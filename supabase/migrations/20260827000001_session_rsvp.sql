-- ════════════════════════════════════════════════════════════════════
-- 모임 참가 신청 (마일스톤 2 · 단계 A)
--
-- 모임을 **미리** 만들어 두고, 동아리 회원이 참가/불참을 누르고, 당일
-- 시각이 되면 참가한 사람들이 그대로 그날의 명단이 된다.
--
--   화요일 오후   회원들이 [참가] 를 누른다     → 모임장은 코트를 몇 개 빌릴지 안다
--   화요일 20:00  화면이 코트 현황으로 바뀐다   → 참가한 사람이 경기 짜기 목록
--
-- ── 설계 판단 여섯 가지 ─────────────────────────────────────────────
--
--  1. "당일 자동 추가" 에 크론이 필요 없다.
--     미리 심어두고 **상태만 바꾼다.** 모임을 만들 때 동아리 회원 전원을
--     tournament_members 에 넣고 rsvp='invited' 로 둔다. 참가를 누르면
--     'going' 이 된다. 시각이 되면 화면이 바뀔 뿐 데이터는 이미 준비돼
--     있다 — '추가' 라는 동작 자체가 없다.
--     그래서 pg_cron 도, 배치도, 서버 타이머도 두지 않는다. 시간에 의존하는
--     상태 전환은 서버 시계와 사용자 시계가 어긋나는 순간 디버깅이
--     불가능해진다. 서버는 '시작했나' 를 판단하지 않는다 — starts_at 을
--     timestamptz 로 저장만 하고, 판단은 화면이 사용자 시간대로 한다.
--
--  2. 미리 심는 것은 선택이 아니라 필수다.
--
--         tournaments_select:  is_tournament_member(id)
--
--     **심어두지 않으면 동아리 회원에게 모임 자체가 안 보인다.** 참가
--     버튼이 있는 화면에 도달할 수가 없다. scripts/smoke-club.ts 의
--     '추가' 절이 이 동작(동아리 소속만으로는 산하 대회가 안 보인다)을
--     이미 검사로 굳혀 두었다.
--     그리고 이 방식이 확정 결정과 일관된다 — "동아리 운영진이 산하
--     대회를 만지는 근거는 생성 시점에 심어진 멤버 행이다". 회원도 같은
--     길로 간다. **권한 헬퍼(is_tournament_member/admin/owner)를 한 줄도
--     안 건드린다.**
--
--  3. 전원을 심어도 기록이 거짓말하지 않는다.
--     rsvp 로 가른다. 경기·기록·순위·대기열은 전부 'going' 만 센다.
--     모임 명단에 16명이 있어도 그날 참가는 12명이고, 화면과 기록은
--     12명을 말한다.
--     **대회(kind='tournament')는 이 컬럼을 보지 않는다.** 대회 명단은
--     운영진이 짜는 것이지 참가 신청으로 만들어지지 않는다.
--
--  4. 기존 행 backfill 은 kind 를 가리지 않고 전부 'going' 으로 둔다.
--     지금 tournament_members 에 있는 행은 전부 (ㄱ) 초대 코드를 치고
--     스스로 들어왔거나 (ㄴ) 운영진이 add_roster_member 로 명단에 올린
--     사람이다. 어느 쪽도 "초대만 받고 답을 안 한 사람" 이 아니다.
--     대회 쪽은 이 컬럼을 안 쓰니 default('invited') 로 놔둬도 동작에는
--     차이가 없지만, 그러면 끝난 대회의 지난 명단이 영원히 "미정" 으로
--     보이게 된다. 나중에 누가 `count(*) where rsvp='invited'` 를 세는
--     순간 유령 미응답자가 잡힌다. 값이 의미를 배신하지 않게 하는 쪽이
--     싸다 — 한 번의 update 로 끝나고, 되돌릴 일도 없다.
--     'invited' 는 **이 마이그레이션 이후 create_session 이 새로 심는
--     행에만** 붙는 값이다.
--
--  5. rsvp 를 guard_member_update 로 잠그지 않는다.
--     tm_update_admin 정책 때문에 모임장은 남의 rsvp 를 직접 PATCH 할 수
--     있다. 이걸 트리거로 막을 수도 있지만 막지 않는다 — rsvp 는 권한이
--     아니라 표시다. 최악의 경우가 "참가 표시가 틀린다" 이고, 경기 편성·
--     점수·순위 어디에도 권한이 걸리지 않는다. 오히려 "전화로 온다고
--     한 사람" 을 모임장이 대신 체크하는 건 정상 경로다.
--     (role·user_id·tournament_id 잠금은 그대로다. 20260818000007 M-1 이
--     막은 구멍은 rsvp 와 무관하다.)
--
--  6. 참가를 게이트로 쓰지 않는다.
--     안 누르고 온 사람도 경기에 넣을 수 있다. 그래서 create_session_match ·
--     can_run_match · 대기열 어디에도 rsvp 검사를 넣지 않았다. 누르지
--     않으면 못 치게 하는 앱은 동아리에서 미움받는다.
--
--  7. 모임 시각은 생성의 일부다 — create_session 의 인자로 받는다.
--     "미리 만들어 두고 회원이 참가를 누른다" 가 이 마일스톤의 요점인데,
--     시각이 생성의 일부가 아니면 화면이 **만들고 → PATCH 하는 2단계**가
--     된다. 그 사이 PATCH 가 실패하면 시각 없는 반쪽 모임이 남고, 그건
--     화면에서 '즉석 개설(starts_at NULL)' 과 구별되지 않는다. 사용자에겐
--     되돌릴 방법도 없다. 시그니처 교체 비용(drop 후 재생성)은 그 값으로
--     감수한다 — 20260824000003 이 create_tournament 로 이미 한 번 했고,
--     지금 하는 게 나중에 하는 것보다 싸다.
--
-- ── 이 마이그레이션이 일부러 하지 않은 것 ───────────────────────────
--
--  - **반복 일정 · 정원 마감 · 참가 마감 시각** — 계획서의 「하지 않는 것」.
--    반복 일정은 아무도 안 오는 유령 모임을 매주 만들어내고, 정원을 넘는
--    건 더 기다릴 일이지 못 오게 할 일이 아니며, 늦게 누르는 게 정상이다.
--  - **starts_at 검증** — 과거 시각도 그대로 받는다. 어제 친 모임을 나중에
--    기록하는 게 정상 경로이고(record_manual_match 로 지난 경기를 남기는
--    길이 이미 있다), "미래여야 한다" 를 서버가 우기면 시계가 어긋난
--    기기에서 정상 개설이 막힌다. 판단 1번(서버는 시각을 판단하지 않는다)
--    과 같은 이유다.
--  - **starts_at 을 guard_tournament_update 로 잠그기** — 만든 뒤 시각을
--    고치는 길이 열려 있어야 한다. tournaments_update_admin 정책으로
--    모임장이 직접 PATCH 한다.
--    ⚠ 직접 PATCH 는 RLS 로 0행이 걸러져도 204 를 준다 — 화면 쪽에서
--    반환 행으로 성패를 판정할 것(이어서시작.md 7번).
--  - **rsvp 변경 감사로그** — 회원 30명 × 매주면 audit_logs 가 참가
--    체크로 뒤덮인다. 권한이 아니라 표시이고, 본인이 자기 행만 바꾼다.
--  - **create_tournament 확장** — 대회 명단은 운영진이 짠다. 참가 신청은
--    모임의 개념이다.
--  - **tournament_members 를 realtime publication 에 추가** — 참가 인원이
--    실시간으로 갱신되면 좋겠지만 그건 화면(단계 D)의 판단이고, 여기서
--    켜면 모든 대회의 명단 변경이 브로드캐스트되기 시작한다.
--
-- ⚠ 알려진 귀결: 명단은 **생성 시점 스냅샷**이다. 모임을 만든 뒤에 동아리에
--   들어온 사람에게는 그 모임이 보이지 않는다. 마일스톤 1b 의 "나중에
--   운영진이 된 사람에게 그 전 대회가 안 보인다" 와 같은 모양이고, 같은
--   이유(권한 헬퍼를 안 건드린다)로 의도된 동작이다. 재동기화는 다음 범위.
-- ════════════════════════════════════════════════════════════════════

