-- ════════════════════════════════════════════════════════════════════
-- 성별(남 · 여) + 명단에서 남의 급수·성별 고치기
--
-- ── 무엇을 푸는가 ───────────────────────────────────────────────────
--
-- 배드민턴 경기의 **종목**(남복 · 여복 · 혼복)은 선수 넷의 성별에서 그대로
-- 나온다(src/lib/gender.ts). 성별을 모르는 사람이 섞이면 그 사람은 종목
-- 편성에서 통째로 빠진다 — 즉 이 값이 비어 있는 것은 "정보가 없다" 가
-- 아니라 **"자동 편성이 그 사람을 못 쓴다"** 는 뜻이다.
--
-- ── 급수와 글자 그대로 같은 구조다 ──────────────────────────────────
--
-- 20260901000001_player_grade.sql 이 이미 판 길을 그대로 따른다.
--
--   player_gender enum ('male','female')
--   profiles.gender            player_gender  nullable
--   tournament_members.gender  player_gender  nullable   ← 명단 스냅샷
--
-- 스냅샷인 이유도 같다. (1) profiles 는 본인만 조회할 수 있어서
-- (profiles_select_own) 참조로 두면 명단 화면이 남의 성별을 영영 못 읽고,
-- (2) 지난 대회 기록의 편성 근거가 소급해 바뀌면 안 된다.
-- 게스트는 프로필이 없으므로 입력값이 곧 값이다.
--
-- ── ⚠ 둘 다 nullable · 기본값 없음 ──────────────────────────────────
--
-- not null 로 만들면 이미 있는 행 전부와, 명단에 사람을 넣는 모든 경로가
-- "채울 책임" 을 진다(마일스톤 3 이 그것으로 프로덕션을 깼다). 성별을
-- 모르는 사람은 **모르는 채로 둔다** — 화면은 배지를 안 그리면 그만이고,
-- '남' 을 기본값으로 덮으면 그 순간 거짓말이 되어 여복 편성이 깨진다.
--
-- ── 🚫 DB 값에 한글을 넣지 않는다 ───────────────────────────────────
--
-- enum 값은 male · female 이고 화면에서만 '남' · '여' 로 그린다
-- (src/lib/gender.ts). 라벨 변경은 마이그레이션이지만 화면 문구 변경은
-- 한 줄이다 — 급수의 'beginner' 가 같은 이유로 영문이다.
--
-- 순서는 목록에 그리는 순서일 뿐 서열이 아니다. 급수는 선언 순서가 곧
-- 실력 순서라 `order by grade` 가 뜻을 갖지만, 성별은 그런 축이 없다.
--
-- ── 🔴 search_path (여기 손대는 사람이 먼저 읽을 것) ────────────────
--
-- 여기서 다시 만드는 함수 전부 원본의 `set search_path = public, pg_temp`
-- 를 **한 글자도 안 바꾸고** 유지한다. 어느 것도 pgcrypto(gen_random_bytes ·
-- digest · crypt)를 부르지 않으므로 그걸로 충분하다. 나중에 이 안에
-- pgcrypto 함수를 넣으면 즉시 `function ... does not exist` 로 죽는다 —
-- Supabase 는 확장을 public 이 아니라 extensions 에 설치한다. 그때는
-- `set search_path = public, extensions, pg_temp` 로 넓혀라(pg_temp 는 맨 뒤).
-- 20260828000002 가 이 함정으로 동아리 생성 전체를 막았다.
--
-- ── 채우는 경로는 다섯이다 (16곳이 아니다) ──────────────────────────
--
-- `insert into tournament_members` 를 가진 파일이 여럿이지만 대부분 **옛
-- 판**이다. 파일별 마지막 정의만 살아 있다. 살아 있는 다섯 중 넷을 고쳤다:
--   create_tournament(20260901000001) · create_session(20260901000001) ·
--   join_tournament(20260901000001) · join_as_guest(20260901000001)
-- 다섯째 `add_roster_member` 는 user_id 가 **리터럴 null** 이라 복사할
-- 프로필이 없다 — 급수와 같은 이유로 의도적으로 제외한다.
-- ════════════════════════════════════════════════════════════════════

