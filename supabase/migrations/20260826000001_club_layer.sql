-- ════════════════════════════════════════════════════════════════════
-- 동아리 계층 (마일스톤 1b) — 그릇만 만든다
--
-- 지금까지는 대회·모임이 최상위였다. 이 마이그레이션은 그 위에 "동아리"
-- 라는 선택적 계층을 얹는다. 동아리는 권한 축이 아니라 명단의 원천이고,
-- 소속은 생성 후 불변이며, 동아리를 지워도 산하 대회·경기·점수 원장은
-- 남는다. 회원 명단을 실제로 재사용하는 건 마일스톤 2 의 몫이고, 여기서는
-- "동아리가 존재한다" 와 "동아리 운영진이 산하 대회를 관리한다" 만
-- 성립시킨다.
--
-- ── 설계 판단 다섯 가지 ─────────────────────────────────────────────
--
--  1. 동아리 권한은 새 헬퍼 세 개(is_club_member/is_club_admin/is_club_owner)
--     로 따로 만든다. 기존 is_tournament_* 는 이름도 본문도 건드리지 않는다.
--     기존 헬퍼에 "or is_club_admin(...)" 을 한 줄 얹으면 소속 없는 기존
--     대회의 모든 권한 판단이 새 경로를 지나게 되고, RLS 가 유일한 보안벽인
--     이 앱에서 회귀는 곧 "남의 대회가 조용히 보이는" 사고로 이어진다.
--     동아리 운영진이 산하 대회를 만지는 근거는 그 대회에 "심어진 멤버 행"
--     이지 동아리 소속 그 자체가 아니다.
--
--  2. clubs 정책은 club_members 를 보고, club_members 정책도 club_members
--     를 본다. 정책 안에서 그냥 서브쿼리를 쓰면 Postgres 가 무한재귀 에러를
--     낸다. 두 정책 모두 SECURITY DEFINER 헬퍼를 경유해야만 고리가 끊긴다
--     (definer 는 테이블 소유자 권한으로 돌아 RLS 를 우회한다). SECURITY
--     INVOKER 로 감싸면 호출자 권한으로 돌아 정책이 다시 적용되므로
--     재귀가 그대로 남는다. 같은 이유로 이 두 테이블에 FORCE ROW LEVEL
--     SECURITY 를 켜면 안 된다 — force 는 테이블 소유자에게도 정책을
--     적용해 definer 우회를 무력화시킨다. (20260818000002_rls.sql 머리
--     주석과 같은 경고다.)
--
--  3. 동아리 밑에 대회를 만들면 그 시점 운영진을 tournament_members 에
--     role='admin' 으로 같은 트랜잭션에 심는다(복제, 참조 아님). 이름이
--     겹치면 add_roster_member 처럼 예외를 던지면 "동아리 밑에서는 대회를
--     못 만드는" 상태가 되므로, unique_display_name 헬퍼로 19자까지 자른
--     뒤 A~Z 접미사를 붙인다. 이미 있는 이름은 절대 바꾸지 않는다 — 이름은
--     대진표·심판 배지·기록 검색의 열쇠라 기존 이름을 고치면 이미 편성된
--     경기의 표시가 흔들린다. 이 헬퍼는 마일스톤 2·3 이 그대로 재사용한다.
--
--  4. 승격은 전파하지 않고, 강등만 전파한다(비대칭이 의도다). 강등은
--     반드시 전파해야 한다 — 내렸는데 이번 주 모임을 계속 관리할 수 있으면
--     내린 게 아니다. 승격은 명단에 없는 사람을 새로 심지 않는다 — 심으려면
--     표시명을 정해야 하고(스냅샷 복제, 마일스톤 2 의 일), 무엇보다 명단에
--     없던 사람을 관리자로 넣으면 대진표·순위에 뛴 적 없는 유령 참가자가
--     생긴다. 끝난 대회(status='finished')는 양쪽 다 건드리지 않는다 —
--     지난 기록을 소급 변조하지 않는다는 원칙 하나다. role='owner' 행도
--     양쪽 다 제외한다 — 강등하면 그 대회가 아무도 못 여는 상태로 잠긴다.
--     전파는 SECURITY DEFINER 함수 안에서 일어나므로 is_direct_api_call()
--     이 거짓이 되어 guard_member_update 의 role 잠금을 통과한다.
--
--  5. club_members 에 role 이 생기는 순간 20260818000007 M-1 이 tournament
--     _members 에서 막았던 "관리자가 자기 행을 owner 로 승격 → 진짜 owner
--     를 강등시켜 잠근다" 구멍이 그대로 복사된다. 같은 모양으로 막는다:
--     guard_club_member_update BEFORE 트리거로 role·user_id·club_id 직접
--     변경을 거부하고, set_club_member_role RPC 로만 role 을 바꾸되 owner
--     로는 못 올리고 owner 행은 못 바꾼다. guard_club_update 는 owner_id·
--     invite_code 직접 변경을 막는다(이름·설명은 관리자가 자유롭게).
--     clubs 에 on delete cascade 로 매달리는 건 club_members 뿐이고,
--     tournaments.club_id 는 on delete set null 이다 — cascade 로 두면
--     동아리 하나를 지우는 것으로 산하 대회·경기·점수 원장이 전부
--     사라진다(이 저장소가 guard_match_delete 로 이미 겪은 종류의 사고다).
-- ════════════════════════════════════════════════════════════════════

