-- ════════════════════════════════════════════════════════════════════
-- 누락된 경기 결과를 소급 입력한다.
--
-- 심판이 앱을 안 켜고 경기를 돌린 경우가 대회마다 생긴다. 그 결과를
-- 넣으려고 경기를 만들고 21번 탭하게 할 수는 없다.
--
-- 원장(score_events)은 만들지 않는다. 실제로 한 점씩 들어온 게 아니라
-- 결과만 아는 것이므로, 원장을 지어내면 감사 추적이 거짓말이 된다.
-- 대신 source='manual' 로 표시하고 감사 로그를 남긴다.
-- 화면에서도 '직접 입력' 으로 구분해 보여준다.
-- ════════════════════════════════════════════════════════════════════

create or replace function record_manual_match(
  p_tournament_id uuid,
  p_group_a       uuid,
  p_players_a     uuid[],
  p_score_a       int,
  p_group_b       uuid,
  p_players_b     uuid[],
  p_score_b       int,
  p_label         text default null
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match   matches;
  v_config  jsonb;
  v_squad   int;
  v_joker_a boolean;
  v_joker_b boolean;
  v_team_a  uuid;
  v_team_b  uuid;
  v_winner  team_side;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 결과를 입력할 수 있습니다' using errcode = '42501';
  end if;

  select config into v_config from tournaments where id = p_tournament_id;
  if not found then
    raise exception '대회를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  if p_group_a = p_group_b then
    raise exception '같은 조끼리는 맞붙을 수 없습니다' using errcode = '22023';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception '점수는 0점 이상이어야 합니다' using errcode = '22023';
  end if;
  if p_score_a = p_score_b then
    raise exception '동점으로는 기록할 수 없습니다' using errcode = '22023';
  end if;

  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;

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

  v_winner := case when p_score_a > p_score_b then 'A'::team_side else 'B'::team_side end;

  insert into matches (tournament_id, label, status, source, score_a, score_b,
                       winner_side, finished_at, created_by, updated_by, edited_at)
  values (p_tournament_id, nullif(btrim(coalesce(p_label, '')), ''), 'finished', 'manual',
          p_score_a, p_score_b, v_winner, now(), auth.uid(), auth.uid(), now())
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

  perform log_audit(p_tournament_id, 'match.manual', 'match', v_match.id,
                    null, to_jsonb(v_match));
  return v_match;
end;
$fn$;

revoke all on function record_manual_match(uuid, uuid, uuid[], int, uuid, uuid[], int, text)
  from public, anon;
grant execute on function record_manual_match(uuid, uuid, uuid[], int, uuid, uuid[], int, text)
  to authenticated;