-- ── 열거형 ──────────────────────────────────────────────────────────
create type player_gender as enum ('male', 'female');

comment on type player_gender is
  '선수 성별. 화면에서 ''남''·''여'' 로 그린다 — DB 값에 한글을 넣지 않는다(src/lib/gender.ts). 선언 순서는 목록에 그리는 순서일 뿐 서열이 아니다.';

-- ── 컬럼 둘 ─────────────────────────────────────────────────────────
alter table profiles           add column gender player_gender;
alter table tournament_members add column gender player_gender;

comment on column profiles.gender is
  '계정의 성별. 회원가입 때 고른 값(handle_new_user 가 메타데이터에서 읽는다)이고, 마이페이지(/me)에서 본인이 고친다. null 은 ''모른다'' — 소셜 로그인은 이 값을 주지 않으므로 null 이 정상이다.';

comment on column tournament_members.gender is
  '이 명단에서의 성별 스냅샷. grade 와 같은 규율로 명단에 들어올 때 profiles 에서 복사한다(게스트는 입력값). 프로필을 나중에 바꿔도 지난 명단은 안 바뀌고, 그래서 운영진이 명단에서 직접 채울 수 있어야 한다(set_member_gender). null 은 ''모른다'' — 그 사람은 종목 편성에서 빠진다.';

-- ── 문자열 → 성별 (모르는 값은 null) ────────────────────────────────
--
-- `parse_player_grade` 와 **같은 규칙 · 같은 이유**다. 성별이 들어오는
-- 입구가 넷인데(가입 메타데이터 · 게스트 등록 인자 · 명단 수정 RPC ·
-- 마이페이지) 앞의 셋은 **우리가 통제하지 못하는 문자열**이다. 메타데이터는
-- 클라이언트가 아무 값이나 넣을 수 있고, 게스트 인자는 비로그인 anon 이 부른다.
--
-- 인자를 player_gender 가 아니라 text 로 받고 여기서 푸는 것이 핵심이다.
-- enum 으로 받으면 이상한 값이 **함수 안으로 들어오기도 전에** PostgREST
-- 경계에서 22P02 로 터진다 — 게스트 경로는 "예외를 던지지 않고 봉투를
-- 돌려준다" 가 규율인데(20260828000001), 그 규율이 함수 밖에서 깨진다.
create or replace function parse_player_gender(p_raw text)
returns player_gender
language plpgsql immutable set search_path = public, pg_temp as $fn$
declare
  v_clean text := btrim(coalesce(p_raw, ''));
begin
  if v_clean = '' then
    return null;
  end if;
  begin
    return v_clean::player_gender;
  exception when invalid_text_representation then
    -- 모르는 값은 '모른다' 로 본다. 여기서 던지면 가입 트리거가 터져
    -- 계정 생성 전체가 롤백된다 — 성별 오타로 가입이 막히면 안 된다.
    return null;
  end;
end;
$fn$;

comment on function parse_player_gender(text) is
  '문자열을 성별로. 모르는 값·빈 값은 null. 성별이 들어오는 입구들이 함께 쓰는 유일한 파서다(parse_player_grade 와 같은 규율).';

