-- ════════════════════════════════════════════════════════════════════
-- 급수(S · A · B · C · D · 초심)
--
-- ── 무엇을 푸는가 ───────────────────────────────────────────────────
--
-- 배드민턴 동호인에게 "몇 급이냐" 는 이름 다음으로 먼저 묻는 것이다.
-- 경기를 짤 때 실력이 안 맞으면 두 팀 다 재미가 없고, 그 판단을 지금은
-- 운영진의 기억에만 맡기고 있다. 그래서 사람이 앱에 들어오는 **두
-- 입구**에서 급수를 같이 받는다.
--
--   계정 사용자 — 회원가입할 때 한 번 고른다 (profiles.grade)
--   게스트     — 게스트 링크로 이름 적을 때 같이 고른다 (그때뿐)
--
-- ── 왜 컬럼이 둘인가 (스냅샷) ───────────────────────────────────────
--
-- `tournament_members.grade` 는 **그 명단에서의 급수**다. `display_name`
-- 과 `avatar_url` 이 이미 같은 규율이다(20260818000001 의 테이블 주석) —
-- 명단에 들어오는 순간 `profiles` 에서 복사하고, 그 뒤 프로필을 바꿔도
-- 지난 대회 명단은 안 바뀐다.
--
-- 참조가 아니라 복사인 이유는 둘이다.
--   1. **`profiles` 는 본인만 조회할 수 있다**(RLS: profiles_select_own).
--      참조로 두면 명단 화면이 남의 급수를 영영 못 읽는다.
--   2. 지난 6월 대회에서 C 였던 사람이 지금 B 라고 해서, 그때 기록의
--      조 편성 근거까지 소급해 바뀌면 안 된다.
--
-- 게스트는 프로필이 없으므로 입력값을 그대로 넣는다.
--
-- ── ⚠ 두 컬럼 다 nullable 이다 ──────────────────────────────────────
--
-- **not null 로 만들면 이미 있는 행 전부와, 명단에 사람을 넣는 모든
-- 경로가 "채울 책임" 을 진다.** 마일스톤 3 이 정확히 그것으로 프로덕션을
-- 깼다(docs/todo.md 🔴 절). 급수를 모르는 사람은 **모르는 채로 둔다** —
-- 화면은 배지를 안 그리면 그만이고, '모른다' 를 억지 기본값으로 덮으면
-- 그 순간 거짓말이 된다. 특히 '초심' 을 기본값으로 쓰면 안 된다:
-- 미입력과 실제 초심이 구별되지 않는다.
--
-- ── 🚫 '초심' 을 DB 값으로 한글로 넣지 않는다 ───────────────────────
--
-- enum 값은 `beginner` 이고 화면에서만 '초심' 으로 그린다(src/lib/grade.ts).
-- DB 값에 한글을 넣으면 나중에 문구를 못 바꾼다 — enum 라벨 변경은
-- 마이그레이션이고, 화면 문구 변경은 한 줄이다. 순서(S > A > B > C > D >
-- 초심)도 enum 선언 순서에 그대로 담아 둔다. `enumsortorder` 덕분에
-- `order by grade` 가 그대로 이 순서다.
--
-- ── 🔴 search_path (여기 손대는 사람이 먼저 읽을 것) ────────────────
--
-- 여기서 다시 만드는 함수 전부 원본의 `set search_path = public, pg_temp`
-- 를 **한 글자도 안 바꾸고** 유지한다. 어느 것도 pgcrypto
-- (gen_random_bytes · digest · crypt)를 부르지 않으므로 그걸로 충분하다.
-- 나중에 이 안에 pgcrypto 함수를 넣으면 즉시 `function ... does not exist`
-- 로 죽는다 — Supabase 는 확장을 public 이 아니라 extensions 에 설치한다.
-- 그때는 `set search_path = public, extensions, pg_temp` 로 넓혀라
-- (pg_temp 는 맨 뒤 그대로). 20260828000002 가 이 함정으로 동아리 생성
-- 전체를 막았다.
-- ════════════════════════════════════════════════════════════════════