-- ── 열거형 ──────────────────────────────────────────────────────────
create type club_role as enum ('owner', 'admin', 'member');

-- ── clubs ───────────────────────────────────────────────────────────
-- tournaments 와 같은 모양(초대 코드·주인)을 그대로 따른다.
create table clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 60),
  description  text check (length(description) <= 500),
  invite_code  text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  owner_id     uuid not null references auth.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index clubs_owner_idx on clubs(owner_id);
create trigger clubs_updated_at before update on clubs
  for each row execute function set_updated_at();

-- ── club_members ────────────────────────────────────────────────────
-- user_id 는 nullable — 마일스톤 2 의 계정 없는 회원이 여기 들어온다.
-- 단 계정 없는 사람은 운영진이 될 수 없다(아무도 열 수 없는 권한은 만들지
-- 않는다. 20260819000008 이 심판에 건 것과 같은 이유).
create table club_members (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references clubs(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  role          club_role not null default 'member',
  display_name  text not null check (length(btrim(display_name)) between 1 and 20),
  avatar_url    text,
  joined_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (club_id, user_id),
  check (role = 'member' or user_id is not null)
);
create index cm_club_idx on club_members(club_id);
create index cm_user_idx  on club_members(user_id);
create trigger cm_updated_at before update on club_members
  for each row execute function set_updated_at();

-- ── audit_logs 를 동아리 이벤트도 받게 확장 ──────────────────────────
-- log_audit 는 tournament_id not null 이라 동아리 단독 이벤트(가입·탈퇴 등
-- 대회와 무관한 행위)를 남길 곳이 없다. tournament_id 를 nullable 로 풀고
-- club_id 를 추가해, 둘 중 하나는 반드시 있게 한다. 기존 대회 감사로그는
-- tournament_id 가 그대로 채워져 있으므로 동작이 안 바뀐다.
alter table audit_logs alter column tournament_id drop not null;
alter table audit_logs add column if not exists club_id uuid references clubs(id) on delete cascade;
alter table audit_logs add constraint audit_logs_target_check
  check (tournament_id is not null or club_id is not null);
create index if not exists audit_club_idx on audit_logs(club_id, created_at desc);

create or replace function log_audit_club(
  p_cid uuid, p_action text, p_target_type text,
  p_target_id uuid, p_before jsonb, p_after jsonb
) returns void language sql security definer
set search_path = public, pg_temp as $fn$
  insert into audit_logs (club_id, actor_id, action, target_type, target_id, before, after)
  values (p_cid, auth.uid(), p_action, p_target_type, p_target_id, p_before, p_after);
$fn$;

revoke all on function log_audit_club(uuid, text, text, uuid, jsonb, jsonb) from public;

-- ── 헬퍼 (SECURITY DEFINER 로 재귀를 끊는다) ────────────────────────
create or replace function is_club_member(cid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from club_members
    where club_id = cid and user_id = auth.uid()
  );
$fn$;

create or replace function is_club_admin(cid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from club_members
    where club_id = cid and user_id = auth.uid() and role in ('owner', 'admin')
  );
$fn$;

create or replace function is_club_owner(cid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from clubs where id = cid and owner_id = auth.uid()
  );
$fn$;

revoke all on function is_club_member(uuid) from public;
revoke all on function is_club_admin(uuid)  from public;
revoke all on function is_club_owner(uuid)  from public;

grant execute on function is_club_member(uuid) to authenticated;
grant execute on function is_club_admin(uuid)  to authenticated;
grant execute on function is_club_owner(uuid)  to authenticated;

-- ── RLS 활성화 ──────────────────────────────────────────────────────
-- ⚠ FORCE ROW LEVEL SECURITY 를 켜면 안 된다. 위 헬퍼가 SECURITY DEFINER
--   로 재귀를 끊는데, force 는 테이블 소유자에게도 정책을 적용해 그 우회를
--   무력화시키고 무한재귀가 그대로 부활한다.
alter table clubs         enable row level security;
alter table club_members  enable row level security;

-- ── clubs 정책 ──────────────────────────────────────────────────────
-- INSERT 정책 없음 = create_club RPC 로만 생성 가능(동아리 + owner 행을
-- 같은 트랜잭션에 만들어야 한다).
create policy clubs_select on clubs
  for select to authenticated using (is_club_member(id));
create policy clubs_update_admin on clubs
  for update to authenticated using (is_club_admin(id)) with check (is_club_admin(id));
create policy clubs_delete_owner on clubs
  for delete to authenticated using (owner_id = auth.uid());

-- ── club_members 정책 ───────────────────────────────────────────────
-- INSERT 없음 = create_club/join_club RPC 로만 가입.
-- role 변경은 guard_club_member_update 트리거 + set_club_member_role RPC 로만.
create policy cm_select on club_members
  for select to authenticated using (is_club_member(club_id));
create policy cm_update_admin on club_members
  for update to authenticated
  using (is_club_admin(club_id)) with check (is_club_admin(club_id));

-- 동아리 감사로그는 그 동아리 운영진만 본다. tournament_id 가 채워진 기존
-- 행은 club_id 가 null 이라 이 정책이 항상 거짓이 되어 새지 않는다.
create policy audit_select_club_admin on audit_logs
  for select to authenticated using (club_id is not null and is_club_admin(club_id));

-- ════════════════════════════════════════════════════════════════════
-- 컬럼 단위 방어 — tournaments 의 guard_tournament_update / guard_member_update
-- 와 같은 모양. is_direct_api_call() 로 정식 경로(RPC)인지 판별한다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_club_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;  -- RPC 경로는 자체 검증을 거쳤다
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception '동아리 주인은 변경할 수 없습니다' using errcode = '42501';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception '초대 코드는 재발급 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger clubs_guard_update
  before update on clubs
  for each row execute function guard_club_update();

create or replace function guard_club_member_update()
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
  if new.club_id is distinct from old.club_id then
    raise exception '멤버를 다른 동아리로 옮길 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger cm_guard_update
  before update on club_members
  for each row execute function guard_club_member_update();

-- ── 동아리 만들기 ───────────────────────────────────────────────────
-- 동아리 + owner 멤버 행을 같은 트랜잭션에.
create or replace function create_club(
  p_name         text,
  p_display_name text,
  p_description  text default null
) returns clubs
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_club    clubs;
  v_code    text;
  v_uid     uuid := auth.uid();
  v_profile profiles;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '동아리 이름을 입력해 주세요' using errcode = '22023';
  end if;

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from clubs where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into clubs (name, description, invite_code, owner_id)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_code,
    v_uid
  )
  returning * into v_club;

  insert into club_members (club_id, user_id, role, display_name, avatar_url)
  values (
    v_club.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  );

  return v_club;
