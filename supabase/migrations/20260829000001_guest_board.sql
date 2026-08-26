-- ════════════════════════════════════════════════════════════════════
-- 게스트 현황판 (마일스톤 4) — 등록한 사람이 코트를 본다
--
-- 새 테이블 0개 · 새 컬럼 0개 · 새 RLS 정책 0개 · 새 인덱스 0개.
-- 늘어나는 것은 anon RPC 하나(guest_board)뿐이다. 코트 · 경기 · 대기
-- 순번은 이미 다 있고(matches.queue_order, 20260819000015), 로그인
-- 사용자용 현황판도 이미 돈다. 이 마이그레이션이 하는 일은 **그
-- 데이터에서 게스트가 봐도 되는 부분만 골라 조립하는 definer 함수
-- 하나를 뚫고, 그 함수가 딱 그것만 싣도록 못 박는 것**이다.
--
-- 그래서 이 파일의 무게는 SQL 줄 수가 아니라 **반환 필드 목록**에 있다.
--
-- ── 왜 이번에도 RLS 정책이 0개인가 ──────────────────────────────────
--
-- "쓰기니까 위험했던 것이고 읽기는 정책을 열어도 되지 않나" 는 틀렸다.
-- is_direct_api_call()(20260818000007) 의 붕괴는 **롤에서 오는 것이지
-- 동작 종류에서 오는 것이 아니다** — anon 으로 들어오면 current_user 가
-- 'anon' 이라 그 함수가 거짓이 되고, guard_tournament_update ·
-- guard_member_update · guard_member_delete 세 트리거가 전부 "RPC
-- 경로다" 로 오판한다. 읽기 정책 하나를 anon 에 열어도 그 정책은
-- PostgREST 의 직접 접근에 그대로 열린다.
--
-- 특히 matches · courts 에 anon SELECT 를 열면
-- `GET /rest/v1/matches?select=*` 로 안 싣기로 한 컬럼(created_by ·
-- updated_by · source · edited_at · label)이 전부 나가고,
-- `select=*,tournament_members(*)` 같은 임베드까지 열린다.
-- tournament_members 에 열면 **그날 온 사람 전원의 display_name 이
-- 한 번의 GET 으로 나간다** — 이 마일스톤이 가장 피해야 할 결과가
-- 정확히 그것이다.
--
-- 같은 이유로 **Realtime(postgres_changes)도 못 쓴다.** 구독은 구독
-- 롤의 RLS 를 그대로 타므로 anon 에게 열려면 matches 에 anon SELECT
-- 정책이 필요하고, 그 정책은 위와 똑같이 직접 조회에도 함께 열린다.
-- 게스트 화면은 폴링(10초)으로 간다.
--
-- ── 왜 match_overview 뷰를 참조조차 하지 않는가 ─────────────────────
--
-- 1) 뷰가 실어 나르는 필드가 우리가 싣기로 한 것보다 훨씬 많다 —
--    referees · group_a_name · target_a · deuce_a · edited_at · source ·
--    label … 뷰를 쓰면 "필드 하나가 곧 노출 표면" 이라는 규율이 첫
--    줄에서 무너진다.
-- 2) security_invoker 뷰의 권한 해석이 definer 함수 소유자에 따라
--    갈리는 자리다. 보안 경계를 "이 함수가 지금 누구 소유인가" 같은
--    배포 시점 값 위에 세우지 않는다.
--
-- 그래서 matches · courts · match_teams · match_team_players ·
-- tournament_members 를 **직접 조인해 필요한 컬럼만** 뽑는다. 뷰 정의는
-- 한 줄도 안 고치고, 이 함수 안에서 참조조차 하지 않는다.
--
-- ⚠ 뷰의 anon SELECT grant 를 이 마이그레이션이 걷지는 않는다. Supabase
--   기본 권한으로 이미 붙어 있고(이 마일스톤 이전부터), 그래도 안전한
--   이유는 뷰가 security_invoker=true 라 기반 테이블 RLS 를 anon 권한으로
--   그대로 타서 **행이 0개** 나오기 때문이다. 그래서 검사(smoke-guest
--   75절)는 403 을 기대하지 않는다 — 기대하면 반드시 실패한다.
--   PostgREST 는 RLS 로 0행이 걸러져도 200 을 낸다.
--
-- ── 🔴 pgcrypto / search_path 함정 (여기 손대는 사람이 먼저 읽을 것) ─
--
-- 이 함수의 search_path 는 `public, pg_temp` 다. pgcrypto 함수를
-- 안 부르기 때문에 그걸로 충분하다. **나중에 누가 이 함수 안에
-- gen_random_bytes() · digest() · crypt() 같은 pgcrypto 함수를 추가하면
-- 즉시 `function ... does not exist` 로 죽는다** — Supabase 는 확장을
-- public 이 아니라 extensions 스키마에 설치하기 때문이다. 추가하려면
-- 반드시 `set search_path = public, extensions, pg_temp` 로 먼저 넓혀라
-- (pg_temp 는 맨 뒤 그대로 — 앞에 오면 같은 이름의 임시 객체로 함수를
-- 가로챌 수 있다).
--
-- 20260828000002 가 정확히 이 함정으로 게스트 기능이 아니라 **동아리
-- 생성 전체**를 막았다. gen_random_uuid() 는 PG13+ 코어 내장이라 멀쩡히
-- 돌아서 더 늦게 드러난다 — "확장이 설치돼 있다" 와 "내 search_path 에서
-- 보인다" 는 다른 말이다.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- 현황판 RPC (anon 읽기) ← 이 마일스톤의 전부
--
-- ── 싣는 것 (이게 전부다) ───────────────────────────────────────────
--
--   { ok: true,
--     club_name,
--     session: { id, name, starts_at, status },   -- 'live' | 'finished'
--     courts:  [{ id, name, sort_order }],
--     matches: [{ id, court_id, status, queue_order, started_at,
--                 score_a, score_b, players_a[], players_b[] }],
--     finished_count }                -- 끝난 경기는 목록이 아니라 숫자다
--
-- ── 안 싣는 것과 그 이유 (이 표가 이 함수에서 가장 중요하다) ────────
--
--  | 안 싣는 것              | 왜                                      |
--  |-------------------------|-----------------------------------------|
--  | 명단 전체               | **이 마일스톤이 가장 피해야 할 결과다.**|
--  | (tournament_members)    | 실으면 링크 하나로 그날 그 동아리에 온  |
--  |                         | 사람 전원의 표시명이 나간다. profiles 를|
--  |                         | 완전 비공개로 유지해 온 것이 이 한 필드로|
--  |                         | 무의미해진다. 게스트가 알아야 하는 것은 |
--  |                         | "지금 코트에서 누가 치나" 이지 "오늘    |
--  |                         | 누가 왔나" 가 아니다. **코트에 편성된   |
--  |                         | 사람 이름만 나간다**                    |
--  | 끝난 경기 목록          | (1) 게스트의 질문은 "지금" 과 "다음"    |
--  |                         | 이다. 지난 기록은 로그인 사용자 화면의  |
--  |                         | 일이다. (2) 모임이 길어질수록 payload 가|
--  |                         | 무한정 자라는데, 레이트리밋을 못 거는   |
--  |                         | anon 이 10초마다 부르는 경로다.         |
--  |                         | finished_count 숫자만                   |
--  | referees                | 모임에는 심판이 없다. 항상 빈 배열      |
--  | group_* · is_joker      | 모임 경기는 group_id 가 NULL. 항상 NULL |
--  | target_score · deuce ·  | 게스트는 점수를 넣지 않으므로 목표 점수를|
--  | max_score               | 알 이유가 없다                          |
--  | member_id · user_id     | **절대.** 사람을 가리키는 키가 한 번    |
--  |                         | 나가면 다음 마일스톤이 그걸 근거로      |
--  |                         | 무언가를 하게 된다. 게스트에게 사람은   |
--  |                         | **문자열 이름**이다                     |
--  | invite_code ·           | 코드가 응답에 실리면 화면 캡처 한 장으로|
--  | guest_code · club_id    | 링크가 샌다                             |
--  | label                   | 사람이 자유롭게 적는 칸이다. **자유     |
--  |                         | 입력 필드는 노출 목록에 넣지 않는다**   |
--  | created_by · updated_by | 운영 메타데이터. 그릴 자리가 없다       |
--  | · edited_at · source    |                                         |
--
-- **필드를 하나 늘리는 것이 곧 노출 표면을 넓히는 것이다.** 늘리려면
-- 위 표를 먼저 고치고, smoke 73번(키 전수 검사)·74번(편성 안 된
-- 참가자 이름 부재)을 다시 통과시켜라.
--
-- started_at 은 싣는다 — 대기자의 진짜 질문이 "내 앞 경기가 언제
-- 끝나나" 이고, 없으면 "내 차례까지 3경기" 가 시간 감각 없는 숫자가
-- 된다. 사람을 가리키지 않는다.
--
-- 점수도 싣는다 — 개인을 가리키지 않는 숫자라 노출 위험이 0 에 가깝고
-- 코트 옆에서 가장 자주 묻는 것이다. 노출 표면을 줄이는 노력을 위험하지
-- 않은 필드에 쓰면 정작 위험한 필드를 줄일 여력이 없어진다.
-- ⚠ matches.scored 는 not null default true 라 **진행 중에는 점수를 한
--   번도 안 넣은 경기도 true** 다. "점수를 보여줄까" 판단은 서버가 하지
--   않는다 — 화면이 score_a + score_b > 0 으로 판단한다(src/lib/guestBoard.ts).
--
-- ── 예외를 던지지 않는다 ───────────────────────────────────────────
--
-- guest_sessions · join_as_guest 와 같은 이유 — 세 anon 함수의 실패
-- 모양을 하나로 맞춘다. 실패는 전부 jsonb {ok:false, error, message}.
--
-- ── 오류를 하나로 합치는 이유 ───────────────────────────────────────
--
-- 다른 동아리의 session_id · 대회 UUID(kind='tournament') · 시각 창 밖 ·
-- 없는 id · 코드와 세션의 불일치를 **전부 board_closed 하나로** 돌려준다.
-- 구별해서 돌려주면 임의의 UUID 로 "이 동아리에 이 모임이 있나" 를
-- 알아내는 탐색기가 된다.
--
-- ── 읽기 필터는 등록 필터의 정확한 상위집합이다 ─────────────────────
--
-- guest_sessions/join_as_guest 의 필터에서 **status 하나만** 넓힌다
-- (status = 'live' → status in ('live','finished')). 시각 창(뒤 12시간 ~
-- 앞 24시간, starts_at null 이면 통과)은 **글자 그대로 동일**하다.
--
--   좁히면 → "등록은 됐는데 현황판이 안 보인다". 코트 앞에 선 게스트를
--            실제로 막는, 가장 나쁜 실패 모드다
--   넓히면 → 오래된 링크로 지난 모임의 편성 이름을 계속 열람할 수 있다
--
-- ⚠ 알아 두는 구멍(이번에 안 고친다): starts_at is null 인 즉석 모임은
--   시각 창을 무조건 통과한다 — 마일스톤 3 부터의 동작이다.
--   coalesce(starts_at, created_at) 이 옳지만, 그러면 **등록 필터도 같이
--   고쳐야 상위집합이 유지된다.** 별건으로 docs/todo.md 에 남긴다.
--   새로 여는 표면이 아니다.
--
-- ── 대기 순번은 서버가 세지 않는다 ──────────────────────────────────
--
-- src/lib/schedule.ts 의 queuePosition 주석에 이미 경고가 있다 —
-- notify_up_next(20260824000001)와 화면이 **같은 줄을 세야 하고, 한쪽만
-- 바꾸면 화면에 3번인 사람에게 알림이 간다.** 세 번째 셈법을 서버에
-- 만들면 어긋날 자리가 셋이 된다. 서버는 queue_order 만 싣고 정렬해서
-- 보내고, 순번은 클라이언트가 기존 queuePosition 으로 센다.
--
-- ── 페이로드 상한 ───────────────────────────────────────────────────
--
-- 경기 목록에 limit 200. **anon 이 레이트리밋 없이 10초마다 부르는
-- 경로에 상한 없는 쿼리를 두지 않는다.**
--
-- ── 이 함수는 읽기만 한다 ───────────────────────────────────────────
--
-- ⚠ INSERT/UPDATE/DELETE 를 추가하지 마라. SECURITY DEFINER 안에서는
--   is_direct_api_call() 이 거짓이라 guard_member_update /
--   guard_member_delete / guard_tournament_update 의 컬럼 보호가 이 함수
--   안의 모든 쓰기에 우회된다. 지금은 stable 로 선언해 두어 쓰기가
--   문법적으로도 막혀 있다 — stable 을 volatile 로 바꾸는 순간 그 방어가
--   사라진다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guest_board(p_code text, p_session_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $fn$
declare
  v_code     text;
  v_club     clubs;
  v_session  tournaments;
  v_courts   jsonb;
  v_matches  jsonb;
  v_finished int;
begin
  v_code := upper(btrim(coalesce(p_code, '')));

  -- 형식 검사를 먼저 한다 — 22자 base32 가 아니면 조회할 것도 없다.
  if v_code !~ '^[A-Z2-9]{22}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  select * into v_club from clubs where guest_code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  -- 등록 필터(join_as_guest)에서 status 하나만 넓힌 상위집합.
  -- club_id 를 같이 거는 것이 핵심이다 — 맞는 코드 + 다른 동아리의
  -- session_id 가 여기서 걸린다. p_session_id 가 NULL 이면 t.id = null
  -- 이 아무 행도 안 내므로 역시 여기서 걸린다.
  select * into v_session
    from tournaments t
   where t.id = p_session_id
     and t.club_id = v_club.id
     and t.kind = 'session'
     and t.status in ('live', 'finished')
     and (t.starts_at is null
          or t.starts_at between now() - interval '12 hours' and now() + interval '24 hours');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'board_closed',
                              'message', '지금은 볼 수 없는 모임입니다');
  end if;

  -- 코트는 이름과 정렬 순서만. tournament_id 는 이미 주소가 담고 있으므로
  -- 응답에 다시 싣지 않는다.
  select coalesce(
           jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
                                        'sort_order', c.sort_order)
                     order by c.sort_order),
           '[]'::jsonb)
    into v_courts
    from courts c
   where c.tournament_id = v_session.id;

  -- 진행 중 · 예정 경기만. 'finished' 는 아래 개수로만, 'void' 는 화면에
  -- 그릴 것이 없다.
  --
  -- 정렬은 queue_order, created_at — src/lib/schedule.ts 의 queuePosition
  -- 과 notify_up_next 가 세는 줄과 **같은 순서**여야 한다. 여기서 다른
  -- 순서로 보내면 클라이언트가 세는 순번이 알림과 어긋난다.
  --
  -- 이름은 tournament_members.display_name 만 뽑는다 — member_id 도
  -- user_id 도 나가지 않는다. 그리고 **이 조인이 명단 전체가 아니라
  -- "코트에 편성된 사람" 만 내보내는 유일한 근거**다. 여기에
  -- `from tournament_members` 를 직접 거는 조회를 절대 더하지 마라.
  with m as (
    select mm.id, mm.court_id, mm.status, mm.queue_order,
           mm.started_at, mm.score_a, mm.score_b, mm.created_at
      from matches mm
     where mm.tournament_id = v_session.id
       and mm.status in ('live', 'scheduled')
     order by mm.queue_order, mm.created_at
     limit 200
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',          m.id,
               'court_id',    m.court_id,
               'status',      m.status,
               'queue_order', m.queue_order,
               'started_at',  m.started_at,
               'score_a',     m.score_a,
               'score_b',     m.score_b,
               'players_a',   (select coalesce(jsonb_agg(tm.display_name
                                                         order by tm.display_name),
                                               '[]'::jsonb)
                                 from match_teams mt
                                 join match_team_players mtp on mtp.match_team_id = mt.id
                                 join tournament_members tm  on tm.id = mtp.member_id
                                where mt.match_id = m.id and mt.side = 'A'),
               'players_b',   (select coalesce(jsonb_agg(tm.display_name
                                                         order by tm.display_name),
                                               '[]'::jsonb)
                                 from match_teams mt
                                 join match_team_players mtp on mtp.match_team_id = mt.id
                                 join tournament_members tm  on tm.id = mtp.member_id
                                where mt.match_id = m.id and mt.side = 'B')
             )
             order by m.queue_order, m.created_at),
           '[]'::jsonb)
    into v_matches
    from m;

  -- 끝난 경기는 목록이 아니라 숫자 하나다. 모임이 길어져도 응답 크기가
  -- 자라지 않는 유일한 이유다.
  select count(*) into v_finished
    from matches mm
   where mm.tournament_id = v_session.id
     and mm.status = 'finished';

  return jsonb_build_object(
    'ok',        true,
    'club_name', v_club.name,
    'session',   jsonb_build_object('id',        v_session.id,
                                    'name',      v_session.name,
                                    'starts_at', v_session.starts_at,
                                    'status',    v_session.status),
    'courts',         v_courts,
    'matches',        v_matches,
    'finished_count', v_finished
  );
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 권한 — Supabase 는 새 함수에 anon/authenticated EXECUTE 를 기본
-- 권한(default privileges)으로 자동 부여한다(20260818000005 의 경고).
-- `revoke all from public` 만으로는 부족해서 anon·authenticated 를
-- 명시적으로 같이 걷어낸 뒤, 필요한 곳에만 다시 연다.
--
-- authenticated 에는 열지 않는다. 로그인 사용자에게는 이미
-- match_overview + RLS 로 더 완전한 현황판이 있고, 게스트 경로는
-- **anon 전용 클라이언트 하나(src/features/guest/api.ts)로 세 함수를
-- 다 부른다** 는 규율을 지킨다. 로그인 세션이 딸려 들어오면 안 되는
-- 경로라 롤을 하나로 묶어 두는 편이 검사(db:verify)도 단순해진다.
--
-- ⚠ 이로써 anon 이 실행할 수 있는 public 함수는 **넷**이다. 게스트 RPC
--   셋(guest_sessions · join_as_guest · guest_board)과, 그와 무관한
--   is_direct_api_call() 이다.
--
--   넷째를 보고 "셋이어야 하는데" 라며 걷어내지 마라. 그 grant 는
--   20260819000001_fix_guard_permission.sql 의 의도된 결정이다 — 가드
--   트리거는 SECURITY INVOKER 여야만 발동하고(DEFINER 로 바꾸면 트리거
--   안에서 current_user 가 postgres 가 되어 is_direct_api_call() 이 항상
--   거짓이 되고, 가드가 영영 안 걸린다), 그래서 호출자 권한으로 이
--   함수를 부를 수 있어야 한다. 예전에 이 EXECUTE 를 걷었다가 주최자의
--   정상 수정이 통째로 막혔다. 노출되는 것은 "당신이 authenticated 인가"
--   불리언 하나뿐이다.
--
--   그래서 검사(db:verify · smoke-guest 81절)는 개수가 아니라 **집합**을
--   본다. 개수보다 강한 검사다 — 새 함수가 anon 에 새면 여전히 걸린다.
--
-- 문제가 생기면 `revoke execute on function guest_board(text, uuid)
-- from anon;` 한 줄로 즉시·완전히 닫힌다.
-- ════════════════════════════════════════════════════════════════════
revoke all on function guest_board(text, uuid) from public, anon, authenticated;