-- ── 열거형 ──────────────────────────────────────────────────────────
-- 선언 순서 = 실력 순서다. 정렬이 필요해지는 날 이 순서가 그대로 답이다.
create type player_grade as enum ('S', 'A', 'B', 'C', 'D', 'beginner');

comment on type player_grade is
  '배드민턴 급수. beginner 는 화면에서 ''초심'' 으로 그린다 — DB 값에 한글을 넣지 않는다. 선언 순서가 곧 실력 순서(S > A > B > C > D > beginner)라 order by 가 그대로 동작한다.';

-- ── 컬럼 둘 ─────────────────────────────────────────────────────────
alter table profiles           add column grade player_grade;
alter table tournament_members add column grade player_grade;

comment on column profiles.grade is
  '계정의 급수. 회원가입 때 고른 값(handle_new_user 가 메타데이터에서 읽는다). null 은 ''모른다'' 이지 초심이 아니다 — 소셜 로그인은 이 값을 주지 않으므로 null 이 정상이다.';

comment on column tournament_members.grade is
  '이 명단에서의 급수 스냅샷. display_name 과 같은 규율로 명단에 들어올 때 profiles 에서 복사한다(게스트는 입력값). 프로필을 나중에 바꿔도 지난 명단은 안 바뀐다. null 은 ''모른다'' — 계정 없이 운영진이 손으로 올린 사람(add_roster_member)은 복사할 프로필이 없어 항상 null 이다.';

-- ── 문자열 → 급수 (모르는 값은 null) ────────────────────────────────
--
-- 파싱을 한 곳에 모으는 이유: 급수가 들어오는 입구가 둘(가입 메타데이터 ·
-- 게스트 등록 인자)인데, 둘 다 **우리가 통제하지 못하는 문자열**이다.
-- 메타데이터는 클라이언트가 아무 값이나 넣을 수 있고, 게스트 인자는
-- 비로그인 anon 이 부른다.
--
-- 인자를 player_grade 가 아니라 text 로 받고 여기서 푸는 것이 핵심이다.
-- enum 으로 받으면 이상한 값이 **함수 안으로 들어오기도 전에** PostgREST
-- 경계에서 22P02 로 터진다 — 게스트 경로는 "예외를 던지지 않고 봉투를
-- 돌려준다" 가 규율인데(20260828000001), 그 규율이 함수 밖에서 깨진다.
-- 모르는 값은 조용히 null 로 떨어뜨린다: src/lib/grade.ts 의 parseGrade
-- 와 **같은 규칙**이다.
create or replace function parse_player_grade(p_raw text)
returns player_grade
language plpgsql immutable set search_path = public, pg_temp as $fn$
declare
  v_clean text := btrim(coalesce(p_raw, ''));
begin
  if v_clean = '' then
    return null;
  end if;
  begin
    return v_clean::player_grade;
  exception when invalid_text_representation then
    -- 모르는 값은 '모른다' 로 본다. 여기서 던지면 가입 트리거가 터져
    -- 계정 생성 전체가 롤백된다 — 급수 오타로 가입이 막히면 안 된다.
    return null;
  end;
end;
$fn$;

comment on function parse_player_grade(text) is
  '문자열을 급수로. 모르는 값·빈 값은 null. 급수가 들어오는 두 입구(가입 메타데이터·게스트 등록 인자)가 함께 쓰는 유일한 파서다.';

