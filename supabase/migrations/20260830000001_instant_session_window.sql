-- ════════════════════════════════════════════════════════════════════
-- 즉석 모임(starts_at is null)의 게스트 링크가 영원히 열려 있던 것을 닫는다
--
-- ── 무엇이 열려 있었나 ──────────────────────────────────────────────
--
-- 게스트 함수 셋(guest_sessions · join_as_guest · guest_board)의 시각
-- 창이 이랬다:
--
--   and (t.starts_at is null
--        or t.starts_at between now() - interval '12 hours'
--                           and now() + interval '24 hours')
--
-- 시각 없이 만든 **즉석 모임**은 판단할 것이 없어 무조건 통과한다.
-- 그 모임이 'live' 로 남아 있는 한 게스트 링크가 **영원히** 열려 있다.
-- 프로덕션 조회로 확인한 실재하는 구멍이다 — 가설이 아니다.
--
-- 20260829000001_guest_board.sql 이 "알아 두는 구멍(이번에 안 고친다)"
-- 으로 남긴 바로 그 항목이다. **이 마이그레이션이 그것을 해결한다.**
-- 그 파일의 경고 주석(157~161행)은 이제 지난 이야기다 — 셋을 한 번에
-- 같이 고쳐야 상위집합이 유지된다는 거기 적힌 조건을 그대로 지켰다.
--
-- ── 무엇으로 바꿨나 ─────────────────────────────────────────────────
--
--   and (case
--          when t.starts_at is not null
--            then t.starts_at between now() - interval '12 hours'
--                               and now() + interval '24 hours'
--          else t.created_at > now() - interval '24 hours'
--        end)
--
-- 시각이 있으면 예전과 **글자 그대로 같다**. 시각이 없을 때만 만든 때를
-- 시각으로 본다.
--
-- ── 왜 즉석 쪽을 24시간으로 넉넉히 두는가 ───────────────────────────
--
-- 두 실패의 무게가 다르다.
--
--   너무 좁으면 → 코트 앞에 선 게스트가 등록도 현황판도 못 한다.
--                 **가장 나쁜 실패 모드다**
--   너무 넓으면 → 지난 모임 이름이 옛 링크로 조금 더 보인다. 가볍다
--
-- 그래서 넉넉한 쪽으로 기운다. 아침에 연 모임이 밤까지 이어져도 살아
-- 있어야 한다.
--
-- ── 셋을 한 파일에서 같이 고치는 이유 ───────────────────────────────
--
-- **읽기 필터(guest_board)는 등록 필터(guest_sessions · join_as_guest)의
-- 정확한 상위집합이어야 한다.** 지금은 status 하나만 넓고
-- (status='live' → status in ('live','finished')) 시각 창은 글자 그대로
-- 같다. 그 관계가 이 마이그레이션 뒤에도 그대로다 — 세 함수에 **문자열이
-- 같은** case 식을 넣었다.
--
-- 한쪽만 좁히면 "등록은 됐는데 현황판이 안 보인다" 가 되고, 그것이 코트
-- 앞에 선 게스트를 실제로 막는 가장 나쁜 실패 모드다. 그래서 나눠서
-- 배포하지 않는다.
--
-- ── 이 파일이 하지 않는 것 ──────────────────────────────────────────
--
-- 🚫 적용된 마이그레이션(20260828000001 · 20260829000001)을 고치지
--    않는다. 이 저장소의 절대 규칙이다. 세 함수를 여기서
--    create or replace 한다.
--
-- 세 함수의 본문은 **원본에서 그대로 옮겼고 시각 창 한 곳만 바뀌었다.**
-- 반환 필드 목록 · 오류 코드 · 상한(limit 200) · security definer ·
-- set search_path · stable/volatile · 정렬 · advisory lock · 이름 정리
-- 정규식 · 게스트 상한 60 — 전부 원본과 한 글자도 다르지 않다. 원본
-- 함수 머리의 긴 설계 주석은 여기서 되풀이하지 않는다(원본이 정본이다).
-- 본문 안의 주석은 원본 그대로 옮겼다.
--
-- ── 🔴 search_path 함정 (여기 손대는 사람이 먼저 읽을 것) ───────────
--
-- 세 함수 전부 `set search_path = public, pg_temp` 를 **원본 그대로**
-- 유지한다. 셋 다 pgcrypto 함수(gen_random_bytes · digest · crypt)를
-- 부르지 않기 때문에 그걸로 충분하다. now() · hashtextextended() 는
-- pg_catalog 코어 내장이라 무관하다.
--
-- **나중에 누가 이 함수들 안에 pgcrypto 함수를 추가하면 즉시
-- `function ... does not exist` 로 죽는다** — Supabase 는 확장을 public 이
-- 아니라 extensions 스키마에 설치한다. 추가하려면 먼저
-- `set search_path = public, extensions, pg_temp` 로 넓혀라(pg_temp 는
-- 맨 뒤 그대로 — 앞에 오면 같은 이름의 임시 객체로 함수를 가로챈다).
--
-- 20260828000002 가 정확히 이 함정으로 게스트 기능이 아니라 **동아리
-- 생성 전체**를 막았다. "확장이 설치돼 있다" 와 "내 search_path 에서
-- 보인다" 는 다른 말이다.
--
-- 참고로 gen_guest_code 는 20260828000002 에서 extensions 를 더해 고쳤고,
-- 이 파일은 그 함수를 건드리지 않는다.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- 1/3 — guest_sessions (등록 후보 조회, anon)
--
-- 원본: 20260828000001_guest_registration.sql:362-402
-- 바뀐 것: 시각 창뿐. 반환 필드(id · name · starts_at + club_name) ·
--          오류 코드(bad_code · no_open_session) · 정렬
--          (starts_at nulls first) · stable · security definer ·
--          search_path 전부 원본 그대로.
-- ════════════════════════════════════════════════════════════════════

