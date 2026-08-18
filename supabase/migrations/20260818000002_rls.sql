-- ════════════════════════════════════════════════════════════════════
-- RLS — 이 앱의 유일한 보안 경계
--
-- 프론트엔드가 Supabase 에 직접 붙기 때문에, 프론트의 조건부 렌더링은
-- 보안이 아니라 UX 다. 실제 차단은 전부 여기서 일어난다.
--
-- ⚠ 무한재귀 주의
--   tournament_members 의 정책이 다시 tournament_members 를 조회하면
--   Postgres 가 무한재귀 에러를 낸다. 아래 헬퍼는 SECURITY DEFINER 라
--   테이블 소유자 권한으로 실행되어 RLS 를 우회하므로 재귀가 끊긴다.
--   따라서 이 테이블들에 FORCE ROW LEVEL SECURITY 를 켜면 안 된다.
-- ════════════════════════════════════════════════════════════════════

-- ── 헬퍼 ────────────────────────────────────────────────────────────
create or replace function is_tournament_member(tid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from tournament_members
    where tournament_id = tid and user_id = auth.uid()
  );
$fn$;

create or replace function is_tournament_admin(tid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from tournament_members
    where tournament_id = tid
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$fn$;

create or replace function is_tournament_owner(tid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from tournaments where id = tid and owner_id = auth.uid()
  );
$fn$;

create or replace function match_tournament_id(mid uuid)
returns uuid language sql security definer stable
set search_path = public, pg_temp as $fn$
  select tournament_id from matches where id = mid;
$fn$;

create or replace function match_team_tournament_id(mtid uuid)
returns uuid language sql security definer stable
set search_path = public, pg_temp as $fn$
  select m.tournament_id
  from match_teams mt join matches m on m.id = mt.match_id
  where mt.id = mtid;
$fn$;

-- 해당 경기에 배정된 심판인가. 전역 역할이 아니라 경기 단위 권한이다.
create or replace function is_match_referee(mid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1
    from match_referees mr
    join tournament_members tm on tm.id = mr.member_id
    where mr.match_id = mid and tm.user_id = auth.uid()
  );
$fn$;

-- 이 대회에서의 내 멤버 id
create or replace function my_member_id(tid uuid)
returns uuid language sql security definer stable
set search_path = public, pg_temp as $fn$
  select id from tournament_members
  where tournament_id = tid and user_id = auth.uid();
$fn$;

revoke all on function is_tournament_member(uuid)     from public;
revoke all on function is_tournament_admin(uuid)      from public;
revoke all on function is_tournament_owner(uuid)      from public;
revoke all on function match_tournament_id(uuid)      from public;
revoke all on function match_team_tournament_id(uuid) from public;
revoke all on function is_match_referee(uuid)         from public;
revoke all on function my_member_id(uuid)             from public;

grant execute on function is_tournament_member(uuid)     to authenticated;
grant execute on function is_tournament_admin(uuid)      to authenticated;
grant execute on function is_tournament_owner(uuid)      to authenticated;
grant execute on function match_tournament_id(uuid)      to authenticated;
grant execute on function match_team_tournament_id(uuid) to authenticated;
grant execute on function is_match_referee(uuid)         to authenticated;
grant execute on function my_member_id(uuid)             to authenticated;

-- ── RLS 활성화 ──────────────────────────────────────────────────────
alter table profiles            enable row level security;
alter table tournaments         enable row level security;
alter table groups              enable row level security;
alter table tournament_members  enable row level security;
alter table courts              enable row level security;
alter table matches             enable row level security;
alter table match_teams         enable row level security;
alter table match_team_players  enable row level security;
alter table match_referees      enable row level security;
alter table score_events        enable row level security;
alter table audit_logs          enable row level security;
alter table join_attempts       enable row level security;

-- ── profiles: 완전 비공개 ───────────────────────────────────────────
-- 다른 참가자의 표시명은 tournament_members.display_name 으로 본다.
-- 덕분에 남의 이메일·실명이 절대 새어나가지 않는다.
create policy profiles_select_own on profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── tournaments ─────────────────────────────────────────────────────
-- INSERT 정책이 없다 = create_tournament RPC 로만 생성 가능.
-- 대회와 조를 원자적으로 함께 만들어야 하기 때문이다.
create policy tournaments_select on tournaments
  for select to authenticated using (is_tournament_member(id));
create policy tournaments_update_admin on tournaments
  for update to authenticated using (is_tournament_admin(id)) with check (is_tournament_admin(id));
create policy tournaments_delete_owner on tournaments
  for delete to authenticated using (owner_id = auth.uid());

-- ── groups ──────────────────────────────────────────────────────────
create policy groups_select on groups
  for select to authenticated using (is_tournament_member(tournament_id));
create policy groups_write_admin on groups
  for all to authenticated
  using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

-- ── tournament_members ──────────────────────────────────────────────
-- INSERT 없음 = join_tournament RPC 로만 가입.
-- UPDATE 는 관리자만 = 본인 조 변경은 set_my_group RPC 로만 (대회 상태 검사 포함).
create policy tm_select on tournament_members
  for select to authenticated using (is_tournament_member(tournament_id));
create policy tm_update_admin on tournament_members
  for update to authenticated
  using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));
