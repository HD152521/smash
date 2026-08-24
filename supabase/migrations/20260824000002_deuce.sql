-- ════════════════════════════════════════════════════════════════════
-- 듀스 (2점 차 승부)
--
-- config 에 'deuce' 키는 처음부터 있었지만 아무도 읽지 않았다. 스키마가
-- 거짓말을 하고 있던 셈이다. 이제 실제로 판정에 반영한다.
--
-- ── 규칙 ────────────────────────────────────────────────────────────
--
--   듀스 끔    목표 점수에 닿는 순간 끝  (지금까지의 동작)
--   듀스 켬    목표 점수에 닿아도 2점 차가 나야 끝
--              단, 상한(deuceCap)에 닿으면 2점 차 없이 그 점수로 끝
--
--   예) 21점 · 상한 30점 →  21:19 승 · 21:20 아직 · 22:20 승 · 30:29 승
--
-- ── 왜 match_teams 에 굳히나 ────────────────────────────────────────
--
-- 목표 점수·승점과 똑같은 이유다. 대회 도중 규칙을 바꿔도 이미 치른 경기의
-- 판정 근거가 소급 변조되면 안 된다. 그래서 편성 시점의 config 를 팀 행에
-- 스냅샷으로 굳힌다.
--
-- ── 왜 트리거로 채우나 ──────────────────────────────────────────────
--
-- match_teams 에 쓰는 곳이 셋이다 (create_match · update_match ·
-- record_manual_match). 셋 다 고치면 다음에 넷째가 생겼을 때 또 빠뜨린다.
-- 컬럼을 채우는 책임을 테이블 쪽에 두면 쓰는 곳이 몇 개든 안 어긋난다.
-- ════════════════════════════════════════════════════════════════════

