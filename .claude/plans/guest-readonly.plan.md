# Plan: 게스트 읽기 전용 화면 (마일스톤 4) — 등록한 사람이 코트를 본다

**결정 사항**: 새 테이블 0개 · 새 컬럼 0개 · 새 RLS 정책 0개 — 늘어나는 것은 **anon RPC 하나(`guest_board`)와 화면 하나**뿐 · 실시간은 **폴링 10초**(Realtime 은 RLS 를 타므로 원리적으로 불가) · 주소는 **`/g/:code`(등록) + `/g/:code/:sessionId`(현황판)** 으로 가른다 · 이름은 **localStorage**(모임별 키, 표시 강조 전용) · **명단 전체는 절대 안 나간다 — 코트에 편성된 사람 이름만** · 끝난 경기는 **개수만** · `match_overview` 뷰는 **참조조차 하지 않는다**
**Complexity**: Medium-High (7~9h) — SQL 은 함수 하나인데, **이 앱 최초의 비로그인 읽기**라 무게가 전부 "무엇을 안 실을 것인가" 에 있다
**후속**: 모임 모드 3단계 출석 체크인 · 4단계 자동 편성 · (게스트 알림은 계정이 없어 영영 없다)

## Summary

마일스톤 3 으로 게스트는 링크 하나로 그날 명단에 들어옵니다. 그런데 **들어온 다음에 볼 것이 없습니다.** `GuestJoinPage` 의 완료 화면은 적힌 이름을 크게 보여주고 끝이고, 되돌아갈 곳도 앞으로 갈 곳도 없습니다 — 계획서에 "마일스톤 4 전까지 볼 것이 없다" 고 적어 둔 그대로입니다. 코트 앞에 선 게스트는 지금 자기 순서가 언제인지 알 방법이 운영진에게 묻는 것뿐입니다.

마일스톤 4 는 그 막다른 길을 현황판으로 잇습니다. **로그인 없이** 코트별 현재 경기와 대기열, 그리고 자기 차례까지 몇 경기 남았는지를 봅니다.

**이번에도 만드는 그릇은 없습니다.** 코트·경기·대기 순번은 이미 다 있고(`matches.queue_order` · `src/lib/schedule.ts` `queuePosition`), 로그인 사용자용 현황판(`CourtBoard`)도 이미 돕니다. 이 마일스톤이 하는 일은 **그 데이터에서 게스트가 봐도 되는 부분만 골라 조립하는 definer 함수 하나를 뚫고, 그 함수가 딱 그것만 싣도록 못 박는 것**입니다.

그래서 이 계획서의 무게는 SQL 줄 수가 아니라 **반환 필드 목록**에 있습니다. 지금까지 `profiles` 를 완전 비공개로 유지해 실명 노출을 막아 왔고(정책 `profiles_select_own`), 대회 표시명만 써 왔습니다. **링크 하나로 그게 새면 마일스톤 1~3 의 노력이 무의미해집니다.** 마일스톤 3 이 `guest_sessions` 의 반환을 "필드 셋만" 으로 못 박은 규율을 여기서도 이어야 하는데, 이번에는 필드가 셋으로 안 끝나므로 **무엇을 안 싣는지와 그 이유를 명시적으로 적습니다.**

## 지금 코드가 막고 있는 것 (전수 확인)

