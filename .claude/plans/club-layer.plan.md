# Plan: 동아리 계층 (마일스톤 1b) — 그릇만 만든다

**결정 사항**: 동아리는 **선택 계층** · 권한 축이 아니라 **명단의 원천** · 소속은 **생성 후 불변** · 삭제는 `set null`
**Complexity**: Medium~High (8~10h) — 새 테이블 2개 · 새 RLS 두 벌 · 기존 가드 확장
**후속**: 2단계 회원 명단 재사용 · 3단계 게스트 명단 · 4단계 게스트 화면(비로그인)

## Summary

지금 앱은 **대회·모임이 최상위**입니다. 명단이 그 하나에 묶여 있어 모임을 열 때마다
초대 코드를 새로 뿌리고 같은 사람들을 다시 모읍니다.

1b 는 **그릇만** 만듭니다 — 운영진이 동아리를 만들고, 이름을 정하고, 운영진을 지정하고,
동아리 밑에 대회·모임을 열 수 있게 하는 데까지입니다. 명단을 실제로 재사용하는 건
2단계이고, 여기서는 "동아리가 존재한다"와 "동아리 운영진이 산하 대회를 관리한다"만
성립시킵니다.

가장 중요한 건 **아무것도 안 깨지는 것**입니다. 동아리 없는 기존 대회·모임은
지나는 경로가 비트 단위로 같아야 합니다. 그래서 이 계획은 기존 권한 헬퍼 세 개를
**한 줄도 건드리지 않고**, 갈리는 지점을 생성 RPC 한 곳에 모읍니다 — 1단계에서
모임/대회를 가른 방식 그대로입니다.

## 지금 코드가 막고 있는 것 (전수 확인)

| 위치 | 지금 | 1b 에서 |
|---|---|---|
| `tournaments` | 소속 개념이 없다. 대회가 최상위다 | `club_id uuid null references clubs(id) on delete set null` |
| `20260818000002_rls.sql` `is_tournament_member/admin/owner` | 멤버 행만 본다 | **손대지 않는다.** 동아리는 여기 안 들어온다 |
| `tournaments_select` 정책 | `is_tournament_member(id)` | **그대로.** 동아리 운영진은 '심어진 멤버 행' 으로 보인다 |
| `20260818000007` `guard_tournament_update` | `owner_id`·`invite_code`·`status`·`config` 잠금 | 같은 함수에 `club_id` 를 **추가** (트리거는 그대로) |
| `20260818000007` `guard_member_update` | `role`·`user_id`·`tournament_id` 잠금 | 동아리 멤버십에 **같은 구멍이 재현**되므로 쌍둥이 가드를 새로 만든다 |
| `20260824000003` `create_tournament(text,text,int,int,text,jsonb)` | 소속을 받을 자리가 없다 | `p_club_id uuid default null` 추가 → **시그니처가 바뀌므로 drop 후 재생성** |
| `20260825000001` `create_session(text,text,int)` | 같음 | `p_club_id uuid default null` 추가 → 같은 처리 |
| `20260825000001` `match_overview` (`security_invoker = true`) | 대회 안만 본다 | **손대지 않는다.** 뷰에 동아리를 끌어들이지 않는다 |
| `20260819000008_roster.sql` `add_roster_member` | 이름 중복이면 **예외로 실패** | 그대로. 다만 운영진 심기는 실패하면 안 되므로 접미사 헬퍼를 새로 둔다 |
| `scripts/verify-schema.ts` | 새 테이블을 모른다 | `clubs`·`club_members`·`tournaments.club_id` 추가 |

## 설계 판단 다섯 가지

### 1. 동아리 권한은 **새 헬퍼 세 개**로 따로 만든다

`is_club_member` / `is_club_admin` / `is_club_owner` 를 신설하고,
기존 `is_tournament_*` 는 이름도 본문도 건드리지 않습니다.

기존 헬퍼에 `or is_club_admin(...)` 를 한 줄만 얹고 싶은 유혹이 큰데, 그 순간
**소속 없는 기존 대회의 모든 권한 판단이 새 경로를 지나게** 됩니다. 이 앱은 RLS 가
유일한 보안벽이라, 회귀가 나면 조용히 남의 대회가 보이는 형태로 납니다.
동아리 운영진이 산하 대회를 만지는 근거는 **심어진 멤버 행**이지 동아리 소속이 아닙니다.

