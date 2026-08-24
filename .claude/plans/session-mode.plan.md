# Plan: 모임 모드 (1단계) — 점수 없이 코트를 돌린다

**결정 사항**: 모임은 동아리 밑에 **날짜별로 하나** · 편은 **이름으로만** (조 없음) · 점수는 **옵션**
**Complexity**: Medium (6~8h)
**후속**: 2단계 동아리 명단+게스트 · 3단계 모임 홈 · 4단계 게임 짜주기

## Summary

지금 앱은 전부 '조 vs 조'와 '승자가 있어야 경기가 끝난다'를 전제로 돌아갑니다.
모임은 둘 다 아닙니다 — 사람 넷이 코트에 들어가고, 끝났는지만 알면 됩니다.

1단계는 **그릇만** 만듭니다. 코트 현황판 · 대기열 · '곧 차례' 알림 · 심판 화면은
이미 사람·코트 단위라 그대로 쓰이므로, 조 가정과 승자 가정을 걷어내는 것만으로
"누가 어느 코트에서 치고 있나"가 완성됩니다.

## 지금 코드가 막고 있는 것 (전수 확인)

| 위치 | 지금 | 1단계에서 |
|---|---|---|
| `20260818000001_schema.sql` `winner_only_when_finished` | 끝난 경기는 승자가 **반드시** 있어야 함 | 점수를 안 센 경기는 승자 없이 끝낼 수 있게 |
| `20260818000003_rpc.sql` `finish_match` | 동점이면 `'동점입니다. 승리 팀을 직접 선택해 주세요'` 예외 | 0:0 + 모임이면 그냥 끝 |
| `match_teams.group_id` | `NOT NULL references groups(id)` | NULL 허용 |
| `20260819000003_queue_ahead.sql` `create_match` | 같은 조 금지 · 각 조에서 N명 · 조 소속 검사 | 모임용 편성 RPC를 따로 둠 |
| `create_tournament` | `p_group_count between 2 and 20` | 모임은 조가 0개 → 만들기 RPC를 따로 둠 |
| `record_score` | `is_match_referee OR is_tournament_admin` | 모임이면 **뛰는 사람도** |
| `TournamentPage.tsx:49` | 조 안 고르면 `/setup` 강제 이동 | 모임이면 건너뛰기 |
| `TournamentNav.tsx:23-28` | 탭 6개 고정 (심판 · 순위 포함) | 모임이면 코트 · 기록 · 참가자만 |
| `schedule.ts` `matchTitle` | `group_a_name ?? '—'` | 조가 없으면 선수 이름으로 |
| `get_standings` | `match_teams mt join groups g on ...` | 손대지 않음 — `group_id` 가 NULL 이면 조인에서 자연히 빠짐 (**검증 필요**) |

## 설계 판단 두 가지

### 1. "그냥 끝"을 어떻게 표현하나 — `matches.scored`

`match_status` enum 에 `'ended'` 를 추가하는 방법은 버립니다. 상태를 하나 늘리면
`get_standings`(`status='finished'`) · `buildSchedule` · 기록 화면 필터 등 **status 를 보는 모든 곳**이
새 값을 모르는 채로 조용히 지나갑니다 — 기록에 안 뜨는 경기가 생깁니다.

대신 `matches.scored boolean not null default true` 를 둡니다.

```sql
check ( (status = 'finished' and (winner_side is not null or not scored))
     or (status <> 'finished' and winner_side is null) )
```

- 기존 140행은 `default true` 로 그대로 통과합니다
- `scored` 는 **미리 고르는 게 아니라 끝낼 때 정해집니다** — 점수를 한 번도 안 넣었으면
  `scored=false`, 넣었으면 `true`. 설정도 버튼도 늘지 않습니다
- 화면에 "점수 없음" 을 띄울 근거가 데이터로 남습니다
- 한 모임 안에서 어떤 게임은 점수를 세고 어떤 게임은 안 세는 게 자연히 됩니다
  ("필요한 사람만 기록")

### 2. 목표 점수는 모임 경기에도 그대로 넣는다

`match_teams.target_score` 를 nullable 로 만들지 **않습니다.** 모임 경기도 config 의
21점을 스냅샷으로 받습니다.

- 점수를 세기로 한 사람은 21점에서 자동 종료 · "3점 남음" 표시가 대회와 똑같이 동작합니다
- 안 세는 사람은 0:0 에서 `경기 끝` 을 누르면 됩니다
- nullable 로 만들면 `record_score` · `undo_score` · `decide_winner` · 심판 화면이
  전부 NULL 분기를 갖게 됩니다. 얻는 게 없습니다