create policy tm_delete on tournament_members
  for delete to authenticated
  using (is_tournament_admin(tournament_id) or user_id = auth.uid());

-- ── courts ──────────────────────────────────────────────────────────
create policy courts_select on courts
  for select to authenticated using (is_tournament_member(tournament_id));
create policy courts_write_admin on courts
  for all to authenticated
  using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

-- ── matches ─────────────────────────────────────────────────────────
-- 점수 변경은 정책이 아니라 RPC(SECURITY DEFINER)로만 일어난다.
-- 관리자의 UPDATE 는 편성·수동수정용이다.
create policy matches_select on matches
  for select to authenticated using (is_tournament_member(tournament_id));
create policy matches_write_admin on matches
  for all to authenticated
  using (is_tournament_admin(tournament_id))
  with check (is_tournament_admin(tournament_id));

-- ── match_teams / players / referees ────────────────────────────────
create policy mt_select on match_teams
  for select to authenticated using (is_tournament_member(match_tournament_id(match_id)));
create policy mt_write_admin on match_teams
  for all to authenticated
  using (is_tournament_admin(match_tournament_id(match_id)))
  with check (is_tournament_admin(match_tournament_id(match_id)));

create policy mtp_select on match_team_players
  for select to authenticated using (is_tournament_member(match_team_tournament_id(match_team_id)));
create policy mtp_write_admin on match_team_players
  for all to authenticated
  using (is_tournament_admin(match_team_tournament_id(match_team_id)))
  with check (is_tournament_admin(match_team_tournament_id(match_team_id)));

create policy mr_select on match_referees
  for select to authenticated using (is_tournament_member(match_tournament_id(match_id)));
create policy mr_write_admin on match_referees
  for all to authenticated
  using (is_tournament_admin(match_tournament_id(match_id)))
  with check (is_tournament_admin(match_tournament_id(match_id)));

-- ── score_events: 읽기 전용 ─────────────────────────────────────────
-- 쓰기 정책이 하나도 없다. record_score / undo_score RPC 를 우회할 방법이 없다는 뜻.
-- 멱등키 검사·목표점수 판정·투영 갱신을 건너뛸 수 없게 만드는 장치다.
create policy se_select on score_events
  for select to authenticated using (is_tournament_member(match_tournament_id(match_id)));

-- ── audit_logs: 관리자 열람 전용 ────────────────────────────────────
create policy audit_select_admin on audit_logs
  for select to authenticated using (is_tournament_admin(tournament_id));

-- ── join_attempts: 정책 없음 (RPC 전용) ─────────────────────────────
-- 아무 정책도 만들지 않는다 = authenticated 는 읽지도 쓰지도 못한다.