### 2. 상호재귀는 `security definer` 헬퍼로만 끊긴다

`clubs` 정책이 `club_members` 를 보고, `club_members` 정책도 `club_members` 를 봅니다.
정책 안에서 그냥 서브쿼리를 쓰면 Postgres 가 무한재귀 에러를 냅니다.

- 두 정책 모두 **`security definer` 헬퍼를 경유**합니다. definer 는 테이블 소유자
  권한으로 돌아 RLS 를 우회하므로 거기서 고리가 끊깁니다
- `security invoker` 로 감싸면 **안 끊깁니다.** 호출자 권한으로 돌면 정책이 다시 적용됩니다
- **`force row level security` 를 켜면 안 됩니다.** force 는 테이블 소유자에게도 정책을
  적용하므로 definer 우회가 무력화되고 재귀가 그대로 부활합니다
- `20260818000002_rls.sql` 머리 주석이 이미 같은 이유로 같은 경고를 답니다. 새 테이블에도
  그 주석을 옮겨 답니다

### 3. 운영진 심기 = **복제**, 그리고 그 복제는 실패하면 안 된다

동아리 밑에 대회를 만들면 그 시점 운영진을 `tournament_members` 에 `role='admin'` 으로
같은 트랜잭션에 심습니다. 이름은 `club_members.display_name` 의 **복사본**입니다 (참조 아님).

문제는 이름 충돌입니다. `add_roster_member` 는 같은 이름이면 `23505` 예외를 던지는데,
그게 대회 생성 경로에서 터지면 **동아리 밑에서는 대회를 못 만드는** 상태가 됩니다.
운영진 둘이 동명이인인 건 드물지만 0 이 아니고, 만든 사람 자신의 표시명과 겹치는 건 흔합니다.

그래서 `unique_display_name(p_tournament_id, p_name)` 헬퍼를 이 마이그레이션에 둡니다.

- **먼저 자르고 붙입니다.** 표시명은 20자 제한이라 20자 이름에 글자를 붙이면 제약 위반으로
  실패합니다. 19자로 자른 뒤 `A`~`Z` 를 붙입니다
- **이미 있는 이름은 절대 안 바꿉니다.** 나중에 들어오는 쪽에만 붙입니다. 이름이 대진표·
  심판 배지·기록 검색에서 사람을 찾는 열쇠라, 기존 이름을 고치면 이미 편성된 경기의 표시가 흔들립니다
- 이 헬퍼는 **마일스톤 2(회원 벌크 삽입)와 3(게스트)이 그대로 재사용**합니다. 1b 에서만
  쓰고 버리는 코드가 아닙니다

만든 사람 자신은 이미 `owner` 로 들어가 있으므로 심기에서 명시적으로 제외하고,
동시성 대비로 `on conflict do nothing` 도 함께 겁니다.

### 4. 승격은 전파하지 않고, 강등만 전파한다 (비대칭이 의도다)

| 상황 | 아직 안 끝난 산하 대회 | 이미 끝난 대회 |
|---|---|---|
| 운영진에서 **내림** | 관리자에서 내린다 (`admin` → `member`) | 건드리지 않는다 |
| 운영진으로 **올림** | **그 대회 명단에 이미 있으면**만 `admin` 으로 | 건드리지 않는다 |
| 멤버 행 자체 | 남긴다 (양쪽 모두) | 남긴다 |

강등은 반드시 전파해야 합니다 — 내렸는데 이번 주 모임을 계속 관리할 수 있으면 내린 게 아닙니다.

승격은 **명단에 없는 사람을 새로 심지 않습니다.** 심으려면 표시명을 정해야 하고 그건
스냅샷 복제(마일스톤 2)의 일입니다. 더 중요한 건, 명단에 없던 사람을 관리자로 넣으면
**대진표와 순위에 뛴 적 없는 유령 참가자**가 생긴다는 것입니다. "운영진인데 지난주 모임을
못 만진다" 는 불편이지만, 유령 참가자는 데이터 오염입니다.

끝난 대회를 양쪽 다 안 건드리는 건 같은 규칙 하나입니다 — **지난 기록을 소급 변조하지 않는다.**

대회 주최자(`role='owner'`) 행은 어느 쪽에서도 건드리지 않습니다. 강등하면 그 대회가
아무도 못 여는 상태로 잠깁니다.

