-- ════════════════════════════════════════════════════════════════════
-- create_session_match 에도 '한 사람이 두 코트' 검사를 넣는다
--
-- ── 실제로 이렇게 나온다 ────────────────────────────────────────────
--
--   ① 1번 코트에서 가·나 vs 다·라 진행 중 (live)
--   ② create_session_match 로 「가」를 2번 코트 새 경기에 넣는다  → 200
--   ③ 그 경기를 start_match                                      → 400
--      '가님이 다른 코트에서 경기 중입니다'
--
-- 남는 것은 **시작할 수 없는 예정 경기**다. 2번 코트에 scheduled 로 서서
-- 1번 코트가 끝날 때까지 아무도 못 시작한다. 만든 사람은 이미 화면을
-- 떠났고, 코트 앞에 선 넷은 초록 버튼을 눌러 빨간 오류만 본다. 그 경기를
-- 지우는 것도 **관리자만** 할 수 있어서(RLS `matches_write_admin`) 그
-- 자리에서 풀 방법이 없다 — 모임장을 찾아다니게 된다.
--
-- ── 형제 함수 셋 중 하나만 빠져 있었다 ──────────────────────────────
--
--   | 함수                            | 선수가 다른 코트에서 뛰는지 |
--   |---------------------------------|-----------------------------|
--   | create_session_match (20260825000001) | **없음** ← 이것        |
--   | update_session_match (20260903000001) | 있음                   |
--   | start_match          (20260825000002) | 있음                   |
--
-- ⚠ 헷갈리기 쉬운 자리: `create_session_match` 에 이미 있던 검사들은
-- **인원수 · 같은 사람 두 번 · 이 모임 참가자인가 · 이 모임 코트인가** 뿐이다.
-- 코트가 비었는지("한 코트 한 경기")조차 여기서는 안 본다 — 그건 `start_match`
-- 와 `claim_court` 가 `status='live'` 로 본다. **사람이 딴 데서 뛰는지**는
-- 그 어느 것도 아니다.
--
-- ── 왜 만들 때 막는가 (시작할 때만으로는 부족하다) ──────────────────
--
-- `update_session_match` 가 이미 같은 말을 적어 두었다: *"안 막으면 저장은
-- 되고 시작할 때 거절당한다. 그때는 코트 앞에서 넷이 서 있고, 고친 사람은
-- 이미 화면을 떠났다."* 만들기도 똑같다. 오히려 만들기가 더 자주 걸린다 —
-- 자동 예약(`useAutoQueue`)이 코트마다 한 경기씩 미리 걸어 두는데, 화면이
-- 목록을 아직 못 받은 짧은 순간에는 "아무도 안 뛴다" 로 보고 편성한다.
--
-- 화면 쪽 잠금(`src/lib/busy.ts`)은 편의다. 이름으로 맞추고, 대기 중인
-- 사람까지 더 넓게 잠그고, 목록이 늦게 오면 틀린다. **깨지면 안 되는 규칙은
-- 서버의 이 한 블록이다.**
--
-- ── 형제와 글자 그대로 같게 맞춘다 ──────────────────────────────────
--
-- 질의 · errcode('22023') · 문구를 `update_session_match` 에서 그대로 옮긴다.
-- 문구는 '…그 경기가 끝난 뒤에 **넣어** 주세요' 쪽이다 — `start_match` 는
-- '…뒤 **시작해** 주세요' 인데, 그건 시작하는 사람에게 하는 말이다. 여기서
-- 사용자가 하는 일은 넣는 것이라 넣기 쪽 문구가 맞고, 같은 일(편성에 사람을
-- 넣기)을 하는 두 함수가 화면마다 다른 말을 하면 안 된다.
--
-- 심판은 안 센다(`match_team_players` 만 훑는다). 형제 둘이 그렇고, 모임
-- 경기에는 애초에 심판이 없다.
--
-- ── 왜 20260825000001 을 고치지 않았나 ──────────────────────────────
--
-- 그 파일은 이미 적용됐다. 적용된 마이그레이션을 고치면 파일과 실제 DB 가
-- 어긋난다 — 새 환경은 고친 것을 받고 지금 DB 는 안 받는다. 이 저장소가
-- 이미 쓰는 방식대로(20260819000001 · 20260825000002) 수정을 다음
-- 마이그레이션으로 둔다.
--
-- ── drop 하지 않는다 ────────────────────────────────────────────────
--
-- 인자가 하나도 안 바뀌므로 `create or replace` 로 충분하다. 시그니처를
-- 바꿨다면 옛 함수를 먼저 `drop` 해야 했다 — PostgREST 는 이름 붙은 인자
-- 집합으로 함수를 찾아서, 같은 이름이 둘이면 "function is not unique" 로
-- 경기 편성이 통째로 막힌다(20260824000003 · 20260826000001 · 20260827000001
-- 이 그 이유로 drop 을 먼저 했다). 여기서는 그럴 일이 없고, 따라서 기존
-- grant 도 그대로 살아 있다 — 아래 revoke/grant 는 재실행 안전성을 위해서다.
--
-- 바꾼 것은 검사 블록 하나뿐이다. 권한 · 인원수 · 중복 · 명단 · 코트 검사와
-- insert 구간은 20260825000001 에서 한 글자도 안 바뀌었다.
-- ════════════════════════════════════════════════════════════════════