-- 내부 전용 — parse_player_grade · gen_invite_code · log_audit 과 같은 취급.
revoke all on function parse_player_gender(text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 1/6 — handle_new_user (가입 시 profiles 생성)
--
-- 원본: 20260901000001_player_grade.sql:130-155 (최신본)
-- 바뀐 것: gender 한 컬럼뿐. 이름 fallback 사슬 · avatar_url 사슬 ·
--          grade · on conflict do nothing · security definer · search_path
--          전부 원본 그대로다.
--
-- 트리거(on_auth_user_created)는 다시 만들지 않는다 — 본문만 바꾸면
-- 기존 트리거가 새 본문을 그대로 탄다.
--
-- ⚠ 급수와 마찬가지로 성별에는 **fallback 사슬이 없다.** 카카오도 구글도
--   우리가 쓰는 뜻의 성별을 주지 않으므로 우리 가입 폼이 넣는 'gender'
--   하나뿐이다. 소셜로 들어온 사람은 null 로 남는 것이 정상이고,
--   마이페이지에서 나중에 채운다.
-- ════════════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into profiles (id, name, email, avatar_url, grade, gender)
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
    -- 우리 가입 폼만 넣는 키들이다. 없거나 모르는 값이면 null
    parse_player_grade(new.raw_user_meta_data->>'grade'),
    parse_player_gender(new.raw_user_meta_data->>'gender')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 2/6 — create_tournament (대회 만들기, 주최자 + 동아리 운영진 심기)
--
-- 원본: 20260901000001_player_grade.sql:172-277 (최신본)
-- 바뀐 것: 두 INSERT 에 gender 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
--          검증 순서 · 조커조 검사 · is_club_admin 검사 · 초대 코드 10회
--          재시도 · groups 생성 · on conflict do nothing · log_audit 전부
--          원본 그대로.
--
-- 운영진 심기 쪽이 profiles 를 직접 보는 이유도 급수와 같다 —
-- club_members 에는 성별이 없고, **성별의 정본은 profiles 하나**다.
-- user_id 가 null 인 미가입 회원이면 서브쿼리가 0행이라 자연히 null 이 된다.
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
  if p_club_id is not null and not is_club_admin(p_club_id) then
    raise exception '동아리 운영진만 소속 대회를 만들 수 있습니다' using errcode = '42501';
  end if;

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

  insert into tournament_members
    (tournament_id, user_id, role, display_name, avatar_url, grade, gender)
  values (
    v_tournament.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    -- 스냅샷. 지금 프로필에 값이 없으면 null 로 남는다(둘 다 선택 입력이라 흔하다)
    v_profile.grade,
    v_profile.gender
  );

  insert into groups (tournament_id, name, sort_order, is_joker)
  select v_tournament.id, i || '조', i, (i <= p_joker_group_count)
  from generate_series(1, p_group_count) as i;

  if p_club_id is not null then
    for v_club_admin in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.role in ('owner', 'admin')
        and cm.user_id is not null
        and cm.user_id <> v_uid
    loop
      insert into tournament_members
        (tournament_id, user_id, role, display_name, avatar_url, grade, gender)
      values (
        v_tournament.id, v_club_admin.user_id, 'admin',
        unique_display_name(v_tournament.id, v_club_admin.display_name),
        v_club_admin.avatar_url,
        -- club_members 에는 급수도 성별도 없다. 정본인 profiles 를 직접 본다.
        (select p.grade  from profiles p where p.id = v_club_admin.user_id),
        (select p.gender from profiles p where p.id = v_club_admin.user_id)
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_tournament.id, 'tournament.create', 'tournament', v_tournament.id,
                    null, to_jsonb(v_tournament));

  return v_tournament;
end;
$fn$;

revoke all on function create_tournament(text, text, int, int, text, jsonb, uuid) from public, anon;
grant execute on function create_tournament(text, text, int, int, text, jsonb, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3/6 — create_session (모임 열기, 주최자 + 동아리 회원 전원 심기)
--
-- 원본: 20260901000001_player_grade.sql:294-397 (최신본)
-- 바뀐 것: 두 INSERT 에 gender 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
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
  insert into tournament_members
    (tournament_id, user_id, role, display_name, avatar_url, rsvp, grade, gender)
  values (
    v_session.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    'going',
    v_profile.grade,
    v_profile.gender
  );

  insert into courts (tournament_id, name, sort_order)
  select v_session.id, i || '번 코트', i
  from generate_series(1, p_court_count) as i;

  -- order by 를 박아 두는 이유 · `is distinct from` 인 이유는 원본 주석 참고
  -- (unique_display_name 접미사 순서 · 미가입 회원(NULL)이 걸러지는 함정).
  if p_club_id is not null then
    for v_club_member in
      select cm.* from club_members cm
      where cm.club_id = p_club_id
        and cm.user_id is distinct from v_uid
      order by cm.joined_at, cm.id
    loop
      insert into tournament_members
        (tournament_id, user_id, role, display_name, avatar_url, rsvp, grade, gender)
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
        -- 미가입 회원(user_id null)은 두 서브쿼리 다 0행이라 자연히 null 이다
        (select p.grade  from profiles p where p.id = v_club_member.user_id),
        (select p.gender from profiles p where p.id = v_club_member.user_id)
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
-- 4/6 — join_tournament (초대 코드로 들어오기)
--
-- 원본: 20260901000001_player_grade.sql:413-480 (최신본)
-- 바뀐 것: INSERT 에 gender 한 컬럼. 시그니처 불변이라 drop 하지 않는다.
--
-- ⚠ 이 함수가 예외 대신 jsonb 봉투를 돌려주는 이유(브루트포스 실패 기록이
--   같은 트랜잭션에서 롤백되는 것을 막는다)는 원본 머리에 있다. 성별을
--   더하면서 그 구조를 건드리지 않았다 — 어떤 실패 경로에서도 raise 로
--   바꾸지 마라.
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

  insert into tournament_members
    (tournament_id, user_id, role, display_name, avatar_url, grade, gender)
  values (
    v_tournament.id, v_uid, 'member',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    v_profile.grade,
    v_profile.gender
  )
  on conflict (tournament_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'tournament', to_jsonb(v_tournament));
end;
$fn$;

revoke all on function join_tournament(text, text) from public, anon;
grant execute on function join_tournament(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 5/6 — join_as_guest (게스트 등록, anon) — **시그니처가 또 바뀐다**
--
-- 원본: 20260901000001_player_grade.sql:525-634 (최신본. 4인자 판이다)
-- 바뀐 것: 인자 p_gender 한 개(맨 뒤, default null) + INSERT 의 gender 한
--          컬럼. 시각 창 case 식 · 오류 코드 · 이름 정리 정규식 · 게스트
--          상한 60 · advisory lock · log_audit · 반환 봉투 전부 원본 그대로다.
--
-- ── ⚠ 왜 drop 이 필요한가 ───────────────────────────────────────────
--
-- `create or replace` 로는 인자를 못 늘린다. 새로 만들면 이름이 같은 함수가
-- **둘** 생기고, PostgREST 는 함수를 **인자 이름 집합**으로 찾으므로 4인자
-- 호출이 어느 쪽인지 몰라 `function is not unique` 로 떨어진다 — 그 순간
-- 게스트 등록이 통째로 막힌다. 20260824000003 · 20260826000001 ·
-- 20260827000001 · 20260901000001 이 전부 같은 이유로 같은 일을 했다.
--
-- 지우는 것은 **직전 4인자 판 하나뿐**이다. 3인자 판은 20260901000001 이
-- 이미 지웠고, 없는 함수에 대한 drop if exists 는 조용히 통과하지만 여기에
-- 남겨 두면 "옛 판이 아직 있나" 를 매번 다시 묻게 된다.
--
-- ── 옛 호출이 안 깨지는 이유 ────────────────────────────────────────
--
-- 새 인자가 **맨 뒤 default null** 이라 `{p_code, p_session_id, p_name}`
-- 3인자도, `{…, p_grade}` 4인자도 그대로 이 함수 하나에 매칭된다. 성별을
-- 안 보내면 gender 가 null 로 들어가고 나머지 동작은 글자 그대로 같다.
-- `db:smoke:guest` 의 3인자 호출들과 `db:smoke:grade` 의 4인자 호출이 그
-- 회귀 관문이다.
--
-- ⚠ drop 하면 기존 grant 도 함께 사라진다. 아래 권한 절에서 **새
--   시그니처로** anon 에게 다시 여는 것이 필수다.
--
-- ⚠ 원본의 경고를 그대로 옮겨 온다 — 이 함수는 INSERT 만 한다.
--   UPDATE·DELETE 를 추가하지 마라. SECURITY DEFINER 안에서는
--   is_direct_api_call() 이 거짓이라 guard_member_update /
--   guard_member_delete 의 컬럼 보호가 이 함수 안의 모든 쓰기에 우회된다.
--
-- 🚫 반환 봉투에는 성별을 **싣지 않는다.** guest_sessions · guest_board 도
--    그대로 둔다 — 게스트 현황판은 노출 표면을 필드 단위로 못 박아 뒀고
--    (20260829000001 머리 주석), 필드를 하나 늘리는 것이 곧 비로그인 노출
--    표면을 넓히는 것이다. 성별은 급수보다 더 민감하다.
-- ════════════════════════════════════════════════════════════════════
drop function if exists join_as_guest(text, uuid, text, text);

create or replace function join_as_guest(
  p_code       text,
  p_session_id uuid,
  p_name       text,
  p_grade      text default null,
  -- 맨 뒤 · default null — 옛 3인자·4인자 호출이 그대로 이 함수를 찾는다.
  -- player_gender 가 아니라 text 인 이유는 parse_player_gender 주석 참고
  -- (게스트 경로는 예외 대신 봉투를 돌려주는 것이 규율이다).
  p_gender     text default null
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
  -- 20자를 넘는 원문이 통과할 수 있다.
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

  -- 오염 상한(설계 판단 3) — 카운트와 삽입 사이를 advisory lock 으로
  -- 직렬화하는 이유는 원본 주석 참고.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select count(*) into v_guest_count
    from tournament_members
   where tournament_id = p_session_id and is_guest;

  if v_guest_count >= 60 then
    return jsonb_build_object('ok', false, 'error', 'guest_limit',
                              'message', '오늘은 더 받을 수 없습니다. 모임장에게 말씀해 주세요');
  end if;

  insert into tournament_members
    (tournament_id, user_id, role, display_name, avatar_url, rsvp, is_guest, grade, gender)
  values
    (p_session_id, null, 'member',
     unique_display_name(p_session_id, v_clean_name),
     null, 'going', true,
     -- 게스트는 프로필이 없다. 스냅샷할 원본이 없으므로 입력값이 곧 값이다.
     -- 모르는 문자열은 null 로 떨어진다 — 오타로 등록을 막지 않는다.
     parse_player_grade(p_grade),
     parse_player_gender(p_gender))
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
-- 게스트로 명단에 들어간다.
-- ════════════════════════════════════════════════════════════════════
revoke all on function join_as_guest(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function join_as_guest(text, uuid, text, text, text) to anon;

-- ════════════════════════════════════════════════════════════════════
-- 6/6 — 명단에서 남의 급수·성별 고치기
--
-- ── 왜 RPC 인가 (RLS 로 이미 열려 있는데) ───────────────────────────
--
-- `tm_update_admin`(20260818000002)이 관리자에게 tournament_members 의
-- UPDATE 를 이미 열어 두고 있다. 그러니 PATCH 한 번으로도 되긴 된다.
-- 그런데 그 길에는 두 가지가 없다.
--
--   1. **감사 기록.** 남의 값을 바꾼 것은 흔적이 남아야 한다 —
--      set_display_name(20260819000007)이 이미 그 규율을 세워 뒀다.
--      급수·성별은 편성의 근거라서 "왜 저 사람이 여복에서 빠졌지" 를
--      나중에 되짚을 수 있어야 한다.
--   2. **본인 경로.** RLS 는 관리자만 연다. 그런데 마이페이지에서 자기
--      프로필을 고쳐도 **이미 들어간 명단은 안 바뀐다**(스냅샷이니까).
--      본인이 오늘 모임의 자기 행을 못 고치면, 성별 하나 채우려고 총무를
--      불러야 한다. set_display_name 과 같은 규칙(본인 또는 관리자)이 맞다.
--
-- ── 왜 함수가 둘인가 ────────────────────────────────────────────────
--
-- 하나로 합치면 "안 바꾼다" 와 "비운다(모른다로 되돌린다)" 를 구별할 수
-- 없다. 인자 하나로 둘을 표현하려면 sentinel 문자열이 필요한데, 그건
-- 값 목록에 없는 값을 규약으로 끼워 넣는 짓이다. 두 함수로 나누면 각
-- 인자의 null 이 언제나 "모른다로 만들어라" 하나만 뜻한다.
--
-- 동시에 두 운영진이 각각 급수·성별을 고칠 때 서로의 값을 덮지 않는
-- 것도 덤이다.
--
-- ── 인자를 text 로 받는다 ───────────────────────────────────────────
--
-- parse_player_grade / parse_player_gender 와 짝을 맞춘다. enum 으로
-- 받으면 오타 하나가 PostgREST 경계에서 22P02 로 터져 화면이 번역할 수
-- 없는 오류를 뿜는다. 여기서는 '모른다' 로 떨어뜨리는 편이 낫다 —
-- 값을 지우는 정상 경로(null)와 같은 자리로 간다.
--
-- ── 🔴 self 판정에 coalesce 를 씌운다 ───────────────────────────────
--
-- `v_member.user_id = auth.uid()` 는 **user_id 가 null 이면 NULL** 이다.
-- 그대로 `if not (v_is_self or is_admin)` 에 넣으면 관리자가 아닐 때
-- `NULL or false` = NULL 이고 `not NULL` = NULL 이라 **if 문이 안 타서
-- 예외가 안 난다.** 즉 계정 없는 행(게스트·손으로 올린 회원)은 아무나
-- 고칠 수 있게 된다. coalesce(..., false) 가 그 구멍을 막는다.
-- (같은 모양이 set_display_name 에도 있다 — 아래 7/6 에서 함께 막는다.)
-- ════════════════════════════════════════════════════════════════════
create or replace function set_member_grade(p_member_id uuid, p_grade text default null)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member  tournament_members;
  v_before  jsonb;
  v_next    player_grade := parse_player_grade(p_grade);
  v_is_self boolean;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  -- coalesce 가 없으면 user_id 가 null 인 행을 아무나 고친다 (머리 주석)
  v_is_self := coalesce(v_member.user_id = auth.uid(), false);

  if not (v_is_self or is_tournament_admin(v_member.tournament_id)) then
    raise exception '본인 또는 운영진만 급수를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  -- 같은 값이면 아무것도 안 한다. 감사 기록에 "안 바뀐 변경" 을 남기면
  -- 나중에 로그를 읽는 사람이 진짜 변경을 못 찾는다 (set_display_name 과 같다).
  if v_next is not distinct from v_member.grade then
    return v_member;
  end if;

  v_before := to_jsonb(v_member);
  update tournament_members
     set grade = v_next, updated_at = now()
   where id = p_member_id
  returning * into v_member;

  -- profiles 는 건드리지 않는다. 명단의 급수는 **그 명단에서의 값**이고
  -- (display_name 과 같은 규율), 계정의 급수는 마이페이지가 고친다.
  -- 여기서 profiles 까지 고치면 지난 대회 명단의 근거가 소급해 바뀐다.

  -- 남의 값을 바꾼 것은 흔적이 남아야 한다
  if not v_is_self then
    perform log_audit(v_member.tournament_id, 'member.set_grade', 'tournament_member',
                      p_member_id, v_before, to_jsonb(v_member));
  end if;

  return v_member;
end;
$fn$;

comment on function set_member_grade(uuid, text) is
  '명단 행의 급수를 바꾼다(본인 또는 운영진). null·빈 값·모르는 값은 ''모른다''(null)로 떨어진다 — 잘못 누른 것을 되돌리는 경로가 그것이다. profiles 는 건드리지 않는다.';

revoke all on function set_member_grade(uuid, text) from public, anon;
grant execute on function set_member_grade(uuid, text) to authenticated;

create or replace function set_member_gender(p_member_id uuid, p_gender text default null)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member  tournament_members;
  v_before  jsonb;
  v_next    player_gender := parse_player_gender(p_gender);
  v_is_self boolean;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  v_is_self := coalesce(v_member.user_id = auth.uid(), false);

  if not (v_is_self or is_tournament_admin(v_member.tournament_id)) then
    raise exception '본인 또는 운영진만 성별을 바꿀 수 있습니다' using errcode = '42501';
  end if;

  if v_next is not distinct from v_member.gender then
    return v_member;
  end if;

  v_before := to_jsonb(v_member);
  update tournament_members
     set gender = v_next, updated_at = now()
   where id = p_member_id
  returning * into v_member;

  if not v_is_self then
    perform log_audit(v_member.tournament_id, 'member.set_gender', 'tournament_member',
                      p_member_id, v_before, to_jsonb(v_member));
  end if;

  return v_member;
end;
$fn$;

comment on function set_member_gender(uuid, text) is
  '명단 행의 성별을 바꾼다(본인 또는 운영진). null·빈 값·모르는 값은 ''모른다''(null). 성별이 비면 그 사람은 종목(남복·여복·혼복) 편성에서 빠지므로, 총무가 명단에서 바로 채울 수 있어야 한다.';

revoke all on function set_member_gender(uuid, text) from public, anon;
grant execute on function set_member_gender(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 7/6 — 🔴 set_display_name 의 같은 구멍을 막는다 (범위 밖이지만 같은 결함)
--
-- 위 6/6 의 self 판정을 쓰면서 본보기(set_display_name, 20260819000007)에
-- **같은 NULL 삼치 논리 결함**이 있는 것을 발견했다.
--
--   v_is_self := v_member.user_id = auth.uid();   -- user_id 가 null 이면 NULL
--   if not (v_is_self or is_tournament_admin(...)) then raise ...
--
-- 관리자가 아닌 사람이 **계정 없는 행**(게스트 · add_roster_member 로 올린
-- 회원)을 상대로 부르면 `NULL or false` = NULL → `not NULL` = NULL 이라
-- if 가 안 타고 **예외 없이 이름이 바뀐다.** 그 대회 참가자가 아니어도
-- 된다 — is_tournament_admin 이 false 를 돌려줄 뿐이기 때문이다.
--
-- 고치는 것은 한 줄(coalesce)뿐이고, 나머지 본문은 원본
-- 20260819000007_display_name_scope.sql 그대로다. 이 변경으로 막히는
-- 정상 경로는 없다 — 본인 행은 user_id 가 auth.uid() 라 true 이고,
-- 게스트는 애초에 anon 이라 이 함수에 grant 가 없다.
-- ════════════════════════════════════════════════════════════════════
create or replace function set_display_name(p_member_id uuid, p_name text)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_before jsonb;
  v_clean  text;
  v_is_self boolean;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  -- 🔴 여기가 바뀐 유일한 줄이다. 근거는 위 머리 주석.
  v_is_self := coalesce(v_member.user_id = auth.uid(), false);

  if not (v_is_self or is_tournament_admin(v_member.tournament_id)) then
    raise exception '본인 또는 관리자만 이름을 바꿀 수 있습니다' using errcode = '42501';
  end if;

  v_clean := btrim(coalesce(p_name, ''));
  if length(v_clean) < 1 or length(v_clean) > 20 then
    raise exception '이름은 1~20자로 입력해 주세요' using errcode = '22023';
  end if;

  -- 같은 대회에 같은 이름이 둘이면 대진표에서 누가 누군지 알 수 없다.
  -- 심판 지정도 이름으로 확인하므로 엉뚱한 사람이 채점하게 된다.
  if exists (
    select 1 from tournament_members
    where tournament_id = v_member.tournament_id
      and id <> p_member_id
      and lower(btrim(display_name)) = lower(v_clean)
  ) then
    raise exception '이 대회에 같은 이름이 이미 있습니다' using errcode = '23505';
  end if;

  if v_clean = v_member.display_name then
    return v_member;
  end if;

  v_before := to_jsonb(v_member);
  update tournament_members
     set display_name = v_clean, updated_at = now()
   where id = p_member_id
  returning * into v_member;

  -- profiles 는 건드리지 않는다. 이 대회에서만 바뀌어야 한다.

  -- 남의 이름을 바꾼 것은 흔적이 남아야 한다
  if not v_is_self then
    perform log_audit(v_member.tournament_id, 'member.rename', 'tournament_member',
                      p_member_id, v_before, to_jsonb(v_member));
  end if;

  return v_member;
end;
$fn$;

revoke all on function set_display_name(uuid, text) from public, anon;
grant execute on function set_display_name(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 열거형: player_gender ('male','female') — 화면 문구('남'·'여')는
--    src/lib/gender.ts 가 진다
--  - 컬럼 둘, **둘 다 nullable · default 없음**: profiles.gender ·
--    tournament_members.gender (+ comment on column 으로 "null 은 모른다"
--    와 "그 사람은 종목 편성에서 빠진다" 를 명시)
--  - 함수(내부 전용, 아무에게도 grant 안 함): parse_player_gender(text)
--  - handle_new_user 본문 교체(트리거 재생성 없음) — 가입 메타데이터의
--    'gender' 를 profiles.gender 로
--  - 성별을 스냅샷하는 RPC 넷: create_tournament · create_session ·
--    join_tournament(시그니처 불변) · join_as_guest(시그니처 변경)
--  - join_as_guest 만 시그니처 변경 — p_gender text default null 을 맨 뒤에
--    추가. 옛 4인자 함수는 drop(function is not unique 방지), anon grant
--    재설정. 옛 3인자·4인자 호출은 그대로 동작한다
--  - **새 RPC 둘**: set_member_grade(uuid, text) · set_member_gender(uuid, text)
--    — 본인 또는 대회 운영진. 남의 값을 바꾸면 감사로그(member.set_grade ·
--    member.set_gender). profiles 는 안 건드린다
--  - set_display_name 본문 교체 — self 판정의 NULL 삼치 구멍(coalesce)
--
-- 이 마이그레이션이 **안 건드린 것**
--
--  - add_roster_member — 계정 없는 사람만 만드는 경로다(user_id 리터럴
--    null). 복사할 프로필이 없으므로 gender 는 항상 null 이고, 그것이 맞다.
--    비어 있는 그 값은 이제 명단에서 set_member_gender 로 채운다
--  - link_member_account — INSERT 가 아니라 두 기존 행을 합치는 경로다
--  - join_club / club_members — 성별의 정본은 profiles 하나다. 동아리마다
--    다른 성별을 갖는다는 개념이 없어 컬럼을 만들지 않았다
--  - guest_sessions · guest_board · join_as_guest 반환 봉투 — 성별을 넣지
--    않았다. 비로그인 노출 표면은 20260829000001 머리의 표가 정본이다
--  - RLS 정책 0개 변경. 트리거 0개 재생성. guard_* 가드 전부 무변경 —
--    guard_member_update 는 role · user_id · tournament_id · is_guest 만
--    잠근다. grade·gender 를 거기에 더하지 않았다: 잠그면 관리자의
--    tm_update_admin 경로가 막히는 게 아니라 **RPC 밖의 모든 경로**가
--    막히는데, 그 경로를 막을 이유가 없다(값이 틀려도 편성이 어긋날 뿐
--    권한·집계가 뒤집히지 않는다)
--  - match_overview 뷰 무변경 — 경기 화면의 종목 표시는 이번 범위 밖이다
-- ════════════════════════════════════════════════════════════════════