> 전파는 `SECURITY DEFINER` 안에서 일어나므로 `is_direct_api_call()` 이 거짓이 되어
> `guard_member_update` 의 `role` 잠금을 통과합니다. `20260824000003` 이 기존 대회 config 를
> 채울 때 쓴 것과 같은 성질입니다.

### 5. 동아리 멤버십에도 **역할 탈취 구멍이 똑같이 재현된다**

`club_members` 에 `role` 이 생기는 순간, `20260818000007` M-1 이 막았던 구멍이
그대로 복사됩니다 — 관리자가 `PATCH /club_members {"role":"owner"}` 로 자기 행을
승격하고, 진짜 owner 를 강등시켜 동아리에서 잠가버릴 수 있습니다.

같은 모양으로 막습니다.

- `guard_club_member_update` BEFORE 트리거 — `role`·`user_id`·`club_id` 직접 변경 거부
- `set_club_member_role` RPC — `owner` 로는 **올릴 수 없고**, `owner` 행은 **바꿀 수 없다**
- `guard_club_update` — `owner_id`·`invite_code` 직접 변경 거부. 이름·설명은 관리자가 자유롭게

`clubs` 에 `on delete cascade` 로 매달리는 건 `club_members` 뿐입니다.
`tournaments.club_id` 는 **`on delete set null`** 입니다 — cascade 로 두면 동아리 하나를
지우는 것으로 산하 대회·경기·**점수 원장**이 전부 사라집니다. 이 저장소는 같은 종류의
사고를 이미 한 번 겪었습니다 (`guard_match_delete` 가 그 흔적입니다).

## Patterns to Mirror

| 범주 | 근거 | 패턴 |
|---|---|---|
| 마이그레이션 이름 | `supabase/migrations/20260825000001_session_mode.sql` | `YYYYMMDD00000N_snake_case.sql` + 파일 머리에 '왜' 를 적는 주석 블록 |
| 재귀 경고 주석 | `20260818000002_rls.sql:7-11` | 새 테이블 머리에 "definer 로 끊는다 / force RLS 금지" 를 그대로 옮겨 적는다 |
| 권한 헬퍼 | `20260818000002_rls.sql:15-33` | `security definer stable set search_path = public, pg_temp` |
| 컬럼 단위 방어 | `20260818000007_security_hardening.sql:30, 66` | `is_direct_api_call()` 로 정식 경로를 판별하는 BEFORE 트리거 |
| 역할 변경 RPC | `20260818000007_security_hardening.sql:92` `set_member_role` | owner 승격 금지 + owner 행 변경 금지 + `log_audit` |
| 시그니처 변경 | `20260824000003_tournament_settings.sql:130-133` | `drop function if exists ...(옛 시그니처)` 를 먼저. 안 그러면 "function is not unique" |
| 권한 | `20260824000003_tournament_settings.sql:207` | `revoke all ... from public, anon` → `grant execute ... to authenticated` |
| 생성 RPC | `20260825000001_session_mode.sql:118` `create_session` | INSERT 정책 없이 RPC 로만. 부속 행을 같은 트랜잭션에 함께 만든다 |
| 초대 코드 | `20260824000003_tournament_settings.sql:171-177` | `gen_invite_code()` 10회 재시도 + `40001` |
| 데이터 접근 | `src/features/tournament/api.ts` → `queries.ts` → 페이지 | `unwrap(res)` 로 감싸고 react-query 훅으로 노출 |
| 화면 오류 | `src/pages/AdminRulesPage.tsx` | `toUserMessage(err, '기본 문구')` + `role="alert"` |
| 순수 로직 | `src/lib/session.ts` + `session.test.ts` | 판단은 `lib/` 순수 함수로 빼고 같은 이름 `.test.ts` 를 옆에 둔다 |
| 테스트 문체 | `src/lib/rules.test.ts` | `describe`/`test` 이름을 한국어 서술문으로 |
| 실DB 검증 | `scripts/smoke-session.ts` · `scripts/smoke-security.ts` | 번호 붙은 시나리오. 보안 경계는 **막히는 것**을 확인 |

## Files to Change

