# TODO — 동아리 플랫폼화 (2단계)

> 2026-08-25 기준. 브랜치 `feat/session-mode`.
> 상위 문서: [`.claude/prds/club-platform.prd.md`](../.claude/prds/club-platform.prd.md) · [`.claude/plans/club-layer.plan.md`](../.claude/plans/club-layer.plan.md)

## 지금 어디까지 왔나

```
마일스톤 1  동아리 그릇      SQL 작성·리뷰 완료 · DB 미적용 · 타입/화면/검증 남음
마일스톤 2  회원 명단 재사용  미착수
마일스톤 3  게스트 등록      미착수
마일스톤 4  게스트 읽기 전용  미착수
```

| 커밋 | 내용 |
|---|---|
| `d8496f5` | 2단계 PRD |
| `2f4e3dd` | 권한 모델 결정 + PRD 사실 오류 정정 |
| `c67aeec` | 1b 구현 계획서 |
| `fb21eff` | **동아리 계층 마이그레이션 838줄** (DB 미적용) |

---

## 🔴 지금 막고 있는 것 — 연결 정보가 없다

**`npm run db:push` 를 못 돌린다.** 이 PC 에 smash 의 `.env` 가 없다.
GitHub 에서 오늘 처음 클론한 사본이고 `.env*` 는 gitignore 라 따라오지 않았다.
홈 디렉터리 전체를 뒤졌지만 smash 용 `.env` 는 어디에도 없었다.

`.env.local` 에 아래 셋을 채워야 다음 단계로 갈 수 있다.

```
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   Settings → API Keys → Publishable
SUPABASE_SECRET_KEY=sb_secret_...                  Settings → API Keys → Secret keys → Reveal
SUPABASE_DB_URL=postgresql://...                   Settings → Database → Connection string (URI)
```

지금 `.env.local` 의 publishable 값은 **자리표시자**다 (`sb_publishable_PASTE_YOUR_KEY_HERE`).
그대로 두면 앱이 `Invalid API key` 로 뜬다.

---

## 마일스톤 1b — 남은 일

### Task 5. 타입 · 순수 로직 · 데이터 접근  ⬜

마이그레이션이 만든 것에 맞춰 프론트 쪽을 붙인다. **한 번 시작했다가 되돌렸다** —
`typecheck` 가 깨진 채로 남아 있어 작업 트리를 깨끗하게 되돌렸다. 처음부터 다시 하면 된다.

- `src/types/database.gen.ts` — `clubs` · `club_members` · `tournaments.club_id` ·
  `audit_logs.club_id` + `tournament_id` nullable · 새 RPC 5종
  (DB 적용 후 `npm run db:types` 로 재생성해 손으로 넣은 것과 대조할 것)
- `src/types/database.ts` — `ClubRow` · `ClubMemberRow` · `ClubRole` 별칭
- `src/lib/club.ts` + `club.test.ts` — 순수 함수만
  - `clubRoleLabel` · `isClubStaff` · `validateClubName`
  - **`parseJoinResult`** ← 제일 중요. `join_club` 은 예외를 안 던지고 jsonb 봉투를 반환한다
    (`ok` / `rate_limited` / `bad_format` / `not_found`). 봉투를 페이지마다 풀면
    안내 문구가 화면마다 흩어진다
- `src/features/club/api.ts` · `queries.ts` — `unwrap()` + react-query 훅

### Task 6. 화면  ⬜

- `MyClubsPage` — 내 동아리 목록 + `[동아리 만들기]`
- `CreateClubPage` — 이름 · 설명 · 내 표시명
- `ClubPage` — 이름 수정 · 초대 코드 · 운영진 관리 · 산하 대회/모임 목록
- `JoinClubPage` — 동아리 코드로 들어오기 (`JoinTournamentPage` 를 본뜬다)
- `ClubStaffManager` — 운영진 지정·해제 (`MemberManager` 를 본뜬다)
- `CreateTournamentPage` · `CreateSessionPage` — 소속 동아리 고르기 (기본 **'동아리 없음'**)
- `HomePage` — `[내 동아리]` 진입점
- `MyTournamentsPage` — 소속 동아리 배지 (없으면 안 그린다)
- `routes.tsx` — `/clubs` · `/clubs/new` · `/clubs/join` · `/c/:clubId`