create or replace function guest_sessions(p_code text)
returns jsonb
language plpgsql security definer stable set search_path = public, pg_temp as $fn$
declare
  v_club     clubs;
  v_code     text;
  v_sessions jsonb;
begin
  v_code := upper(btrim(coalesce(p_code, '')));

  if v_code !~ '^[A-Z2-9]{22}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  select * into v_club from clubs where guest_code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  select jsonb_agg(
           jsonb_build_object('id', t.id, 'name', t.name, 'starts_at', t.starts_at)
           order by t.starts_at nulls first
         )
    into v_sessions
    from tournaments t
   where t.club_id = v_club.id
     and t.kind = 'session'
     and t.status = 'live'
     and (case
            when t.starts_at is not null
              then t.starts_at between now() - interval '12 hours' and now() + interval '24 hours'
            -- 즉석 모임은 판단할 시각이 없다. 만든 때를 시각으로 본다.
            else t.created_at > now() - interval '24 hours'
          end);

  if v_sessions is null then
    return jsonb_build_object('ok', false, 'error', 'no_open_session',
                              'message', '지금 열린 모임이 없습니다. 모임장에게 확인해 주세요');
  end if;

  return jsonb_build_object('ok', true, 'club_name', v_club.name, 'sessions', v_sessions);
end;
$fn$;


-- ════════════════════════════════════════════════════════════════════
-- 2/3 — join_as_guest (등록, anon)
--
-- 원본: 20260828000001_guest_registration.sql:429-527
-- 바뀐 것: 시각 창뿐. guest_sessions 와 **같은 문자열**이라 후보 목록과
--          등록이 어긋나지 않는다.
--
-- ⚠ 원본의 경고를 그대로 옮겨 왔다 — 이 함수는 INSERT 만 한다.
--   UPDATE·DELETE 를 추가하지 마라. SECURITY DEFINER 안에서는
--   is_direct_api_call() 이 거짓이라 guard_member_update /
--   guard_member_delete 의 컬럼 보호가 이 함수 안의 모든 쓰기에
--   우회된다.
--
-- 오류 코드(bad_code · session_closed · bad_name · guest_limit) ·
-- 이름 정리 정규식 · 게스트 상한 60 · pg_advisory_xact_lock ·
-- INSERT 컬럼 리터럴 · log_audit · volatile · search_path 전부 원본 그대로.
-- ════════════════════════════════════════════════════════════════════