| 파일 | 동작 | 이유 |
|---|---|---|
| `supabase/migrations/20260826000001_club_layer.sql` | CREATE | 아래 전부 |
| `src/types/database.ts` | UPDATE | `ClubRow`·`ClubMemberRow`·`TournamentRow.club_id` · 새 RPC 4종 |
| `src/types/database.gen.ts` | UPDATE | `db:push` 후 `npm run db:types` 재생성 |
| `src/lib/club.ts` | CREATE | `clubRoleLabel()` · `isClubStaff()` · `validateClubName()` 순수 함수 |
| `src/lib/club.test.ts` | CREATE | 위 함수들 |
| `src/features/club/api.ts` | CREATE | `createClub`·`renameClub`·`joinClub`·`setClubMemberRole`·`listMyClubs`·`getClub`·`listClubMembers`·`deleteClub` |
| `src/features/club/queries.ts` | CREATE | 위를 react-query 훅으로 |
| `src/features/club/ClubStaffManager.tsx` | CREATE | 운영진 목록 · 지정 · 해제. `MemberManager.tsx` 를 본뜬다 |
| `src/pages/MyClubsPage.tsx` | CREATE | 내 동아리 목록 + `[동아리 만들기]` |
| `src/pages/CreateClubPage.tsx` | CREATE | 이름 · 설명 · 내 표시명 |
| `src/pages/ClubPage.tsx` | CREATE | 이름 수정 · 초대 코드 · 운영진 관리 · 산하 대회/모임 목록 |
| `src/pages/JoinClubPage.tsx` | CREATE | 동아리 코드로 들어오기. `JoinTournamentPage.tsx` 를 본뜬다 |
| `src/pages/CreateTournamentPage.tsx` | UPDATE | 소속 동아리 고르기(기본 **'동아리 없음'**) |
| `src/pages/CreateSessionPage.tsx` | UPDATE | 같음 |
| `src/pages/HomePage.tsx` | UPDATE | `[내 동아리]` 진입점 |
| `src/pages/MyTournamentsPage.tsx` | UPDATE | 소속 동아리 이름 배지 (없으면 안 그린다) |
| `src/app/routes.tsx` | UPDATE | `/clubs` · `/clubs/new` · `/clubs/join` · `/c/:clubId` |
| `scripts/smoke-club.ts` | CREATE | 실DB 검증 (아래) |
| `scripts/verify-schema.ts` | UPDATE | 새 테이블·컬럼 |
| `package.json` | UPDATE | `db:smoke:club` |
| `.claude/prds/club-platform.prd.md` | UPDATE | Delivery Milestones 표의 1번 Status·Plan 칸 |
| `docs/이어서시작.md` · `README.md` | UPDATE | 동아리 계층 · 화면 구조 |

> `src/features/tournament/*` 와 `match_overview` 는 **목록에 없습니다.** 의도입니다.

## Tasks

### Task 1 — 스키마와 재귀 안 나는 RLS
- **Action**: `club_role` enum · `clubs` · `club_members` 생성.
  `club_members.user_id` 는 **nullable** (마일스톤 2 의 계정 없는 회원이 여기 들어온다).
  단 `check (role = 'member' or user_id is not null)` — 계정 없는 사람은 운영진이 될 수 없다
  (`20260819000008` 이 심판에 건 것과 같은 이유: 아무도 열 수 없는 권한은 만들지 않는다).
  `is_club_member`/`is_club_admin`/`is_club_owner` 를 `security definer` 로.
  두 테이블에 `enable row level security` — **`force` 는 켜지 않는다.**
- **Mirror**: `20260818000002_rls.sql` 의 헬퍼 모양·머리 주석·revoke/grant 순서
- **Validate**: `select * from clubs` 가 재귀 에러 없이 돈다 (smoke 4번)

### Task 2 — 동아리 만들기 · 들어오기 · 운영진 지정
- **Action**: `create_club(p_name, p_display_name, p_description)` — 동아리 + owner 행을
  같은 트랜잭션에. `gen_invite_code()` 10회 재시도.
  `join_club(p_code, p_display_name)` — `role='member'` 로.
  `set_club_member_role(p_member_id, p_role)` — owner 승격 금지 · owner 행 변경 금지 · 전파(Task 4).
  `guard_club_update` · `guard_club_member_update` 트리거.
- **Mirror**: `set_member_role` (`20260818000007:92`) · `create_session` (`20260825000001:118`)
- **Validate**: smoke 1·2·3·5·6번

