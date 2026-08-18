-- ════════════════════════════════════════════════════════════════════
-- 경기 편성 · 순위 집계 · Realtime
-- ════════════════════════════════════════════════════════════════════

-- ── 경기 편성 ───────────────────────────────────────────────────────
-- 목표점수(21/11)와 승점(1.0/0.5)을 클라이언트가 보내지 않는다.
-- 조의 is_joker 와 대회 config 에서 서버가 직접 계산해 스냅샷으로 굳힌다.
-- 이렇게 해야 (a) 조작이 불가능하고 (b) 나중에 조커 구성을 바꿔도
-- 이미 치른 경기의 결과와 순위가 소급 변조되지 않는다.
create or replace function create_match(
  p_tournament_id uuid,
  p_court_id      uuid,
  p_label         text,
  p_group_a       uuid,
  p_players_a     uuid[],
  p_group_b       uuid,
  p_players_b     uuid[],
  p_referees      uuid[] default '{}'
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match      matches;
  v_config     jsonb;
  v_squad      int;
  v_joker_a    boolean;
  v_joker_b    boolean;
  v_team_a     uuid;
  v_team_b     uuid;
  v_all        uuid[];
  v_busy       text;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 경기를 편성할 수 있습니다' using errcode = '42501';
  end if;

  select config into v_config from tournaments where id = p_tournament_id;
  if not found then
    raise exception '대회를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;

  if p_group_a = p_group_b then
    raise exception '같은 조끼리는 맞붙을 수 없습니다' using errcode = '22023';
  end if;

  select is_joker into v_joker_a from groups where id = p_group_a and tournament_id = p_tournament_id;
  if not found then
    raise exception 'A팀 조를 찾을 수 없습니다' using errcode = '22023';
  end if;
  select is_joker into v_joker_b from groups where id = p_group_b and tournament_id = p_tournament_id;
  if not found then
    raise exception 'B팀 조를 찾을 수 없습니다' using errcode = '22023';
  end if;

  if coalesce(array_length(p_players_a, 1), 0) <> v_squad
     or coalesce(array_length(p_players_b, 1), 0) <> v_squad then
    raise exception '각 팀에서 %명씩 선택해 주세요', v_squad using errcode = '22023';
  end if;

  -- 선수는 자기 조 소속이어야 한다
  if exists (
    select 1 from unnest(p_players_a) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = p_tournament_id and tm.group_id = p_group_a)
  ) then
    raise exception 'A팀 선수 중 해당 조 소속이 아닌 사람이 있습니다' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_players_b) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = p_tournament_id and tm.group_id = p_group_b)
  ) then
    raise exception 'B팀 선수 중 해당 조 소속이 아닌 사람이 있습니다' using errcode = '22023';
  end if;

  v_all := p_players_a || p_players_b;

  -- 심판은 뛰는 선수일 수 없다
  if exists (select 1 from unnest(p_referees) r where r = any(v_all)) then
    raise exception '경기에 뛰는 사람은 그 경기의 심판을 볼 수 없습니다' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_referees) r
    where not exists (select 1 from tournament_members tm
                      where tm.id = r and tm.tournament_id = p_tournament_id)
  ) then
    raise exception '이 대회의 참가자가 아닌 심판이 있습니다' using errcode = '22023';
  end if;

  -- 한 사람이 동시에 두 코트에서 뛸 수는 없다 (진행 중인 경기만 검사)
  select string_agg(distinct tm.display_name, ', ') into v_busy
  from match_team_players mtp
  join match_teams mt on mt.id = mtp.match_team_id
  join matches m on m.id = mt.match_id
  join tournament_members tm on tm.id = mtp.member_id
  where m.status = 'live' and mtp.member_id = any(v_all);

  if v_busy is not null then
    raise exception '%님은 지금 다른 코트에서 경기 중입니다', v_busy using errcode = '22023';
  end if;

  if p_court_id is not null then
    if not exists (select 1 from courts where id = p_court_id and tournament_id = p_tournament_id) then
      raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
    end if;
  end if;

  insert into matches (tournament_id, court_id, label, status, source, created_by, updated_by)
  values (p_tournament_id, p_court_id, nullif(btrim(coalesce(p_label, '')), ''),
          'scheduled', 'live', auth.uid(), auth.uid())
  returning * into v_match;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (
    v_match.id, 'A', p_group_a,
    (case when v_joker_a then v_config->>'jokerPoints' else v_config->>'normalPoints' end)::int,
    (case when v_joker_a then v_config->>'jokerWinPoints' else v_config->>'winPoints' end)::numeric,
    v_joker_a
  ) returning id into v_team_a;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (
    v_match.id, 'B', p_group_b,
    (case when v_joker_b then v_config->>'jokerPoints' else v_config->>'normalPoints' end)::int,
    (case when v_joker_b then v_config->>'jokerWinPoints' else v_config->>'winPoints' end)::numeric,
    v_joker_b
  ) returning id into v_team_b;

  insert into match_team_players (match_team_id, member_id)
  select v_team_a, unnest(p_players_a);
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, unnest(p_players_b);

  if coalesce(array_length(p_referees, 1), 0) > 0 then
    insert into match_referees (match_id, member_id)
    select v_match.id, unnest(p_referees);
  end if;

  perform log_audit(p_tournament_id, 'match.create', 'match', v_match.id, null, to_jsonb(v_match));
  return v_match;