| 위치 | 지금 | 마일스톤 4 에서 |
|---|---|---|
| `20260818000007_security_hardening.sql:16` `is_direct_api_call()` | `select current_user = 'authenticated'` | **손대지 않는다.** 마일스톤 3 의 설계 판단 1 이 **그대로** 적용된다 — anon 앞에서 이 함수가 거짓이 되어 `guard_tournament_update`·`guard_member_update`·`guard_member_delete` 가 전부 "RPC 경로다" 로 오판한다. **읽기 정책이라도 anon 에 하나 열면 그 정책이 PostgREST 의 직접 접근에도 그대로 열린다** |
| `20260818000002_rls.sql` 전 정책 | 전부 `to authenticated` | **한 줄도 안 건드린다.** 정책 0개를 이번에도 유지한다 |
| `matches_select` · `courts_select` · `mt_select` · `mtp_select` · `tm_select` | 전부 `is_tournament_member(...)` | 그대로. anon 은 `auth.uid()` 가 NULL 이라 어느 것도 통과하지 못한다 |
| `20260825000001_session_mode.sql` `match_overview` | `with (security_invoker = true)` + `grant select to authenticated` | **뷰를 anon 에 열지 않는다. 그리고 definer 함수 안에서 참조하지도 않는다** (→ 설계 판단 2) |
| `20260819000015_queue_order.sql` `matches.queue_order` | `bigint not null default nextval(...)`, `matches_queue_idx(tournament_id, queue_order)` | **그대로 재사용.** 대기 순번의 근거가 이미 있고 인덱스도 있다 |
| `src/lib/schedule.ts` `queuePosition` | 코트 대기열에서 몇 번째인가 (1부터) | **그대로 재사용.** 새 순번 규칙을 서버에 만들지 않는다 — `notify_up_next` 와 같은 줄을 세야 한다는 경고가 이미 이 함수 주석에 붙어 있다 |
| `src/features/match/useRealtimeMatches.ts` | `postgres_changes` 로 `matches` 구독 | **게스트는 쓸 수 없다.** 구독은 구독 롤의 RLS 를 그대로 타므로, anon 에게 열려면 `matches` 에 anon SELECT 정책이 필요하고 그 정책은 PostgREST 직접 조회에도 똑같이 열린다 (→ 설계 판단 3) |
| `src/features/match/CourtBoard.tsx` | `useClaimCourt` 뮤테이션 · 경기 링크 · 대기열 모달 | **한 줄도 안 고치고 재사용도 안 한다.** 게스트 화면의 요구가 "아무것도 누를 수 없다" 라 이 컴포넌트의 모든 분기와 정반대다 (→ 설계 판단 7) |
| `src/pages/GuestJoinPage.tsx` | 완료 화면에 되돌아갈 곳이 없다 | 완료 화면에 **현황판으로 가는 버튼 하나**. 자동 이동은 하지 않는다 — 접미사 붙은 이름을 읽을 시간을 뺏는다 |
| `src/features/guest/api.ts` `guestSupabase` | `persistSession:false` · `autoRefreshToken:false` · `detectSessionInUrl:false` | **그대로 재사용.** 새 클라이언트를 또 만들지 않는다 — 셋 중 하나만 켜져도 로그인 세션이 딸려 들어와 42501 이 된다 |
| `src/app/routes.tsx` | 가드 밖 라우트는 `/login` · `/auth/callback` · `/g/:guestCode` 셋 | `/g/:guestCode/:sessionId` 를 **같은 자리**에 추가. 넷이 된다 |
| `src/lib/guest.ts` `GuestErrorCode` | `bad_code` · `no_open_session` · `session_closed` · `bad_name` · `guest_limit` · `unknown` | `board_closed` 하나만 더한다. **빈 문구가 나오는 일은 없게** 하는 규율은 그대로 |
| `scripts/verify-schema.ts` | anon 권한 검사가 대회 RPC 에 대해서만 있다 | **"anon 이 execute 할 수 있는 public 함수 집합"** 검사를 추가한다 (아래 정정 참고) |
| `20260828000002_...search_path.sql` | `gen_guest_code` 만 `public, extensions, pg_temp` | 이번 함수는 pgcrypto 를 안 부르므로 `public, pg_temp` 로 충분하다. **다만 나중에 누가 이 함수에 `digest`·`gen_random_bytes` 를 더하면 즉시 죽는다** (→ Risks) |
| `clubs.guest_code` · `tournament_members.is_guest` | 마일스톤 3 이 만든 컬럼 | **컬럼을 하나도 더하지 않는다.** 더하는 순간 "not null 로 만든 쪽이 채우는 책임도 진다" 를 다시 지켜야 하고, 마일스톤 3 이 정확히 거기서 프로덕션을 깼다 (→ Risks) |

## 설계 판단 여덟 가지

> **착수 중 정정 — "정확히 셋" 은 틀렸다. 넷이다.**
>
> 계획 단계에서 anon 이 실행할 수 있는 public 함수를 게스트 RPC 셋으로
> 적었는데, 프로덕션을 실제로 조회하니 **`is_direct_api_call()` 이 넷째로
> 있다.** 이건 `20260819000001_fix_guard_permission.sql` 의 의도된 결정이다 —
> 가드 트리거는 SECURITY INVOKER 여야만 발동하고(DEFINER 로 바꾸면 트리거
> 안에서 `current_user` 가 postgres 가 되어 가드가 **영영 안 걸린다**),
> 그래서 호출자 권한으로 이 함수를 부를 수 있어야 한다. 예전에 이 EXECUTE 를
> 걷었다가 주최자의 정상 수정이 통째로 막혔다.
>
> 노출되는 것은 "당신이 authenticated 인가" 불리언 하나뿐이라 위험이 없다.
> **걷지 않고, 검사를 개수가 아니라 집합으로 바꿨다** — 개수보다 강한
> 검사다(새 함수가 anon 에 새면 여전히 걸린다). 트리거 함수는 PostgREST 가
> 노출하지 않으므로 `prorettype <> 'trigger'` 로 제외한다.

### 1. 이번에도 **정책 0개**다. 읽기라고 다르지 않다

"쓰기니까 위험했던 것이고 읽기는 정책을 열어도 되지 않나" 는 틀렸습니다 — **`is_direct_api_call()` 의 붕괴는 롤에서 오는 것이지 동작 종류에서 오는 것이 아닙니다.**

| 안 | 모양 | 실제로 열리는 것 |
|---|---|---|
| A. `matches`·`courts` 등에 anon SELECT 정책 | `for select to anon using (...)` | **PostgREST 직접 조회가 함께 열린다.** `GET /rest/v1/matches?select=*` 로 안 싣기로 한 컬럼(`created_by`·`updated_by`·`source`·`edited_at`)이 전부 나간다. `select=*,tournament_members(*)` 같은 임베드까지 열린다 |
| B. **정책 0개 + SECURITY DEFINER RPC 하나** | `guest_board(p_code, p_session_id)` 에만 `grant execute to anon` | 함수 하나의 **인자와 반환 필드 목록**으로 한정된다 |