### Task 3 — 소속 컬럼과 생성 경로
- **Action**: `tournaments.club_id` 추가 (`on delete set null`).
  `guard_tournament_update` 를 `create or replace` 로 **본문만 교체**해 `club_id` 잠금 추가
  (트리거는 이미 붙어 있으므로 다시 만들지 않는다).
  `unique_display_name(uuid, text)` 헬퍼.
  `create_tournament` · `create_session` 을 `drop` 후 `p_club_id uuid default null` 로 재생성 —
  소속이 있으면 `is_club_admin` 검사 후 그 시점 운영진을 `admin` 멤버 행으로 심는다.
  옛 시그니처 `revoke`, 새 시그니처 `grant`.
- **Mirror**: `20260824000003:130-133` 의 drop 주석까지 그대로
- **Validate**: smoke 7·8·9·14번. `npm run db:smoke:match`

### Task 4 — 강등 전파
- **Action**: `set_club_member_role` 안에서 `admin → member` 일 때,
  `tournaments.club_id = 이 동아리 and status <> 'finished'` 인 대회의
  `tournament_members` 중 그 사용자의 행을 `role='member'` 로. **`role='owner'` 행은 제외.**
  승격은 `tournament_members` 에 **이미 있는 행만** `admin` 으로 (없으면 심지 않는다).
  양쪽 다 `log_audit` 남긴다.
- **Validate**: smoke 10·11·12번

### Task 5 — 타입 · 순수 로직
- **Action**: `db:push` 후 `db:types` 재생성, 손으로 넣은 `database.ts` 와 대조.
  `lib/club.ts` + 테스트
- **Mirror**: `src/types/database.ts` 의 `Functions` 블록 · `src/lib/session.ts`
- **Validate**: `npm run typecheck && npm run test`

### Task 6 — 화면
- **Action**: `MyClubsPage` · `CreateClubPage` · `ClubPage`(+`ClubStaffManager`) · `JoinClubPage` ·
  대회/모임 만들기의 소속 고르기 · 홈 진입점 · 라우트
- **Mirror**: `MemberManager.tsx` · `JoinTournamentPage.tsx` · `AdminRulesPage.tsx` 의 오류 표시
- **Validate**: `npm run verify`

### Task 7 — 실DB 검증
- **Action**: `scripts/smoke-club.ts`
  1. 동아리를 만들면 만든 사람이 `owner` 로 들어간다
  2. 관리자는 동아리 이름을 바꾸고, 일반 회원은 못 바꾼다
  3. 남의 동아리는 목록에 아예 안 보인다 (`select` 가 0행)
  4. **동아리와 동아리 멤버십을 읽어도 무한재귀가 나지 않는다** ← definer 로 끊었는지
  5. **관리자가 자기 `club_members` 행을 `PATCH` 로 `owner` 승격하지 못한다** ← 보안 경계
  6. `set_club_member_role` 로도 `owner` 를 만들 수 없고, `owner` 행은 못 바꾼다
  7. 동아리 밑에 대회를 만들면 그 시점 운영진이 `admin` 멤버 행으로 함께 들어간다
  8. **동아리 없이 대회·모임을 만드는 기존 경로가 그대로 동작한다 (`club_id` 가 NULL)** ← 회귀
  9. 이미 만들어진 대회의 `club_id` 를 `PATCH` 로 바꾸거나 지울 수 없다 ← 탈취
  10. 운영진에서 내리면 **안 끝난** 산하 대회의 관리자 권한만 사라지고, 끝난 대회는 그대로다
  11. 내려도 `tournament_members` 행 자체는 남는다 (출전 기록 보존)
  12. 승격은 그 대회 명단에 **이미 있는 사람만** 올리고, 없는 사람을 새로 심지 않는다
  13. 동아리를 지워도 산하 대회·경기·점수 원장이 남는다 (`club_id` 만 NULL 이 된다)
  14. 동명이인 운영진 둘이어도 대회 생성이 실패하지 않고 접미사가 붙는다 (20자 이름 포함)
  15. 동아리 운영진이라는 사실만으로는 **동아리 밖 대회**에 아무 권한이 없다
- **Validate**: `npm run db:smoke:club && npm run db:smoke:match && npm run db:smoke:session && npm run db:smoke:roster && npm run db:smoke:security`

## Validation

```bash
npm run verify              # typecheck + lint + test + CSP + build
npm run db:push
npm run db:types            # 손으로 넣은 타입과 대조
npm run db:verify           # 새 테이블·컬럼 반영 후
npm run db:smoke:club       # 신규
npm run db:smoke:match      # 대회 회귀 ← 필수
npm run db:smoke:session    # 모임 회귀 ← 필수
npm run db:smoke:roster     # 명단 회귀 (접미사 헬퍼가 옆에 생겼다)
npm run db:smoke:security   # 가드를 하나 넓혔으므로 필수
```