-- ── 모임 시각 ───────────────────────────────────────────────────────
-- nullable 인 이유: 대회는 안 쓰고, 모임도 "지금 모여서 치는 날" 로 즉석
-- 개설하는 길을 막지 않는다. NULL 이면 곧바로 진행 화면이다.
alter table tournaments
  add column if not exists starts_at timestamptz;

comment on column tournaments.starts_at is
  '모임 시각. NULL 이면 즉석 모임 — 곧바로 진행 화면. 대회는 쓰지 않는다. '
  '''시작했나'' 판단은 서버가 하지 않는다(화면이 사용자 시간대로 한다).';

-- ── 참가 여부 ───────────────────────────────────────────────────────
do $$ begin
  create type rsvp_status as enum ('invited', 'going', 'declined');
exception when duplicate_object then null;
end $$;

-- backfill 을 default 로 태운다. 위 판단 4번을 재실행 안전하게 쓰는
-- 방법이다:
--   1) `add column if not exists ... default 'going'` 이 **처음 적용될 때만**
--      기존 행 전부를 'going' 으로 채운다. 두 번째 적용은 통째로 no-op 이라
--      그 사이에 생긴 'invited' 행을 건드리지 않는다.
--   2) 그 다음 default 를 'invited' 로 내려, 앞으로 심기는 행은 전부
--      '초대만 된 상태' 로 시작한다. set default 는 몇 번을 돌려도 같다.
-- 별도 update 문으로 backfill 하면 재실행 때 새 'invited' 행까지 'going'
-- 으로 뒤집는다 — 그래서 이 순서다.
alter table tournament_members
  add column if not exists rsvp rsvp_status not null default 'going';

alter table tournament_members
  alter column rsvp set default 'invited';

comment on column tournament_members.rsvp is
  'invited = 심어졌지만 아직 안 누름 / going = 참가 / declined = 불참. '
  '모임(kind=''session'')만 쓴다. 대회는 이 컬럼을 보지 않는다. '
  '경기·기록·순위·대기열은 전부 ''going'' 만 센다.';

-- 인덱스는 추가하지 않는다. 참가 인원 집계는 항상 한 모임 안에서 세므로
-- tm_tournament_idx(tournament_id) 로 충분하다. 회원 30명 × 매주여도
-- 1년에 1,560행이다.

-- ════════════════════════════════════════════════════════════════════
-- 모임 열기 — 동아리 회원까지 전부 심는다
--
-- ⚠ 이 함수는 여러 번 재정의됐다. 여기 있는 본문은
--   **20260826000001_club_layer.sql 의 정의(p_club_id 판)** 를 기준으로
--   고친 것이다. 20260825000001_session_mode.sql 의 옛 판(p_club_id 없음,
--   동아리 심기 없음)에서 복사하면 검사가 통째로 사라진다 — 이 저장소가
--   start_match 로 이미 한 번 겪은 사고다.
--
-- 바뀐 것은 세 곳이다:
--   (가) p_starts_at 인자 — **맨 뒤에** 붙여 default null 로 둔다. 기존
--        3인자·4인자 호출(p_starts_at 을 안 보내는 프론트)이 그대로 산다
--   (나) 만든 사람 행에 rsvp='going' — 만든 사람이 안 갈 리 없다
--   (다) 심는 대상을 '동아리 운영진' 에서 '동아리 회원 전원' 으로
--
--   | 대상          | role   | rsvp      |
--   |---------------|--------|-----------|
--   | 만든 사람     | owner  | going     |
--   | 동아리 운영진 | admin  | invited   |
--   | 동아리 회원   | member | invited   |
--
-- 미가입 회원(user_id is null)도 심는다 — 계정이 없어 참가를 못 누를 뿐,
-- 모임장이 대신 경기에 넣을 수 있어야 한다. club_members 의 체크 제약
-- (role='member' or user_id is not null) 때문에 미가입 회원은 항상
-- role='member' 다. 즉 계정 없는 사람이 admin 으로 심어지는 경로는 없다.
-- ════════════════════════════════════════════════════════════════════
-- 인자가 바뀌므로 예전 것을 먼저 지운다. create or replace 로는 시그니처를
-- 못 바꾸고, 남겨 두면 이름이 같은 함수가 둘이 되어 PostgREST 가 어느 쪽을
-- 부를지 모른다 ("function is not unique") — 그 순간 모임 생성이 통째로
-- 막힌다. 20260824000003(create_tournament) · 20260826000001 이 같은 이유로
-- 같은 일을 했다.
--
-- ⚠ drop 하면 기존 권한(grant)도 함께 사라진다. 아래 revoke/grant 를
--   **새 시그니처로** 다시 쓰는 것이 필수다.
drop function if exists create_session(text, text, int, uuid);

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
  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, rsvp)
  values (
    v_session.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url,
    'going'
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
      insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url, rsvp)
      values (
        v_session.id,
        v_club_member.user_id,
        case when v_club_member.role in ('owner', 'admin')
             then 'admin'::member_role
             else 'member'::member_role
        end,
        unique_display_name(v_session.id, v_club_member.display_name),
        v_club_member.avatar_url,
        'invited'
      )
      on conflict (tournament_id, user_id) do nothing;
    end loop;
  end if;

  perform log_audit(v_session.id, 'session.create', 'tournament', v_session.id,
                    null, to_jsonb(v_session));

  return v_session;
end;
$fn$;

-- drop 으로 날아간 권한을 새 시그니처로 다시 세운다.
revoke all on function create_session(text, text, int, uuid, timestamptz) from public, anon;
grant execute on function create_session(text, text, int, uuid, timestamptz) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 참가/불참 누르기
--
-- - **본인 행만** 바꾼다. 남의 참가 여부를 대신 정하는 인자가 아예 없다.
-- - 모임(kind='session')에서만 허용. 대회에서 부르면 거절한다.
-- - 이미 시작한 모임에도 허용한다 — 늦게 도착해서 누르는 게 정상 경로다.
--   그래서 status 도 starts_at 도 보지 않는다.
--
-- SECURITY DEFINER 인 이유: tournament_members 의 UPDATE 정책은
-- tm_update_admin 하나뿐이라(관리자만) 회원이 자기 행을 직접 고칠 길이
-- 없다. set_my_group(20260818000003) 이 같은 이유로 definer 다.
-- definer 로 돌면 guard_member_update 의 is_direct_api_call() 이 거짓이
-- 되어 통과하는데, 이 함수는 rsvp 한 컬럼만 건드리므로 role 잠금이
-- 우회되지 않는다.
--
-- 멤버 행을 먼저 찾고 kind 를 나중에 보는 순서에는 이유가 있다. 반대로
-- 하면 남의 모임 UUID 를 넣어 봤을 때 '모임을 찾을 수 없습니다' 와
-- '참가자가 아닙니다' 가 갈려 존재 여부가 새어 나간다.
-- ════════════════════════════════════════════════════════════════════
create or replace function set_my_rsvp(p_tournament_id uuid, p_rsvp rsvp_status)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_kind   tournament_kind;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if p_rsvp is null then
    raise exception '참가 여부를 선택해 주세요' using errcode = '22023';
  end if;

  select * into v_member
  from tournament_members
  where tournament_id = p_tournament_id and user_id = auth.uid();

  if not found then
    raise exception '이 모임의 참가자가 아닙니다' using errcode = '42501';
  end if;

  select kind into v_kind from tournaments where id = p_tournament_id;
  if v_kind <> 'session' then
    raise exception '대회에는 참가 신청이 없습니다' using errcode = '22023';
  end if;

  if v_member.rsvp = p_rsvp then
    return v_member;  -- 멱등. 같은 버튼을 두 번 눌러도 조용히 통과한다.
  end if;

  update tournament_members
  set rsvp = p_rsvp
  where id = v_member.id
  returning * into v_member;

  return v_member;
end;
$fn$;

revoke all on function set_my_rsvp(uuid, rsvp_status) from public, anon;
grant execute on function set_my_rsvp(uuid, rsvp_status) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--
--  - 열거형: rsvp_status ('invited','going','declined')
--  - tournaments.starts_at timestamptz (nullable, 대회는 안 씀).
--    guard_tournament_update 에 잠금을 걸지 않았다 — 모임장이 시각을
--    고칠 수 있어야 한다
--  - tournament_members.rsvp rsvp_status not null default 'invited'.
--    기존 행은 전부 'going' 으로 backfill (default 'going' 으로 추가한 뒤
--    default 를 'invited' 로 내리는 순서 = 재실행 안전한 backfill)
--  - create_session: 20260826000001 판을 기준으로 **옛 4인자 시그니처를
--    drop 한 뒤 5인자로 재생성**. 새 인자는 맨 뒤 p_starts_at timestamptz
--    default null (검증 없음 — 과거 시각도 허용). 만든 사람 rsvp='going',
--    동아리 **회원 전원**을 운영진은 admin / 회원은 member 로
--    rsvp='invited' 심기. 미가입 회원(user_id null)도 심고, 이름 충돌은
--    unique_display_name. revoke/grant 를 새 시그니처로 다시 세움
--  - RPC: set_my_rsvp(uuid, rsvp_status) — 본인 행만, 모임에서만,
--    시작 뒤에도 허용, 같은 값이면 멱등
--  - 안 건드린 것: 권한 헬퍼(is_tournament_member/admin/owner) ·
--    RLS 정책 · guard_member_update · create_tournament ·
--    create_session_match · can_run_match · match_overview 뷰 ·
--    realtime publication
-- ════════════════════════════════════════════════════════════════════