**B 를 고릅니다.** 되돌리기도 `revoke execute ... from anon` 한 줄입니다.

> ⚠ `tournament_members` 에 anon SELECT 를 열면 **그날 온 사람 전원의 `display_name` 이 한 번의 GET 으로 나갑니다.** 이 마일스톤이 가장 피해야 할 결과가 바로 그것이고(→ 설계 판단 6), 정책은 "코트에 편성된 사람만" 같은 조건을 표현하기에 좋은 도구가 아닙니다.

### 2. `match_overview` 뷰는 **anon 에 열지도, definer 함수 안에서 쓰지도 않는다**

1. **뷰가 실어 나르는 필드가 우리가 싣기로 한 것보다 훨씬 많습니다.** `referees` · `group_a_name` · `target_a` · `deuce_a` · `edited_at` · `source` … 뷰를 쓰면 "필드 하나가 곧 노출 표면" 이라는 규율이 **첫 줄에서 무너집니다.**
2. **`security_invoker` 뷰의 권한 해석이 함수 소유자에 따라 갈리는 자리입니다.** **보안 경계를 "이 함수가 지금 누구 소유인가" 같은 배포 시점 값 위에 세우지 않습니다.**

`guest_board` 는 `matches` · `courts` · `match_teams` · `match_team_players` · `tournament_members` 를 직접 조인해 **필요한 컬럼만** 뽑습니다. 뷰 정의는 한 줄도 안 고칩니다.

### 3. 실시간 — **Realtime 은 못 쓴다. 폴링 10초.**

`postgres_changes` 구독은 **구독 롤의 RLS 를 그대로 탑니다.** anon 에게 열려면 `matches` 에 anon SELECT 정책이 필요하고, 그건 설계 판단 1 의 A안 그 자체입니다. 선택지가 아닙니다.

| 주기 | 근거 | 판단 |
|---|---|---|
| 3~5초 | `useMatchScoring` 이 진행 중 경기에 5초를 쓴다 | **과하다.** 그건 채점자 한 명의 화면이고, 여기는 코트 옆 사람 전원이 동시에 켜 두는 화면이다 |
| **10초** | 앱 전역 `staleTime: 10_000` 과 같은 값 | **권고.** 이미 앱이 "10초면 최신" 이라고 판단한 값이라, 게스트만 다른 감각을 갖지 않는다 |
| 30초+ | 부하 최소 | 21점 경기의 점수가 30초 뒤에 뜨면 "고장났나" 가 된다 |

**레이트리밋을 못 거는 상대**이므로 호출 자체를 줄이는 장치 셋을 답니다.

1. **화면이 안 보이면 멈춘다** — react-query 의 `refetchIntervalInBackground` 기본값이 `false` 다. **이 기본값에 의존한다고 주석에 명시**한다
2. **끝난 모임이면 폴링을 끈다** — `refetchInterval: (q) => 살아있나 ? 10_000 : false`
3. **응답 자체를 작게 유지한다** — 끝난 경기는 개수만. 모임이 길어질수록 payload 가 자라는 구조를 만들지 않는다

> 게스트 20명이 각자 한 탭을 켜 두면 초당 2회다. 이 수치가 문제가 되는 순간은 게스트가 아니라 **링크가 유출된 순간**이고, 그때의 답은 주기 조절이 아니라 `rotate_guest_code` 다.

### 4. 게스트가 자기 이름을 다시 알려주는 방법 — **localStorage. 그리고 그것은 권한이 아니다**

**서버는 이름을 받지 않습니다.** 이름은 오직 화면에서 자기 경기를 강조하는 데만 쓰이고, 이름이 없어도 현황판은 **똑같이 전부 보입니다.**

| 안 | 문제 |
|---|---|
| A. 안 한다 (눈으로 찾는다) | "내 차례까지 몇 경기" 를 만들 수 없다. 코트 4개 × 대기 5경기면 눈으로 못 찾는다 |
| B. **localStorage** | 브라우저 청소·시크릿창이면 사라진다 → 한 칸 입력으로 다시 받는다. **잃어도 잃는 게 강조뿐이다** |
| C. 링크에 싣는다 | **이름이 URL 에 남는다** — 카톡 미리보기·리퍼러·액세스 로그. 공유하면 남의 화면이 내 이름으로 강조된다 |
| D. 게스트 토큰 | **확정 결정 3(개인 링크 없음)이 금지한다.** 얻는 것이 강조 하나 |

**B 를 권고합니다.** 설계 셋을 못 박습니다.

- **키에 `sessionId` 를 넣는다.** 다음 주 모임에 지난주 이름이 따라붙으면 엉뚱한 사람을 강조한다
- **저장하는 값은 서버가 돌려준 최종 `display_name`.** 접미사가 붙었으면 원문으로는 매칭이 안 된다
- **읽기·쓰기를 전부 try/catch 로 감싼다.** 시크릿 모드에서 접근 자체가 예외를 던진다. **현황판이 이 값 때문에 안 뜨는 일은 없어야 한다**