## Risks

| 리스크 | 확률 | 완화 |
|---|---|---|
| **동아리 정책 상호재귀로 조회가 통째로 죽는다** | 높 | 두 정책 모두 `security definer` 헬퍼 경유. `force row level security` 금지. smoke 4번으로 못 박는다 |
| **관리자가 자기 동아리 행을 owner 로 승격** (`guard_member_update` 가 막은 것의 재현) | 높 | `guard_club_member_update` + `set_club_member_role`. smoke 5·6번 |
| **대회를 동아리에서 떼어내 탈취** | 중 | `club_id` 를 `guard_tournament_update` 에 넣어 생성 후 불변. smoke 9번 |
| **동아리 삭제가 점수 원장까지 지운다** | 중 | `on delete set null`. cascade 는 `club_members` 까지만. smoke 13번 |
| **기존 권한 헬퍼를 '한 줄만' 넓히고 싶어진다** | 중 | 넓히면 소속 없는 기존 대회 전부가 새 경로를 지난다. 새 헬퍼로 분리하고 smoke 8·15번으로 못 박는다 |
| **운영진 이름 충돌로 동아리 밑 대회 생성이 통째로 실패** | 중 | `unique_display_name` 으로 자르고 붙인다. smoke 14번에 20자 경계 포함 |
| **초대 코드가 두 종류가 되어 사용자가 헷갈린다** (동아리 코드 vs 대회 코드) | 중 | 진입 경로를 `/clubs/join` 과 `/join` 으로 가르고, 화면 문구에 '동아리 코드' 를 명시. 코드 한 칸에 둘 다 받는 통합 화면은 만들지 않는다 |
| **승격이 전파 안 돼서 "운영진인데 못 만진다"** | 중 | 의도된 비대칭(설계 판단 4). 명단에 있으면 승격은 전파된다. 명단에 없는 경우는 마일스톤 2 가 푼다 |
| `match_overview` 에 동아리를 실어 뷰가 `security_invoker` 로 새 테이블을 참조 | 낮 | 뷰를 아예 안 건드린다. Files to Change 에 없다 |
| 화면이 두 벌(동아리 있음/없음)로 갈라져 유지비가 늘어남 | 중 | 의도적으로 감수한다 — 운영 중인 서비스를 안 깨는 값. 갈리는 지점을 생성 RPC 한 곳에만 둔다 |

## Non-goals (1b 에서 하지 않음)

- **회원 명단 재사용** (동아리 명단에서 골라 대회·모임 열기) → **마일스톤 2**
- **게스트 등록 · 상시 링크** → 마일스톤 3
- **비로그인 읽기 화면** → 마일스톤 4. 이 앱 최초의 비로그인 경로라 성격이 다르다
- **기존 대회·모임을 동아리로 옮기기** → 만들지 않음. 소속은 생성 후 불변이고, 선택 계층이라 급하지 않다
- 회원이 스스로 동아리에 가입 신청하는 경로 → 운영진이 관리 주체다
- 동아리 간 명단 공유 · 통합 → 중복 소속은 각각 별개로 취급한다
- 동아리 단위 순위 · 전적 → 만들지 않음 (1단계 결정 유지)
- 동아리 주최자 넘기기 → `set_member_role` 이 대회에서 막은 것과 같은 이유로 막는다

## Acceptance

- [ ] 동아리를 만들고, 이름을 바꾸고, 코드로 들어온 사람을 운영진으로 지정할 수 있다
- [ ] 동아리 밑에 대회·모임을 열면 그 시점 운영진이 관리자로 함께 들어가 있다
- [ ] **동아리 없이 만든 기존 대회·모임의 동작이 하나도 바뀌지 않았다** (`db:smoke:match` · `:session` · `:roster` 통과)
- [ ] 관리자가 자기 동아리 행을 owner 로 승격하지 못한다
- [ ] 대회의 소속 동아리를 나중에 바꿀 수 없다
- [ ] 운영진에서 내리면 안 끝난 대회의 권한만 사라지고, 끝난 대회와 멤버 행은 그대로다
- [ ] 동아리를 지워도 산하 대회와 점수 원장이 남는다
- [ ] `npm run verify` + smoke 5종 통과