-- 내부 전용 — gen_invite_code · log_audit 과 같은 취급(20260818000005).
revoke all on function parse_player_grade(text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 1/5 — handle_new_user (가입 시 profiles 생성)
--
-- 원본: 20260818000001_schema.sql:45-68
-- 바뀐 것: grade 한 컬럼뿐. 이름 fallback 사슬(name → full_name →
--          nickname → preferred_username → 이메일 앞부분 → '이름없음') ·
--          avatar_url 사슬 · on conflict do nothing · security definer ·
--          search_path 전부 원본 그대로다.
--
-- 트리거(on_auth_user_created)는 다시 만들지 않는다 — 본문만 바꾸면
-- 기존 트리거가 새 본문을 그대로 탄다.
--
-- ⚠ 소셜 로그인은 메타데이터 키가 provider 마다 다르다. 그래서 이름은
--   위 사슬로 여러 키를 훑는데, **급수는 사슬이 없다.** 카카오도 구글도
--   급수라는 개념을 모르므로 줄 수가 없고, 우리 가입 폼이 넣는 'grade'
--   하나뿐이다. 소셜로 들어온 사람은 null 로 남는 것이 정상이다.
-- ════════════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into profiles (id, name, email, avatar_url, grade)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'nickname', ''),
      nullif(new.raw_user_meta_data->>'preferred_username', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '이름없음'
    ),
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    ),
    -- 우리 가입 폼만 넣는 키다. 없거나 모르는 값이면 null (parse_player_grade)
    parse_player_grade(new.raw_user_meta_data->>'grade')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 2/5 — create_tournament (대회 만들기, 주최자 + 동아리 운영진 심기)
--
-- 원본: 20260826000001_club_layer.sql:612-711 (최신본. grep -ln 으로
--       create_tournament 를 가진 파일 넷을 전부 확인하고 마지막을 골랐다 —
--       '최신을 잘못 짚어 검사가 조용히 사라진' 사고가 이 저장소에 있다)
-- 바뀐 것: 두 INSERT 에 grade 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
--          검증 순서·조커조 검사·is_club_admin 검사·초대 코드 10회 재시도·
--          groups 생성·on conflict do nothing·log_audit 전부 원본 그대로.
--
-- 운영진 심기 쪽은 club_members 에서 도는데 그 테이블에는 급수가 없다.
-- **급수의 정본은 profiles 하나**여서(동아리마다 다른 급수를 갖는다는
-- 개념은 없다) 여기서 profiles 를 직접 본다. user_id 가 null 인 미가입
-- 회원이면 서브쿼리가 0행이라 자연히 null 이 된다 — 따로 분기하지 않는다.
-- ════════════════════════════════════════════════════════════════════
create or replace function create_tournament(
  p_name               text,
  p_description        text,
  p_group_count        int,
  p_joker_group_count  int,
  p_display_name       text,
  p_config             jsonb default '{}'::jsonb,
  p_club_id            uuid default null
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament  tournaments;
  v_code        text;
  v_uid         uuid := auth.uid();
  v_profile     profiles;
  v_config      jsonb;
  v_club_admin  club_members;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '대회 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_group_count < 2 or p_group_count > 20 then
    raise exception '조는 2개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;
  if p_joker_group_count < 0 or p_joker_group_count > p_group_count then
    raise exception '조커조 개수는 0 이상 전체 조 개수 이하여야 합니다' using errcode = '22023';
  end if;
  -- 소속을 지정하려면 그 동아리의 운영진이어야 한다. 동아리 운영진이라는
  -- 사실만으로 동아리 밖 대회를 만질 권한이 생기지는 않는다 — 이 검사는
  -- 어디까지나 "만들 수 있는가" 이고, 만든 뒤의 권한은 심어진 멤버 행이 진다.
  if p_club_id is not null and not is_club_admin(p_club_id) then
    raise exception '동아리 운영진만 소속 대회를 만들 수 있습니다' using errcode = '42501';
  end if;

  -- 조커조 개수는 groups.is_joker 가 진실이다. config 쪽은 그 사본이므로
  -- 부르는 쪽이 뭘 보냈든 인자 값으로 덮는다.
  v_config := normalize_tournament_config(
    coalesce(p_config, '{}'::jsonb) || jsonb_build_object('jokerGroupCount', p_joker_group_count)
  );

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into tournaments (name, description, invite_code, owner_id, config, club_id)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_code,
    v_uid,
    v_config,
    p_club_id
  )
  returning * into v_tournament;

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, grade)
  values (
    v_tournament.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    -- 스냅샷. 지금 프로필에 급수가 없으면 null 로 남는다(가입을 막지 않으므로 흔하다)
    v_profile.grade
  );

  insert into groups (tournament_id, name, sort_order, is_joker)
  select v_tournament.id, i || '조', i, (i <= p_joker_group_count)
  from generate_series(1, p_group_count) as i;

  -- 동아리 밑이면 그 시점 운영진(만든 사람 제외)을 admin 멤버 행으로 함께
  -- 심는다. 이름 충돌은 unique_display_name 이 접미사로 풀고, 동시성
  -- 대비로 on conflict do nothing 도 건다. 이 심기는 실패하면 안 된다.
  if p_club_id is not null then
    for v_club_admin in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.role in ('owner', 'admin')
        and cm.user_id is not null
        and cm.user_id <> v_uid
    loop
      insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, grade)
      values (
        v_tournament.id, v_club_admin.user_id, 'admin',
        unique_display_name(v_tournament.id, v_club_admin.display_name),
        v_club_admin.avatar_url,
        -- club_members 에는 급수가 없다. 정본인 profiles 를 직접 본다.
        (select p.grade from profiles p where p.id = v_club_admin.user_id)
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_tournament.id, 'tournament.create', 'tournament', v_tournament.id,
                    null, to_jsonb(v_tournament));

  return v_tournament;