end;
$fn$;

-- ── 동아리 코드로 들어오기 ──────────────────────────────────────────
-- 초대 코드 브루트포스 차단 — join_tournament(20260818000003) 와 그 수정
-- (20260818000008_join_rate_limit_fix) 을 그대로 이식한다. join_attempts 는
-- user_id·code·succeeded 만 갖는 범용 테이블이라 대회/동아리 구분 컬럼 없이
-- 그대로 재사용한다(같은 사용자의 대회·동아리 시도가 한 카운터를 같이 쓴다).
--
-- ⚠ 실패 기록 뒤에 raise exception 을 던지면 트랜잭션 전체가 롤백되어
--   방금 넣은 실패 기록도 함께 사라진다(이 저장소가 이미 겪은 함정,
--   20260818000008 참고). 그래서 예외 대신 jsonb 로 결과를 돌려준다.
create or replace function join_club(
  p_code          text,
  p_display_name  text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_club            clubs;
  v_code            text;
  v_uid             uuid := auth.uid();
  v_profile         profiles;
  v_recent_failures int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated',
                              'message', '로그인이 필요합니다');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select count(*) into v_recent_failures
  from join_attempts
  where user_id = v_uid
    and not succeeded
    and attempted_at > now() - interval '10 minutes';

  if v_recent_failures >= 10 then
    return jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'message', '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요');
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'bad_format',
                              'message', '초대 코드는 6자리입니다');
  end if;

  select * into v_club from clubs where invite_code = v_code;

  if not found then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'not_found',
                              'message', '초대 코드를 찾을 수 없습니다');
  end if;

  insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);

  v_profile := ensure_profile(v_uid);

  -- 이미 가입한 사람이 코드를 다시 넣어도 그냥 들어가진다 (멱등)
  insert into club_members (club_id, user_id, role, display_name, avatar_url)
  values (
    v_club.id, v_uid, 'member',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  )
  on conflict (club_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'club', to_jsonb(v_club));