end;
$fn$;

-- ── 대회 상태 변경 ──────────────────────────────────────────────────
create or replace function set_tournament_status(p_tournament_id uuid, p_status tournament_status)
returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_before jsonb;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 대회 상태를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  select to_jsonb(t) into v_before from tournaments t where t.id = p_tournament_id;

  -- 조를 아직 안 고른 사람이 있으면 시작을 막는다.
  -- 시작 뒤에는 본인이 조를 못 바꾸므로, 여기서 걸러야 관리자 일이 줄어든다.
  if p_status = 'live' then
    if exists (select 1 from tournament_members
               where tournament_id = p_tournament_id and group_id is null) then
      raise exception '아직 조를 선택하지 않은 참가자가 있습니다' using errcode = '22023';
    end if;
  end if;

  update tournaments set status = p_status where id = p_tournament_id
  returning * into v_tournament;

  perform log_audit(p_tournament_id, 'tournament.status', 'tournament', p_tournament_id,
                    v_before, to_jsonb(v_tournament));
  return v_tournament;
end;
$fn$;

-- ── 초대 코드 재발급 ────────────────────────────────────────────────
create or replace function regenerate_invite_code(p_tournament_id uuid)
returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code text;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 초대 코드를 재발급할 수 있습니다' using errcode = '42501';
  end if;

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다' using errcode = '40001';
    end if;
  end loop;

  update tournaments set invite_code = v_code where id = p_tournament_id
  returning * into v_tournament;

  perform log_audit(p_tournament_id, 'tournament.regenerate_code', 'tournament',
                    p_tournament_id, null, jsonb_build_object('code', v_code));
  return v_tournament;
end;
$fn$;

-- ── 대진 개요 뷰 ────────────────────────────────────────────────────
-- security_invoker = true 여야 호출자의 RLS 가 그대로 적용된다.
-- 이게 빠지면 뷰가 RLS 우회 통로가 된다.
create or replace view match_overview
with (security_invoker = true) as
select
  m.id,
  m.tournament_id,
  m.court_id,
  c.name          as court_name,
  m.label,
  m.status,
  m.source,
  m.score_a,
  m.score_b,
  m.winner_side,
  m.started_at,
  m.finished_at,
  m.edited_at,
  m.created_at,
  ta.group_id     as group_a_id,
  ga.name         as group_a_name,
  ta.is_joker     as group_a_joker,
  ta.target_score as target_a,
  tb.group_id     as group_b_id,
  gb.name         as group_b_name,
  tb.is_joker     as group_b_joker,
  tb.target_score as target_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players p join tournament_members tm on tm.id = p.member_id
    where p.match_team_id = ta.id) as players_a,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players p join tournament_members tm on tm.id = p.member_id
    where p.match_team_id = tb.id) as players_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_referees r join tournament_members tm on tm.id = r.member_id
    where r.match_id = m.id) as referees
