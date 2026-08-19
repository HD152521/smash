-- ════════════════════════════════════════════════════════════════════
-- 아직 시작하지 않은 경기 고치기
--
-- 사람이 안 왔거나 조를 잘못 골랐을 때, 지금은 지우고 다시 만드는 수밖에
-- 없다. 그러면 코트 배정과 심판 지정이 함께 날아가고 알림도 다시 나간다.
--
-- 왜 직접 UPDATE 로 두지 않는가:
--   조를 바꾸면 match_teams 의 group_id 만 바꿔서는 안 된다.
--   target_score / win_points 는 편성 시점에 굳혀 둔 스냅샷이라
--   (조커 11점 0.5승점 / 일반 21점 1승점) 함께 다시 계산해야 한다.
--   한 칸이라도 빠뜨리면 조커조가 21점을 내야 이기는 경기가 만들어진다.
--
--   선수 소속·정원·심판 규칙도 편성과 똑같이 지켜야 하는데, 그 검사는
--   전부 create_match 안에 있다. 화면에서 세 테이블을 직접 손대게 하면
--   그 규칙을 다시 구현해야 하고, 반드시 어긋난다.
--
-- 시작한 경기는 못 고친다. 점수가 이미 붙어 있어서 선수를 바꾸면
-- 그 점수가 누구 것인지 알 수 없어진다. 그때는 무효 처리가 맞다.
-- ════════════════════════════════════════════════════════════════════

create or replace function update_match(
  p_match_id  uuid,
  p_court_id  uuid,
  p_group_a   uuid,
  p_players_a uuid[],
  p_group_b   uuid,
  p_players_b uuid[],
  p_referees  uuid[] default '{}'
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match   matches;
  v_before  jsonb;
  v_config  jsonb;
  v_squad   int;
  v_joker_a boolean;
  v_joker_b boolean;
  v_team_a  uuid;
  v_team_b  uuid;
  v_all     uuid[];
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_tournament_admin(v_match.tournament_id) then
    raise exception '관리자만 경기를 고칠 수 있습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기는 고칠 수 없습니다. 무효 처리를 해주세요'
      using errcode = '22023';
  end if;

  select config into v_config from tournaments where id = v_match.tournament_id;
  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;

  if p_group_a = p_group_b then
    raise exception '같은 조끼리는 맞붙을 수 없습니다' using errcode = '22023';
  end if;

  select is_joker into v_joker_a from groups
   where id = p_group_a and tournament_id = v_match.tournament_id;
  if not found then
    raise exception 'A팀 조를 찾을 수 없습니다' using errcode = '22023';
  end if;
  select is_joker into v_joker_b from groups
   where id = p_group_b and tournament_id = v_match.tournament_id;
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
                      where tm.id = pid and tm.tournament_id = v_match.tournament_id
                        and tm.group_id = p_group_a)
  ) then
    raise exception 'A팀 선수 중 해당 조 소속이 아닌 사람이 있습니다' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_players_b) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = v_match.tournament_id
                        and tm.group_id = p_group_b)
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
                      where tm.id = r and tm.tournament_id = v_match.tournament_id)
  ) then
    raise exception '이 대회의 참가자가 아닌 심판이 있습니다' using errcode = '22023';
  end if;

  if p_court_id is not null then
    if not exists (select 1 from courts
                   where id = p_court_id and tournament_id = v_match.tournament_id) then
      raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
    end if;
  end if;

  v_before := to_jsonb(v_match);

  -- 팀을 통째로 다시 만든다. match_team_players 는 cascade 로 함께 지워진다.
  -- 부분 수정하면 스냅샷(target_score/win_points)이 조와 어긋날 수 있다.
  delete from match_teams where match_id = p_match_id;
  delete from match_referees where match_id = p_match_id;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (
    p_match_id, 'A', p_group_a,
    (case when v_joker_a then v_config->>'jokerPoints' else v_config->>'normalPoints' end)::int,
    (case when v_joker_a then v_config->>'jokerWinPoints' else v_config->>'winPoints' end)::numeric,
    v_joker_a
  ) returning id into v_team_a;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (
    p_match_id, 'B', p_group_b,
    (case when v_joker_b then v_config->>'jokerPoints' else v_config->>'normalPoints' end)::int,
    (case when v_joker_b then v_config->>'jokerWinPoints' else v_config->>'winPoints' end)::numeric,
    v_joker_b
  ) returning id into v_team_b;

  insert into match_team_players (match_team_id, member_id)
  select v_team_a, pid from unnest(p_players_a) pid;
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, pid from unnest(p_players_b) pid;

  -- 미가입 참가자를 심판으로 넣는 것은 트리거가 막는다
  insert into match_referees (match_id, member_id)
  select p_match_id, r from unnest(p_referees) r;

  update matches
     set court_id = p_court_id, updated_by = auth.uid(), edited_at = now()
   where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'match.edit', 'match',
                    p_match_id, v_before, to_jsonb(v_match));
  return v_match;
end;
$fn$;

revoke all on function update_match(uuid, uuid, uuid, uuid[], uuid, uuid[], uuid[])
  from public, anon;
grant execute on function update_match(uuid, uuid, uuid, uuid[], uuid, uuid[], uuid[])
  to authenticated;