end;
$fn$;

-- ── 동아리 역할 바꾸기 + 산하 대회 전파 ─────────────────────────────
-- owner 로는 올릴 수 없고, owner 행은 바꿀 수 없다(주최자 권한은 넘기지도
-- 뺏지도 못한다 — set_member_role 과 같은 이유).
--
-- admin → member (강등): club_id 가 같고 status <> 'finished' 인 대회에서
--   그 사람의 tournament_members.role = 'admin' 행만 'member' 로 내린다.
--   멤버 행 자체는 남긴다.
-- member → admin (승격): 같은 범위의 대회에서 그 사람의 tournament_members
--   행이 이미 있는 경우(role='member')에만 'admin' 으로 올린다. 없는 사람을
--   새로 심지 않는다 — 유령 참가자를 막기 위해서다.
-- 양쪽 다 role='owner' 행은 제외한다. 끝난 대회는 어느 쪽도 건드리지 않는다.
create or replace function set_club_member_role(p_member_id uuid, p_role club_role)
returns club_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member    club_members;
  v_before    jsonb;
  v_was_admin boolean;
  v_tm        tournament_members;
  v_tm_before jsonb;
begin
  -- for update: owner 승격 금지 검사와 v_was_admin 판정이 락 없는 결과에
  -- 기반하면 동시 요청 사이에 TOCTOU 가 생긴다.
  select * into v_member from club_members where id = p_member_id for update;
  if not found then
    raise exception '동아리 멤버를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_member.club_id) then
    raise exception '운영진만 권한을 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception '동아리 주인 권한은 넘길 수 없습니다' using errcode = '22023';
  end if;
  if v_member.role = 'owner' then
    raise exception '동아리 주인의 권한은 바꿀 수 없습니다' using errcode = '22023';
  end if;

  v_before    := to_jsonb(v_member);
  v_was_admin := v_member.role = 'admin';

  update club_members set role = p_role where id = p_member_id
  returning * into v_member;

  if v_member.user_id is not null then
    if v_was_admin and p_role = 'member' then
      -- 강등 전파: 안 끝난 산하 대회의 관리자 권한만 내린다.
      for v_tm in
        select tm.* from tournament_members tm
        join tournaments t on t.id = tm.tournament_id
        where t.club_id = v_member.club_id
          and t.status <> 'finished'
          and tm.user_id = v_member.user_id
          and tm.role = 'admin'
      loop
        v_tm_before := to_jsonb(v_tm);
        update tournament_members set role = 'member' where id = v_tm.id;
        perform log_audit(v_tm.tournament_id, 'member.role.club_demote', 'tournament_member',
                          v_tm.id, v_tm_before, jsonb_build_object('role', 'member'));
      end loop;
    elsif not v_was_admin and p_role = 'admin' then
      -- 승격 전파: 그 대회 명단에 이미 있는 사람만 admin 으로. 새로 심지 않는다.
      for v_tm in
        select tm.* from tournament_members tm
        join tournaments t on t.id = tm.tournament_id
        where t.club_id = v_member.club_id
          and t.status <> 'finished'
          and tm.user_id = v_member.user_id
          and tm.role = 'member'
      loop
        v_tm_before := to_jsonb(v_tm);
        update tournament_members set role = 'admin' where id = v_tm.id;
        perform log_audit(v_tm.tournament_id, 'member.role.club_promote', 'tournament_member',
                          v_tm.id, v_tm_before, jsonb_build_object('role', 'admin'));
      end loop;
    end if;
  end if;

  return v_member;
