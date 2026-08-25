-- ════════════════════════════════════════════════════════════════════
-- 게스트 등록 (마일스톤 3) — 계정 없는 사람이 그날 명단에 스스로 들어온다
--
-- 새 테이블은 0개다. 게스트 그릇은 이미 있다(tournament_members.user_id
-- is null, 20260819000008_roster.sql). 이 마이그레이션이 하는 일은 그
-- 그릇에 anon(비로그인)이 닿는 좁은 통로를 뚫고, 그 통로가 딱 그것만
-- 하도록 못 박는 것이다.
--
-- ── 왜 RLS 정책을 하나도 안 여는가 ──────────────────────────────────
--
-- is_direct_api_call()(20260818000007) 은 `current_user = 'authenticated'`
-- 하나로 "정식 경로(RPC)인가 직접 API 호출인가" 를 가른다. anon 으로
-- 들어오면 current_user 가 'anon' 이라 이 함수는 **거짓**이 되고, 그
-- 순간 guard_tournament_update · guard_member_update · guard_member_delete
-- 세 트리거가 전부 "RPC 경로다" 로 오판해 컬럼 단위 방어를 안 하고
-- 통과시킨다. 즉 anon 에게 테이블 UPDATE/INSERT 정책을 단 하나라도 열면,
-- 관리자에게도 막혀 있는 owner_id · role · user_id · club_id 변경이
-- anon 에게 그대로 허용된다. 이건 이론이 아니라 지금 코드의 확정된
-- 동작이라 되돌릴 수 없는 사고다.
--
-- 그래서 clubs · tournaments · tournament_members 등 어떤 테이블에도
-- anon 대상 정책을 만들지 않는다. 대신 SECURITY DEFINER 함수 둘
-- (guest_sessions, join_as_guest) 에만 `grant execute to anon` 한다.
-- 노출 표면이 두 함수의 인자·반환값으로 한정되고, 문제가 생기면
-- `revoke execute ... from anon` 한 줄로 즉시·완전히 닫힌다.
--
-- ── 왜 레이트리밋을 안 만드는가 ─────────────────────────────────────
--
-- join_attempts.user_id 는 not null references auth.users(id) 라 계정
-- 없는 게스트는 애초에 시도 기록을 넣을 수 없다. 우회로 "user_id 를
-- nullable 로 풀고 게스트 시도를 null 로 기록" 하면 카운터가 전 세계
-- anon 하나로 합쳐진다 — 누군가 10번만 틀려도 그 순간부터 **모든**
-- 게스트 등록이 전역으로 막힌다. 코드 문자열이나 IP 로 세는 것도 각각
-- "존재하지 않는 코드는 안 쌓인다" · "Postgres 안에서 클라이언트 IP 가
-- 안 보인다" 로 막힌다. 즉 anon 상대로는 레이트리밋이 원리적으로
-- 불가능하고, 억지로 이식하면 전역 차단 DoS 를 스스로 여는 것이다.
--
-- 대신 세 겹으로 막는다: (1) 22자 코드의 엔트로피(약 110비트, 온라인
-- 추측이 계산상 불가능) (2) 모임당 게스트 상한(오염 상한이지 정원
-- 마감이 아니다) (3) status='live' + 시각 창 밖의 모임은 애초에 후보가
-- 아니다.
--
-- ── 코드 두 종류, 서로 다른 이유 ────────────────────────────────────
--
-- clubs.invite_code(6자리, 사람이 구두로 불러 입력, join_club 의 열쇠)와
-- clubs.guest_code(22자, 링크에만 실리고 아무도 손으로 안 침)는 서로
-- 다른 코드다. 게스트에게 invite_code 를 주면 게스트가 회원이 되어
-- club_members 에 남는다 — "게스트는 그날 모임에만 존재한다" 는 확정
-- 결정을 링크 하나가 깬다. guest_code 로만 게스트 등록을 받는다.
--
-- ── 게스트는 지워지지 않는다 ────────────────────────────────────────
--
-- 이 마이그레이션은 게스트 삭제 경로를 만들지 않는다. tournament_members
-- 는 원래 모임 하나에 종속된 테이블이라 다음 주 모임은 새 행 집합이고,
-- 시스템은 지난주를 기억하지 않는다 — 지울 것이 없다. 지우고 싶은
-- 운영진에게는 이미 remove_member 가 있고, guard_member_delete 가
-- 출전 기록 있는 행을 막는 동작도 그대로다.
--
-- ── is_guest 컬럼이 왜 필요한가 ─────────────────────────────────────
--
-- create_session 은 동아리 미가입 회원(user_id is null, 매주 오는
-- 사람)도 모임 명단에 심는다. user_id is null 로 배지를 그리면 그
-- 사람들 전원에게 "게스트" 딱지가 붙는다. is_guest 컬럼이 그 둘을
-- 가른다 — 화면 배지와 게스트 상한 계산에만 쓰고, 권한 판단에는
-- 절대 쓰지 않는다.
--
-- 실행 순서: 컬럼 → 코드 생성 함수 → backfill → 인덱스 → 가드 교체
-- (guard_club_update · guard_member_update) → RPC → revoke/grant.
--
-- ── 리뷰 반영 (적용 전, 같은 파일 안에서 고침) ──────────────────────
-- 1) join_as_guest 의 게스트 상한 카운트-삽입 구간에 advisory lock 추가
--    (동시 요청으로 상한이 무력화되는 것을 막는다)
-- 2) guard_member_update 본문에 is_guest 잠금 추가 (guest_code 와 같은
--    이유 — 자매 컬럼만 열려 있으면 상한 우회 경로가 남는다)
-- 3) p_name 에서 제어문자·제로폭·방향재정렬 문자를 정리 후 길이 검사
-- 4) anon 이 무제한 호출하는 두 쿼리에 방어적 인덱스 추가
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- Task 1 — 코드와 표시 컬럼
-- ════════════════════════════════════════════════════════════════════