이름 칸은 **서버에 아무것도 보내지 않습니다.** 이미 받은 목록과 문자열 비교만 하므로 **명단 탐색 도구가 되지 않습니다** — 애초에 명단을 안 보내기 때문입니다.

### 5. 주소 — **`/g/:code` 는 등록 입구, `/g/:code/:sessionId` 는 현황판**

| 안 | 판단 |
|---|---|
| A. `/g/:guestCode` 하나 | **어느 모임의 현황인지를 주소가 못 담는다.** 후보가 둘인 날은 새로고침마다 다시 고른다. "등록했나" 를 localStorage 로 판단하게 되어, 저장소가 막힌 브라우저에서 영영 등록 화면에 갇힌다 ✗ |
| B. **둘로 가른다** | 새로고침·재열기가 정확히 그 모임으로 돌아온다. **뿌리는 링크는 여전히 `/g/:code` 하나** ✓ |
| C. 별도 접두사 | 링크가 둘이 되어 운영진이 뿌릴 것이 는다 ✗ |

주소의 두 조각이 `guest_board(p_code, p_session_id)` 의 인자와 1:1 로 맞아, **"지금 무엇을 보고 있는가" 가 주소 하나로 완전히 복원됩니다.**

링크를 다시 열었을 때(`/g/:guestCode`):

```
마지막에 본 sessionId 가 있고, 그게 guest_sessions 후보에 아직 있으면
    → /g/:code/:sessionId 로 replace 이동
아니면 → 지금 그대로 등록 화면
```

- **`replace` 다.** `push` 면 뒤로가기가 등록↔현황판을 무한 왕복한다
- **후보에 있는지 확인하고 넘긴다.** 저장값만 믿으면 끝난 모임 주소로 보내 놓고 "지난 모임입니다" 만 보게 된다
- **마지막 sessionId 에 36시간 만료.** 창 판단은 서버가 하게 조금 넓게 둔다

등록 완료 화면에는 **"코트 현황 보기" 버튼 하나.** 자동 이동은 하지 않습니다 — 최종 이름을 읽을 시간을 뺏습니다.

### 6. 반환 필드 — 여기가 이 마일스톤의 전부다

**싣는 것**(이게 전부다):

```
{ ok: true,
  club_name,
  session: { id, name, starts_at, status },     -- 'live' | 'finished'
  courts:  [{ id, name, sort_order }],
  matches: [{ id, court_id, status, queue_order, started_at,
              score_a, score_b, players_a[], players_b[] }],
  finished_count }                              -- 끝난 경기는 목록이 아니라 숫자다
```

**안 싣는 것과 그 이유** — 이 표가 이 계획서에서 가장 중요합니다.

| 안 싣는 것 | 왜 |
|---|---|
| **명단 전체 (`tournament_members`)** | **이 마일스톤이 가장 피해야 할 결과다.** 실으면 링크 하나로 **그날 그 동아리에 온 사람 전원의 표시명**이 나간다. `profiles` 를 완전 비공개로 유지해 온 것이 이 한 필드로 무의미해진다. 게스트가 알아야 하는 것은 "지금 코트에서 누가 치나" 이지 "오늘 누가 왔나" 가 아니다. **코트에 편성된 사람 이름만 나간다** |
| **끝난 경기 목록** | (1) 게스트의 질문은 "지금" 과 "다음" 이다. 지난 기록은 로그인 사용자 화면이 할 일이다. (2) **모임이 길어질수록 payload 가 무한정 자라는데, 레이트리밋을 못 거는 anon 이 10초마다 부르는 경로다.** `finished_count` 숫자만 |
| `referees` | 모임에는 심판이 없다. 항상 빈 배열 |
| `group_*` · `is_joker` | 모임 경기는 `group_id` 가 NULL 이다. 항상 NULL |
| `target_score` · `deuce` · `max_score` | 게스트는 점수를 넣지 않으므로 목표 점수를 알 이유가 없다 |
| `member_id` · `user_id` | **절대.** 사람을 가리키는 키가 한 번 나가면 다음 마일스톤이 그걸 근거로 무언가를 하게 된다. 게스트에게 사람은 **문자열 이름**이다 |
| `invite_code` · `guest_code` · `club_id` | 코드가 응답에 실리면 화면 캡처 한 장으로 링크가 샌다 |
| `label` | 사람이 자유롭게 적는 칸이다. **자유 입력 필드는 노출 목록에 넣지 않는다** |
| `created_by` · `updated_by` · `edited_at` · `source` | 운영 메타데이터. 그릴 자리가 없다 |

**`started_at` 은 싣습니다.** 대기자의 진짜 질문이 "내 앞 경기가 언제 끝나나" 이고, 없으면 "내 차례까지 3경기" 가 시간 감각 없는 숫자가 됩니다. 사람을 가리키지 않습니다.