grant execute on function guest_board(text, uuid) to anon;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 새 테이블 0개 · 새 컬럼 0개 · 새 RLS 정책 0개 · 새 인덱스 0개.
--    anon 은 여전히 테이블·뷰에 도달하지 않는다
--  - RPC(anon 전용): guest_board(p_code text, p_session_id uuid)
--    returns jsonb — security definer · stable ·
--    set search_path = public, pg_temp. 예외를 던지지 않고
--    {ok:false,error,message} 또는
--    {ok:true, club_name, session:{id,name,starts_at,status},
--     courts:[{id,name,sort_order}],
--     matches:[{id,court_id,status,queue_order,started_at,score_a,
--               score_b,players_a,players_b}],
--     finished_count} 를 돌려준다. 반환 키는 이 여섯(ok 포함)이 전부다
--  - 필터: guest_code 형식(^[A-Z2-9]{22}$) → clubs.guest_code →
--    tournaments(id · club_id · kind='session' ·
--    status in ('live','finished') · 시각 창 −12h~+24h, starts_at null 이면
--    통과). 등록 필터의 정확한 상위집합이며 status 만 넓혔다
--  - 오류 코드는 둘뿐: bad_code(코드 형식·미존재) ·
--    board_closed(그 외 전부 — 다른 동아리 · 대회 · 창 밖 · 없는 id ·
--    코드-세션 불일치). 탐색기가 되지 않도록 일부러 합쳤다
--  - 경기 목록은 status in ('live','scheduled') · order by
--    queue_order, created_at · **limit 200**. 끝난 경기는 finished_count
--    숫자 하나
--  - 이름은 match_teams → match_team_players → tournament_members 조인으로
--    **코트에 편성된 사람만**. 명단 전체(tournament_members 직접 조회)는
--    어디에도 없다. member_id · user_id 도 나가지 않는다
--  - 권한: public·anon·authenticated 에서 전부 revoke 후 anon 에만 grant.
--    authenticated 에는 열지 않는다. anon 실행 가능 public 함수는 정확히
--    셋(guest_sessions · join_as_guest · guest_board)
--
-- 안 건드린 것
--
--  - RLS 정책 **전부** (20260818000002 이하 한 줄도 안 고침)
--  - match_overview 뷰 — 정의도 권한도 그대로. 이 함수는 참조조차 안 한다
--  - matches · courts · match_teams · match_team_players ·
--    tournament_members · clubs · tournaments — 컬럼 · 인덱스 · 제약 전부
--  - is_direct_api_call · guard_tournament_update · guard_club_update ·
--    guard_member_update · guard_member_delete 전부
--  - guest_sessions · join_as_guest · rotate_guest_code · gen_guest_code ·
--    create_club · create_session · notify_up_next · claim_court ·
--    set_court_queue · record_score · finish_match
--  - 새 인덱스는 만들지 않았다. explain (analyze) 로 여섯 조회를 전부
--    확인했고, 자랄 수 있는 세 조회는 이미 인덱스를 탄다:
--      matches 목록      → Index Scan using matches_queue_idx
--                          (tournament_id, queue_order — 정렬까지 presorted)
--      players_a/b 조인  → mt_match_idx + match_team_players PK(index only)
--                          + tournament_members PK
--      finished_count    → Index Only Scan using matches_tournament_idx
--    clubs · tournaments · courts 조회는 지금 데이터량(행 2·15·22)에서
--    플래너가 seq scan 을 고르지만, 이 셋은 **행 수가 조회당 상수로
--    묶여 있고**(guest_code unique · id PK · 모임당 코트 몇 개)
--    clubs_guest_code_key(unique) · tournaments PK ·
--    courts_tournament_idx(tournament_id, sort_order) 가 이미 있어
--    커지면 그때 인덱스로 갈아탄다. 지금 인덱스를 더해도 플래너가
--    안 쓴다 — 안 만든다
-- ════════════════════════════════════════════════════════════════════