end;
$fn$;

-- 시그니처를 안 바꿨으므로 create or replace 가 권한을 보존한다.
-- 그래도 관례(20260818000005_function_lockdown.sql)대로 명시적으로 다시 쓴다.
revoke all on function create_tournament(text, text, int, int, text, jsonb, uuid) from public, anon;
grant execute on function create_tournament(text, text, int, int, text, jsonb, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3/5 — create_session (모임 열기, 주최자 + 동아리 회원 전원 심기)
--
-- 원본: 20260827000001_session_rsvp.sql:182-283 (최신본. 20260826000001 의
--       4인자 판은 여기서 이미 대체됐다 — 그쪽을 베끼면 p_starts_at 이
--       통째로 사라진다)
-- 바뀐 것: 두 INSERT 에 grade 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
--          rsvp 리터럴('going'/'invited') · order by joined_at,id ·
--          `is distinct from` · role 승격 case · log_audit 전부 원본 그대로.
-- ════════════════════════════════════════════════════════════════════
create or replace function create_session(
  p_name         text,
  p_display_name text,
  p_court_count  int default 2,
  p_club_id      uuid default null,
  p_starts_at    timestamptz default null
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_session      tournaments;
  v_code         text;
  v_uid          uuid := auth.uid();
  v_profile      profiles;
  v_club_member  club_members;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '모임 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_court_count < 1 or p_court_count > 20 then
    raise exception '코트는 1개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;
  if p_club_id is not null and not is_club_admin(p_club_id) then
    raise exception '동아리 운영진만 소속 모임을 만들 수 있습니다' using errcode = '42501';
  end if;

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  -- p_starts_at 은 검증하지 않는다. NULL 이면 즉석 모임이고, 과거 시각이면
  -- 어제 친 모임을 나중에 기록하는 것이다 — 둘 다 정상 경로다.
  insert into tournaments (name, invite_code, owner_id, status, kind, config, club_id, starts_at)
  values (
    btrim(p_name), v_code, v_uid, 'live', 'session',
    normalize_tournament_config('{}'::jsonb), p_club_id, p_starts_at
  )
  returning * into v_session;

  -- 만든 사람은 'going'. 자기가 여는 모임에 참가 여부를 다시 물을 이유가 없다.
  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, rsvp, grade)
  values (
    v_session.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    'going',
    v_profile.grade
  );

  -- 코트가 없으면 아무것도 못 한다. 모임은 코트가 곧 화면이다.
  insert into courts (tournament_id, name, sort_order)
  select v_session.id, i || '번 코트', i
  from generate_series(1, p_court_count) as i;

  -- 동아리 밑이면 그 시점 회원 **전원**(만든 사람 제외)을 심는다.
  -- 이름 충돌은 unique_display_name 이 접미사로 풀고, 동시성 대비로
  -- on conflict do nothing 도 건다. 이 심기는 실패하면 안 된다 —
  -- 동명이인 하나 때문에 모임 생성 트랜잭션이 통째로 롤백되면 안 된다.
  --
  -- order by 를 박아 두는 이유: unique_display_name 의 A~Z 접미사는 부르는
  -- 순서대로 붙는다. 순서가 흔들리면 같은 동아리로 같은 모임을 두 번 열 때
  -- '홍길동A' 가 서로 다른 사람이 된다.
  --
  -- user_id 비교는 `is distinct from` 이어야 한다. 미가입 회원(NULL)에
  -- `<> v_uid` 를 쓰면 NULL 이 되어 그 사람이 통째로 걸러진다.
  if p_club_id is not null then
    for v_club_member in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.user_id is distinct from v_uid
      order by cm.joined_at, cm.id
    loop
      insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, rsvp, grade)
      values (
        v_session.id,
        v_club_member.user_id,
        case when v_club_member.role in ('owner', 'admin')
             then 'admin'::member_role
             else 'member'::member_role
        end,
        unique_display_name(v_session.id, v_club_member.display_name),
        v_club_member.avatar_url,
        'invited',
        -- 미가입 회원(user_id null)은 서브쿼리가 0행이라 자연히 null 이다
        (select p.grade from profiles p where p.id = v_club_member.user_id)
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_session.id, 'session.create', 'tournament', v_session.id,
                    null, to_jsonb(v_session));

  return v_session;