**점수는 보여주되 `scored` 로 판단하지 않습니다.** `matches.scored` 는 `not null default true` 라 **진행 중에는 점수를 한 번도 안 넣은 경기도 `true`** 입니다. 화면 규칙은 **`score_a + score_b > 0` 이면 점수, 아니면 "진행 중"** 이고, `src/lib/guestBoard.ts` 순수 함수에 넣고 테스트합니다.

> **왜 점수를 아예 빼지 않는가**: 점수는 개인을 가리키지 않는 숫자라 노출 위험이 0 에 가깝고, 코트 옆에서 가장 자주 묻는 것입니다. **노출 표면을 줄이는 노력을 위험하지 않은 필드에 쓰면, 정작 위험한 필드를 줄일 여력이 없어집니다.**

**페이로드 상한**: 경기 목록에 `limit 200`. **anon 이 무제한 호출하는 경로에는 상한 없는 쿼리를 두지 않습니다.**

**새 인덱스는 필요 없습니다.** `matches_queue_idx` · `courts_tournament_idx` · `mt_match_idx` · `match_team_players` PK 가 이미 덮습니다. Task 1 에서 `explain` 으로 확인하고, 안 덮이면 그때만 더합니다.

### 7. 끝난 모임을 열면 — **보이되, 창 밖이면 안 보인다**

읽기 필터는 등록 필터에서 **`status` 하나만** 넓힙니다.

```
club_id = (그 guest_code 의 동아리)
and kind = 'session'
and status in ('live', 'finished')        -- ← 여기만 넓힌다
and (starts_at is null
     or starts_at between now() - interval '12 hours'
                      and now() + interval '24 hours')   -- 등록과 똑같은 창
```

**읽기 필터를 등록 필터의 정확한 상위집합으로 둡니다.**

- 좁히면 **"등록은 됐는데 현황판이 안 보인다"** — 코트 앞에 선 게스트를 실제로 막는, 가장 나쁜 실패 모드
- 넓히면 오래된 링크로 **지난 모임의 편성 이름을 계속 열람**할 수 있다

| 상태 | 게스트가 보는 것 |
|---|---|
| `live` | 코트별 현재 경기 · 대기열 · 내 차례 |
| `finished` | "오늘 모임이 끝났습니다" + 코트별 완료 개수. 등록 입구로 가는 줄도 두지 않는다 |
| 창 밖 · 다른 동아리 · 대회 · 없는 id | `board_closed` **하나로 합친다** + 등록 입구로 가는 줄 |

> **왜 하나로 합치나**: 구별해서 돌려주면 임의의 UUID 로 **"이 동아리에 이 모임이 있나" 를 알아내는 탐색기**가 됩니다.

> **알아 두는 구멍(이번에 안 고친다)**: `starts_at is null` 인 즉석 모임은 시각 창을 무조건 통과합니다 — 마일스톤 3 부터의 동작입니다. `coalesce(starts_at, created_at)` 이 옳지만, 그러면 **등록 필터도 같이 고쳐야 상위집합이 유지되고** 마일스톤 3 회귀 25항목이 통째로 다시 필요합니다. **별건으로 `docs/todo.md` 에 남깁니다.** 새로 여는 표면이 아닙니다.

### 8. 대기 순번은 **서버가 세지 않는다**

`queuePosition` 주석에 이미 경고가 있습니다 — `notify_up_next`(SQL)와 화면이 **같은 줄을 세야 하고, 한쪽만 바꾸면 화면에 3번인 사람에게 알림이 갑니다.** 세 번째 셈법을 서버에 만들면 어긋날 자리가 셋이 됩니다.

**서버는 `queue_order` 만 싣고 정렬해서 보냅니다.** 순번은 클라이언트가 기존 `queuePosition` 으로 셉니다.

**공용 대기(`court_id is null`)를 코트마다 복제하지 않습니다.** `CourtBoard` 는 모든 코트에 함께 띄우는데(먼저 비는 코트가 집어가므로 옳다), 게스트 화면에서 그러면 **"대기 2번" 이 코트 넷에 동시에 뜹니다.** 게스트는 코트를 집어갈 수 없으므로 혼란만 남습니다. **"아직 코트 미정" 한 줄로 따로** 냅니다.

"내 차례까지 N경기" 는 **내 이름이 든 가장 앞선 `scheduled` 경기**로 계산합니다.

- 코트에 붙어 있으면 → **"3번 코트 · 앞에 2경기"**
- 코트 미정이면 → **"코트가 정해지지 않았습니다"** (숫자를 내지 않는다 — 어느 코트가 먼저 빌지 모르는데 숫자를 내면 거짓말이다)
- 지금 뛰고 있으면 → **"지금 3번 코트"**
- 이름이 없거나 편성이 없으면 → 카드 자체를 안 그린다

## Patterns to Mirror