> **초대 코드가 두 종류가 된다** (동아리 코드 · 대회 코드). 진입 경로를 갈라 두고
> 화면 문구에 '동아리 코드' 를 명시한다. 한 칸에 둘 다 받는 통합 화면은 만들지 않는다.

### Task 7. 실DB 검증 스크립트  ⬜

`scripts/smoke-club.ts` + `package.json` 에 `db:smoke:club`.
검사 항목 17개는 계획서 Task 7 에 있다. 그중 반드시 들어가야 하는 것:

- **8번** 동아리 없이 만드는 기존 경로가 그대로 동작한다 ← 회귀
- **5번** 관리자가 자기 행을 owner 로 승격하지 못한다 ← 보안 경계
- **16번** 브루트포스가 막히고, **차단된 뒤에도 `join_attempts` 기록이 남아 있다**
  ← 예외로 롤백되면 카운터가 영원히 0 이 되는 함정. 이 저장소가 이미 한 번 밟았다

### Task 8. DB 적용 · 검증  ⬜  ← `.env` 가 있어야 함

```bash
npm run db:push
npm run db:types            # 손으로 넣은 타입과 대조
npm run db:verify
npm run db:smoke:club       # 신규
npm run db:smoke:match      # 대회 회귀 ← 필수
npm run db:smoke:session    # 모임 회귀 ← 필수
npm run db:smoke:roster     # 명단 회귀
npm run db:smoke:security   # 가드를 넓혔으므로 필수
npm run verify
```

> **대회·모임이 진행 중일 때 적용하지 말 것.** `alter table tournaments` 가 잠깐
> 쓰기 락을 잡는다. 테이블이 작아 순식간일 가능성이 높지만 체육관에서 점수 찍는
> 중에 걸리면 곤란하다.

> **회귀 3종(match · session · roster)이 이번 작업의 진짜 관문이다.** PRD 에서
> 유일하게 계측 가능한 성공 지표가 "기존 대회·모임 동작 회귀 0건" 이다.

### Task 9. 문서 갱신  ⬜

- `docs/이어서시작.md` · `README.md` — 동아리 계층 · 화면 구조
- `.claude/prds/club-platform.prd.md` — Delivery Milestones 표의 1번 Status/Plan 칸

---

## 확정된 결정 (다시 논하지 말 것)

1. **동아리는 명단의 원천이지 권한 축이 아니다.** 기존 권한 헬퍼
   `is_tournament_member` / `is_tournament_admin` / `is_tournament_owner` 를 한 줄도 안 건드린다.
   동아리 운영진이 산하 대회를 만지는 근거는 **생성 시점에 심어진 멤버 행**이다
2. **동아리는 선택 계층.** 동아리 없는 기존 대회·모임이 그대로 동작한다. 두 경로를
   유지하는 부담은 운영 중인 서비스를 안 깨는 값으로 감수한다
3. **강등만 전파하고 승격은 명단에 이미 있는 행만.** 끝난 대회와 주최자 행은 양쪽 다 제외.
   명단에 없는 사람을 심으면 대진표·순위에 뛴 적 없는 유령 참가자가 생긴다
4. **대회 명단은 동아리 명단의 복제(스냅샷), 참조가 아니다.** 가장 되돌리기 어려운 결정이다.
   참조로 몇 주 운영하면 지난 대회의 이름이 동아리의 *현재* 이름을 가리키게 되고,
   그때 그 사람이 뭐라고 불렸는지는 복원할 수 없다