end;
$fn$;

-- ── 동아리에서 빼기 / 스스로 나가기 ─────────────────────────────────
-- remove_member(20260819000008) 의 모양(찾기 → 보호 검사 → 지우기 →
-- log_audit) 과 tm_delete 정책의 권한 규칙(관리자는 남을, 본인은 스스로)
-- 을 그대로 따른다. owner 행은 어느 쪽도 뺄 수 없다 — 대회 쪽과 같은
-- 이유로, 그러면 아무도 못 여는 동아리가 된다.
--
-- 뺀 사람의 산하 대회 tournament_members 행은 건드리지 않는다. 출전
-- 기록이 걸려 있을 수 있고, 지난 기록을 소급 변조하지 않는다는 규칙이
-- 동아리 탈퇴에도 그대로 적용된다 — 강등 전파(admin→member)와 달리
-- "명단에서 사람 자체가 사라지는" 변경은 하지 않는다.
create or replace function remove_club_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member club_members;
begin
  select * into v_member from club_members where id = p_member_id for update;
  if not found then
    raise exception '동아리 멤버를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if v_member.role = 'owner' then
    raise exception '동아리 주인은 뺄 수 없습니다' using errcode = '22023';
  end if;
  if not (is_club_admin(v_member.club_id) or v_member.user_id = auth.uid()) then
    raise exception '운영진만 다른 멤버를 뺄 수 있습니다' using errcode = '42501';
  end if;

  perform log_audit_club(v_member.club_id, 'club_member.remove', 'club_member',
                         p_member_id, to_jsonb(v_member), null);
  delete from club_members where id = p_member_id;
end;
$fn$;

revoke all on function create_club(text, text, text)         from public, anon;
revoke all on function join_club(text, text)                 from public, anon;
revoke all on function set_club_member_role(uuid, club_role) from public, anon;
revoke all on function remove_club_member(uuid)               from public, anon;

grant execute on function create_club(text, text, text)         to authenticated;
grant execute on function join_club(text, text)                 to authenticated;
grant execute on function set_club_member_role(uuid, club_role) to authenticated;
grant execute on function remove_club_member(uuid)               to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 소속 컬럼과 생성 경로
--
-- tournaments.club_id 는 on delete set null 이다. cascade 로 두면 동아리
-- 하나를 지우는 것으로 산하 대회·경기·점수 원장이 전부 사라진다.
-- ════════════════════════════════════════════════════════════════════
alter table tournaments
  add column if not exists club_id uuid references clubs(id) on delete set null;