create or replace function join_as_guest(
  p_code       text,
  p_session_id uuid,
  p_name       text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_club         clubs;
  v_code         text;
  v_session_name text;
  v_clean_name   text;
  v_guest_count  int;
  v_member       tournament_members;
begin
  v_code := upper(btrim(coalesce(p_code, '')));

  if v_code !~ '^[A-Z2-9]{22}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  select * into v_club from clubs where guest_code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'bad_code',
                              'message', '링크가 올바르지 않습니다');
  end if;

  -- guest_sessions 와 동일한 필터를 다시 통과시킨다. 다른 동아리의
  -- session_id · 대회 UUID · 끝난 모임 · 시각 창 밖 모임은 전부 여기서
  -- 걸러진다.
  select t.name into v_session_name
    from tournaments t
   where t.id = p_session_id
     and t.club_id = v_club.id
     and t.kind = 'session'
     and t.status = 'live'
     and (case
            when t.starts_at is not null
              then t.starts_at between now() - interval '12 hours' and now() + interval '24 hours'
            -- 즉석 모임은 판단할 시각이 없다. 만든 때를 시각으로 본다.
            else t.created_at > now() - interval '24 hours'
          end);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'session_closed',
                              'message', '지금은 등록할 수 없는 모임입니다');
  end if;

  -- 제어문자(C0/C1)·제로폭 문자·방향 재정렬 문자를 정리한 뒤에 길이를
  -- 검사한다. 순서가 중요하다 — 길이부터 재면 정리 후 빈 문자열이거나
  -- 20자를 넘는 원문이 통과할 수 있다. U+202E(RTL override) 등을 안
  -- 거르면 명단·심판 배지·경기 편성 화면에서 다른 회원과 구별이 안 되는
  -- 이름을 만들 수 있다.
  v_clean_name := regexp_replace(
    coalesce(p_name, ''),
    '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]',
    '', 'g'
  );
  v_clean_name := btrim(v_clean_name);
  if length(v_clean_name) < 1 or length(v_clean_name) > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_name',
                              'message', '이름은 1~20자로 입력해 주세요');
  end if;

  -- 오염 상한(설계 판단 3) — 정원 마감이 아니라, 코드를 아는 사람이
  -- 새로고침을 연타해 명단을 무한 증식시키는 것을 막는 유일한 방어선.
  -- on conflict do nothing 은 NULL(user_id) 끼리 안 걸리므로 효과가 없다.
  --
  -- 카운트와 삽입 사이에 잠금이 없으면 READ COMMITTED 에서 동시 요청이
  -- 전부 같은 카운트(예: 59)를 읽고 다 통과한다 — 코트 앞에서 여러
  -- 명이 동시에 링크를 여는 건 정상 시나리오라 이 경합은 실제로
  -- 일어난다. 트랜잭션 스코프 advisory lock 으로 같은 session_id 의
  -- 카운트-삽입 구간을 직렬화한다. tournaments 행을 for update 로
  -- 잠그는 대신 advisory lock 을 쓰는 이유: 그러면 같은 모임의 다른
  -- 쓰기(경기 시작 등)와 불필요하게 경합하지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select count(*) into v_guest_count
    from tournament_members
   where tournament_id = p_session_id and is_guest;

  if v_guest_count >= 60 then
    return jsonb_build_object('ok', false, 'error', 'guest_limit',
                              'message', '오늘은 더 받을 수 없습니다. 모임장에게 말씀해 주세요');
  end if;

  insert into tournament_members
    (tournament_id, user_id, role, display_name, avatar_url, rsvp, is_guest)
  values
    (p_session_id, null, 'member',
     unique_display_name(p_session_id, v_clean_name),
     null, 'going', true)
  returning * into v_member;

  perform log_audit(p_session_id, 'member.guest_join', 'tournament_member',
                    v_member.id, null, to_jsonb(v_member));

  -- 접미사가 붙었으면 게스트가 그 사실을 알아야 코트 현황판에서 자기를
  -- 찾는다 — 요청한 이름이 아니라 적힌 이름을 그대로 돌려준다.
  return jsonb_build_object('ok', true, 'display_name', v_member.display_name,
                            'session_name', v_session_name);
end;
$fn$;