-- ── config 에서 규칙을 꺼내는 함수 ──────────────────────────────────
-- 조커조와 일반조가 서로 다른 값을 쓴다는 비대칭을 여기 한 곳에 가둔다.
create or replace function rule_deuce(p_config jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce((p_config->>'deuce')::boolean, false);
$fn$;

create or replace function rule_max_score(p_config jsonb, p_is_joker boolean) returns int
language sql immutable set search_path = public, pg_temp as $fn$
  select case
    when not coalesce((p_config->>'deuce')::boolean, false) then null
    -- null = 상한 없음. 2점 차가 날 때까지 계속한다.
    else (case when p_is_joker then p_config->>'jokerDeuceCap'
               else p_config->>'deuceCap' end)::int
  end;
$fn$;

-- ── 스냅샷 컬럼 ─────────────────────────────────────────────────────
alter table match_teams
  add column if not exists deuce     boolean not null default false,
  add column if not exists max_score int;

-- 상한이 목표보다 낮으면 목표에 닿는 순간 이미 상한을 넘어 있다 — 규칙이 아니라 오타다.
alter table match_teams drop constraint if exists match_teams_max_score_check;
alter table match_teams add constraint match_teams_max_score_check
  check (max_score is null or (max_score between 1 and 99 and max_score >= target_score));

create or replace function fill_match_team_rules()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_config jsonb;
begin
  select t.config into v_config
    from matches m
    join tournaments t on t.id = m.tournament_id
   where m.id = new.match_id;

  new.deuce     := rule_deuce(v_config);
  new.max_score := rule_max_score(v_config, new.is_joker);
  return new;
end;
$fn$;

drop trigger if exists match_teams_fill_rules on match_teams;
create trigger match_teams_fill_rules
  before insert on match_teams
  for each row execute function fill_match_team_rules();

-- ── 승자 판정 ───────────────────────────────────────────────────────
--
-- ⚠ src/lib/rules.ts 의 decideWinner 와 같은 판정이어야 한다.
--   진실의 원천은 여기고, 저쪽은 화면을 먼저 움직이기 위한 사본이다.
create or replace function side_wins(
  p_mine int, p_theirs int, p_target int, p_deuce boolean, p_max int
) returns boolean
language sql immutable set search_path = public, pg_temp as $fn$
  select case
    when p_mine < p_target                            then false
    when not coalesce(p_deuce, false)                 then true
    when p_max is not null and p_mine >= p_max        then true
    else (p_mine - p_theirs) >= 2
  end;
$fn$;

-- 양쪽이 동시에 조건을 만족하는 일은 +1 씩 오르는 한 생기지 않지만,
-- 관리자가 점수를 수기로 넣는 경로가 있으므로 A 를 우선으로 결정한다.
create or replace function decide_winner(
  p_score_a int, p_score_b int,
  p_target_a int, p_target_b int,
  p_deuce_a boolean, p_deuce_b boolean,
  p_max_a int, p_max_b int
) returns team_side
language sql immutable set search_path = public, pg_temp as $fn$
  select case
    when side_wins(p_score_a, p_score_b, p_target_a, p_deuce_a, p_max_a) then 'A'::team_side
    when side_wins(p_score_b, p_score_a, p_target_b, p_deuce_b, p_max_b) then 'B'::team_side
    else null
  end;
$fn$;

-- ── 득점 ────────────────────────────────────────────────────────────
-- 판정 부분만 decide_winner 로 갈아 끼운다. 원장·멱등·잠금은 그대로다.
create or replace function record_score(
  p_match_id        uuid,
  p_side            team_side,
  p_delta           int,
  p_client_event_id text
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match    matches;
  v_rows     int;
  v_score_a  int;
  v_score_b  int;
  v_target_a int;
  v_target_b int;
  v_deuce_a  boolean;
  v_deuce_b  boolean;
  v_max_a    int;
  v_max_b    int;
  v_winner   team_side;
begin
  if p_delta not in (1, -1) then
    raise exception '점수 변화량은 +1 또는 -1 만 가능합니다' using errcode = '22023';
  end if;

  -- 두 심판이 동시에 눌러도 순서대로 처리되도록 경기 행을 잠근다
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
    raise exception '이 경기의 점수를 기록할 권한이 없습니다' using errcode = '42501';
  end if;

  if v_match.status <> 'live' then
    raise exception '진행 중인 경기가 아닙니다' using errcode = '22023';
  end if;

  insert into score_events (match_id, side, delta, client_event_id, created_by)
  values (p_match_id, p_side, p_delta, p_client_event_id, auth.uid())
  on conflict (client_event_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- 이미 반영된 요청이다. 재전송이므로 현재 상태만 돌려주고 끝낸다.
    return v_match;
  end if;

  select
    coalesce(sum(delta) filter (where side = 'A'), 0),
    coalesce(sum(delta) filter (where side = 'B'), 0)
  into v_score_a, v_score_b
  from score_events
  where match_id = p_match_id and not voided;

  if v_score_a < 0 or v_score_b < 0 then
    raise exception '점수는 0점 미만이 될 수 없습니다' using errcode = '22023';
  end if;

  select
    max(target_score) filter (where side = 'A'),
    max(target_score) filter (where side = 'B'),
    bool_or(deuce)    filter (where side = 'A'),
    bool_or(deuce)    filter (where side = 'B'),
    max(max_score)    filter (where side = 'A'),
    max(max_score)    filter (where side = 'B')
  into v_target_a, v_target_b, v_deuce_a, v_deuce_b, v_max_a, v_max_b
  from match_teams where match_id = p_match_id;

  if v_target_a is null or v_target_b is null then
    raise exception '양 팀이 편성되지 않은 경기입니다' using errcode = '22023';
  end if;

  v_winner := decide_winner(v_score_a, v_score_b, v_target_a, v_target_b,
                            v_deuce_a, v_deuce_b, v_max_a, v_max_b);

  update matches set
    score_a     = v_score_a,
    score_b     = v_score_b,
    status      = case when v_winner is not null then 'finished'::match_status else status end,
    winner_side = v_winner,
    finished_at = case when v_winner is not null then now() else finished_at end,
    updated_by  = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

-- ── 득점 취소 ───────────────────────────────────────────────────────
create or replace function undo_score(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match     matches;
  v_event_id  bigint;
  v_is_admin  boolean;
  v_score_a   int;
  v_score_b   int;
  v_target_a  int;
  v_target_b  int;
  v_deuce_a   boolean;
  v_deuce_b   boolean;
  v_max_a     int;
  v_max_b     int;
  v_winner    team_side;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  v_is_admin := is_tournament_admin(v_match.tournament_id);

  if not (is_match_referee(p_match_id) or v_is_admin) then
    raise exception '이 경기의 점수를 되돌릴 권한이 없습니다' using errcode = '42501';
  end if;

  if v_match.status = 'finished' and not v_is_admin then
    if v_match.finished_at is null or v_match.finished_at < now() - interval '2 minutes' then
      raise exception '종료된 지 2분이 지났습니다. 관리자에게 요청해 주세요' using errcode = '42501';
    end if;
  elsif v_match.status not in ('live', 'finished') then
    raise exception '점수를 되돌릴 수 있는 상태가 아닙니다' using errcode = '22023';
  end if;

  select id into v_event_id
  from score_events
  where match_id = p_match_id and not voided
  order by id desc limit 1;

  if v_event_id is null then
    raise exception '되돌릴 점수가 없습니다' using errcode = '22023';
  end if;

  update score_events set voided = true where id = v_event_id;

  select
    coalesce(sum(delta) filter (where side = 'A'), 0),
    coalesce(sum(delta) filter (where side = 'B'), 0)
  into v_score_a, v_score_b
  from score_events
  where match_id = p_match_id and not voided;

  select
    max(target_score) filter (where side = 'A'),
    max(target_score) filter (where side = 'B'),
    bool_or(deuce)    filter (where side = 'A'),
    bool_or(deuce)    filter (where side = 'B'),
    max(max_score)    filter (where side = 'A'),
    max(max_score)    filter (where side = 'B')
  into v_target_a, v_target_b, v_deuce_a, v_deuce_b, v_max_a, v_max_b
  from match_teams where match_id = p_match_id;

  -- 되돌린 결과가 아직도 종료 조건을 만족하면 종료 상태를 유지한다
  v_winner := decide_winner(v_score_a, v_score_b, v_target_a, v_target_b,
                            v_deuce_a, v_deuce_b, v_max_a, v_max_b);

  update matches set
    score_a     = v_score_a,
    score_b     = v_score_b,
    status      = case when v_winner is not null then 'finished'::match_status else 'live'::match_status end,
    winner_side = v_winner,
    finished_at = case when v_winner is not null then finished_at else null end,
    updated_by  = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'score.undo', 'match', p_match_id,
                    jsonb_build_object('scoreEventId', v_event_id),
                    jsonb_build_object('scoreA', v_score_a, 'scoreB', v_score_b));

  return v_match;
end;
$fn$;

-- ── 화면이 같은 판정을 하려면 스냅샷이 함께 와야 한다 ───────────────
drop view if exists match_overview;
create view match_overview
with (security_invoker = true) as
select
  m.id,
  m.tournament_id,
  m.court_id,
  c.name as court_name,
  m.label,
  m.status,
  m.source,
  m.score_a,
  m.score_b,
  m.winner_side,
  m.queue_order,
  m.started_at,
  m.finished_at,
  m.edited_at,
  m.created_at,
  ta.group_id   as group_a_id,
  ga.name       as group_a_name,
  ga.is_joker   as group_a_joker,
  ta.target_score as target_a,
  ta.deuce        as deuce_a,
  ta.max_score    as max_a,
  tb.group_id   as group_b_id,
  gb.name       as group_b_name,
  gb.is_joker   as group_b_joker,
  tb.target_score as target_b,
  tb.deuce        as deuce_b,
  tb.max_score    as max_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = ta.id) as players_a,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = tb.id) as players_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_referees mr
     join tournament_members tm on tm.id = mr.member_id
    where mr.match_id = m.id) as referees
from matches m
left join courts c on c.id = m.court_id
left join match_teams ta on ta.match_id = m.id and ta.side = 'A'
left join groups ga on ga.id = ta.group_id
left join match_teams tb on tb.match_id = m.id and tb.side = 'B'
left join groups gb on gb.id = tb.group_id;

grant select on match_overview to authenticated;