create index if not exists tournaments_club_idx on tournaments(club_id);

-- guard_tournament_update 는 본문만 교체한다. 트리거(tournaments_guard_update,
-- 20260818000007 에서 이미 생성됨)는 다시 만들지 않는다.
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
  if new.club_id is distinct from old.club_id then
    raise exception '소속 동아리는 생성 후 바꿀 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- ── 표시명 중복 방지 헬퍼 (마일스톤 2·3 도 재사용) ──────────────────
-- 이미 있는 이름이면 그대로 두고, 겹치는 경우에만 접미사를 붙인다.
-- 기존 행의 이름은 절대 바꾸지 않는다(이 함수는 읽기 전용이고, 호출부가
-- 반환값으로 새 행을 insert 한다).
--
-- 26개(A~Z)를 넘겨도 예외를 던지지 않는다 — "이 심기는 실패하면 안
-- 된다"(create_tournament/create_session 의 클럽 운영진 심기)가 이 함수의
-- 예외 하나로 대회 생성 트랜잭션 전체가 롤백되는 걸 막아야 하기 때문이다.
--   1단계: 원래 이름 그대로 (최대 20자)
--   2단계: 19자로 자른 뒤 A~Z (26가지)
--   3단계: 18자로 자른 뒤 AA~ZZ (676가지)
--   4단계: 최후 수단으로 15자 + '-' + 4자리 임의 16진수. 이론상으로도
--     거의 실패하지 않고, 그래도 겹치면 호출부의 on conflict do nothing
--     이 최종 방어선이다(값 자체는 항상 반환하므로 예외로 롤백되지 않는다).
create or replace function unique_display_name(p_tournament_id uuid, p_name text)
returns text
language plpgsql volatile set search_path = public, pg_temp as $fn$
declare
  v_base    text;
  v_prefix  text;
  v_suffix  text;
begin
  v_base := btrim(coalesce(p_name, ''));
  if length(v_base) > 20 then
    v_base := left(v_base, 20);
  end if;

  if not exists (
    select 1 from tournament_members
    where tournament_id = p_tournament_id
      and lower(btrim(display_name)) = lower(v_base)
  ) then
    return v_base;
  end if;

  v_prefix := left(v_base, 19);
  for i in 0..25 loop
    v_suffix := chr(ascii('A') + i);
    if not exists (
      select 1 from tournament_members
      where tournament_id = p_tournament_id
        and lower(btrim(display_name)) = lower(v_prefix || v_suffix)
    ) then
      return v_prefix || v_suffix;
    end if;
  end loop;

  v_prefix := left(v_base, 18);
  for i in 0..25 loop
    for j in 0..25 loop
      v_suffix := chr(ascii('A') + i) || chr(ascii('A') + j);
      if not exists (
        select 1 from tournament_members
        where tournament_id = p_tournament_id
          and lower(btrim(display_name)) = lower(v_prefix || v_suffix)
      ) then
        return v_prefix || v_suffix;
      end if;
    end loop;
  end loop;

  v_prefix := left(v_base, 15);
  for attempt in 1..50 loop
    v_suffix := substr(md5(clock_timestamp()::text || random()::text || attempt::text), 1, 4);
    if not exists (
      select 1 from tournament_members
      where tournament_id = p_tournament_id
        and lower(btrim(display_name)) = lower(v_prefix || '-' || v_suffix)
    ) then
      return v_prefix || '-' || v_suffix;
    end if;
  end loop;

  -- 여기까지 왔다면 사실상 불가능한 경우다. 그래도 예외 대신 값을 반환한다.
  return left(v_base, 14) || '-' || substr(md5(clock_timestamp()::text || gen_random_uuid()::text), 1, 5);
end;
$fn$;

