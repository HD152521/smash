-- ════════════════════════════════════════════════════════════════════
-- 모임 경기 고치기 — 한 트랜잭션 안에서, 경기 id 를 그대로 두고
--
-- ── 왜 필요한가 ─────────────────────────────────────────────────────
--
-- 모임 경기 수정 화면(`/t/:id/matches/:matchId/edit-session`)에는 맞는 서버
-- 함수가 없어서 **지우고 다시 만들기** 로 우회하고 있었다.
--
-- `update_match`(20260819000011)는 모임에 원리적으로 못 쓴다. `p_group_a` 로
-- `groups` 를 조회해 없으면 던지는데, 모임은 조가 0개다
-- (`match_teams.group_id` 가 NULL — 20260825000001). 실측:
--
--     update_match(p_group_a: null, …) → 400 {"22023","A팀 조를 찾을 수 없습니다"}
--
-- ── 우회가 무엇을 걸고 있었나 ───────────────────────────────────────
--
-- 우회는 **지우기를 먼저** 한다. 순서를 반대로 하면 아주 짧은 순간 같은 넷이
-- 두 경기에 들어가 있고, 그 사이에 누가 코트를 시작하면 한 사람이 두 코트에서
-- 불려 간다. 그래서 지우기가 먼저였다 — 그런데 **지우기가 성공하고 만들기가
-- 실패하면 고치려던 경기가 사라진다.** 저녁 체육관에서 "내 경기 어디 갔어" 다.
--
-- 두 순서 중 어느 쪽도 안전하지 않다. 안전한 순서가 없는 게 아니라, 화면에서
-- 두 번 부르는 것으로는 풀 수 없는 문제다. 한 트랜잭션이어야 한다.
--
-- 부수 피해도 있었다:
--   · 경기 id 가 매번 바뀐다 → 새 경기의 `queue_order` 가 시퀀스 기본값이라
--     **줄 맨 뒤로 밀린다.** 선수 한 명을 바꿨을 뿐인데 첫 번째로 뛸 경기가
--     맨 뒤가 된다. 화면이 `set_court_queue` 로 다시 세워 보정하고 있었고,
--     그 보정이 실패할 자리가 하나 더였다.
--   · 감사로그에 `match.edit` 가 아니라 삭제 + 생성으로 남는다.
--   · 지우기가 관리자 전용(RLS `matches_write_admin`)이라, 모임에서 자기
--     경기를 돌릴 수 있는 사람(`can_run_match`)이 자기 편성은 못 고쳤다.
--
-- ── 무엇을 그대로 두는가 ────────────────────────────────────────────
--
-- **경기 id 를 유지한다.** 그래야 `queue_order` 도 그대로고 대기 줄에서
-- 자리가 안 밀린다. 고치기는 고치기지 미루기가 아니다.
-- `matches` 행은 `court_id` · `label` · `edited_at` · `updated_by` 만 손댄다 —
-- `queue_order` · `created_at` · `source` 는 건드리지 않는다.
--
-- 팀은 `update_match` 와 같은 이유로 **통째로 다시 만든다.** 부분 수정하면
-- 스냅샷(target_score · win_points · deuce · max_score)이 어긋날 수 있고,
-- 그 값들은 `match_teams_fill_rules` 트리거가 insert 때 채운다(20260824000002).
-- `match_team_players` 는 cascade 로 함께 지워진다.
--
-- ── 시작한 경기는 못 고친다 ─────────────────────────────────────────
--
-- 원본과 같은 이유다. 점수가 이미 붙어 있는데 선수를 바꾸면 그 점수가 누구
-- 것인지 알 수 없어진다. 그때는 무효 처리가 맞다.
--
-- ── 🔴 search_path ──────────────────────────────────────────────────
--
-- 원본의 `set search_path = public, pg_temp` 를 한 글자도 안 바꾼다. 여기서
-- pgcrypto(gen_random_bytes · digest · crypt)를 부르는 곳이 없으므로 충분하다.
-- 나중에 이 안에 pgcrypto 함수를 넣으면 즉시 `function ... does not exist` 로
-- 죽는다 — Supabase 는 확장을 public 이 아니라 extensions 에 설치한다
-- (20260828000002 가 이 함정으로 동아리 생성을 통째로 막았다).
-- ════════════════════════════════════════════════════════════════════