alter table clubs
  add column if not exists guest_code text;

alter table tournament_members
  add column if not exists is_guest boolean not null default false;

comment on column tournament_members.is_guest is
  '화면 배지·게스트 상한 계산에만 쓴다. 권한 판단에는 절대 쓰지 않는다. '
  'user_id is null 인 행에는 미가입 회원(운영진이 심은, 매주 오는 사람)과 '
  '게스트(오늘 문 앞에서 등록한, 오늘만 오는 사람)가 섞여 있고, '
  'user_id is null 만으로는 그 둘을 가를 수 없다 — 이 컬럼이 가른다.';

-- ── 게스트 코드 생성 ────────────────────────────────────────────────
-- 알파벳 A-Z(26) + 2-9(8) = 34자. 22자를 뽑으면 log2(34)*22 ≈ 111비트로
-- 온라인 추측이 계산상 불가능해진다(설계 판단 2·3). invite_code 와 달리
-- 사람이 손으로 치지 않으므로 헷갈리는 글자(I/O/0/1)를 뺄 이유가 없다.
--
-- random() 이 아니라 gen_random_bytes() 를 쓴다 — 게스트 코드는 anon
-- 에게 레이트리밋을 걸 수 없어서 엔트로피 자체가 유일한 방어선이고,
-- 방어선이 암호학적으로 안전한 난수 위에 서 있어야 한다.
-- 바이트값(0~255)을 34로 나눈 나머지를 쓰므로 아주 작은 균등성 편향이
-- 있다(256 = 34*7 + 18 이라 일부 문자가 근소하게 더 자주 나온다). 22자
-- 전체의 엔트로피 마진이 워낙 커서 브루트포스 저항성에는 영향이 없다.
create or replace function gen_guest_code() returns text
language plpgsql volatile as $fn$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  raw      bytea;
  result   text := '';
