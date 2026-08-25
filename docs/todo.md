# TODO

> 지금 어디까지 왔고 다음에 뭘 할지. 화면 구조 · 도메인 규칙 · 겪은 함정은
> [이어서시작.md](이어서시작.md) 에 있습니다.
>
> 마지막 갱신: 2026-08-25 · 브랜치 `feat/session-mode`
> 상위 문서: [`.claude/prds/club-platform.prd.md`](../.claude/prds/club-platform.prd.md) ·
> [`.claude/plans/club-layer.plan.md`](../.claude/plans/club-layer.plan.md)

---

## 지금 상태

```
배포        smash.juganlab.com (Vercel · main 자동 배포)
DB          20260828000002 까지 프로덕션 적용 완료
웹 푸시     send-push Edge Function 배포됨 (HTTP 401 응답 확인)
검증        단위 345 · 실DB 9종 전부 통과 (아래 "검증 명령")
브랜치      feat/session-mode — origin 과 동기 (0ed62b5)
```

| PR | 내용 | 상태 |
|---|---|---|
| [#1](https://github.com/HD152521/smash/pull/1) | 대회 설정 · 듀스 · 대기순번 알림 · 심판 가로보기 · 기록 시각순 | **머지됨** |
| [#2](https://github.com/HD152521/smash/pull/2) | 모임 모드 1단계 — 이후 동아리 계층이 같은 브랜치에 쌓였습니다 | **열림 — 머지 대기** |

> DB 마이그레이션은 **이미 프로덕션에 올라가 있습니다.** 코드만 따라가면 됩니다.
> 머지가 늦어도 대회 쪽은 멀쩡합니다 — 모임·동아리 함수는 전부 새로 추가된 것이고,
> 기존 함수 중 손댄 것은 `guard_tournament_update` 에 잠금 컬럼 하나를 더한 것뿐입니다.

---

## 동아리 플랫폼화 (2단계) — 마일스톤 현황

```
마일스톤 1  동아리 그릇       ✅ 완료
마일스톤 2  참가 신청          ✅ 완료 — 아래 "마일스톤 2가 실제로 만든 것"
마일스톤 3  게스트 등록       ✅ 완료 — 아래 "마일스톤 3 이 실제로 만든 것"
마일스톤 4  게스트 읽기 전용   ⬜ 미착수  ← 다음 차례
```

> **마일스톤 2의 이름이 바뀌었습니다.** 원래 "회원 명단 재사용" 이었는데,
> 설계 대화에서 **"모임을 미리 만들고 회원이 참가를 누른다"** 로 구체화됐습니다
> (소모임 앱의 정모 참석 모델). 명단 재사용은 그 안에 포함됩니다 —
> 참가를 누르려면 먼저 명단에 있어야 하니까요.

| 커밋 | 내용 |
|---|---|
| `d8496f5` | 2단계 PRD |
| `2f4e3dd` | 권한 모델 결정 + PRD 사실 오류 정정 |
| `c67aeec` | 1b 구현 계획서 |
| `fb21eff` | 동아리 계층 마이그레이션 838줄 (Task 1~4) |
| `8e74f7b` | **Task 5** 타입 · 순수 로직 · 데이터 접근 |
| `75b20f5` | **Task 7** 실DB 검증 18절 89항목 |
| `26ab03e` | **Task 6** 화면 9종 + Task 8 DB 적용 · 전 검증 |
| `5f3efd5` | **Task 9** 문서 갱신 + todo 통합 (마일스톤 1 완료) |
| `30e028b` | **마일스톤 2-A** `starts_at` · `rsvp` · `create_session` 확장 · `set_my_rsvp` |
| `9adead5` | **마일스톤 2-C** 실DB 검증 61항목 + rsvp 를 모임 전용으로 굳힘 |
| `0ed62b5` | **마일스톤 2-D** 참가 화면 · 시각 분기 · `lib/rsvp.ts` |
| `ff352a8` | **마일스톤 3** 계획서 |
| `d57abbb` | 게스트 등록 마이그레이션 650줄 (Task 1~4, 리뷰 반영 후) |
| `965750c` | 차단 버그 — `create_club` 이 `guest_code` 를 안 채우던 것 |
| `a4f1485` | **Task 7** 실DB 검증 25항목 |
| `26ab02c` | **Task 5** 타입 · 순수 로직 · 데이터 접근 |
| `f85d287` | **Task 6** 화면 (`/g/:guestCode` · 링크 발급·재발급 · 게스트 배지) |
| `885a8ca` | `gen_random_bytes` search_path 수정 + DB 적용 · 전 검증 |

### 마일스톤 1b 가 실제로 만든 것

| Task | 무엇 | 상태 |
|---|---|---|
| 1~4 | 마이그레이션 838줄 (`20260826000001_club_layer.sql`) | ✅ |
| 5 | `src/lib/club.ts` · `src/types/database*.ts` · `src/features/club/{api,queries}.ts` | ✅ |
| 6 | 화면 — `/clubs` · `/clubs/new` · `/clubs/join` · `/c/:clubId` + 만들기 화면의 소속 고르기 | ✅ |
| 7 | `scripts/smoke-club.ts` · `npm run db:smoke:club` — 18절 89항목 | ✅ |
| 8 | 프로덕션 적용 + 회귀 전량 (`match` · `session` · `roster` · `security` · `notify` · `db:verify`) | ✅ |
| 9 | 문서 갱신 (이 파일 · `이어서시작.md` · `README.md` · PRD) | ✅ |

검증 결과 (커밋 `26ab03e` 기준):

```
verify            typecheck · lint · 단위 279 · CSP · build
db:smoke:club     89     db:smoke:match    44     db:smoke:session  23
db:smoke:roster   23     db:smoke:security 37     db:smoke:notify   26
db:verify         11
```

> **회귀 3종(match · session · roster)이 이번 작업의 진짜 관문이었습니다.** PRD 에서
> 유일하게 계측 가능한 성공 지표가 "기존 대회·모임 동작 회귀 0건" 이고, 셋 다 통과했습니다.

### 마일스톤 2 가 실제로 만든 것

**모임을 미리 만들어 두면 동아리 회원이 참가/불참을 누르고, 시각이 되면
참가한 사람들이 그대로 그날의 명단이 된다.**

```
tournaments        + starts_at   timestamptz          모임 시각. NULL = 즉석 모임
tournament_members + rsvp        invited|going|declined

create_session      동아리 회원 **전원** 을 심는다 (전에는 운영진만)
                    만든 사람만 going, 나머지는 invited
                    + p_starts_at (맨 뒤 default null)
set_my_rsvp         본인 행만 · 모임에서만 · 멱등
tm_fill_rsvp        대회 행은 언제나 going (트리거)
```

화면: `src/lib/rsvp.ts` · `features/tournament/SessionRsvpPanel.tsx` ·
`CreateSessionPage`(시각 입력) · `TournamentPage`(시작 전/후 분기) ·
`SessionMatchCreatePage`(참가자 먼저)

#### 판단 넷 — 다시 논하지 말 것

1. **크론이 필요 없다.** 미리 심어두고 상태만 바꾼다. 시각이 되면 화면이 바뀔 뿐
   데이터는 이미 준비돼 있다. **서버는 시각을 판단하지 않는다** — 화면이 사용자
   시계로 판단한다. 시간에 의존하는 서버 상태 전환은 시계가 어긋나는 순간
   디버깅이 불가능해진다
2. **미리 심는 것은 선택이 아니다.** `tournaments_select` 가
   `is_tournament_member(id)` 뿐이라, 안 심으면 동아리 회원에게 **모임 자체가
   안 보이고** 참가 버튼에 도달할 수 없다
3. **참가는 게이트가 아니라 기본값이다.** 안 누르고 온 사람도 경기에 넣을 수
   있다. 누르지 않으면 못 치게 하는 앱은 동아리에서 미움받는다
4. **`rsvp` 는 모임 전용.** 대회 행은 트리거가 항상 `going` 으로 맞춘다.
   대회 화면에서 이 컬럼을 읽으면 안 된다

#### 하지 않은 것

- **반복 일정(매주 화 20:00 자동 생성)** — 아무도 안 오는 유령 모임을 매주
  만들어낸다. 손으로 만드는 게 실제로 귀찮은지 보고 판단한다
- **정원 마감** — 코트를 넘으면 더 기다릴 뿐이지 못 오게 할 일이 아니다
- **참가 마감 시각** — 늦게 누르는 게 정상이다
- **`starts_at` 검증** — 과거 시각도 받는다. 어제 친 모임을 나중에 기록하는 게
  정상 경로다. "미래여야 한다" 를 서버가 우기면 시계가 어긋난 기기에서
  정상 개설이 막힌다

#### 화면이 틀리기 쉬운 자리 (smoke 61항목이 확인한 것)

- **`42501` 은 "권한 없음" 이 아니라 "이 모임 명단에 당신이 없다"** 다.
  명단은 **생성 시점 스냅샷**이라, 모임이 열린 뒤 동아리에 들어온 사람이 여기
  걸린다. `toUserMessage` 의 공용 표를 고치지 말고 `lib/rsvp.ts` 에서 덮는다
- **계정 없는 회원(`user_id is null`)을 '미정' 으로 세지 마라.** 누를 주체가
  없어서 매주 유령 미응답자가 잡힌다. `countRsvp` 가 네 칸으로 센다
- **`hasStarted` 는 못 읽는 값을 `true` 로 본다.** `false` 면 값이 깨진 순간
  아무도 빠져나올 수 없는 대기 화면에 갇힌다
- `starts_at` **직접 PATCH 는 RLS 로 0행이 걸러져도 200 + `[]`** 다.
  상태코드가 아니라 반환 행 수로 판정할 것

---

### 마일스톤 3 이 실제로 만든 것

**계정 없는 사람이 동아리 상시 링크로 그날 모임 명단에 스스로 들어온다.**
운영진 타이핑 0회.

```
clubs              + guest_code   22자 base32. invite_code 와 다른 코드다
tournament_members + is_guest     화면 배지·상한 계산 전용. 권한 판단에 안 쓴다

guest_sessions(p_code)                        anon. 후보 모임 목록 (필드 셋만)
join_as_guest(p_code, p_session_id, p_name)   anon. 등록
rotate_guest_code(p_club_id)                  운영진. 링크 회수
```

화면: `/g/:guestCode`(로그인 가드 **밖**) · `ClubPage` 링크 발급·재발급 ·
`MembersPage` 게스트 배지 · `src/lib/guest.ts`(봉투 파싱)

검증: `db:smoke:guest` **67항목** · 회귀 전량 통과
(club 89 · security 37 · rsvp 61 · match 44 · session 23 · roster 23)

#### 판단 다섯 — 다시 논하지 말 것

1. **RLS 정책을 하나도 안 만든다.** `is_direct_api_call()` 은
   `current_user = 'authenticated'` 하나로 정식 경로를 가르는데, anon 은
   `'anon'` 이라 **거짓**이 된다. 그 순간 `guard_tournament_update` ·
   `guard_member_update` · `guard_member_delete` 가 전부 "RPC 경로다" 로
   오판해 통과한다. **anon 에 정책을 하나라도 열면 관리자에게도 막힌
   `owner_id` · `role` · `user_id` 변경이 anon 에게 열린다.** definer 함수
   둘에만 grant 하고, 문제가 생기면 `revoke` 한 줄로 닫는다
2. **레이트리밋을 만들지 않는다.** `join_attempts.user_id` 가
   `not null references auth.users` 라 계정 없는 사람은 기록할 수 없다.
   억지로 풀면 카운터가 전 세계 anon 하나로 합쳐져 **열 번 틀린 한 사람이
   모든 게스트를 잠근다**(전역 차단 DoS). 대신 22자 엔트로피 + 모임당 상한 60
3. **그 상한이 유일한 방어선이라 카운트-삽입을 직렬화한다.**
   `pg_advisory_xact_lock(hashtextextended(session_id))`. 코트 앞에서 여럿이
   동시에 링크를 여는 건 정상이고, 락이 없으면 전부 같은 숫자를 읽고 통과한다.
   `tournaments` 행을 잠그지 않는 이유는 같은 모임의 다른 쓰기(경기 시작)와
   경합하기 때문
4. **게스트를 지우지 않는다.** `guard_member_delete` 가 출전 기록 있는 행을
   막아서, 자동 삭제를 켜면 뛴 게스트는 남고 안 뛴 게스트만 사라진다 —
   **결과가 반반인 삭제는 규칙이 아니다.** 그리고 `tournament_members` 는
   원래 모임 하나에 묶인 테이블이라 다음 주는 새 행 집합이다. 지울 것이 없다
5. **`user_id is null` 로 게스트를 판별하지 않는다.** `create_session` 이
   미가입 회원(매주 오는 사람)도 심으므로, 그걸로 배지를 그리면 그 사람들
   전원에게 게스트 딱지가 붙는다. `is_guest` 가 그 둘을 가른다

#### 게스트가 쓰기를 못 하는 것은 코드 0줄로 이미 관철돼 있다

- **심판 불가** — `guard_referee_has_account`(`roster.sql`)가 `user_id is null`
  인 멤버의 심판 지정을 이미 거부한다
- **점수 불가** — `is_match_player` 가 `tm.user_id = auth.uid()` 를 요구한다.
  NULL 은 매칭되지 않고, `auth.uid()` 도 NULL 이면 `NULL = NULL` 은 true 가
  아니라 NULL 이라 `exists` 가 거짓이다. 이중으로 안전
- **나머지 RPC 불가** — anon 에게 grant 가 없다. 정책 이전에 grant 에서 끝난다

### ⚠ Task 7 검사 항목 번호가 문서마다 어긋나 있었습니다

| 어디 | 적힌 개수 | 실제 |
|---|---|---|
| `.claude/plans/club-layer.plan.md` Task 7 | 15개 (1~15) | 착수 시점의 목록. 여기가 계획의 원본입니다 |
| 이 파일의 예전 판 | "17개는 계획서에 있다" | **틀렸습니다.** 계획서엔 15개뿐이고, 16번(브루트포스)은 이 todo 가 나중에 덧붙인 것입니다 |
| `scripts/smoke-club.ts` | **18절 89항목** | 1~17번 + 번호 없는 '추가' 1절 |

실제 구현이 계획서보다 늘어난 자리:

- **16번** 브루트포스가 막히고, 차단된 뒤에도 `join_attempts` 기록이 남는다
  — 계획서에는 리스크 표에만 있었고 검사 항목으로는 없었습니다
- **17번** `remove_club_member` (빼기 · 스스로 나가기)
  — 1b 가 추가한 RPC 넷 중 **유일하게 어디서도 검증되지 않던 것**이라 Task 7 에서 채웠습니다.
  '뺐어도 산하 대회 출전 기록은 남는다' 를 함께 못 박았습니다
- **'추가' 절** 동아리 소속만으로는 산하 대회가 목록에 안 보인다 (의도된 동작)
- 계획서 10·11·12번은 스크립트에서 `10~12` 한 절로 묶여 있습니다

> 앞으로 항목을 더할 때는 **계획서가 아니라 `scripts/smoke-club.ts` 의 번호를 정본**으로 보세요.
> 계획서는 착수 시점에 얼어붙은 문서라 뒤늦게 맞춰 고치지 않습니다.

> 16번에서 한 번 헛짚었습니다. 처음에 `join_attempts` 기록이 11건 이상일 것으로 단정했는데
> 틀렸습니다 — `join_club` 은 `rate_limited` 를 돌려줄 때 기록을 남기지 않고 먼저 return 합니다.
> 차단된 시도까지 기록하면 재시도할 때마다 10분 창이 스스로 밀려 **영구 차단**이 됩니다.
> 카운터는 임계치 10에서 멈추는 게 맞습니다.

---

## 지금 해야 할 것

### 1. 실기기 확인 — 아직 아무도 안 해봤습니다

자동 검증이 잡아낼 수 없는 것들입니다. 코트에서 폰으로 해봐야 압니다.

- [ ] **모임 한 판** — 경기 짜기 → 시작 → 점수 없이 `경기 끝` → 다음 경기에 '곧 차례' 알림
- [ ] **대기 순번 알림** — 앞 경기를 시작했을 때 뒷사람 폰이 울리는가
      (2번째 이하가 되면 울립니다. 관리 → 경기 규칙에서 조절)
- [ ] **심판 화면 가로 보기** — 아이폰(회전 잠금 ON)과 안드로이드 크롬은 경로가 다릅니다.
      아이폰은 CSS 로 돌리고, 안드로이드는 전체화면 + `orientation.lock` 으로 진짜로 돌아갑니다.
      **둘 다 봐야 합니다.**
- [ ] **듀스** — 20:20 에서 안 끝나고 22:20 에 끝나는가. 상한(30점)에 닿으면 1점 차로도 끝나는가
- [ ] **오프라인** — 와이파이를 껐다 켜면서 채점. 대기 큐가 밀리는지, 화면이 안 꺼지는지
- [ ] **동아리 한 바퀴** — 만들기 → 코드 뿌리기 → 다른 폰으로 `/clubs/join` → 산하 모임 열기.
      대회 코드를 `/clubs/join` 에 넣었을 때 안내가 말이 되는지도 같이 보세요

### 2. 웹 푸시가 실제로 나가는지 확인

Edge Function 은 떠 있습니다 (HTTP 401 응답 확인 — 붙어는 있다는 뜻입니다).
VAPID 비밀키(Supabase secrets)와 Vercel 의 `VITE_VAPID_PUBLIC_KEY` 가 실제로
꽂혔는지는 확인이 안 됐습니다.

```bash
npm run db:smoke:push     # 서명·암호화해서 푸시 서비스까지 닿는지
```

앱을 켜 둔 사람에게는 인앱 배너가 이미 뜹니다. 이건 **닫아둬도 오는 알림** 이야기입니다.
아이폰은 홈 화면에 추가한 경우에만 받습니다 (애플 정책).

### 3. 대회 쪽 남은 것

- [ ] **소셜 로그인 (구글·카카오)** — 코드는 이미 준비됨. 대시보드에서 켜면 버튼이 자동으로 나옵니다.
      redirect URI 는 전부 `https://vwocyjuwormeaentdost.supabase.co/auth/v1/callback`
      (앱 도메인이 아닙니다)
- [ ] **순위 동률 시 승자승** — 지금 클라이언트에서 계산 중입니다. 조가 많아지면 SQL 로 옮길 것
- [ ] `Confirm email` 을 다시 켜기 — 지금은 OFF 입니다.
      내장 메일은 시간당 몇 통이라 막혀서 껐는데, 실서비스로 갈 거면 Resend/SES 를 붙이고 켜야 합니다

### 4. 정리하면 좋을 것 (급하지 않음)

- [ ] `MatchCreatePage.tsx` **594줄** — 기준(800줄)을 넘진 않았지만 조 선택·선수 선택·심판 선택이
      한 파일에 있습니다. 모임 편성(`SessionMatchCreatePage`)과 겹치는 부분이 있는지 볼 것
- [ ] `SchedulePage.tsx` **521줄**
- [ ] `eslint-plugin-jsx-a11y` 도입

### 5. 곁다리 — 사용 안내가 낡았습니다

`docs/guide.html` (참가자용 안내, 아티팩트로 배포됨) 이 **"듀스가 없습니다"** 라고
못 박아 두었는데, 그 뒤 대회 설정으로 듀스를 켤 수 있게 됐습니다. 코트 체인지와
'곧 차례' 알림, 동아리 코드로 들어오는 길도 안내에 없습니다. 다음에 뿌리기 전에 고칠 것.

---

## 🔴 마일스톤 3 에서 실제로 프로덕션을 깨뜨린 것 두 가지

둘 다 **정적 리뷰(DB·보안) 두 벌이 통과시켰고, 실행이 잡았습니다.**
리뷰는 "이 코드가 무엇을 깨뜨리나" 를 보고, 실행은 "실제로 되나" 를 봅니다.

### 1. `create_club` 이 `guest_code` 를 안 채웠다

`clubs.guest_code` 를 default 없이 `not null` 로 만들어 놓고 `create_club` 은
그대로 뒀습니다. backfill 은 **기존 행만** 채웠고 **앞으로 들어올 행**은
아무도 채우지 않았습니다. 적용했으면 모든 동아리 생성이 죽었습니다.

> **컬럼을 `not null` 로 만든 쪽이 채우는 책임도 진다.**
> 리뷰 지시에 "이 마이그레이션 이후 **새로 만들어지는 행**이 모든 제약을
> 만족하는가" 를 항목으로 넣으세요. 두 리뷰어 다 backfill 순서는 봤지만
> 그 질문을 안 했습니다.

### 2. `gen_random_bytes` 를 search_path 에서 못 찾았다

`gen_guest_code` 가 `set search_path = public, pg_temp` 로 잠근 채
`gen_random_bytes(22)` 를 불렀습니다. 이건 **pgcrypto** 함수이고 Supabase 는
확장을 `public` 이 아니라 **`extensions`** 스키마에 설치합니다.

```
function gen_random_bytes(integer) does not exist
```

이 함수는 `create_club` 안에서 불립니다. **게스트 기능만이 아니라 동아리
생성 전체가 막혔고**, `db:smoke:club` 첫 항목이 잡았습니다.
`20260828000002` 로 `extensions` 를 search_path 에 더해 복구했습니다.

> **확장이 설치돼 있다는 것과 내 search_path 에서 보인다는 것은 다른 말입니다.**
> `gen_random_uuid()` 가 멀쩡히 돌아 더 늦게 드러났습니다 — 그건 PG13+ 코어
> 내장이라 pgcrypto 와 무관합니다.
> **pgcrypto 함수(`gen_random_bytes` · `crypt` · `digest` 등)를 쓸 때는
> `set search_path` 에 `extensions` 를 반드시 넣으세요.**

## 확정된 결정 (다시 논하지 말 것)

1. **동아리는 명단의 원천이지 권한 축이 아니다.** 기존 권한 헬퍼
   `is_tournament_member` / `is_tournament_admin` / `is_tournament_owner` 를 한 줄도 안 건드린다.
   동아리 운영진이 산하 대회를 만지는 근거는 **생성 시점에 심어진 멤버 행**이다.
   그 귀결로 **나중에 운영진이 된 사람에게는 그 전에 열린 산하 대회가 안 보인다** — 버그가 아니다
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
8. **초대 코드는 두 종류로 두고 입구를 가른다.** `/join` 은 대회 코드, `/clubs/join` 은
   동아리 코드. 한 칸에 둘 다 받는 통합 화면은 만들지 않는다 — 누르기 전에는 어디로
   들어가는지 알 수 없게 된다. 대신 각 화면 아래에 반대쪽으로 가는 줄을 하나 둔다
9. **동아리 역할 이름을 대회 쪽과 겹치지 않게 둔다.** 동아리장·운영진·회원 /
   주최자·관리자·참가자. 한 사람이 두 축에서 서로 다른 역할을 갖는 일이 정상이라,
   같은 단어를 쓰면 지금 어느 축의 권한인지 흐려진다
10-1. **게스트 코드는 재발급한다.** 동아리 코드와 반대다. 게스트 코드는
    그날 온 사람에게 그때 보여주는 링크라, 바꿔도 "아직 안 들어온 회원에게
    뿌린 코드가 죽는" 문제가 없다. `rotate_guest_code` 가 있다
10-2. **게스트 코드와 동아리 코드는 다른 코드다.** 게스트에게 `invite_code` 를
    주면 게스트가 **회원이 되어** `club_members` 에 남는다 — 확정 결정 6 이
    링크 하나로 깨진다
10. **동아리 코드 재발급은 만들지 않는다.** 대회와 달리 코드를 바꾸면 아직 안 들어온
    회원에게 뿌린 코드가 한꺼번에 죽는다. 서버에도 재발급 RPC 가 없다

## 마이그레이션이 담고 있는 것 (`20260826000001_club_layer.sql`)

- `clubs` · `club_members` · `club_role` enum. 정책은 전부 `security definer` 헬퍼 경유
  (**`force row level security` 를 켜면 재귀가 부활한다**)
- `create_club` · `join_club` · `set_club_member_role` · `remove_club_member`
- `tournaments.club_id` (`on delete set null`) + `guard_tournament_update` 에 잠금 추가
- `create_tournament` · `create_session` 에 `p_club_id` 추가 (옛 시그니처 drop 후 재생성)
- `unique_display_name` — 자르고 접미사, **어떤 경우에도 실패하지 않는다**
- `audit_logs` 확장 — `tournament_id` nullable + `club_id`
- `join_attempts` 재사용 — 동아리 코드도 10분/10회 브루트포스 차단.
  **차단 카운터는 대회 코드와 공유한다** (그래서 안내 문구를 '동아리 코드를 10번' 으로 좁히지 않았다)

## 리뷰에서 나왔고 **의도적으로 안 고친 것**

| | 이유 |
|---|---|
| `set_club_member_role` 의 TOCTOU 원본 (`set_member_role`) | 기존 코드의 결함. 이번 범위 밖 |
| `cm_club_idx` 가 unique 인덱스와 선행 컬럼 중복 | 기존 `tm_tournament_idx` 도 같은 모양. 관례 |
| `is_club_owner` 가 아직 아무 데서도 안 쓰임 | 마일스톤 2 에서 쓴다 |
| `alter table` 이 잠깐 잡는 락 | 코드 문제가 아니라 적용 시점 문제 (적용은 끝났다) |
| `TournamentAdminPage` 에 동아리 메뉴 없음 | 대회 관리 메뉴는 대회 구성만 담는다는 계약이 테스트로 굳어 있다. 동아리는 권한 축이 아니라 거기 나올 이유가 없다 |

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

## 모임 모드 남은 단계

계획서: `.claude/plans/session-mode.plan.md`

| 단계 | 무엇 | 규모 |
|---|---|---|
| ~~1~~ | ~~모임 그릇 — 조 없는 경기 · 점수 없는 종료~~ | **완료** (`944470a`) |
| 2 | 동아리 명단 + 게스트 | 위 마일스톤 1~3 으로 흡수됨 (1 완료) |
| 3 | 모임 홈 · 출석 체크인 | 6h |
| 4 | 자동 게임 편성 | 10~14h |

### 3·4단계는 실제 모임을 한 번 돌려본 뒤에

자동 편성의 기준을 "가장 오래 쉰 사람 먼저" 로 잡아 뒀는데,
**그게 사람들이 납득하는 기준인지는 체육관에서만 알 수 있습니다.**
공정성 불만은 알고리즘이 아니라 **근거를 안 보여줘서** 생깁니다 (쉰 시간 · 경기 수를 함께 표시).

명단이 커지면 **모임마다 고르는 일 자체가 새 부담**이 됩니다. 그게 4단계의 근거이므로,
마일스톤 2 에서 고르는 화면이 실제로 빠른지 직접 운영으로 확인하세요.

---

## 알아두면 시간 아끼는 것들

### 연결 정보(`.env.local`)는 이미 있습니다

`~/smash/.env.local` 에 세 값(`VITE_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` ·
`SUPABASE_DB_URL`)이 다 들어 있습니다. 원래 작업본은 `~/smashCompetition/.env.local` 이고
지금 것은 거기서 복사해 온 사본입니다.

> **`.env*` 는 gitignore 라 클론에 따라오지 않습니다.** 새 사본에서 "연결 정보가 없다" 로
> 결론 내리기 전에 `~/smashCompetition/.env.local` 을 먼저 보세요.
> 한 세션이 "이 PC 어디에도 없다" 고 단정하고 이 문서에 🔴 블로커로 적어 둔 적이 있습니다.

### DB 작업

```bash
export SUPABASE_DB_URL="$(sed -n 's/^SUPABASE_DB_URL=//p' .env.local | head -1 | tr -d '\r')"
npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run   # 먼저 dry-run
npx supabase db push --db-url "$SUPABASE_DB_URL"
npm run db:types                                             # 반드시 이어서
```

- **`npm run db:push` 는 `.env.local` 을 안 읽습니다.** 셸 환경변수 `$SUPABASE_DB_URL` 만 봅니다.
  tsx 스크립트(`db:types` · smoke · `db:verify`)는 `.env.local` 을 직접 파싱합니다
- **pooler 가 자주 timeout 을 냅니다.** 2~3번 재시도하면 붙습니다. SQL 문제가 아닙니다
- **push 후 `db:types` 는 선택이 아닙니다.** 손으로 넣은 타입의 누락을 잡아줍니다
  (실제로 두 번 잡혔습니다 — `MatchTeamsRow.group_id` nullable 누락 등)
- **대회·모임이 진행 중일 때 적용하지 마세요.** `alter table tournaments` 가 잠깐
  쓰기 락을 잡습니다. 테이블이 작아 순식간일 가능성이 높지만 체육관에서 점수 찍는
  중에 걸리면 곤란합니다

### 함수를 고칠 때

```bash
grep -ln "function 이름" supabase/migrations/*.sql   # 전부 찾아 마지막 파일을 볼 것
```

`start_match` 를 낡은 버전에서 복사해서 "한 사람이 두 코트에서 동시에 뛸 수 없다" 검사가
통째로 빠진 적이 있습니다. `db:smoke:match` 가 잡았습니다.

**이미 적용된 마이그레이션은 고치지 마세요.** 파일과 실제 DB 가 어긋납니다.
수정은 다음 마이그레이션으로 둡니다 (`20260825000002_fix_start_match_busy_check.sql` 처럼).

### `npm run format` 을 함부로 돌리지 마세요

저장소가 prettier-clean 이 아니라서, 손대지 않은 파일 90여 개가 통째로 재포맷됩니다.
편집한 파일만 개별로 포맷하세요.

### 검증 명령

```bash
npm run verify              # typecheck + lint + test + CSP + build
npm run db:verify           # RLS·권한·Realtime 구조 11항목
npm run db:smoke            # 인증·권한 17항목
npm run db:smoke:security   # 공격 시나리오 37항목
npm run db:smoke:match      # 경기 한 판 전체 흐름 44항목
npm run db:smoke:session    # 모임 모드 23항목
npm run db:smoke:club       # 동아리 계층 18절 89항목
npm run db:smoke:rsvp       # 참가 신청 12절 61항목
npm run db:smoke:notify     # 알림 대상·권한 26항목
npm run db:smoke:roster     # 명단·계정 잇기 23항목
npm run db:smoke:push       # 웹 푸시가 실제로 나가는지
```

### 🔴 `@smashtest.local` 계정을 도메인만 보고 지우지 마세요

smoke 는 **프로덕션에 테스트 계정과 대회를 만들었다 지웁니다.** 끝나면 정리하지만,
중간에 죽으면 계정이 남습니다. 여기까지는 사실입니다.

**그런데 지금 프로덕션에 있는 `@smashtest.local` 21개는 smoke 잔여물이 아닙니다.**
`npm run db:seed` 가 심은 것이고, **실제 대회 5곳의 참가자**입니다
(정기전 17명 · 상반기대회 19명 등). 도메인만 보고 일괄 삭제하면 그 명단이 날아갑니다.

지우기 전에 **소속을 확인하세요.** 로컬 접두사로 갈립니다.

| 로컬 접두사 | 어디서 왔나 | 지워도 되나 |
|---|---|---|
| `seed-N@` | `npm run db:seed` (`scripts/seed-members.ts`) | ❌ 실제 대회 명단 |
| `demo@` | 데모 대회 주최자 (`npm run demo:live` 가 씁니다) | ❌ |
| `club-` `match-` `session-` `roster-` `sec-` `notify-` `smoke-` `pushe2e-` + 타임스탬프 | smoke 스크립트가 그때그때 만든 것 | ✅ 죽은 실행의 잔여물이면 |

```sql
-- 지우기 전에: 이 계정이 어느 대회 명단에 들어 있나
select u.email, t.name, tm.display_name
from auth.users u
join tournament_members tm on tm.user_id = u.id
join tournaments t on t.id = tm.tournament_id
where u.email like '%@smashtest.local'
order by t.name, tm.display_name;
```

행이 나오면 그 계정은 **살아 있는 명단의 일부**입니다.