-- ── 감사로그에 실을 편성 스냅샷 ─────────────────────────────────────
--
-- 이름으로 남긴다. member id 는 그 사람이 나중에 명단에서 빠지면 되짚을 수
-- 없고, 감사로그는 **한참 뒤에 읽는 글**이다 ("누가 날 뺐어" 는 그날 저녁이
-- 아니라 다음 주에 나온다). 같은 이유로 `busy.ts` · `autoQueue.ts` 도 이름을
-- 기준으로 삼는다.
--
-- 편성이 없으면 `[]` 다 — NULL 을 내면 감사로그 화면이 "선수 없음" 과
-- "칸이 빠짐" 을 구분하지 못한다.
create or replace function team_player_names(p_match_id uuid, p_side team_side)
returns jsonb language sql security definer stable
set search_path = public, pg_temp as $fn$
  select coalesce(jsonb_agg(tm.display_name order by tm.display_name), '[]'::jsonb)
    from match_teams mt
    join match_team_players mtp on mtp.match_team_id = mt.id
    join tournament_members tm  on tm.id = mtp.member_id
   where mt.match_id = p_match_id and mt.side = p_side;
$fn$;

-- ⚠ `authenticated` 에게도 주지 않는다. security definer 라 RLS 를 지나쳐서,
-- 열어 두면 경기 id 하나로 **남의 대회 명단 이름**을 읽을 수 있다.
-- 부르는 곳은 아래 함수 안뿐이고, 그 안에서는 소유자로 돌아 실행 권한이 있다
-- (`notify_up_next` 가 같은 이유로 authenticated 까지 revoke 한다).
revoke all on function team_player_names(uuid, team_side) from public, anon, authenticated;

-- ── 권한: `can_run_match` 를 그대로 쓴다 ────────────────────────────
--
-- ⚠ 고치기는 **남을 빼는 일**이다. 그래도 '그 경기 선수' 에게 연다.
--
--   1. **경계를 새로 만들지 않는다.** 시작 · 코트잡기 · 득점 · 취소 · 종료가
--      전부 `can_run_match` 하나를 쓴다(README 「절대 깨면 안 되는 것」 3-a).
--      고치기만 자기만의 OR 를 갖게 되면, 나중에 경계를 넓히거나 좁히는 날
--      한 곳이 조용히 남는다. 이 저장소는 그 사고를 이미 겪었다
--      (20260825000002 — start_match 에서 검사가 통째로 사라졌다).
--
--   2. **넣는 쪽은 이미 열려 있다.** `create_session_match` 는 관리자가
--      아니어도 **자기가 뛰는 편성이면** 만들게 한다 — 즉 남을 코트에 넣는
--      일은 이미 선수가 할 수 있다. 빼는 것만 막아 두면, 잘못 넣은 사람을
--      본인이 못 빼고 모임장을 찾아다니게 된다. 모임 모드가 없애려던 바로
--      그 마찰이다.
--
--   3. **'자기 경기' 가 핵심이다.** `can_run_match` 는 그 경기에 뛰는 사람만
--      통과시킨다. 남의 코트 경기는 모임에서도 못 건드린다. 넷이 코트 앞에
--      서서 "쟤 대신 내가 들어갈게" 를 하는 것이 열리는 전부다.
--
--   4. **되돌릴 수 없는 것이 없다.** 예정 경기만 대상이라 점수도 기록도 아직
--      없다. 빠진 사람은 다시 넣으면 그만이고, 누가 무엇을 바꿨는지는
--      `match.edit` 감사로그에 선수 이름까지 남는다.
--
-- 여는 것이 아니라 **좁히는** 쪽이 위험한 자리다: 관리자만으로 막으면 화면은
-- 열려 있는데 서버가 42501 을 주고, 사람들은 "고치기가 안 된다" 로 겪는다.