5. **게스트의 신원은 본인이 적는 이름.** 시스템이 보는 사람이 누구인지 알 필요가 없다
6. **게스트는 그날 모임에만 존재한다.** 동아리 명단에 남는 것은 회원뿐.
   다만 이미 치른 경기 기록에는 이름이 남는다 — 명단에서 사라지는 것과 기록이
   지워지는 것은 다르다
7. **같은 이름은 뒤에 글자를 붙여 가르되 기존 이름은 절대 안 바꾼다.** 이름이
   대진표·심판 배지·기록 검색에서 사람을 찾는 열쇠다

## 마이그레이션이 이미 담고 있는 것 (`fb21eff`)

- `clubs` · `club_members` · `club_role` enum. 정책은 전부 `security definer` 헬퍼 경유
  (**`force row level security` 를 켜면 재귀가 부활한다**)
- `create_club` · `join_club` · `set_club_member_role` · `remove_club_member`
- `tournaments.club_id` (`on delete set null`) + `guard_tournament_update` 에 잠금 추가
- `create_tournament` · `create_session` 에 `p_club_id` 추가 (옛 시그니처 drop 후 재생성)
- `unique_display_name` — 자르고 접미사, **어떤 경우에도 실패하지 않는다**
- `audit_logs` 확장 — `tournament_id` nullable + `club_id`
- `join_attempts` 재사용 — 동아리 코드도 10분/10회 브루트포스 차단

## 리뷰에서 나왔고 **의도적으로 안 고친 것**

| | 이유 |
|---|---|
| `set_club_member_role` 의 TOCTOU 원본 (`set_member_role`) | 기존 코드의 결함. 이번 범위 밖 |
| `cm_club_idx` 가 unique 인덱스와 선행 컬럼 중복 | 기존 `tm_tournament_idx` 도 같은 모양. 관례 |
| `is_club_owner` 가 아직 아무 데서도 안 쓰임 | 마일스톤 2 에서 쓴다 |
| `alter table` 이 잠깐 잡는 락 | 코드 문제가 아니라 적용 시점 문제 |

---

## 마일스톤 2~4 — 착수 전에 답할 것

- [ ] 게스트는 정확히 언제 사라지는가 (모임 종료 / 그날이 지날 때 / 운영진이 닫을 때)
- [ ] 열린 모임이 없을 때 상시 링크로 들어오면 어떻게 되는가
- [ ] 대회에도 게스트가 필요한가, 모임 전용인가
- [ ] 게스트 화면이 적은 이름을 기억해 자기 경기를 강조할 것인가 (필수는 아니다)
- [ ] 상시 링크가 유출되면 회수 수단이 필요한가
- [ ] 게스트가 나중에 회원이 되면 지난 기록이 이어져야 하는가
- [ ] 게스트 등록에 이름 말고 무엇을 받는가 (연락처를 받으면 개인정보 보관 책임이 생긴다)

> **마일스톤 4(게스트 읽기 전용)는 이 앱 최초의 비로그인 접근 경로다.** 모든 정책이
> 로그인 사용자를 전제하므로 성격이 다르다. 1~3 을 끝낸 뒤 별도로 판단한다.
> 보안 리뷰가 짚은 방향: 정책을 anon 에 여는 것보다, `join_attempts` 처럼
> **정책 0개 + SECURITY DEFINER RPC 하나**로 읽기 페이로드를 조립해 반환하는 쪽이
> 기존 구조와 일치한다.

---

## 곁다리 — 사용 안내가 낡았다

`docs/guide.html` (참가자용 안내, 아티팩트로 배포됨) 이 **"듀스가 없습니다"** 라고
못 박아 두었는데, 그 뒤 대회 설정으로 듀스를 켤 수 있게 됐다. 코트 체인지와
'곧 차례' 알림도 안내에 없다. 다음에 뿌리기 전에 고칠 것.