| 범주 | 근거 | 패턴 |
|---|---|---|
| 마이그레이션 이름 | `20260828000001_guest_registration.sql` | `YYYYMMDD00000N_snake_case.sql` + 머리에 '왜' 주석 + 끝에 "만든 것" 요약 |
| 정책 0개 + definer | `join_attempts` · 마일스톤 3 | 테이블 정책 없이 definer 함수만 |
| 예외 대신 봉투 | `guest_sessions` · `join_as_guest` | 실패를 `jsonb {ok,error,message}` 로 |
| 봉투 파싱 | `src/lib/guest.ts` `parseGuestSessions` | 모르는 모양은 `'unknown'`, **빈 문구 금지** |
| anon 전용 클라이언트 | `src/features/guest/api.ts` | 새로 만들지 않고 그대로 쓴다 |
| 폴링 안전망 | `useMatchScoring` | `refetchInterval: (q) => 조건 ? ms : false` |
| 순수 로직 | `src/lib/rsvp.ts` · `schedule.ts` | `lib/` 순수 함수 + `.test.ts`. 화면은 판단하지 않는다 |
| 권한 | `20260828000001` 끝 | `revoke all from public, anon, authenticated` → 필요한 롤에만 `grant` |
| 실DB 검증 | `scripts/smoke-guest.ts` | 번호 붙은 절. anon 클라이언트로 직접 찌른다 |
| 라우트 | `src/app/routes.tsx` `<Public>` | 가드 밖 화면은 `Public` 으로 |

## Files to Change

| 파일 | 동작 | 이유 |
|---|---|---|
| `supabase/migrations/20260829000001_guest_board.sql` | CREATE | `guest_board(text, uuid)` 하나 + revoke/grant. **컬럼 0 · 테이블 0 · 정책 0 · 인덱스 0** |
| `src/types/database.ts` · `database.gen.ts` | UPDATE | `guest_board` 시그니처 · `db:types` 재생성 |
| `src/lib/guest.ts` · `guest.test.ts` | UPDATE | `board_closed` · `parseGuestBoard` · `guestBoardUrl` |
| `src/lib/guestBoard.ts` · `.test.ts` | CREATE | 코트별 묶기 · 공용 대기 분리 · 내 다음 경기 · 점수 표시 판단 |
| `src/lib/guestMe.ts` · `.test.ts` | CREATE | localStorage. 모임별 키 · 만료 · **접근 예외를 삼킨다** |
| `src/features/guest/api.ts` · `queries.ts` | UPDATE | `fetchGuestBoard` · `useGuestBoard`(폴링 10초, 끝나면 정지) |
| `src/pages/GuestBoardPage.tsx` | CREATE | `/g/:guestCode/:sessionId` |
| `src/pages/GuestJoinPage.tsx` | UPDATE | 완료 화면 버튼 · 이름 저장 · 재방문 자동 이동(`replace`) |
| `src/app/routes.tsx` | UPDATE | `Public` 으로 `/g/:guestCode` 옆에 |
| `scripts/smoke-guest.ts` | UPDATE | 절을 **이어 붙인다**. 새 스크립트를 만들지 않는다 |
| `scripts/verify-schema.ts` | UPDATE | **anon 실행 가능 함수 = 정확히 그 넷의 집합** |
| `.claude/prds/club-platform.prd.md` · `docs/todo.md` · `이어서시작.md` · `README.md` | UPDATE | 결과 · 화면 구조 · 즉석 모임 창 구멍 |

> **목록에 없는 것 — 전부 의도입니다.**
> `match_overview` 뷰 · RLS 정책 **전부** · `CourtBoard.tsx` · `useRealtimeMatches.ts` ·
> `guest_sessions` · `join_as_guest` · `rotate_guest_code` · `create_session` ·
> `guard_*` 트리거 전부 · `is_direct_api_call` · `schedule.ts` · `rsvp.ts` ·
> `tournament_members` · `clubs`.

## Tasks

### Task 1 — 읽기 페이로드 RPC (`guest_board`) ← 이 마일스톤의 전부

- `guest_board(p_code text, p_session_id uuid) returns jsonb` — `security definer` `stable` `set search_path = public, pg_temp`. **예외를 던지지 않는다.**
- 순서:
  1. 코드 정규화 + 형식 검사 → 아니면 `bad_code`
  2. `clubs where guest_code = ...` → 없으면 `bad_code`
  3. **설계 판단 7 의 필터**로 모임 한 행 → 없으면 `board_closed`. ⚠ 다른 동아리 · 대회 · 창 밖 · 없는 id 를 **전부 같은 코드**로
  4. `courts` (`order by sort_order`)
  5. `matches where status in ('live','scheduled')` + 조인으로 `players_a`/`players_b` 조립. `order by queue_order, created_at`, **`limit 200`**
  6. `finished_count` — 숫자 하나로만
- **반환 필드를 설계 판단 6 의 목록으로 못 박고, 그 표를 함수 머리 주석에 그대로 옮긴다**
- 권한: `revoke all ... from public, anon, authenticated` → `grant execute ... to anon`. **`authenticated` 에는 열지 않는다** (anon 전용 클라이언트 하나로 셋을 다 부르는 규율)
- `explain` 으로 새 인덱스 필요 여부 확인. 필요 없으면 **안 만든다**
- **Validate**: dry-run → push → `db:types`. smoke 68~74절
- **Risk**: **높음.** 이 함수 하나가 비로그인 읽기 경계 전부다