create or replace function create_session_match(
  p_tournament_id uuid,
  p_court_id      uuid,
  p_players_a     uuid[],
  p_players_b     uuid[],
  p_label         text default null
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match  matches;
  v_config jsonb;
  v_kind   tournament_kind;
  v_squad  int;
  v_team_a uuid;
  v_team_b uuid;
  v_all    uuid[];
  v_busy   text;
begin
  select config, kind into v_config, v_kind
    from tournaments where id = p_tournament_id;
  if not found then
    raise exception '모임을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_kind <> 'session' then
    raise exception '대회 경기는 경기 편성 화면에서 만들어 주세요' using errcode = '22023';
  end if;

  v_all := p_players_a || p_players_b;

  -- 모임장이 짜 주기도 하고, 비는 코트를 보고 본인들이 들어가기도 한다.
  -- 뛰는 사람 본인이면 만들 수 있게 한다 — 그래야 모임장이 매번 안 짜도 된다.
  -- 남을 마음대로 코트에 넣는 건 여전히 관리자만 할 수 있다.
  if not (
    is_tournament_admin(p_tournament_id)
    or exists (select 1 from tournament_members tm
                where tm.id = any(v_all) and tm.user_id = auth.uid())
  ) then
    raise exception '모임장이거나 그 경기에 뛰는 사람만 경기를 만들 수 있습니다'
      using errcode = '42501';
  end if;

  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;
  if coalesce(array_length(p_players_a, 1), 0) <> v_squad
     or coalesce(array_length(p_players_b, 1), 0) <> v_squad then
    raise exception '양쪽에 %명씩 골라 주세요', v_squad using errcode = '22023';
  end if;

  -- 같은 사람이 두 번 들어가면 안 된다 (양쪽에 걸치거나 한쪽에 두 번)
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception '같은 사람을 두 번 넣을 수 없습니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_all) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = p_tournament_id)
  ) then
    raise exception '이 모임의 참가자가 아닌 사람이 있습니다' using errcode = '22023';
  end if;

  if p_court_id is not null
     and not exists (select 1 from courts
                     where id = p_court_id and tournament_id = p_tournament_id) then
    raise exception '이 모임의 코트가 아닙니다' using errcode = '22023';
  end if;

  -- ── 🔴 한 사람이 동시에 두 코트에서 뛸 수는 없다 (여기가 새로 온 검사) ──
  --
  -- `update_session_match`(20260903000001) · `start_match`(20260825000002) 와
  -- **같은 기준**이다: 지금 `live` 인 다른 경기에 선수로 들어 있으면 안 된다.
  --
  -- 만들 때 막지 않으면 저장은 되고 **시작할 때** 거절당한다. 그때 그 경기는
  -- 시작도 못 하고 지우지도 못한 채 코트를 물고 서 있는다.
  --
  -- 새 경기라 `other.id <> ...` 로 자기 자신을 뺄 일이 없다 — 아직 행이 없다.
  select string_agg(distinct tm.display_name, ', ') into v_busy
  from matches other
  join match_teams mt on mt.match_id = other.id
  join match_team_players mtp on mtp.match_team_id = mt.id
  join tournament_members tm on tm.id = mtp.member_id
  where other.status = 'live'
    and mtp.member_id = any(v_all);

  if v_busy is not null then
    raise exception '%님이 다른 코트에서 경기 중입니다. 그 경기가 끝난 뒤에 넣어 주세요', v_busy
      using errcode = '22023';
  end if;

  insert into matches (tournament_id, court_id, label, status, source, created_by, updated_by)
  values (p_tournament_id, p_court_id, nullif(btrim(coalesce(p_label, '')), ''),
          'scheduled', 'live', auth.uid(), auth.uid())
  returning * into v_match;

  -- 조가 없으니 group_id 는 NULL, 조커도 없다.
  -- 목표 점수·승점·듀스는 대회와 같은 스냅샷 규칙을 따른다 (세는 사람을 위해).
  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (v_match.id, 'A', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_a;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (v_match.id, 'B', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_b;

  insert into match_team_players (match_team_id, member_id)
  select v_team_a, pid from unnest(p_players_a) pid;
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, pid from unnest(p_players_b) pid;

  return v_match;
end;
$fn$;

revoke all on function create_session_match(uuid, uuid, uuid[], uuid[], text) from public, anon;
grant execute on function create_session_match(uuid, uuid, uuid[], uuid[], text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 바꾼 것
--
--   · create_session_match — '다른 코트에서 live 인 경기에 뛰는 사람이 있으면
--     거절' 한 블록을 코트 검사 뒤·insert 앞에 넣었다. errcode 22023,
--     문구는 update_session_match 와 글자 그대로 같다.
--
-- 안 건드린 것
--
--   · 시그니처 — 인자가 그대로다. drop 없이 create or replace 로 끝난다.
--   · start_match · update_session_match · claim_court — 이미 같은 검사를
--     갖고 있다. 세 곳이 같은 기준을 쓰게 되는 것이 이 마이그레이션의 전부다.
--   · create_match (대회) — 대회는 조가 있고 검사 체계가 다르다. 대회 쪽의
--     같은 검사는 start_match 에 있다(20260819000003 에서 그리로 옮겼다).
--   · 스키마 · RLS · 트리거 · match_overview 뷰 — 새 컬럼도 새 상태도 없다.
--
-- 알려진 한계
--
--   · 두 사람이 **동시에** 만들면 둘 다 통과할 수 있다 (이 검사는 `live` 인
--     경기만 본다 — 아직 시작 안 한 경기 둘은 서로를 못 본다). 그 경우는
--     start_match 가 두 번째를 막는다. 예정 경기끼리의 겹침을 서버에서 막는
--     것은 자동 예약 폭주(`src/lib/autoQueue.ts` 머리)와 같은 문제이고,
--     같은 해법(pg_advisory_xact_lock)이 필요하다 — 그건 이 수리의 범위가
--     아니다. 여기서 닫는 것은 **이미 코트에서 뛰고 있는 사람**이다.
-- ════════════════════════════════════════════════════════════════════