조가 없으니 `is_joker=false`, `win_points` 는 config 의 일반조 값입니다.

## Patterns to Mirror

| 범주 | 근거 | 패턴 |
|---|---|---|
| 마이그레이션 이름 | `supabase/migrations/20260824000001_notify_when_up_next.sql` | `YYYYMMDD00000N_snake_case.sql` + 파일 머리에 '왜' 를 적는 주석 블록 |
| RPC 오류 | `20260818000003_rpc.sql:265` | `raise exception '한국어 문장' using errcode = '22023' / '42501' / 'P0002'` |
| 권한 | `20260824000003_tournament_settings.sql:207` | `revoke all ... from public, anon` → `grant execute ... to authenticated` |
| 불변식은 트리거로 | `20260818000007_security_hardening.sql:30` `guard_tournament_update` | RLS 로 못 가리는 컬럼 단위 규칙은 BEFORE 트리거 |
| 데이터 접근 | `features/tournament/api.ts` → `queries.ts` → 페이지 | `unwrap(res)` 로 감싸고 react-query 훅으로 노출 |
| 화면 오류 | `pages/AdminRulesPage.tsx` | `toUserMessage(err, '기본 문구')` + `role="alert"` |
| 순수 로직 | `src/lib/records.ts` + `records.test.ts` | 판단은 `lib/` 순수 함수로 빼고 같은 이름 `.test.ts` 를 옆에 둔다 |
| 테스트 문체 | `src/lib/rules.test.ts` | `describe`/`test` 이름을 한국어 서술문으로, 픽스처는 지역 `match({...})` 팩토리 |

## Files to Change

| 파일 | 동작 | 이유 |
|---|---|---|
| `supabase/migrations/20260825000001_session_mode.sql` | CREATE | `kind` · `scored` · `group_id` nullable · 제약 교체 · `create_session` · `create_session_match` · `finish_match` · `record_score` |
| `src/types/database.ts` | UPDATE | `TournamentRow.kind` · 새 RPC 3종 시그니처 |
| `src/types/database.gen.ts` | UPDATE | `kind` · `scored` 컬럼 (db:push 후 `npm run db:types` 로 재생성) |
| `src/lib/session.ts` | CREATE | `isSession()` · `sessionMatchTitle()` · `defaultSessionName(date)` 순수 함수 |
| `src/lib/session.test.ts` | CREATE | 위 함수들 |
| `src/lib/schedule.ts` | UPDATE | `matchTitle` 이 조 없으면 선수 이름으로 |
| `src/lib/schedule.test.ts` | UPDATE | 조 없는 경기 제목 |
| `src/features/tournament/api.ts` | UPDATE | `createSession` · `createSessionMatch` |
| `src/features/tournament/queries.ts` | UPDATE | `useCreateSession` · `useCreateSessionMatch` |
| `src/features/tournament/TournamentNav.tsx` | UPDATE | 모임이면 탭에서 심판 · 순위 제외 |
| `src/features/match/CourtBoard.tsx` | UPDATE | 조 이름이 없으면 선수 이름을 머리로 (지금은 `'—'`) |
| `src/pages/HomePage.tsx` | UPDATE | `[모임 열기]` 진입점 |
| `src/pages/CreateSessionPage.tsx` | CREATE | 이름(기본 `M월 D일 모임`) + 코트 개수 |
| `src/pages/SessionMatchCreatePage.tsx` | CREATE | 조 대신 사람 4명 고르기 |
| `src/pages/TournamentPage.tsx` | UPDATE | `:49` setup 리다이렉트를 모임이면 건너뛰기 |
| `src/pages/MatchRecordsPage.tsx` | UPDATE | `scored=false` 경기에 "점수 없음" 표시 |
| `src/pages/MatchScorePage.tsx` | UPDATE | 0:0 에서 `경기 끝` 이 눌리게 (지금은 동점 예외로 실패) |
| `src/pages/MyTournamentsPage.tsx` | UPDATE | 대회 / 모임 갈라 보기 |
| `src/app/routes.tsx` | UPDATE | `/new/session` · `/t/:id/matches/new-session` |
| `scripts/smoke-session.ts` | CREATE | 실DB 검증 (아래) |
| `package.json` | UPDATE | `db:smoke:session` |
| `docs/이어서시작.md` · `README.md` | UPDATE | 모임 모드 · 화면 구조 |

## Tasks

### Task 1 — 마이그레이션
- **Action**: `kind` · `scored` 추가, `winner_only_when_finished` 교체, `match_teams.group_id` nullable,
  `create_session` / `create_session_match` 신설, `finish_match` · `record_score` 수정