### Task 2 — 타입 · 순수 로직
- `db:types` 재생성 후 대조 (**선택이 아니다** — 실제로 두 번 잡혔다)
- `lib/guest.ts` 에 `board_closed` + `parseGuestBoard`
- `lib/guestBoard.ts` — **`queuePosition` 을 재사용하고 새 셈법을 만들지 않는다**
- `lib/guestMe.ts` — 모임별 키 · 36시간 만료 · **접근 예외를 삼킨다**
- **Validate**: `npm run typecheck && npm run test`

### Task 3 — 데이터 접근
- `fetchGuestBoard` — **기존 `guestSupabase` 를 그대로**
- `useGuestBoard` — `retry:false` · `refetchInterval: (q) => 살아있나 ? 10_000 : false`.
  **`refetchIntervalInBackground` 를 켜지 않는다는 것을 주석에 명시**

### Task 4 — 화면
- `GuestBoardPage` — **아무것도 누를 수 없다.** 링크 · 뮤테이션 · 모달 없음. `CourtBoard` 재사용 안 함
  - 머리(동아리·모임·시각·상태) · **내 다음 경기 카드** · 코트별 카드 · "아직 코트 미정" 줄
  - 이름이 없으면 상단 한 칸: "이름을 적으면 내 경기를 강조합니다" (**서버로 안 보낸다**고 주석에 명시)
- `GuestJoinPage` — "코트 현황 보기" 버튼 · 이름 저장 · 재방문 `replace` 이동. **로그인 유도는 여전히 안 한다**
- **Validate**: `npm run verify`

### Task 5 — 실DB 검증 (`scripts/smoke-guest.ts` 68번부터 이어 붙임)

*통로* 68~72 — 현황 읽기 · 점수 · `queue_order` 순 · 코트 미배정이 한 번만 · 끝난 경기는 개수만 · 끝난 모임은 `ok:true`

*보안 경계 — 관문*

73. **반환 JSON 의 키가 설계 판단 6 목록과 정확히 일치한다** (`referees`·`member_id`·`user_id`·`label`·`target_*`·`invite_code`·`club_id` 가 **어디에도 없다** — 키 전수 검사)
74. **편성되지 않은 참가자의 이름이 응답에 없다** ← **이 마일스톤에서 가장 중요한 한 줄**
75. anon 이 `match_overview` 를 직접 SELECT 하지 못한다
76. anon 이 `matches`·`courts`·`match_teams`·`match_team_players`·`tournament_members`·`score_events` 를 직접 못 읽는다
77. 다른 동아리 · 대회 · 없는 UUID 가 **전부 `board_closed` 하나로** (코드가 갈리지 않는 것까지)
78. 시각 창 밖은 `board_closed`
79. **틀린 코드 + 맞는 session_id 가 거절된다**
80. **맞는 코드 + 다른 동아리의 session_id 가 거절된다**
81. **anon 실행 가능 public 함수가 정확히 그 넷의 집합** ← 착수 중 정정. 아래 상자
82. 재발급하면 **옛 코드로 현황판도 즉시 안 열린다**
83. 게스트는 여전히 아무것도 못 쓴다 (`record_score`·`finish_match`·`claim_court`·`set_court_queue`)

*회귀* 84~85 — 로그인 사용자 현황판 무변경 · 마일스톤 3 등록 통로 1~67절 전량

### Task 6 — 문서
`docs/todo.md` 마일스톤 4 ✅ + "실제로 만든 것" 절. **`scripts/smoke-guest.ts` 절 번호가 정본.**
PRD Open Questions → Decisions 승격. **즉석 모임 시각 창 구멍**을 별건으로 남긴다.

## Validation

```bash
npm run verify
npm run db:push             # dry-run 먼저
npm run db:types            # 선택이 아니다
npm run db:verify           # anon 실행 가능 함수 = 정확히 그 넷의 집합
npm run db:smoke:guest      # 1~85절 전량
npm run db:smoke:security   # anon 표면이 늘었으므로 필수
npm run db:smoke:match      # match_overview 무변경 증명
npm run db:smoke:session / club / rsvp / roster / notify
```

## Risks