begin
  raw := gen_random_bytes(22);
  for i in 1..22 loop
    result := result || substr(alphabet, 1 + (get_byte(raw, i - 1) % length(alphabet)), 1);
  end loop;
  return result;
end;
$fn$;

-- ── 기존 동아리 backfill ────────────────────────────────────────────
-- 동아리마다 따로 재시도한다 — 재시도 카운터(최대 10회)가 동아리별로
-- 독립이라는 뜻이다. 단, 어느 한 동아리가 10회 안에 못 뽑아 예외를
-- 던지면 그 예외는 이 DO 블록 밖으로 전파되어 **마이그레이션 파일
-- 전체가 롤백된다** — 동아리별 격리가 "한 동아리 실패가 다른 동아리를
-- 막지 않는다" 는 뜻은 아니다. fail-closed 가 의도된 동작이다: 코드
-- 생성 실패를 감춘 채 일부 동아리만 guest_code 없이 넘어가지 않는다.
do $$
declare
  v_club    record;
  v_code    text;
  v_attempt int;
begin
  for v_club in select id from clubs where guest_code is null loop
    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      v_code := gen_guest_code();
      exit when not exists (select 1 from clubs where guest_code = v_code);
      if v_attempt >= 10 then
        raise exception '게스트 코드 생성에 실패했습니다' using errcode = '40001';
      end if;
    end loop;
    update clubs set guest_code = v_code where id = v_club.id;
  end loop;
end;
$$;

alter table clubs alter column guest_code set not null;

alter table clubs drop constraint if exists clubs_guest_code_key;
alter table clubs add constraint clubs_guest_code_key unique (guest_code);

alter table clubs drop constraint if exists clubs_guest_code_format;
alter table clubs add constraint clubs_guest_code_format
  check (guest_code ~ '^[A-Z2-9]{22}$');

comment on column clubs.guest_code is
  '게스트 등록 링크의 열쇠. invite_code(회원 가입용, 6자리, 사람이 입력)와는 '
  '다른 코드다 — 이 코드로는 회원이 되지 않는다. 22자 base32([A-Z2-9])라 '
  '온라인 추측이 계산상 불가능하고, 그래서 레이트리밋 없이 엔트로피만으로 '
  '막는다. rotate_guest_code 로만 바뀐다(직접 PATCH 는 guard_club_update 가 막는다).';

-- ════════════════════════════════════════════════════════════════════
-- 방어적 인덱스 — guest_sessions/join_as_guest 는 로그인 없이 anon 이
-- 무제한으로 부를 수 있는 경로다(레이트리밋을 걸 수 없다는 게 이
-- 마이그레이션의 전제). 지금 데이터량에선 필수가 아니지만, 이 두
-- 쿼리만큼은 시퀀셜 스캔에 기대지 않도록 미리 넣는다.
-- ════════════════════════════════════════════════════════════════════
-- 후보 조회(club_id + kind='session' + status='live')용. 부분 인덱스라
-- 대회 행(kind='tournament')과 종료된 모임은 인덱스에 아예 안 실린다.
create index if not exists tournaments_guest_candidates_idx
  on tournaments (club_id)
  where kind = 'session' and status = 'live';

-- 모임당 게스트 상한(60) 카운트용. is_guest=false 행(대다수의 회원 행)은
-- 인덱스에 안 실려 카운트 쿼리가 가볍다.
create index if not exists tm_guest_count_idx
  on tournament_members (tournament_id)
  where is_guest;

-- ════════════════════════════════════════════════════════════════════
-- Task 4 (가드 교체) — guard_club_update 본문만 교체
--
-- 20260826000001_club_layer.sql 이 만든 트리거(clubs_guard_update)는
-- 다시 만들지 않는다. 본문에 guest_code 잠금만 추가한다 — 직접 PATCH 로
-- 게스트 링크를 바꾸는 길을 막고, rotate_guest_code RPC 로만 바뀌게
-- 한다(RPC 안에서는 is_direct_api_call() 이 거짓이라 이 가드를 그대로
-- 통과한다).
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_club_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;  -- RPC 경로는 자체 검증을 거쳤다
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception '동아리 주인은 변경할 수 없습니다' using errcode = '42501';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception '초대 코드는 재발급 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.guest_code is distinct from old.guest_code then
    raise exception '게스트 코드는 재발급 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 가드 확장(계획 밖, 코드리뷰 반영) — guard_member_update 에 is_guest 잠금
