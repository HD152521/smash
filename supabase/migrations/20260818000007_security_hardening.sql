-- ════════════════════════════════════════════════════════════════════
-- 보안 강화 — 보안 검수에서 발견된 구멍 4건
--
-- 공통 원인: RLS 는 "행" 단위 조건이라 "어떤 컬럼을 바꿨는가" 를 못 본다.
--   admin 이 tournaments 를 UPDATE 할 수 있다 = owner_id 도 바꿀 수 있다.
--   admin 이 matches 를 UPDATE 할 수 있다   = 점수도 바꿀 수 있다.
-- RPC 로 감싸 둔 검증·감사 로직이 전부 "선택사항" 이 되어 있었다.
--
-- 해결: BEFORE 트리거로 컬럼 단위 방어를 건다.
--   PostgREST 직접 호출은 current_user = 'authenticated',
--   SECURITY DEFINER RPC 안에서는 current_user = 함수 소유자(postgres).
--   이 차이로 "정식 경로인가" 를 판별한다.
-- ════════════════════════════════════════════════════════════════════

-- 정식 경로(SECURITY DEFINER RPC)가 아닌 직접 API 호출인가
create or replace function is_direct_api_call() returns boolean
language sql stable as $fn$
  select current_user = 'authenticated';
$fn$;

revoke all on function is_direct_api_call() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- H-1. 대회 소유권 탈취 차단
--
-- admin 이 PATCH /tournaments {"owner_id": "<본인>"} 하면 소유자가 되고,
-- 그 즉시 tournaments_delete_owner 정책을 통과해 대회를 통째로 지울 수 있었다.
-- cascade 로 조·멤버·경기·점수원장·감사로그가 전부 사라진다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_tournament_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;  -- RPC 경로는 자체 검증을 거쳤다
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception '주최자는 변경할 수 없습니다' using errcode = '42501';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception '초대 코드는 재발급 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception '대회 상태는 시작/종료 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.config is distinct from old.config then
    raise exception '경기 규칙은 직접 바꿀 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger tournaments_guard_update
  before update on tournaments
  for each row execute function guard_tournament_update();

-- ════════════════════════════════════════════════════════════════════
-- M-1. 역할 탈취 차단
--
-- tm_update_admin 정책은 role 값을 검사하지 않았다.
-- admin 이 자기 행에 {"role":"owner"} 를 넣거나, 진짜 owner 를 member 로
-- 강등시켜 모든 관리 기능에서 잠가버릴 수 있었다.
-- user_id 를 바꿔 멤버십을 부계정으로 옮기는 것도 가능했다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_member_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception '역할은 권한 부여 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception '멤버의 계정은 변경할 수 없습니다' using errcode = '42501';
  end if;
  if new.tournament_id is distinct from old.tournament_id then
    raise exception '멤버를 다른 대회로 옮길 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger members_guard_update
  before update on tournament_members
  for each row execute function guard_member_update();

-- 역할 변경은 이 함수로만. 주최자는 넘기지도 뺏지도 못한다.
create or replace function set_member_role(p_member_id uuid, p_role member_role)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_before jsonb;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_tournament_admin(v_member.tournament_id) then
    raise exception '관리자만 권한을 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception '주최자 권한은 넘길 수 없습니다' using errcode = '22023';
  end if;
  if v_member.role = 'owner' then
    raise exception '주최자의 권한은 바꿀 수 없습니다' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_member);
  update tournament_members set role = p_role where id = p_member_id
  returning * into v_member;

  perform log_audit(v_member.tournament_id, 'member.role', 'tournament_member',
                    p_member_id, v_before, to_jsonb(v_member));
  return v_member;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- H-3. 결과 조작 차단
