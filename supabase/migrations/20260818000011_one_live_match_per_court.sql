-- ════════════════════════════════════════════════════════════════════
-- 한 코트에서는 한 경기만 진행된다.
--
-- 경기는 코트 단위로 돌아간다. 같은 코트에 진행 중인 경기가 둘이면
-- 관전 화면과 대진표가 모순되고, 심판 두 명이 같은 코트를 두고 다툰다.
--
-- 예정(scheduled)은 여러 개여도 된다 — 그게 그 코트의 대기열이다.
-- 막아야 하는 건 '동시에 진행 중' 뿐이다.
--
-- 부분 유니크 인덱스로 DB 가 강제한다. 애플리케이션 검사만으로는
-- 동시 요청 두 개가 나란히 통과할 수 있다.
-- ════════════════════════════════════════════════════════════════════

create unique index one_live_match_per_court
  on matches (court_id)
  where status = 'live' and court_id is not null;

-- 편성 시점에도 미리 걸러 사용자에게 읽히는 메시지를 준다
-- (인덱스 위반은 영문 unique constraint 메시지로 나온다)
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
  v_court_name text;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 경기를 편성할 수 있습니다' using errcode = '42501';
  end if;

  select config into v_config from tournaments where id = p_tournament_id;
  if not found then
    raise exception '대회를 찾을 수 없습니다' using errcode = 'PT404';
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
    select name into v_court_name from courts
    where id = p_court_id and tournament_id = p_tournament_id;
    if not found then
      raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
    end if;
    -- ★ 한 코트 한 경기. 예정은 여러 개여도 되지만 진행 중은 하나뿐이다.
    if exists (select 1 from matches
               where court_id = p_court_id and status = 'live') then
      raise exception '%에서 이미 경기가 진행 중입니다', v_court_name using errcode = '22023';
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

  insert into match_team_players (match_team_id, member_id) select v_team_a, unnest(p_players_a);
  insert into match_team_players (match_team_id, member_id) select v_team_b, unnest(p_players_b);

  if coalesce(array_length(p_referees, 1), 0) > 0 then
    insert into match_referees (match_id, member_id) select v_match.id, unnest(p_referees);
  end if;

  perform log_audit(p_tournament_id, 'match.create', 'match', v_match.id, null, to_jsonb(v_match));
  return v_match;
end;
$fn$;

-- 경기 시작 시점에도 확인한다. 편성 후 시작 전에 다른 경기가 먼저 시작될 수 있다.
create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
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

  update matches
  set status = 'live', started_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

revoke all on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[]) from public, anon;
revoke all on function start_match(uuid) from public, anon;
grant execute on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[]) to authenticated;
grant execute on function start_match(uuid) to authenticated;