from matches m
left join courts c      on c.id = m.court_id
left join match_teams ta on ta.match_id = m.id and ta.side = 'A'
left join match_teams tb on tb.match_id = m.id and tb.side = 'B'
left join groups ga     on ga.id = ta.group_id
left join groups gb     on gb.id = tb.group_id;

grant select on match_overview to authenticated;

-- ── 조별 순위 ───────────────────────────────────────────────────────
-- 승점은 편성 시점에 굳힌 win_points 를 쓴다 (일반 1.0 / 조커 0.5).
-- 조커조는 11점만 내면 이기지만 승점이 절반이라 균형이 맞는다.
--
-- 정렬: 승점 → 득실차 → 총득점 → 조 순서
-- 승자승(head-to-head)은 동점인 조끼리만 의미가 있고 SQL 로 일반화하기
-- 까다로워서, 클라이언트에서 동점 그룹에 한해 2차 정렬한다.
create or replace function get_standings(p_tournament_id uuid)
returns table (
  group_id    uuid,
  group_name  text,
  is_joker    boolean,
  sort_order  int,
  played      bigint,
  wins        bigint,
  losses      bigint,
  points      numeric,
  scored      bigint,
  conceded    bigint,
  diff        bigint
)
language sql stable security invoker set search_path = public, pg_temp as $fn$
  with team_rows as (
    select
      mt.group_id,
      mt.win_points,
      (m.winner_side = mt.side) as won,
      case when mt.side = 'A' then m.score_a else m.score_b end as scored,
      case when mt.side = 'A' then m.score_b else m.score_a end as conceded
    from match_teams mt
    join matches m on m.id = mt.match_id
    where m.tournament_id = p_tournament_id
      and m.status = 'finished'
  )
  select
    g.id,
    g.name,
    g.is_joker,
    g.sort_order,
    -- count(tr.*) 는 LEFT JOIN 의 NULL 확장 행까지 세는 함정이 있다.
    -- 실제 컬럼을 세야 경기를 한 번도 안 치른 조가 0 으로 나온다.
    count(tr.group_id)                                                 as played,
    count(*) filter (where tr.won)                                     as wins,
    count(*) filter (where tr.won is false)                            as losses,
    coalesce(sum(tr.win_points) filter (where tr.won), 0)::numeric     as points,
    coalesce(sum(tr.scored), 0)::bigint                                as scored,
    coalesce(sum(tr.conceded), 0)::bigint                              as conceded,
    coalesce(sum(tr.scored) - sum(tr.conceded), 0)::bigint             as diff
  from groups g
  left join team_rows tr on tr.group_id = g.id
  where g.tournament_id = p_tournament_id
  group by g.id, g.name, g.is_joker, g.sort_order
  order by points desc, diff desc, scored desc, g.sort_order;
$fn$;

revoke all on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[]) from public;
revoke all on function set_tournament_status(uuid, tournament_status) from public;
revoke all on function regenerate_invite_code(uuid) from public;
revoke all on function get_standings(uuid) from public;

grant execute on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[]) to authenticated;
grant execute on function set_tournament_status(uuid, tournament_status) to authenticated;
grant execute on function regenerate_invite_code(uuid) to authenticated;
grant execute on function get_standings(uuid) to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────
-- matches 만 구독한다. score_events 를 구독하면 클라이언트가 매번
-- 재집계해야 하고 페이로드도 커진다. 투영 테이블 하나면 충분하다.
alter publication supabase_realtime add table matches;