-- ════════════════════════════════════════════════════════════════════
-- 3/3 — guest_board (현황판 읽기, anon)
--
-- 원본: 20260829000001_guest_board.sql:185-308
-- 바뀐 것: 시각 창뿐. 위 둘과 **같은 문자열**이다 — status 하나만 넓은
--          (live → live·finished) 정확한 상위집합 관계가 그대로 유지된다.
--
-- ⚠ 이 함수는 읽기만 한다. stable 선언이 쓰기를 문법적으로도 막는
--   방어선이라 원본 그대로 stable 을 유지했다 — volatile 로 바꾸는 순간
--   그 방어가 사라진다.
--
-- 반환 키(ok · club_name · session · courts · matches · finished_count) ·
-- 안 싣는 필드 목록 · 오류 코드(bad_code · board_closed) ·
-- limit 200 · order by queue_order, created_at · 조인 경로
-- (match_teams → match_team_players → tournament_members) 전부 원본 그대로.
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
     and (case
            when t.starts_at is not null
              then t.starts_at between now() - interval '12 hours' and now() + interval '24 hours'
            -- 즉석 모임은 판단할 시각이 없다. 만든 때를 시각으로 본다.
            else t.created_at > now() - interval '24 hours'
          end);

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
-- 권한 재적용
--
-- create or replace 는 권한을 보존한다. 그래도 명시적으로 다시 건다 —
-- Supabase 가 새 함수에 anon/authenticated EXECUTE 를 기본 권한으로
-- 자동 부여하는 함정(20260818000005) 때문에 이 저장소는 함수를 손댄
-- 파일마다 revoke → grant 를 다시 쓰는 관례를 지킨다. 관례를 지키면
-- 이 파일만 읽어도 "누구에게 열려 있나" 가 확정된다.
--
-- 원본과 **똑같이** 연다:
--   guest_sessions · join_as_guest · guest_board → **anon 에만**
--   authenticated 에는 열지 않는다(원본 그대로). 로그인 사용자에게는
--   이미 match_overview + RLS 가 있고, 게스트 경로는 anon 전용
--   클라이언트 하나로 세 함수를 다 부른다는 규율을 지킨다.
--
-- 이로써 anon 이 실행할 수 있는 public 함수는 여전히 **넷**이다 —
-- 이 셋 + is_direct_api_call(). 넷째는 20260819000001 의 의도된 결정이니
-- 걷어내지 마라(걷으면 가드 트리거가 발동하지 않아 주최자의 정상 수정이
-- 통째로 막힌다). 검사는 개수가 아니라 집합으로 본다
-- (db:verify · smoke-guest 81절).
-- ════════════════════════════════════════════════════════════════════
revoke all on function guest_sessions(text)            from public, anon, authenticated;
revoke all on function join_as_guest(text, uuid, text) from public, anon, authenticated;
revoke all on function guest_board(text, uuid)         from public, anon, authenticated;

grant execute on function guest_sessions(text)            to anon;
grant execute on function join_as_guest(text, uuid, text) to anon;
grant execute on function guest_board(text, uuid)         to anon;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 새 테이블 0개 · 새 컬럼 0개 · 새 RLS 정책 0개 · 새 인덱스 0개 ·
--    새 함수 0개. anon 은 여전히 테이블·뷰에 도달하지 않는다
--  - 세 함수의 시각 창 교체(create or replace, 시그니처 불변):
--      guest_sessions(text) · join_as_guest(text, uuid, text) ·
--      guest_board(text, uuid)
--    starts_at 이 있으면 예전과 동일(−12h ~ +24h). starts_at 이 null 인
--    즉석 모임만 created_at > now() - interval '24 hours' 로 판단한다.
--    셋에 들어간 case 식은 **문자열이 서로 같다**
--  - 그 결과: 만든 지 24시간이 지난 즉석 모임은 등록도 현황판도 닫힌다.
--    예전에는 status='live' 인 한 영원히 열려 있었다
--  - 상위집합 관계 유지: 읽기 필터(guest_board)는 등록 필터에서
--    status 하나만 넓다(live → live·finished). 시각 창은 글자 그대로
--    같아서 "등록은 됐는데 현황판이 안 보인다" 가 원리적으로 불가능하다
--  - 권한 재적용: 셋 다 public·anon·authenticated 에서 revoke 후
--    anon 에만 grant(원본과 동일). authenticated 에는 안 엶
--
-- 안 건드린 것
--
--  - 적용된 마이그레이션 파일 **전부** — 20260828000001 ·
--    20260828000002 · 20260829000001 을 한 줄도 안 고쳤다
--  - 세 함수의 나머지 전부 — 반환 필드 목록 · 오류 코드 · 정렬 ·
--    limit 200 · security definer · set search_path = public, pg_temp ·
--    stable/volatile · pg_advisory_xact_lock · 게스트 상한 60 ·
--    이름 정리 정규식 · INSERT 컬럼 리터럴 · log_audit 호출 ·
--    본문 주석까지 원본 그대로
--  - status 필터 — guest_sessions/join_as_guest 는 'live',
--    guest_board 는 in ('live','finished') 그대로
--  - RLS 정책 전부 · match_overview 뷰 · 가드 트리거와 그 본문
--    (is_direct_api_call · guard_tournament_update · guard_club_update ·
--     guard_member_update · guard_member_delete)
--  - gen_guest_code · rotate_guest_code · create_club · create_session ·
--    create_tournament · unique_display_name · log_audit ·
--    notify_up_next · claim_court · set_court_queue · record_score ·
--    finish_match
--  - 인덱스 · 제약 · 컬럼 · 테이블 전부. tournaments.created_at 은
--    20260818000001 부터 not null default now() 라 새 조건이 NULL 을
--    만날 일이 없다
-- ════════════════════════════════════════════════════════════════════