- **Mirror**: `20260824000003_tournament_settings.sql` 의 머리 주석 · revoke/grant 순서
- **Validate**: `npm run db:push && npm run db:verify`

### Task 2 — 타입
- **Action**: `TournamentRow.kind`, `Functions` 에 RPC 3종. `db:types` 재생성 후 손으로 넣은 것과 대조
- **Mirror**: `src/types/database.ts:118` `Functions` 블록
- **Validate**: `npm run typecheck`

### Task 3 — 순수 로직
- **Action**: `lib/session.ts` + `matchTitle` 폴백
- **Mirror**: `src/lib/records.ts`
- **Validate**: `npm run test`

### Task 4 — 만들기 흐름
- **Action**: 홈 진입점 · `CreateSessionPage` · `/my` 갈라 보기
- **Validate**: `npm run test && npm run build`

### Task 5 — 진행 흐름
- **Action**: `SessionMatchCreatePage`(사람 4명) · `CourtBoard` 이름 표시 · 탭 숨김 · setup 건너뛰기 ·
  0:0 종료 · 기록에 "점수 없음"
- **Validate**: `npm run verify`

### Task 6 — 실DB 검증
- **Action**: `scripts/smoke-session.ts`
  1. 모임을 만들면 조가 0개다
  2. 조 없이 경기를 편성할 수 있다
  3. 점수를 한 번도 안 넣고 끝낼 수 있다 (`scored=false`, `winner_side` 없음)
  4. 점수를 넣고 끝내면 대회와 똑같이 동작한다 (`scored=true`, 승자 있음)
  5. 뛰는 사람이 자기 경기 점수를 넣을 수 있다
  6. **뛰지도 않는 남이 그 경기 점수를 못 넣는다** ← 보안 경계
  7. 대회 경기는 여전히 승자 없이 끝낼 수 없다
  8. 모임 경기가 조별 순위(`get_standings`)에 안 섞인다
  9. '곧 차례' 알림이 모임에서도 나간다
- **Validate**: `npm run db:smoke:session && npm run db:smoke:match && npm run db:smoke:security`

## Validation

```bash
npm run verify              # typecheck + lint + test + CSP + build
npm run db:push
npm run db:types            # 손으로 넣은 타입과 대조
npm run db:verify
npm run db:smoke:session    # 신규
npm run db:smoke:match      # 대회 회귀
npm run db:smoke:security   # 채점 권한 확대 후 필수
```

## Risks

| 리스크 | 확률 | 완화 |
|---|---|---|
| 승자 없는 경기가 **조별 순위에 유령으로** 섞임 | 중 | `group_id` NULL 이면 `get_standings` 조인에서 빠지는 것을 smoke 8번으로 못 박는다 |
| 대회 경기도 승자 없이 끝나게 됨 | 중 | 완화는 `kind='session'` 인 경기에만. smoke 7번 |
| **채점 권한 확대 = 보안 경계 변경** | 높 | 뛰는 사람만. `smoke-security` 에 '남의 경기 조작' 추가 (smoke 6번). 이 앱은 RLS 가 유일한 보안벽 |
| status 를 보는 곳을 놓쳐 모임 경기가 화면에서 사라짐 | 중 | `scored` 로 간 이유가 이것. `status` 값은 늘리지 않는다 |
| `match_teams.group_id` NULL 이 대회 경로로 새어 들어감 | 낮 | `create_match` 는 그대로 두고 모임용 RPC 를 따로 둔다 |
| 대회/모임 문구가 섞임 ("내 대회" 에 모임) | 낮 | `/my` 두 갈래 · 탭 숨김 |

## Non-goals (1단계에서 하지 않음)

- 동아리 · 명단 재사용 · 게스트 → **2단계**
- 출석 체크인 → 3단계
- 자동 게임 편성 → 4단계
- 개인 순위 · 승률 → 만들지 않음 (모임은 기록이 목적이 아님)
- 모임에 조 만들기 → 만들지 않음 (대회와의 구분이 흐려짐)

## Acceptance

- [ ] 모임을 만들고, 조 없이 경기를 편성하고, 점수를 안 세고 끝낼 수 있다
- [ ] 모임 화면에 조 · 순위 · 심판이 보이지 않는다
- [ ] 대회 동작이 하나도 바뀌지 않았다 (`db:smoke:match` 통과)
- [ ] 뛰지 않는 사람은 남의 경기 점수를 넣을 수 없다
- [ ] `npm run verify` + smoke 3종 통과