create or replace function update_session_match(
  p_match_id  uuid,
  p_court_id  uuid,
  p_players_a uuid[],
  p_players_b uuid[],
  p_label     text default null
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match    matches;
  v_config   jsonb;
  v_squad    int;
  v_team_a   uuid;
  v_team_b   uuid;
  v_all      uuid[];
  v_busy     text;
  v_before   jsonb;
  v_names_a  jsonb;
  v_names_b  jsonb;
begin
  -- 잠근다. 같은 경기를 두 사람이 동시에 고치면 뒤엣것이 이긴다 —
  -- 반쪽씩 섞이지는 않는다.
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  -- 권한이 먼저다. 남의 모임 경기인지 대회 경기인지를 먼저 알려 주면
  -- 아무 관계 없는 사람이 경기 id 하나로 종류를 떠볼 수 있다.
  if not can_run_match(p_match_id) then
    raise exception '이 경기를 고칠 권한이 없습니다' using errcode = '42501';
  end if;

  -- 대회 경기는 조를 고르는 함수가 맞다. 여기서 고치면 group_id 가 NULL 이
  -- 되어 그 경기가 순위표(get_standings)에서 통째로 사라진다.
  if not is_session_match(p_match_id) then
    raise exception '대회 경기는 경기 고치기 화면에서 고쳐 주세요' using errcode = '22023';
  end if;

  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기는 고칠 수 없습니다. 무효 처리를 해주세요'
      using errcode = '22023';
  end if;

  select config into v_config from tournaments where id = v_match.tournament_id;
  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;

  if coalesce(array_length(p_players_a, 1), 0) <> v_squad
     or coalesce(array_length(p_players_b, 1), 0) <> v_squad then
    raise exception '양쪽에 %명씩 골라 주세요', v_squad using errcode = '22023';
  end if;

  v_all := p_players_a || p_players_b;

  -- 조가 없으니 '같은 조끼리 못 붙는다' 가 이 역할을 대신 못 한다
  -- (`create_session_match` 와 같은 검사)
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception '같은 사람을 두 번 넣을 수 없습니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_all) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = v_match.tournament_id)
  ) then
    raise exception '이 모임의 참가자가 아닌 사람이 있습니다' using errcode = '22023';
  end if;

  if p_court_id is not null
     and not exists (select 1 from courts
                     where id = p_court_id and tournament_id = v_match.tournament_id) then
    raise exception '이 모임의 코트가 아닙니다' using errcode = '22023';
  end if;

  -- ── 한 사람이 동시에 두 코트에서 뛸 수는 없다 ─────────────────────
  --
  -- `start_match` 의 검사와 **같은 기준**이다(20260825000002): 지금 `live` 인
  -- 다른 경기에 선수로 들어 있으면 안 된다. 심판은 안 센다 — 서버의 다른
  -- 검사도 `match_team_players` 만 훑고, 모임 경기에는 심판이 없다.
  --
  -- 여기서 미리 막는 이유: 안 막으면 저장은 되고 **시작할 때** 거절당한다.
  -- 그때는 코트 앞에서 넷이 서 있고, 고친 사람은 이미 화면을 떠났다.
  -- 화면(`src/lib/busy.ts`)이 대기 중인 사람까지 더 넓게 잠그는 것은 편의고,
  -- 깨지면 안 되는 규칙은 이 한 줄이다.
  select string_agg(distinct tm.display_name, ', ') into v_busy
  from matches other
  join match_teams mt on mt.match_id = other.id
  join match_team_players mtp on mtp.match_team_id = mt.id
  join tournament_members tm on tm.id = mtp.member_id
  where other.status = 'live'
    and other.id <> p_match_id
    and mtp.member_id = any(v_all);

  if v_busy is not null then
    raise exception '%님이 다른 코트에서 경기 중입니다. 그 경기가 끝난 뒤에 넣어 주세요', v_busy
      using errcode = '22023';
  end if;

  -- ── 고치기 전 모습 ────────────────────────────────────────────────
  --
  -- `to_jsonb(v_match)` 만 남기면 **바뀐 것이 하나도 안 보인다** — 선수는
  -- matches 행에 없다. 이 함수가 하는 일의 전부가 편성 바꾸기라, 감사로그가
  -- "누가 누구를 뺐나" 에 답하지 못하면 남길 이유가 없다.
  -- 이름으로 남긴다: id 는 나중에 명단에서 사라지면 되짚을 수 없다.
  v_before := jsonb_build_object(
    'match',    to_jsonb(v_match),
    'playersA', team_player_names(p_match_id, 'A'),
    'playersB', team_player_names(p_match_id, 'B')
  );

  -- ── 여기부터가 원자 구간 ──────────────────────────────────────────
  --
  -- 팀을 통째로 다시 만든다. 아래에서 하나라도 실패하면 트랜잭션이 통째로
  -- 되돌아가 **고치기 전 그대로** 남는다 — 경기가 사라지는 우회의 실패
  -- 모드가 없어지는 자리가 정확히 여기다.
  delete from match_teams where match_id = p_match_id;

  -- 조가 없으니 group_id 는 NULL, 조커도 없다.
  -- 목표 점수·승점은 `create_session_match` 와 글자 그대로 같은 규칙이고,
  -- 듀스·상한은 `match_teams_fill_rules` 트리거가 채운다.
  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (p_match_id, 'A', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_a;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (p_match_id, 'B', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_b;

  insert into match_team_players (match_team_id, member_id)
  select v_team_a, pid from unnest(p_players_a) pid;
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, pid from unnest(p_players_b) pid;

  -- ── label 은 화면이 정한다 ────────────────────────────────────────
  --
  -- 서버가 '자동' 을 강제로 떼지 않는다. 세 가지 이유다.
  --
  --   1. '자동' 은 **화면의 개념**이다(`AUTO_QUEUE_LABEL`, src/lib/autoQueue.ts).
  --      DB 에는 자동 예약이라는 것이 없다 — 강제하려면 그 한글 상수를 SQL 로
  --      복제해야 하고, 이 저장소는 같은 규칙을 두 곳에 두는 것을 함정으로
  --      적어 두었다(`rules.ts` ↔ `side_wins`). 한쪽만 고치는 날이 온다.
  --   2. `create_session_match` 가 이미 `p_label` 을 받는다. 같은 화면
  --      (`SessionMatchEditor`)이 만들기와 고치기를 함께 하는데 한쪽만 서버가
  --      정하면 화면이 규칙을 두 벌 갖는다.
  --   3. **틀려도 피해가 없다.** label 은 배지 하나와 × 버튼 하나의 근거일
  --      뿐이라(autoQueue.ts 가 이미 "피해가 없어서 이대로 둔다" 고 적었다)
  --      권한·점수·순위 어디에도 안 닿는다. 판단을 서버로 끌어올려 값을
  --      치를 자리가 아니다.
  --
  -- ⚠ 이 함수는 편성을 **통째로 다시 쓴다.** label 도 마찬가지라, 안 보내면
  -- (기본값 NULL) 이름이 지워진다. 화면은 `labelAfterHumanEdit` 로 계산한
  -- 값을 **항상** 보낸다 — 사람이 붙인 이름은 그대로 돌아오고 '자동' 만 빠진다.
  update matches
     set court_id   = p_court_id,
         label      = nullif(btrim(coalesce(p_label, '')), ''),
         updated_by = auth.uid(),
         edited_at  = now()
   where id = p_match_id
  returning * into v_match;

  perform log_audit(
    v_match.tournament_id, 'match.edit', 'match', p_match_id,
    v_before,
    jsonb_build_object(
      'match',    to_jsonb(v_match),
      'playersA', team_player_names(p_match_id, 'A'),
      'playersB', team_player_names(p_match_id, 'B')
    )
  );

  return v_match;
end;
$fn$;

revoke all on function update_session_match(uuid, uuid, uuid[], uuid[], text) from public, anon;
grant execute on function update_session_match(uuid, uuid, uuid[], uuid[], text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 만든 것
--
--   · update_session_match(p_match_id, p_court_id, p_players_a,
--                          p_players_b, p_label default null) → matches
--     한 트랜잭션 안에서 모임 경기의 팀·선수·코트·이름을 바꾼다.
--     경기 id 와 queue_order 를 그대로 둔다. `match.edit` 로 감사로그를
--     남기되 before/after 에 **선수 이름**을 함께 싣는다.
--
--   · team_player_names(match_id, side) → jsonb
--     감사로그가 읽을 수 있는 편성 스냅샷. 위 함수 안에 인라인으로 두 번
--     쓰면 같은 질의가 네 벌이 된다. **내부 전용** — authenticated 에게도
--     실행 권한을 주지 않는다.
--
--   거절하는 경우 (전부):
--     PT404  경기가 없다
--     42501  can_run_match 가 아니다 (관리자 · 심판 · 그 경기 선수 아님)
--     22023  대회 경기다 / 예정 경기가 아니다 / 인원이 안 맞다 /
--            같은 사람이 두 번 / 이 모임 참가자가 아니다 /
--            이 모임 코트가 아니다 / 다른 코트에서 경기 중인 사람이 있다
--
-- 안 건드린 것
--
--   · update_match — 대회 경기 고치기. 한 줄도 안 바뀐다. 조 검증 · 심판 ·
--     조커 스냅샷이 전부 거기 그대로 있고, 이 함수는 그 길을 거절한다.
--   · create_session_match · can_run_match · is_session_match · start_match
--   · set_court_queue — 대기 줄 다시 세우기. 사람이 순서를 바꾸는 용도로는
--     그대로 쓰인다. 고치기가 더 이상 안 부를 뿐이다.
--   · 스키마 · RLS · 트리거 · match_overview 뷰 — 새 컬럼도 새 상태도 없다.
--   · matches.queue_order · created_at · source — 고치기가 안 만지는 자리다.
-- ════════════════════════════════════════════════════════════════════