--
-- ⚠ 이 저장소의 원칙은 "기존 트리거·가드를 건드리지 마라" 다. 여기는 그
--   원칙의 명시적 예외다 — 이유: is_guest 는 게스트 상한(60) 계산의
--   유일한 근거인데, 자매 컬럼 guest_code 는 guard_club_update 로
--   직접 PATCH 를 막아 놓고 is_guest 만 열려 있으면 관리자가
--   PATCH /tournament_members {"is_guest": false} 로 기존 게스트를
--   카운트에서 빼서 상한을 우회할 수 있다. join_as_guest 의 advisory
--   lock(아래)이 "동시 삽입" 은 막아도 "이미 들어온 행의 표시를 지우는
--   것" 은 못 막는다 — 그래서 여기를 막아야 방어선이 완성된다.
--
-- 트리거(members_guard_update, 20260818000007 에서 이미 생성됨)는 다시
-- 만들지 않는다. 본문만 create or replace 한다. **기존 세 잠금
-- (role · user_id · tournament_id)은 원본(20260818000007_security_
-- hardening.sql)그대로 전부 유지한다** — 하나라도 빠뜨리면 조용히
-- 보안 구멍이 열린다.
-- ════════════════════════════════════════════════════════════════════
create or replace function guard_member_update()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception '역할은 권한 부여 기능으로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception '멤버의 계정은 변경할 수 없습니다' using errcode = '42501';
  end if;
  if new.tournament_id is distinct from old.tournament_id then
    raise exception '멤버를 다른 대회로 옮길 수 없습니다' using errcode = '42501';
  end if;
  if new.is_guest is distinct from old.is_guest then
    raise exception '게스트 표시는 직접 바꿀 수 없습니다' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- Task 2 — 후보 조립 RPC (anon 읽기)
