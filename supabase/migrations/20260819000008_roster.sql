-- ════════════════════════════════════════════════════════════════════
-- 명단 관리 — 아직 안 들어온 사람도 미리 넣고, 잘못 들어온 사람은 뺀다.
--
-- 실제 운영: 주최자는 클럽 명단을 이미 갖고 있다. 대회 날 아침에
-- 20명이 각자 코드를 치고 들어오기를 기다릴 수 없으니 미리 채워 넣는다.
-- 그 사람들은 계정이 없으므로 user_id 가 비어 있다 ('미가입').
--
-- 미가입 참가자로 할 수 있는 것: 조 배정, 경기 편성, 순위 집계.
-- 할 수 없는 것: 로그인, 심판. 점수를 넣을 방법이 없기 때문이다.
-- ════════════════════════════════════════════════════════════════════

alter table tournament_members alter column user_id drop not null;

-- unique (tournament_id, user_id) 는 그대로 둔다.
-- 포스트그레스에서 null 은 서로 같지 않으므로 미가입 참가자는 여럿이어도 된다.

-- ── 심판은 계정이 있어야 한다 ───────────────────────────────────────
-- 미가입 참가자를 심판으로 지정하면, 열 수 있는 사람이 아무도 없는 경기가
-- 만들어진다. 코트에서 그제서야 발견하게 되므로 편성 단계에서 막는다.
create or replace function guard_referee_has_account()
returns trigger language plpgsql as $fn$
declare
  v_name text;
  v_uid  uuid;
begin
  select display_name, user_id into v_name, v_uid
    from tournament_members where id = new.member_id;
  if v_uid is null then
    raise exception '%님은 아직 앱에 들어오지 않아 심판을 맡을 수 없습니다', v_name
      using errcode = '22023';
  end if;
  return new;
end;
$fn$;

create trigger match_referees_need_account
  before insert on match_referees
  for each row execute function guard_referee_has_account();

-- ── 명단에 사람 추가 ────────────────────────────────────────────────
create or replace function add_roster_member(p_tournament_id uuid, p_name text)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_clean  text;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 참가자를 추가할 수 있습니다' using errcode = '42501';
  end if;

  v_clean := btrim(coalesce(p_name, ''));
  if length(v_clean) < 1 or length(v_clean) > 20 then
    raise exception '이름은 1~20자로 입력해 주세요' using errcode = '22023';
  end if;

  if exists (
    select 1 from tournament_members
    where tournament_id = p_tournament_id
      and lower(btrim(display_name)) = lower(v_clean)
  ) then
    raise exception '이 대회에 같은 이름이 이미 있습니다' using errcode = '23505';
  end if;

  insert into tournament_members (tournament_id, user_id, display_name, role)
  values (p_tournament_id, null, v_clean, 'member')
  returning * into v_member;

  perform log_audit(p_tournament_id, 'member.add', 'tournament_member',
                    v_member.id, null, to_jsonb(v_member));
  return v_member;
end;
$fn$;

-- ── 명단에서 빼기 ───────────────────────────────────────────────────
--
-- ⚠ match_team_players / match_referees 가 on delete cascade 다.
--   경기에 나간 사람을 지우면 그 사람이 지난 경기에서 조용히 사라진다.
--   21:19 로 끝난 경기가 1:2 복식이 되고 순위 근거가 어긋나는데 오류도 안 뜬다.
--   그래서 한 번이라도 나갔으면 지우지 못하게 막는다.
create or replace function remove_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_plays  int;
  v_refs   int;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_tournament_admin(v_member.tournament_id) then
    raise exception '관리자만 참가자를 뺄 수 있습니다' using errcode = '42501';
  end if;
  if v_member.role = 'owner' then
    raise exception '주최자는 뺄 수 없습니다' using errcode = '22023';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception '자기 자신은 뺄 수 없습니다' using errcode = '22023';
  end if;

  select count(*) into v_plays from match_team_players mtp
    join match_teams mt on mt.id = mtp.match_team_id
   where mtp.member_id = p_member_id;
  select count(*) into v_refs from match_referees where member_id = p_member_id;

  if v_plays > 0 or v_refs > 0 then
    raise exception
      '%님은 이미 경기에 나갔습니다. 지우면 그 경기 기록에서도 사라집니다',
      v_member.display_name using errcode = '22023';
  end if;

  perform log_audit(v_member.tournament_id, 'member.remove', 'tournament_member',
                    p_member_id, to_jsonb(v_member), null);
  delete from tournament_members where id = p_member_id;