| 리스크 | 확률 | 완화 |
|---|---|---|
| **참가자 실명이 링크 하나로 전부 샌다** | **높** | 명단을 안 싣는다. **코트에 편성된 사람 이름만.** smoke 74번이 정면 검사. **이 마일스톤의 유일한 진짜 관문** |
| **반환 필드를 하나씩 늘리다 노출 표면이 조용히 커진다** | 높 | 설계 판단 6 표를 함수 주석에 박고 smoke 73번이 **키 전수 검사** |
| **`match_overview` 를 definer 안에서 써서 안 실을 필드가 딸려 나간다** | 중 | 뷰를 참조하지 않는다. 테이블 직접 조인 + 컬럼 명시 |
| **anon 에 정책을 열어 가드 3종이 무력화** | 중 | 읽기라고 예외를 두지 않는다 — 붕괴는 롤에서 오지 동작 종류에서 오지 않는다 |
| **Realtime 을 열려고 `matches` 에 anon 정책을 만든다** | 중 | 폴링. **그 정책은 PostgREST 직접 조회에도 함께 열린다**를 마이그레이션 주석에 |
| 🔴 **`extensions` search_path 함정** | 중 | 이번 함수는 pgcrypto 를 안 부른다. **함수 머리에 "pgcrypto 함수를 여기 추가하려면 `extensions` 를 search_path 에 먼저 넣어라" 를 주석으로 박는다.** `20260828000002` 가 정확히 이 함정으로 **동아리 생성 전체**를 막았다. `gen_random_uuid()` 는 코어라 멀쩡히 돌아 더 늦게 드러난다 |
| 🔴 **not null 컬럼의 채우는 책임** | 중 | **컬럼을 하나도 더하지 않는 것이 이 계획의 결정.** 그래도 더하면 `grep -rn "insert into <table>"` 로 **모든** INSERT 경로를 찾아 같은 마이그레이션에서 채운다. 리뷰 질문은 "backfill 했나" 가 아니라 **"이 마이그레이션 이후 새로 만들어지는 행이 모든 제약을 만족하는가"** |
| **레이트리밋 없는 anon 이 10초마다 때린다** | 중 | 응답을 작게 · 백그라운드 정지 · 끝난 모임 정지. 유출되면 답은 `rotate_guest_code` |
| **`scored` 로 판단해 모든 경기에 `0 : 0`** | 중 | `score_a+score_b>0` 으로 판단하고 순수 함수에서 테스트 |
| **공용 대기가 코트마다 복제** | 중 | 별도 줄로. smoke 70번 |
| **대기 순번 셈법이 셋으로 갈린다** | 중 | 서버가 안 센다. `queuePosition` 하나 |
| **`localStorage` 예외로 현황판이 통째로 안 뜬다** | 중 | try/catch, 실패는 "이름 없음". 이름은 강조 전용 |
| **다음 주에 지난주 이름이 따라붙는다** | 중 | 키에 `sessionId`. 마지막 모임 키에 36시간 만료 |
| **자동 이동이 뒤로가기 무한 왕복** | 중 | `replace` + 후보 목록 확인 후 이동 |
| **오류 코드를 갈라 탐색기가 된다** | 낮 | `board_closed` 하나. smoke 77번 |
| **가드 안에 라우트를 두어 게스트가 못 연다** | 중 | `Public` 으로. 실기기 확인 항목에 |

## Non-goals (마일스톤 4 에서 하지 않음)

- **게스트 쓰기 전부** — 지금 코드가 이미 셋으로 막고 있다. **이번에 그 셋 중 어느 것도 건드리지 않는다**
- **게스트 알림** — 계정이 없어 **보낼 곳이 없다.** 억지로 열면 마일스톤 3 의 "전역 차단 DoS" 와 같은 종류의 구조적 오류를 다시 만든다
- **출석 체크인** → 3단계 · **자동 편성** → 4단계 ("내 차례까지 N경기" 는 있는 대기열을 읽어 보여줄 뿐 순서를 만들지 않는다)
- **게스트 계정 전환 · 지난 기록 잇기** → 확정 결정 6 의 직접 귀결
- **명단 화면 · 참가자 목록** → 설계 판단 6
- **끝난 경기 기록 · 전적 · 순위** → 로그인 사용자의 화면. 모임에는 순위가 없기도 하다
- **Realtime** → 설계 판단 3 · **개인 링크·토큰** → 확정 결정 3
- **대회 현황판** — 게스트는 모임 전용. `kind='session'` 을 읽기에서도 유지
- **모임마다 게스트 스위치** — 운영진 조작이 늘고 켜는 걸 잊으면 게스트가 갇힌다
- **즉석 모임 시각 창 고치기** → 설계 판단 7 의 경고 상자. 별건

## Acceptance

- [ ] 게스트가 로그인 없이 코트별 현재 경기와 대기열을 본다
- [ ] 등록 완료 화면에서 현황판으로 갈 수 있고, 링크를 다시 열면 **그 모임으로 돌아온다**
- [ ] 자기 이름이 강조되고 "내 차례까지 N경기" 가 보인다. **이름이 없어도 현황판은 완전하다**
- [ ] 점수가 10초 안에 갱신된다. 탭을 내리면 멈추고, 끝난 모임에서도 멈춘다
- [ ] 끝난 모임은 "끝났습니다", 창 밖은 `board_closed` 하나
- [ ] **편성되지 않은 참가자의 이름이 응답 어디에도 없다** ← 핵심
- [ ] **반환 JSON 의 키가 설계 판단 6 목록과 정확히 일치한다**
- [ ] **anon 이 테이블·뷰에 직접 도달하지 못한다** — `match_overview` 포함
- [x] **anon 실행 가능 함수가 정확히 그 넷의 집합** (셋 + is_direct_api_call)
- [ ] 게스트는 여전히 점수·심판·코트 잡기를 못 한다
- [ ] 코드를 재발급하면 현황판도 즉시 닫힌다
- [ ] **새 컬럼 0 · 새 테이블 0 · 새 RLS 정책 0**
- [ ] **로그인 사용자의 코트 현황판이 한 글자도 안 바뀌었다**
- [ ] `npm run verify` + `db:verify` + smoke 8종 통과