--
-- 반환 필드는 정확히 셋뿐이다 — 동아리 이름(club_name) · 모임 이름
-- (sessions[].name) · 모임 시각(sessions[].starts_at), 그리고 등록에
-- 필요한 모임 id(sessions[].id). 회원 명단 · 인원수 · 초대 코드 · 다음
-- 주 일정은 절대 싣지 않는다. 반환 필드를 늘리는 순간 마일스톤 4(비로그인
-- 읽기 화면)를 앞당겨 여는 것이다 — 늘리려면 이 계획을 다시 논의한다.
--
-- 예외를 던지지 않는다. join_club(20260826000001) 과 같은 이유 —
-- definer 함수의 예외는 트랜잭션 전체를 롤백시키고, 이 함수는 읽기
-- 전용이라 롤백될 것도 없지만 두 anon 함수의 실패 모양을 하나로
-- 맞추기 위해 join_as_guest 와 동일하게 jsonb 봉투를 쓴다.
--
-- 후보 조건(설계 판단 4): 그 guest_code 의 동아리 소속 · kind='session' ·
-- status='live' · 시각 창(뒤 12시간 ~ 앞 24시간, starts_at null 이면
-- 통과). 이 필터는 join_as_guest 가 등록 시점에 그대로 다시 검사한다 —
-- 여기서는 후보를 "줄이는" 용도일 뿐이다.
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
     and (t.starts_at is null
          or t.starts_at between now() - interval '12 hours' and now() + interval '24 hours');

  if v_sessions is null then
    return jsonb_build_object('ok', false, 'error', 'no_open_session',
                              'message', '지금 열린 모임이 없습니다. 모임장에게 확인해 주세요');
  end if;

  return jsonb_build_object('ok', true, 'club_name', v_club.name, 'sessions', v_sessions);
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- Task 3 — 등록 RPC (anon 쓰기) ← 이 마일스톤의 핵심
--
-- ⚠ guest_sessions 가 보여준 후보 목록을 신뢰하지 않는다. p_session_id
--   는 전부 사용자 입력이라, guest_sessions 와 똑같은 필터(동아리 소속 ·
--   kind='session' · status='live' · 시각 창)를 여기서 다시 통과시킨다.
--
-- INSERT 컬럼을 명시적으로 나열한다 — user_id = null(리터럴) ·
-- role = 'member'(리터럴) · rsvp = 'going'(리터럴) · is_guest = true
-- (리터럴). 인자로 role · user_id · is_guest 를 받지 않는다. 이 함수가
-- SECURITY DEFINER 라 is_direct_api_call() 이 안에서 거짓이 되고
-- guard_member_update/guard_member_delete 의 방어를 우회하므로, 이
-- 함수 스스로 자기가 하는 일을 좁혀야 한다(설계 판단 1의 경고).
--
-- 예외를 던지지 않는다 — 같은 트랜잭션에 남기는 log_audit 기록까지
-- 롤백되는 것을 막기 위해서다(join_club 과 같은 이유).
--
-- ⚠ 이 함수는 INSERT 만 한다. UPDATE·DELETE 를 추가하지 마라 —
--   SECURITY DEFINER 안에서는 is_direct_api_call() 이 거짓이라
--   guard_member_update/guard_member_delete 의 컬럼 보호가 이 함수
--   안의 모든 쓰기에 우회된다. 지금은 INSERT 뿐이라 우회할 컬럼
--   변경이 없어 무해하지만, 나중에 누가 이 함수에 UPDATE 를 추가하면
--   그 우회가 조용히 되살아난다. 추가하려면 이 가드 우회를 먼저 다시
--   검토하라.
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
     and (t.starts_at is null
          or t.starts_at between now() - interval '12 hours' and now() + interval '24 hours');

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
-- Task 4 — 회수 수단 (authenticated 전용, anon 아니다)
--
-- 링크가 유출됐을 때 옛 링크를 즉시 죽인다. 이미 등록된 게스트 행은
-- 그대로 남는다(코드가 바뀌어도 tournament_members 는 건드리지 않는다).
-- ════════════════════════════════════════════════════════════════════
create or replace function rotate_guest_code(p_club_id uuid)
returns clubs
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_club    clubs;
  v_before  jsonb;
  v_code    text;
  v_attempt int;
begin
  select * into v_club from clubs where id = p_club_id for update;
  if not found then
    raise exception '동아리를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(p_club_id) then
    raise exception '운영진만 게스트 코드를 재발급할 수 있습니다' using errcode = '42501';
  end if;

  v_before := to_jsonb(v_club);

  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    v_code := gen_guest_code();
    exit when not exists (select 1 from clubs where guest_code = v_code);
    if v_attempt >= 10 then
      raise exception '게스트 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  update clubs set guest_code = v_code where id = p_club_id
  returning * into v_club;

  perform log_audit_club(p_club_id, 'club.guest_code.rotate', 'club', p_club_id,
                         v_before, to_jsonb(v_club));

  return v_club;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 권한 — Supabase 는 새 함수에 anon/authenticated EXECUTE 를 기본
-- 권한(default privileges)으로 자동 부여한다(20260818000005 의 경고).
-- `revoke all from public` 만으로는 부족해서 anon·authenticated 를
-- 명시적으로 같이 걷어낸 뒤, 필요한 곳에만 다시 연다.
--
-- anon 이 실행할 수 있는 함수는 정확히 둘 — guest_sessions ·
-- join_as_guest. rotate_guest_code 는 authenticated 만. gen_guest_code
-- 는 내부 전용(gen_invite_code 와 같은 취급)이라 아무에게도 안 연다.
-- ════════════════════════════════════════════════════════════════════
revoke all on function gen_guest_code()                    from public, anon, authenticated;
revoke all on function guest_sessions(text)                 from public, anon, authenticated;
revoke all on function join_as_guest(text, uuid, text)      from public, anon, authenticated;
revoke all on function rotate_guest_code(uuid)               from public, anon, authenticated;