revoke all on function unique_display_name(uuid, text) from public, anon, authenticated;

-- ── 대회 생성 ───────────────────────────────────────────────────────
-- 인자가 바뀌므로 예전 것을 먼저 지운다(20260824000003 과 같은 이유 —
-- create or replace 로는 시그니처를 못 바꾸고, 남겨 두면 이름이 같은
-- 함수가 둘이 되어 PostgREST 가 어느 쪽을 부를지 모른다).
drop function if exists create_tournament(text, text, int, int, text, jsonb);

create or replace function create_tournament(
  p_name               text,
  p_description        text,
  p_group_count        int,
  p_joker_group_count  int,
  p_display_name       text,
  p_config             jsonb default '{}'::jsonb,
  p_club_id            uuid default null
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament  tournaments;
  v_code        text;
  v_uid         uuid := auth.uid();
  v_profile     profiles;
  v_config      jsonb;
  v_club_admin  club_members;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '대회 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_group_count < 2 or p_group_count > 20 then
    raise exception '조는 2개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;
  if p_joker_group_count < 0 or p_joker_group_count > p_group_count then
    raise exception '조커조 개수는 0 이상 전체 조 개수 이하여야 합니다' using errcode = '22023';
  end if;
  -- 소속을 지정하려면 그 동아리의 운영진이어야 한다. 동아리 운영진이라는
  -- 사실만으로 동아리 밖 대회를 만질 권한이 생기지는 않는다 — 이 검사는
  -- 어디까지나 "만들 수 있는가" 이고, 만든 뒤의 권한은 심어진 멤버 행이 진다.
  if p_club_id is not null and not is_club_admin(p_club_id) then
    raise exception '동아리 운영진만 소속 대회를 만들 수 있습니다' using errcode = '42501';
  end if;

  -- 조커조 개수는 groups.is_joker 가 진실이다. config 쪽은 그 사본이므로
  -- 부르는 쪽이 뭘 보냈든 인자 값으로 덮는다.
  v_config := normalize_tournament_config(
    coalesce(p_config, '{}'::jsonb) || jsonb_build_object('jokerGroupCount', p_joker_group_count)
  );

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into tournaments (name, description, invite_code, owner_id, config, club_id)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_code,
    v_uid,
    v_config,
    p_club_id
  )
  returning * into v_tournament;

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  values (
    v_tournament.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  );

  insert into groups (tournament_id, name, sort_order, is_joker)
  select v_tournament.id, i || '조', i, (i <= p_joker_group_count)
  from generate_series(1, p_group_count) as i;

  -- 동아리 밑이면 그 시점 운영진(만든 사람 제외)을 admin 멤버 행으로 함께
  -- 심는다. 이름 충돌은 unique_display_name 이 접미사로 풀고, 동시성
  -- 대비로 on conflict do nothing 도 건다. 이 심기는 실패하면 안 된다.
  if p_club_id is not null then
    for v_club_admin in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.role in ('owner', 'admin')
        and cm.user_id is not null
        and cm.user_id <> v_uid
    loop
      insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
      values (
        v_tournament.id, v_club_admin.user_id, 'admin',
        unique_display_name(v_tournament.id, v_club_admin.display_name),
        v_club_admin.avatar_url
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_tournament.id, 'tournament.create', 'tournament', v_tournament.id,
                    null, to_jsonb(v_tournament));

  return v_tournament;
end;
$fn$;

revoke all on function create_tournament(text, text, int, int, text, jsonb, uuid) from public, anon;
grant execute on function create_tournament(text, text, int, int, text, jsonb, uuid) to authenticated;

-- ── 모임 생성 ───────────────────────────────────────────────────────
drop function if exists create_session(text, text, int);