end;
$fn$;

revoke all on function create_session(text, text, int, uuid, timestamptz) from public, anon;
grant execute on function create_session(text, text, int, uuid, timestamptz) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4/5 — join_tournament (초대 코드로 들어오기)
--
-- 원본: 20260818000008_join_rate_limit_fix.sql:25-96 (최신본)
-- 바뀐 것: INSERT 에 grade 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
--
-- ⚠ 이 함수가 예외 대신 jsonb 봉투를 돌려주는 이유(브루트포스 실패 기록이
--   같은 트랜잭션에서 롤백되는 것을 막는다)는 원본 머리에 있다. 여기서
--   급수를 더하면서 그 구조를 건드리지 않았다 — 어떤 실패 경로에서도
--   raise 로 바꾸지 마라.
-- ════════════════════════════════════════════════════════════════════
create or replace function join_tournament(p_code text, p_display_name text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code text;
  v_uid uuid := auth.uid();
  v_recent_failures int;
  v_profile profiles;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated',
                              'message', '로그인이 필요합니다');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select count(*) into v_recent_failures
  from join_attempts
  where user_id = v_uid
    and not succeeded
    and attempted_at > now() - interval '10 minutes';

  if v_recent_failures >= 10 then
    return jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'message', '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요');
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'bad_format',
                              'message', '초대 코드는 6자리입니다');
  end if;

  select * into v_tournament from tournaments where invite_code = v_code;

  if not found then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'not_found',
                              'message', '그런 코드의 대회가 없습니다');
  end if;

  if v_tournament.status = 'finished' then
    -- 코드 자체는 맞았으므로 브루트포스 카운터에는 넣지 않는다
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);
    return jsonb_build_object('ok', false, 'error', 'finished',
                              'message', '이미 종료된 대회입니다');
  end if;

  insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);

  -- 프로필이 없으면 만들어 준다. 없으면 멤버가 0행 삽입되어
  -- "성공했다는데 참가가 안 된" 상태가 된다.
  v_profile := ensure_profile(v_uid);

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, grade)
  values (
    v_tournament.id, v_uid, 'member',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    v_profile.grade
  )
  on conflict (tournament_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'tournament', to_jsonb(v_tournament));
