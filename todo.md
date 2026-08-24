# TODO

> 지금 어디까지 왔고 다음에 뭘 할지. 화면 구조·도메인 규칙·함정은
> [docs/이어서시작.md](docs/이어서시작.md) 에 있습니다.
>
> 마지막 갱신: 2026-08-25

---

## 지금 상태

```
배포        smash.juganlab.com (Vercel · main 자동 배포)
DB          마이그레이션 20260825000002 까지 프로덕션 적용 완료
웹 푸시     send-push Edge Function 배포됨 (HTTP 401 응답 확인)
검증        단위 258 · 실DB 141항목 (아래 스크립트 참고) 전부 통과
```

| PR | 내용 | 상태 |
|---|---|---|
| [#1](https://github.com/HD152521/smash/pull/1) | 대회 설정 · 듀스 · 대기순번 알림 · 심판 가로보기 · 기록 시각순 | **머지됨** |
| [#2](https://github.com/HD152521/smash/pull/2) | 모임 모드 1단계 — 점수 없이 코트 돌리기 | **열림 — 머지 대기** |

---

## 지금 해야 할 것

### 1. PR #2 머지
DB 마이그레이션은 **이미 프로덕션에 올라가 있습니다.** 코드만 따라가면 됩니다.
머지가 늦어도 대회 쪽은 멀쩡합니다 (모임 관련 함수는 새로 추가된 것뿐입니다).

### 2. 실기기 확인 — 아직 아무도 안 해봤습니다
자동 검증이 잡아낼 수 없는 것들입니다. 코트에서 폰으로 해봐야 압니다.

- [ ] **모임 한 판** — 경기 짜기 → 시작 → 점수 없이 `경기 끝` → 다음 경기에 '곧 차례' 알림
- [ ] **대기 순번 알림** — 앞 경기를 시작했을 때 뒷사람 폰이 울리는가
      (2번째 이하가 되면 울립니다. 관리 → 경기 규칙에서 조절)
- [ ] **심판 화면 가로 보기** — 아이폰(회전 잠금 ON)과 안드로이드 크롬은 경로가 다릅니다.
      아이폰은 CSS 로 돌리고, 안드로이드는 전체화면 + `orientation.lock` 으로 진짜로 돌아갑니다.
      **둘 다 봐야 합니다.**
- [ ] **듀스** — 20:20 에서 안 끝나고 22:20 에 끝나는가. 상한(30점)에 닿으면 1점 차로도 끝나는가
- [ ] **오프라인** — 와이파이를 껐다 켜면서 채점. 대기 큐가 밀리는지, 화면이 안 꺼지는지

### 3. 웹 푸시가 실제로 나가는지 확인
Edge Function 은 떠 있는데, VAPID 비밀키(Supabase secrets)와 Vercel 의
`VITE_VAPID_PUBLIC_KEY` 가 실제로 꽂혔는지는 확인이 안 됐습니다.

```bash
npm run db:smoke:push     # 서명·암호화해서 푸시 서비스까지 닿는지
```

앱을 켜 둔 사람에게는 인앱 배너가 이미 뜹니다. 이건 **닫아둬도 오는 알림** 이야기입니다.
아이폰은 홈 화면에 추가한 경우에만 받습니다 (애플 정책).

---

## 모임 모드 남은 단계

계획서: `.claude/plans/session-mode.plan.md` (PR #2 에 포함 — 머지되면 보입니다)

| 단계 | 무엇 | 규모 |
|---|---|---|
| ~~1~~ | ~~모임 그릇 — 조 없는 경기 · 점수 없는 종료~~ | **PR #2** |
| 2 | **동아리 명단 + 게스트** | 8h |
| 3 | 모임 홈 · 출석 체크인 | 6h |
| 4 | 자동 게임 편성 | 10~14h |

### 2단계 — 동아리 (다음 차례)
매주 여는데 매번 초대 코드로 다시 들어와야 하는 불편을 없애는 게 목적입니다.

```sql
clubs          동아리 (id, name, owner_id, invite_code)
club_members   재사용 명단 (club_id, user_id nullable, display_name, active)
tournaments  + club_id
tournament_members + club_member_id   -- 있으면 동아리 사람, 없으면 게스트
```

- 모임을 열 때 동아리 명단이 딸려옵니다
- **게스트는 `club_member_id` 가 없는 사람**입니다 — 그 모임에만 있고 명단에 안 남습니다.
  새 플래그가 거의 필요 없습니다
- `club_members` → `tournament_members` 는 **복사(스냅샷)** 입니다.
  참조로 두면 동아리에서 사람을 빼는 순간 지난 모임 기록의 이름이 사라집니다
- 새 테이블이므로 **RLS 정책과 `db:smoke:security` 항목을 같이** 만들어야 합니다.
  명단에서 남의 실명·이메일이 새면 안 됩니다 (`profiles` 를 본인만 보게 만든 그 교훈)

### 3·4단계 — 실제 모임을 한 번 돌려본 뒤에
자동 편성의 기준을 "가장 오래 쉰 사람 먼저" 로 잡아 뒀는데,
**그게 사람들이 납득하는 기준인지는 체육관에서만 알 수 있습니다.**
공정성 불만은 알고리즘이 아니라 **근거를 안 보여줘서** 생깁니다 (쉰 시간 · 경기 수를 함께 표시).

---

## 대회 쪽 남은 것

- [ ] **소셜 로그인 (구글·카카오)** — 코드는 이미 준비됨. 대시보드에서 켜면 버튼이 자동으로 나옵니다.
      redirect URI 는 전부 `https://vwocyjuwormeaentdost.supabase.co/auth/v1/callback`
      (앱 도메인이 아닙니다)
- [ ] **순위 동률 시 승자승** — 지금 클라이언트에서 계산 중입니다. 조가 많아지면 SQL 로 옮길 것
- [ ] `Confirm email` 을 다시 켜기 — 지금은 OFF 입니다.
      내장 메일은 시간당 몇 통이라 막혀서 껐는데, 실서비스로 갈 거면 Resend/SES 를 붙이고 켜야 합니다

## 정리하면 좋을 것 (급하지 않음)

- [ ] `MatchCreatePage.tsx` **594줄** — 기준(800줄)을 넘진 않았지만 조 선택·선수 선택·심판 선택이
      한 파일에 있습니다. 모임 편성(`SessionMatchCreatePage`)과 겹치는 부분이 있는지 볼 것
- [ ] `SchedulePage.tsx` **521줄**
- [ ] `eslint-plugin-jsx-a11y` 도입

---

## 알아두면 시간 아끼는 것들

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
npm run db:smoke:notify     # 알림 대상·권한 26항목
npm run db:smoke:roster     # 명단·계정 잇기
npm run db:smoke:push       # 웹 푸시가 실제로 나가는지
```
smoke 는 **프로덕션에 테스트 계정과 대회를 만들었다 지웁니다.** 끝나면 정리하지만,
중간에 죽으면 `@smashtest.local` 계정이 남습니다.
