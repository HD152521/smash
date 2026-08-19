-- ════════════════════════════════════════════════════════════════════
-- 경기를 미리 여러 개 짜둘 수 있게 한다.
--
-- 실제 운영 순서는 이렇다:
--   관리자가 경기를 여러 개 만든다 → 비는 코트를 보고 배정한다
--   → 그 코트 대기열에 선다 → 대기열에서 눌러 시작한다
--
-- 그런데 create_match 가 '지금' 상태를 보고 '나중'을 막고 있었다:
--
--   1) 그 코트에 진행 중인 경기가 있으면 편성 자체를 거부했다.
--      주석에는 "예정은 여러 개여도 되지만 진행 중은 하나뿐이다" 라고
--      써 있었는데 코드가 정반대였다. 대기열을 쌓는 게 요점인데
--      코트가 도는 동안에는 아무것도 못 넣는다.
--
--   2) 지금 뛰고 있는 선수가 끼면 편성을 거부했다. 그 사람은 몇 분 뒤면
--      코트에서 내려온다. 다음 경기를 미리 잡아둘 수가 없었다.
--
-- 두 검사 모두 '시작하는 순간' 에 참이어야 하는 규칙이다. 그래서
-- create_match 에서 빼고 start_match 로 옮긴다. 한 코트 한 경기 규칙은
-- start_match 와 one_live_match_per_court 부분 유니크 인덱스가 지킨다.
-- ════════════════════════════════════════════════════════════════════

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

  -- 심판은 뛰는 선수일 수 없다. 이건 시점과 무관하게 항상 참이어야 한다.
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

  -- 코트는 이 대회 것이기만 하면 된다. 지금 그 코트가 도는 중이어도
  -- 예정 경기는 뒤에 줄을 서면 된다.
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
  select v_team_a, pid from unnest(p_players_a) pid;
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, pid from unnest(p_players_b) pid;

  insert into match_referees (match_id, member_id)
  select v_match.id, r from unnest(p_referees) r;

  return v_match;
end;
$fn$;

-- ────────────────────────────────────────────────────────────────────
-- 검사를 '시작하는 순간' 으로 옮긴다.
-- 여기서는 지금 뛰는 사람인지가 진짜로 참이어야 하는 조건이다.
-- ────────────────────────────────────────────────────────────────────
create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
  v_busy text;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
    raise exception '이 경기를 시작할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기입니다' using errcode = '22023';
  end if;

  if v_match.court_id is not null then
    select c.name into v_court_name from courts c where c.id = v_match.court_id;
    if exists (select 1 from matches m
               where m.court_id = v_match.court_id and m.status = 'live' and m.id <> p_match_id) then
      raise exception '%에서 진행 중인 경기를 먼저 끝내주세요', v_court_name using errcode = '22023';
    end if;
  end if;

  -- 한 사람이 동시에 두 코트에서 뛸 수는 없다
  select string_agg(distinct tm.display_name, ', ') into v_busy
  from match_team_players mtp
  join match_teams mt on mt.id = mtp.match_team_id
  join matches other on other.id = mt.match_id
  join tournament_members tm on tm.id = mtp.member_id
  where other.status = 'live'
    and other.id <> p_match_id
    and mtp.member_id in (
      select mtp2.member_id
      from match_team_players mtp2
      join match_teams mt2 on mt2.id = mtp2.match_team_id
      where mt2.match_id = p_match_id
    );

  if v_busy is not null then
    raise exception '%님이 다른 코트에서 경기 중입니다. 그 경기가 끝난 뒤 시작해 주세요', v_busy
      using errcode = '22023';
  end if;

  update matches
  set status = 'live', started_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

revoke all on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[])
  from public, anon;
grant execute on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[])
  to authenticated;
revoke all on function start_match(uuid) from public, anon;
grant execute on function start_match(uuid) to authenticated;