grant execute on function guest_sessions(text)            to anon;
grant execute on function join_as_guest(text, uuid, text) to anon;
grant execute on function rotate_guest_code(uuid)         to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 새 테이블 0개. 새 RLS 정책 0개. anon 은 테이블에 도달하지 않는다
--  - 컬럼: clubs.guest_code text not null unique
--    (check '^[A-Z2-9]{22}$', 기존 동아리 backfill 완료) ·
--    tournament_members.is_guest boolean not null default false
--    (권한 판단에 안 씀, comment on column 으로 명시)
--  - 함수(내부 전용, 아무에게도 grant 안 함): gen_guest_code() —
--    gen_random_bytes 기반 22자 base32([A-Z2-9], 약 111비트)
--  - RPC(anon): guest_sessions(text) returns jsonb — 예외 없이
--    {ok,error,message} 또는 {ok:true, club_name, sessions:[{id,name,
--    starts_at}]}. 반환 필드 정확히 셋 + id. status='live' ·
--    kind='session' · 시각 창(−12h~+24h) 필터
--  - RPC(anon): join_as_guest(text, uuid, text) returns jsonb —
--    guest_sessions 와 동일한 필터를 재검증(후보 목록 불신), 이름을
--    제어문자·제로폭·방향재정렬 문자 제거 후 1~20자 검사, 모임당 게스트
--    상한 60(pg_advisory_xact_lock 으로 카운트-삽입 구간 직렬화 —
--    동시 요청으로 상한이 무력화되는 것을 막음), INSERT 컬럼 명시 나열
--    (user_id=null · role='member' · rsvp='going' · is_guest=true 전부
--    리터럴), log_audit('member.guest_join'), 접미사 붙은 최종 이름 반환.
--    함수 머리에 "UPDATE/DELETE 추가 금지" 경고 주석
--  - RPC(authenticated 전용, anon 아님): rotate_guest_code(uuid) —
--    is_club_admin 검사 + for update 락, 10회 재시도 + 40001,
--    log_audit_club
--  - guard_club_update 본문 교체(트리거 재생성 없음) — guest_code 직접
--    PATCH 를 invite_code 와 같은 방식으로 잠금
--  - guard_member_update 본문 교체(트리거 재생성 없음, 코드리뷰 반영 —
--    계획에 없던 예외) — 기존 role·user_id·tournament_id 잠금을 전부
--    유지한 채 is_guest 잠금 추가. 상한 우회(관리자가 is_guest=false 로
--    PATCH 해 카운트에서 빼는 경로)를 막기 위함
--  - 방어적 인덱스 둘: tournaments_guest_candidates_idx(club_id, 부분:
--    kind='session' and status='live') · tm_guest_count_idx(tournament_id,
--    부분: is_guest) — anon 이 무제한 호출하는 두 쿼리용
--  - 권한: gen_guest_code/guest_sessions/join_as_guest/rotate_guest_code
--    를 public·anon·authenticated 에서 전부 걷어낸 뒤, guest_sessions·
--    join_as_guest 는 anon 에만, rotate_guest_code 는 authenticated 에만
--    다시 grant. anon 이 실행 가능한 함수는 정확히 둘
--  - 안 건드린 것: RLS 정책 전부 · is_tournament_* · is_club_* ·
--    guard_tournament_update · create_session · create_tournament ·
--    set_my_rsvp · add_roster_member · remove_member · tm_fill_rsvp ·
--    match_overview 뷰 · join_attempts · guard_club_update/
--    guard_member_update 트리거 자체(clubs_guard_update,
--    members_guard_update) — 둘 다 본문만 교체, 트리거는 재생성 안 함
-- ════════════════════════════════════════════════════════════════════