end;
$fn$;

-- ── 명단과 계정 짝짓기 ──────────────────────────────────────────────
--
-- 명단에 미리 넣어둔 '김철수' 와, 나중에 코드로 들어온 김철수의 계정이
-- 따로 놀게 된다. 관리자가 둘을 이어 준다.
--
-- 명단 쪽(기록이 붙어 있을 수 있는 행)을 남기고 계정을 그 행에 붙인다.
-- 반대로 하면 명단 쪽에 쌓인 경기 기록이 통째로 사라진다.
create or replace function link_member_account(p_roster_member_id uuid, p_account_member_id uuid)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_roster  tournament_members;
  v_account tournament_members;
  v_plays   int;
  v_refs    int;
begin
  select * into v_roster from tournament_members where id = p_roster_member_id;
  if not found then
    raise exception '명단 참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  select * into v_account from tournament_members where id = p_account_member_id;
  if not found then
    raise exception '계정 참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  if not is_tournament_admin(v_roster.tournament_id) then
    raise exception '관리자만 계정을 연결할 수 있습니다' using errcode = '42501';
  end if;
  if v_roster.tournament_id <> v_account.tournament_id then
    raise exception '같은 대회의 참가자끼리만 연결할 수 있습니다' using errcode = '22023';
  end if;
  if v_roster.user_id is not null then
    raise exception '%님은 이미 계정이 연결돼 있습니다', v_roster.display_name
      using errcode = '22023';
  end if;
  if v_account.user_id is null then
    raise exception '연결할 계정이 없는 참가자입니다' using errcode = '22023';
  end if;
  if v_account.role = 'owner' then
    raise exception '주최자 계정은 명단에 합칠 수 없습니다' using errcode = '22023';
  end if;

  -- 계정 쪽에도 기록이 붙어 있으면 어느 쪽 기록을 남길지 알 수 없다.
  -- 사람이 판단해야 하는 상황이므로 자동으로 합치지 않는다.
  select count(*) into v_plays from match_team_players where member_id = p_account_member_id;
  select count(*) into v_refs from match_referees where member_id = p_account_member_id;
  if v_plays > 0 or v_refs > 0 then
    raise exception
      '%님의 계정으로 이미 경기를 뛰었습니다. 합치면 기록이 어긋나므로 직접 정리해 주세요',
      v_account.display_name using errcode = '22023';
  end if;

  -- 순서가 중요하다. 계정 행을 먼저 지워야 unique(tournament_id, user_id) 에 안 걸린다.
  delete from tournament_members where id = p_account_member_id;

  update tournament_members
     set user_id = v_account.user_id, updated_at = now()
   where id = p_roster_member_id
  returning * into v_roster;

  perform log_audit(v_roster.tournament_id, 'member.link', 'tournament_member',
                    p_roster_member_id, to_jsonb(v_account), to_jsonb(v_roster));
  return v_roster;
end;
$fn$;

revoke all on function add_roster_member(uuid, text) from public, anon;
revoke all on function remove_member(uuid) from public, anon;
revoke all on function link_member_account(uuid, uuid) from public, anon;
grant execute on function add_roster_member(uuid, text) to authenticated;
grant execute on function remove_member(uuid) to authenticated;
grant execute on function link_member_account(uuid, uuid) to authenticated;