create or replace function create_session(
  p_name         text,
  p_display_name text,
  p_court_count  int default 2,
  p_club_id      uuid default null
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_session     tournaments;
  v_code        text;
  v_uid         uuid := auth.uid();
  v_profile     profiles;
  v_club_admin  club_members;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '모임 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_court_count < 1 or p_court_count > 20 then
    raise exception '코트는 1개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;
  if p_club_id is not null and not is_club_admin(p_club_id) then
    raise exception '동아리 운영진만 소속 모임을 만들 수 있습니다' using errcode = '42501';
  end if;

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into tournaments (name, invite_code, owner_id, status, kind, config, club_id)
  values (
    btrim(p_name), v_code, v_uid, 'live', 'session',
    normalize_tournament_config('{}'::jsonb), p_club_id
  )
  returning * into v_session;

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  values (
    v_session.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  );

  -- 코트가 없으면 아무것도 못 한다. 모임은 코트가 곧 화면이다.
  insert into courts (tournament_id, name, sort_order)
  select v_session.id, i || '번 코트', i
  from generate_series(1, p_court_count) as i;

  if p_club_id is not null then
    for v_club_admin in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.role in ('owner', 'admin')
        and cm.user_id is not null
        and cm.user_id <> v_uid
    loop
      insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
      values (
        v_session.id, v_club_admin.user_id, 'admin',
        unique_display_name(v_session.id, v_club_admin.display_name),
        v_club_admin.avatar_url
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_session.id, 'session.create', 'tournament', v_session.id,
                    null, to_jsonb(v_session));

  return v_session;
end;
$fn$;

revoke all on function create_session(text, text, int, uuid) from public, anon;
grant execute on function create_session(text, text, int, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 열거형: club_role ('owner','admin','member')
--  - 테이블: clubs, club_members (user_id nullable + role='member' or
--    user_id is not null 체크, unique(club_id, user_id))
--  - 헬퍼(SECURITY DEFINER, 재귀 차단): is_club_member, is_club_admin,
--    is_club_owner — 기존 is_tournament_* 는 무변경
--  - RLS: clubs(select/update_admin/delete_owner), club_members
--    (select/update_admin). FORCE RLS 는 켜지 않음. INSERT 정책 없음
--    (RPC 전용)
--  - 트리거: clubs_guard_update, cm_guard_update (컬럼 단위 방어)
--  - RPC: create_club, join_club(브루트포스 차단, jsonb 반환),
--    set_club_member_role(for update 로 TOCTOU 차단, 강등 전파 + 승격은
--    기존 명단 행만 반영, 끝난 대회·owner 행 양쪽 제외),
--    remove_club_member(owner 제외, 관리자 또는 본인만, 산하 대회
--    tournament_members 행은 안 건드림)
--  - audit_logs 확장: tournament_id nullable + club_id 컬럼 + 둘 중 하나는
--    필수인 체크 제약. log_audit_club 헬퍼 + audit_select_club_admin 정책
--  - join_attempts 재사용: join_club 도 join_tournament 와 같은 10분/10회
--    브루트포스 차단을 쓴다(컬럼 추가 없이 기존 테이블 그대로). 실패 기록
--    뒤 raise exception 대신 jsonb 반환 — 예외를 던지면 같은 트랜잭션의
--    실패 기록까지 롤백되어 카운터가 영원히 0 이 되는 함정을 피한다
--  - 스키마 변경: tournaments.club_id uuid on delete set null + 인덱스
--  - guard_tournament_update 본문 교체(club_id 잠금 추가, 트리거 재생성 없음)
--  - unique_display_name(uuid, text): 원래 이름 → 19자+A~Z → 18자+AA~ZZ →
--    15자+임의 4자리 순으로 시도하고 예외 없이 항상 값을 반환한다(심기
--    실패로 대회 생성 전체가 롤백되는 것을 막는다). 기존 이름은 불변.
--    마일스톤 2·3 재사용 예정
--  - create_tournament / create_session: p_club_id uuid default null 추가
--    (옛 시그니처 drop 후 재생성, 소속 있으면 is_club_admin 검사 후
--    그 시점 club 운영진을 admin 멤버로 함께 심음)
--  - match_overview 뷰는 손대지 않음
-- ════════════════════════════════════════════════════════════════════