--
-- matches_write_admin 이 for all 이라 admin 이 PATCH 로 점수·승자·상태를
-- 직접 쓸 수 있었다. 그러면 원장(score_events)과 투영(matches.score_a/b)이
-- 갈라지고, get_standings 는 투영을 읽으므로 순위가 조작된다.
-- edited_at 도 안 남고 감사로그도 없어서 흔적이 전혀 없었다.
--
-- 경기 삭제도 마찬가지다 — score_events 가 cascade 로 함께 사라진다.
-- 삭제 대신 '무효(void)' 상태로 남긴다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_match_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;
  end if;

  if new.score_a is distinct from old.score_a
     or new.score_b is distinct from old.score_b then
    raise exception '점수는 채점 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception '경기 상태는 시작/종료/무효 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.winner_side is distinct from old.winner_side then
    raise exception '승리 팀은 직접 지정할 수 없습니다' using errcode = '42501';
  end if;
  if new.source is distinct from old.source then
    raise exception '경기 출처는 변경할 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger matches_guard_update
  before update on matches
  for each row execute function guard_match_update();

create or replace function guard_match_delete()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return old;
  end if;
  if exists (select 1 from score_events where match_id = old.id) then
    raise exception '점수 기록이 있는 경기는 지울 수 없습니다. 무효 처리를 해주세요'
      using errcode = '42501';
  end if;
  return old;
end;
$fn$;

create trigger matches_guard_delete
  before delete on matches
  for each row execute function guard_match_delete();

-- 잘못 편성했거나 취소된 경기를 기록은 남긴 채 무효화한다
create or replace function void_match(p_match_id uuid, p_reason text default null)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_before jsonb;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_tournament_admin(v_match.tournament_id) then
    raise exception '관리자만 경기를 무효 처리할 수 있습니다' using errcode = '42501';
  end if;
  if v_match.status = 'void' then
    return v_match;
  end if;

  v_before := to_jsonb(v_match);

  update matches set
    status = 'void', winner_side = null, edited_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'match.void', 'match', p_match_id,
                    v_before, jsonb_build_object('reason', p_reason));
  return v_match;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- M-2. 경기 이력 소거 차단
--
-- tm_delete 정책이 본인 탈퇴를 허용하는데, match_team_players 가
-- cascade 라 자기가 뛴 모든 경기의 출전 기록이 함께 사라졌다.
-- 감사로그도 안 남고, 초대 코드로 곧바로 재가입할 수 있었다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_member_delete()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return old;
  end if;
  if exists (select 1 from match_team_players where member_id = old.id) then
    raise exception '경기에 출전한 기록이 있어 내보낼 수 없습니다' using errcode = '42501';
  end if;
  if exists (select 1 from match_referees mr
             join matches m on m.id = mr.match_id
             where mr.member_id = old.id and m.status = 'live') then
    raise exception '진행 중인 경기의 심판이라 내보낼 수 없습니다' using errcode = '42501';
  end if;
  return old;
end;
$fn$;

create trigger members_guard_delete
  before delete on tournament_members
  for each row execute function guard_member_delete();

-- ════════════════════════════════════════════════════════════════════
-- LOW. profiles 가 없으면 참가가 조용히 실패하던 문제
--
-- 멤버 INSERT 가 `from profiles where id = auth.uid()` 라, 프로필 행이
-- 없으면 0행이 들어가는데 함수는 성공을 반환했다.
-- create_tournament 에서 터지면 아무도 볼 수 없는 고아 대회가 생긴다.
-- ════════════════════════════════════════════════════════════════════
create or replace function ensure_profile(p_uid uuid)
returns profiles
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_profile profiles;
begin
  select * into v_profile from profiles where id = p_uid;
  if found then
    return v_profile;
  end if;

  insert into profiles (id, name, email)
  select
    u.id,
    coalesce(
      nullif(u.raw_user_meta_data->>'name', ''),
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      '이름없음'
    ),
    u.email
  from auth.users u where u.id = p_uid
  on conflict (id) do nothing;

  select * into v_profile from profiles where id = p_uid;
  if not found then
    raise exception '사용자 정보를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  return v_profile;
end;
$fn$;

-- ── 권한 ────────────────────────────────────────────────────────────
revoke all on function set_member_role(uuid, member_role) from public, anon;
revoke all on function void_match(uuid, text)             from public, anon;
revoke all on function ensure_profile(uuid)               from public, anon, authenticated;

grant execute on function set_member_role(uuid, member_role) to authenticated;
grant execute on function void_match(uuid, text)             to authenticated;