end;
$fn$;

revoke all on function join_tournament(text, text) from public, anon;
grant execute on function join_tournament(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 5/5 — join_as_guest (게스트 등록, anon) — **시그니처가 바뀐다**
--
-- 원본: 20260830000001_instant_session_window.sql:166-282 (최신본. 시각 창
--       case 식이 여기 들어 있다 — 20260828000001 의 원본을 베끼면 즉석
--       모임 링크가 영원히 열리는 구멍이 되살아난다)
-- 바뀐 것: 인자 p_grade 한 개(맨 뒤, default null) + INSERT 의 grade 한 컬럼.
--          시각 창 case 식 · 오류 코드 · 이름 정리 정규식 · 게스트 상한 60 ·
--          advisory lock · log_audit · 반환 봉투 전부 원본 그대로다.
--
-- ── ⚠ 왜 drop 이 필요한가 ───────────────────────────────────────────
--
-- `create or replace` 로는 인자를 못 늘린다. 새로 만들면 이름이 같은 함수가
-- **둘** 생기고, PostgREST 는 함수를 **인자 이름 집합**으로 찾으므로 3인자
-- 호출이 어느 쪽인지 몰라 `function is not unique` 로 떨어진다 — 그 순간
-- 게스트 등록이 통째로 막힌다. 20260824000003 · 20260826000001 ·
-- 20260827000001 이 전부 같은 이유로 같은 일을 했다.
--
-- ── 옛 호출이 안 깨지는 이유 ────────────────────────────────────────
--
-- 새 인자가 **맨 뒤 default null** 이라 `{p_code, p_session_id, p_name}` 만
-- 보내는 호출이 그대로 이 함수 하나에 매칭된다. 급수를 안 보내면 grade 가
-- null 로 들어가고 나머지 동작은 글자 그대로 같다. `db:smoke:guest` 의
-- 3인자 호출 수십 건이 그 회귀 관문이다.
--
-- ⚠ drop 하면 기존 grant 도 함께 사라진다. 아래 권한 절에서 **새
--   시그니처로** anon 에게 다시 여는 것이 필수다.
--
-- ⚠ 원본의 경고를 그대로 옮겨 온다 — 이 함수는 INSERT 만 한다.
--   UPDATE·DELETE 를 추가하지 마라. SECURITY DEFINER 안에서는
--   is_direct_api_call() 이 거짓이라 guard_member_update /
--   guard_member_delete 의 컬럼 보호가 이 함수 안의 모든 쓰기에 우회된다.
--
-- 🚫 반환 봉투에는 급수를 **싣지 않는다.** guest_sessions · guest_board 도
--    그대로 둔다 — 게스트 현황판은 노출 표면을 필드 단위로 못 박아 뒀고
--    (20260829000001 머리 주석), 필드를 하나 늘리는 것이 곧 비로그인 노출
--    표면을 넓히는 것이다. 이번 범위 밖이다.
-- ════════════════════════════════════════════════════════════════════
drop function if exists join_as_guest(text, uuid, text);

create or replace function join_as_guest(
  p_code       text,
  p_session_id uuid,
  p_name       text,
  -- 맨 뒤 · default null — 옛 3인자 호출이 그대로 이 함수를 찾는다.
  -- player_grade 가 아니라 text 인 이유는 parse_player_grade 주석 참고
  -- (게스트 경로는 예외 대신 봉투를 돌려주는 것이 규율이다).
  p_grade      text default null
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
    (tournament_id, user_id, role, display_name, avatar_url, rsvp, is_guest, grade)
  values
    (p_session_id, null, 'member',
     unique_display_name(p_session_id, v_clean_name),
     null, 'going', true,
     -- 게스트는 프로필이 없다. 스냅샷할 원본이 없으므로 입력값이 곧 값이다.
     -- 모르는 문자열은 null 로 떨어진다 — 급수 오타로 등록을 막지 않는다.
     parse_player_grade(p_grade))
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
-- 권한 — drop 으로 날아간 join_as_guest 의 grant 를 새 시그니처로 다시 세운다.
--
-- Supabase 는 새 함수에 anon/authenticated EXECUTE 를 기본 권한으로 자동
-- 부여한다(20260818000005 의 경고). `revoke all from public` 만으로는
-- 부족해서 anon·authenticated 를 명시적으로 걷어낸 뒤 필요한 곳에만 연다.
--
-- **authenticated 에는 열지 않는다** — 원본과 같다. 로그인한 사람이 같은
-- 브라우저로 게스트 링크를 열면 JWT 가 딸려 가 current_user 가
-- 'authenticated' 가 되는데, 거기 grant 가 있으면 운영진이 자기도 모르게
-- 게스트로 명단에 들어간다. src/features/guest/api.ts 가 전용 anon
-- 클라이언트를 따로 두는 것도 같은 이유다.
-- ════════════════════════════════════════════════════════════════════
revoke all on function join_as_guest(text, uuid, text, text) from public, anon, authenticated;
grant execute on function join_as_guest(text, uuid, text, text) to anon;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 열거형: player_grade ('S','A','B','C','D','beginner') — 선언 순서가
--    곧 실력 순서. 화면 문구('초심')는 src/lib/grade.ts 가 진다
--  - 컬럼 둘, **둘 다 nullable**: profiles.grade · tournament_members.grade
--    (+ comment on column 으로 "null 은 모른다이지 초심이 아니다" 명시)
--  - 함수(내부 전용, 아무에게도 grant 안 함): parse_player_grade(text) —
--    모르는 값·빈 값은 null. 급수가 들어오는 두 입구가 함께 쓰는 유일한 파서
--  - handle_new_user 본문 교체(트리거 재생성 없음) — 가입 메타데이터의
--    'grade' 를 profiles.grade 로. 이름 fallback 사슬은 원본 그대로
--  - 급수를 스냅샷하는 RPC 넷(시그니처 불변, 전부 create or replace):
--    create_tournament(주최자 + 동아리 운영진) · create_session(주최자 +
--    동아리 회원 전원) · join_tournament(본인) · join_as_guest(입력값)
--  - join_as_guest 만 시그니처 변경 — p_grade text default null 을 맨 뒤에
--    추가. 옛 3인자 함수는 drop(function is not unique 방지), anon grant
--    재설정. 옛 3인자 호출은 그대로 동작한다
--
-- 이 마이그레이션이 **안 건드린 것**
--
--  - add_roster_member — 계정 없는 사람만 만드는 경로다(user_id 리터럴
--    null). 복사할 프로필이 없으므로 grade 는 항상 null 이고, 그것이 맞다.
--    "급수를 모르는 사람은 모르는 채로 둔다"
--  - link_member_account — INSERT 가 아니라 두 기존 행을 합치는 경로다.
--    계정 쪽 행의 급수가 이미 스냅샷돼 있다
--  - join_club / club_members — 급수의 정본은 profiles 하나다. 동아리마다
--    다른 급수를 갖는다는 개념이 없어 컬럼을 만들지 않았다
--  - guest_sessions · guest_board — 반환 필드에 급수를 넣지 않았다.
--    비로그인 노출 표면은 20260829000001 머리의 표가 정본이고, 필드를
--    하나 늘리는 것이 곧 그 표면을 넓히는 것이다
--  - RLS 정책 0개 변경. 트리거 0개 재생성. guard_* 가드 전부 무변경
--  - match_overview 뷰 무변경 — 경기 짜기 화면의 급수 표시는 범위 밖이다
-- ════════════════════════════════════════════════════════════════════
