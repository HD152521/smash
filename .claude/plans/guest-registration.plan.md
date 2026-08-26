# Plan: 게스트 등록 (마일스톤 3) — 계정 없는 사람이 그날 명단에 스스로 들어온다

**결정 사항**: 게스트 그릇은 **이미 있다**(`tournament_members.user_id is null`) · anon 쓰기는 **정책 0개 + SECURITY DEFINER RPC** · 게스트 코드는 동아리 코드와 **다른 코드** · 붙을 모임은 **게스트가 고른다** · 게스트는 **지우지 않는다**(범위로 소멸) · 등록이 곧 참가(`rsvp='going'`)
**Complexity**: High (10~13h) — 이 앱 최초의 **비로그인 쓰기 경로**다. 새 테이블은 0개인데 난이도가 여기서 온다
**후속**: 마일스톤 4 게스트 읽기 화면(비로그인 읽기) · 모임 모드 3단계 출석 체크인 · 4단계 자동 편성

## Summary

동아리 회원은 마일스톤 2로 끝났습니다 — 모임을 열면 명단에 심어지고, 참가를 누르고,
시각이 되면 그대로 그날의 명단이 됩니다. **게스트는 그 길에 아예 못 올라탑니다.**
계정이 없어서 `join_club` 도 `set_my_rsvp` 도 부를 수 없고, 지금 방법은 운영진이
`add_roster_member` 로 한 명씩 타이핑하는 것 하나뿐입니다.

마일스톤 3은 **동아리 상시 링크 하나**로 그걸 없앱니다. 게스트가 링크를 열고, 오늘 열린
모임을 확인하고, 자기 이름을 적으면 그날 명단에 들어갑니다. 운영진의 타이핑은 0회입니다.

**만드는 그릇은 없습니다.** `20260819000008_roster.sql` 이 이미 계정 없는 명단 참가자를
허용하고, `guard_referee_has_account` 가 이미 그 사람의 심판 지정을 거부하며,
`unique_display_name` 이 이미 이름 충돌을 접미사로 풉니다. 이 마일스톤이 실제로 하는 일은
**그 그릇에 anon 이 닿는 좁은 통로를 뚫고, 그 통로가 딱 그것만 하도록 못 박는 것**입니다.

그래서 이 계획서의 무게는 SQL 줄 수가 아니라 **보안 판단 한 곳**에 있습니다 —
이 앱은 RLS 가 유일한 보안벽이고, 모든 정책이 `auth.uid()` 를 전제합니다.

## 지금 코드가 막고 있는 것 (전수 확인)

| 위치 | 지금 | 마일스톤 3 에서 |
|---|---|---|
| `20260818000007_security_hardening.sql:16` `is_direct_api_call()` | `select current_user = 'authenticated'` | **손대지 않는다.** 다만 이 한 줄이 이 마일스톤의 최대 함정이다 — anon 으로 들어오면 `current_user = 'anon'` 이라 **false** 가 되고, 그러면 `guard_tournament_update`·`guard_member_update`·`guard_member_delete` 가 전부 "RPC 경로다" 로 오판해 **통과**한다. 정책을 anon 에 여는 순간 컬럼 단위 방어가 통째로 무력해진다 |
| `20260818000002_rls.sql` 전 정책 | 전부 `to authenticated` | **한 줄도 안 건드린다.** anon 은 테이블에 도달하지 않는다 |
| `tournaments_select` | `is_tournament_member(id)` | 그대로. 게스트는 모임 목록을 못 읽으므로 후보 조립을 definer RPC 가 한다 |
| `clubs_select` | `is_club_member(id)` | 그대로. anon 은 동아리 이름조차 못 읽는다 — RPC 반환값에 실어 준다 |
| `20260818000001_schema.sql:242` `join_attempts.user_id` | `uuid **not null** references auth.users(id)` | **게스트는 계정이 없어 이 테이블을 쓸 수 없다.** `join_club` 의 10분/10회 차단을 그대로 이식할 수 없다 (→ 설계 판단 3) |
| `clubs.invite_code` | 6자리. `join_club` 이 이 코드로 **회원 가입**을 시킨다 | 게스트에게 이 코드를 주면 게스트가 **회원이 된다.** 게스트 링크는 별도 `clubs.guest_code` 로 가른다 |
| `roster.sql:20` `guard_referee_has_account` | `user_id is null` 이면 심판 거부 | **그대로 재사용.** "게스트는 심판이 될 수 없다" 가 코드 0줄로 이미 관철돼 있다 |
| `roster.sql:14` `unique (tournament_id, user_id)` | NULL 은 서로 같지 않다 → 미가입 참가자 여럿 허용 | 게스트 여럿이 가능하다. **반대로 `on conflict (tournament_id, user_id) do nothing` 방어가 게스트에는 안 걸린다** |
| `guard_member_delete` | 출전 기록 있으면 삭제 거부 | **삭제 기반 소멸이 성립할 수 없는 이유.** 경기에 나간 게스트는 지워지지 않는다 (→ 설계 판단 5) |
| `guard_member_update` | `user_id` 불변 | 게스트 행의 `user_id` 는 영원히 NULL 이다. 회원 전환 경로는 `link_member_account` 하나뿐 (이번 범위 밖) |
| `my_member_id(tid)` | 단일행 가정 | **게스트가 늘어도 안전하다.** `user_id is null` 이라 `= auth.uid()` 에 절대 매칭되지 않는다. 그리고 이 상황은 **새것이 아니다** — `add_roster_member` 가 이미 같은 모양의 행을 만들고 있다 |
| `tm_fill_rsvp` | `kind='tournament'` 면 `rsvp := 'going'` 으로 덮어씀 | **부딪히지 않는다.** 게스트도 `'going'` 으로 넣는다. 애초에 게스트는 모임 전용이라 이 분기에 닿지 않는다 (→ 설계 판단 7) |
| `create_session` | 동아리 회원 전원을 **생성 시점 스냅샷**으로 심는다 | **한 줄도 안 고친다.** 게스트는 생성 이후에 도착하는 사람이다 (→ 설계 판단 6) |
| `set_my_rsvp` | 본인 행만 · `auth.uid()` 필수 | 그대로. 게스트는 부를 수 없고, 부를 필요도 없다 (등록이 곧 참가) |
| `unique_display_name` | 자르고 A~Z→AA~ZZ→해시. **어떤 경우에도 실패하지 않는다** | **그대로 재사용.** 1b 계획서가 "마일스톤 2·3 이 재사용한다" 고 예약해 둔 자리다 |
| `record_score` 등 RPC | `grant execute ... to authenticated` | **그대로.** anon 에게 grant 가 없으므로 게스트의 쓰기 차단은 **정책 이전에 grant 에서** 끝난다 |
| `src/lib/rsvp.ts` `groupRsvp` | `userId === null && rsvp !== 'going'` → `noAccount` | 게스트를 `'invited'` 로 넣으면 **직접 걸어온 사람이 화면에서 "명단만 N명"** 으로 잡힌다 |
| `src/app/routes.tsx` | 가드 밖 라우트는 `/login` · `/auth/callback` 둘뿐 | `/g/:guestCode` 를 가드 밖에 추가. **이 앱 최초의 로그인 없이 여는 화면** |
| `scripts/verify-schema.ts` | anon 권한을 안 본다 | **"anon 이 execute 할 수 있는 함수 목록"** 검사를 추가한다. 이게 이 마일스톤 이후의 회귀 감시선이다 |

## 설계 판단 여덟 가지

### 1. anon 쓰기는 **정책을 여는 게 아니라 함수 둘을 여는 것**이다

| 안 | 모양 | 노출 표면 | 되돌리기 |
|---|---|---|---|
| A. `anon` 에 RLS 정책을 연다 | `tournament_members` 에 `for insert to anon with check (...)` 등 | **앱 전체의 권한 원장이 열린다.** `is_tournament_member/admin/owner` 가 전부 `tournament_members` 를 보므로, "아무나 아무 대회에 자기 행을 넣을 수 있는가" 를 `with check` 한 줄이 홀로 막게 된다 | 어렵다. 열려 있던 동안 anon 이 무엇을 읽어갔는지 알 방법이 없다 |
| B. **정책 0개 + SECURITY DEFINER RPC 둘** | `guest_sessions(p_code)` · `join_as_guest(p_code, p_session_id, p_name)` 에만 `grant execute to anon` | 함수 두 개의 **인자와 반환값**으로 한정된다. 테이블 정책은 한 줄도 안 바뀐다 | `revoke execute ... from anon` 한 줄. 즉시, 완전히 닫힌다 |

**B 를 고릅니다.** 근거 넷:

1. **`is_direct_api_call()` 이 anon 앞에서 무너진다.** 이 함수는 `current_user = 'authenticated'` 하나입니다. anon 으로 들어오면 `'anon'` 이라 **false** 가 되고, 그 순간 `guard_tournament_update`·`guard_member_update`·`guard_member_delete` 세 트리거가 전부 첫 줄에서 `return new` 로 빠져나갑니다. 즉 **anon 에게 테이블 UPDATE 를 열면, 관리자에게도 막혀 있는 `owner_id`·`role`·`user_id`·`club_id` 변경이 anon 에게 허용됩니다.** 이건 이론이 아니라 지금 코드의 동작이고, A 안을 배제하는 결정적 사실입니다.
2. **저장소에 이미 선례가 있습니다.** `join_attempts` 는 정책 0개 테이블이고 definer 함수만 씁니다. `docs/todo.md` 도 마일스톤 4 에 대해 같은 방향을 미리 적어 뒀습니다 — 게스트 등록은 그것의 **쓰기 판**이라 같은 이유가 더 강하게 적용됩니다.
3. **리뷰 범위가 유한해집니다.** 정책을 열면 그 정책과 기존 12개 정책의 상호작용을 전부 다시 논해야 합니다. 함수 둘이면 리뷰 대상이 함수 둘입니다.
4. **anon 에게 열리는 것을 셀 수 있습니다.** 지금 anon 이 실행할 수 있는 함수는 하나도 없습니다. 마일스톤 3 이후엔 둘입니다. `verify-schema.ts` 가 그 숫자를 지킵니다.

> ⚠ definer 함수 안에서는 `is_direct_api_call()` 이 false 이므로 가드가 통과합니다.
> 그건 정상입니다 — RPC 가 자체 검증을 했다는 뜻입니다. 다만 그래서 **`join_as_guest`
> 는 자기가 하는 일을 스스로 좁혀야 합니다.** INSERT 하는 컬럼을 명시적으로 나열하고,
> `role` 은 리터럴 `'member'`, `user_id` 는 리터럴 `null` 로 박습니다. 인자로 받지
> 않습니다.

### 2. 게스트 코드는 동아리 코드가 **아니어야** 한다

`clubs.invite_code` 를 게스트 링크에 그대로 쓰면 안 됩니다. 그 코드는 `join_club` 의
열쇠라서, **게스트에게 준 링크가 곧 회원 가입 코드**가 됩니다. 확정 결정 6("동아리 명단에
남는 것은 회원뿐")이 링크를 뿌리는 순간 깨집니다.

그래서 `clubs.guest_code` 를 따로 둡니다. 그리고 **6자리로 만들지 않습니다.**

- 동아리 코드가 6자리인 건 **사람이 입력하기 때문**입니다. 게스트 코드는 링크에만 실리고
  아무도 손으로 치지 않으므로 짧을 이유가 없습니다
- 그리고 짧으면 안 됩니다 — 설계 판단 3 이 말하듯 **anon 에게는 레이트리밋이 원리적으로
  불가능**합니다. 셀 수 없는 상대는 카운터가 아니라 **엔트로피**로 막습니다
- 22자 base32(`[A-Z2-9]`, 약 110비트)로 둡니다. 온라인 추측이 계산상 불가능해지고,
  그러면 브루트포스 방어를 흉내 낼 필요 자체가 사라집니다

부수 효과로 **회수 수단이 생깁니다.** 확정 결정 10 은 "동아리 코드 재발급은 만들지
않는다" 인데, 그 근거는 "아직 안 들어온 회원에게 뿌린 코드가 한꺼번에 죽는다" 였습니다.
게스트 코드는 **그날 온 사람에게 그때 보여주는 링크**라 그 근거가 성립하지 않습니다.
`rotate_guest_code(p_club_id)` 를 둡니다.

### 3. 브루트포스 — `join_attempts` 를 이식할 수 없다. 그리고 이식해서도 안 된다

`join_attempts.user_id` 는 `not null references auth.users(id)` 입니다. 게스트는 계정이
없으니 애초에 행을 넣을 수 없습니다. 우회안 셋을 다 봤고 셋 다 나쁩니다.

| 우회안 | 왜 안 되나 |
|---|---|
| `user_id` 를 nullable 로 풀고 게스트 시도를 `null` 로 기록 | **카운터가 전 세계 anon 하나로 합쳐진다.** 한 사람이 10번 틀리면 그 순간부터 모든 게스트가 차단된다. 공격자가 10줄짜리 스크립트로 게스트 등록을 영구 정지시킬 수 있다 |
| 코드 문자열 단위로 센다 | 존재하지 않는 코드로 시도하면 키가 매번 달라 안 쌓이고, 진짜 코드로 시도하면 **그 동아리만 골라 정지**시킬 수 있다 |
| IP 로 센다 | Postgres 안에서 클라이언트 IP 가 보이지 않는다. PostgREST 가 넘겨주지 않는다 |

그래서 **레이트리밋을 만들지 않고, 대신 세 겹으로 막습니다.**

1. **엔트로피** — 22자 코드(설계 판단 2). 추측이 불가능하면 시도 횟수를 셀 이유가 없습니다
2. **모임당 게스트 상한** — `is_guest` 행이 상한(기본 60)에 닿으면 거절합니다.
   이건 마일스톤 2 가 안 만들기로 한 "정원 마감" 과 **다른 것**입니다. 회원이 오는 걸
   막는 게 아니라, 코드를 아는 사람이 스크립트로 명단을 채우는 것을 유한하게 만드는
   **오염 상한**입니다. 문구도 다릅니다 — "자리가 없습니다" 가 아니라
   "오늘은 더 받을 수 없습니다. 모임장에게 말씀해 주세요"
3. **끝난 모임은 후보가 아니다** — 오래된 링크로 지난 모임을 채우는 길을 닫습니다

> **왜 "안 만든다" 가 답이 아닌가**: 게스트가 쓰기 권한이 없으니 코드를 맞혀도 얻는 게
> 없다는 말은 틀렸습니다. **등록 자체가 쓰기**라 명단 오염이 곧 피해입니다. 새로고침을
> 눌러대면 `unique_display_name` 이 계속 새 행을 만들고,
> `on conflict (tournament_id, user_id) do nothing` 은 **NULL 끼리 충돌하지 않으므로
> 안 걸립니다.** 상한이 그 유일한 방어선입니다.

### 4. 어느 모임에 붙는가 — 서버는 후보만 주고, **게스트가 고른다**

| 안 | 규칙 | 여럿일 때 | 운영진 조작 | 실패 모드 |
|---|---|---|---|---|
| A. 서버가 고른다 | `starts_at` 이 지금과 가장 가까운 모임 | 서버가 임의로 하나 | 0회 | **조용히 엉뚱한 모임에 등록된다.** 게스트는 자기가 어디 붙었는지 모르고, 운영진은 명단에서 그 이름을 못 찾는다 |
| B. **게스트가 고른다** | 서버는 후보 목록만 (이름 · 시각) | 게스트가 화면에서 고른다. 하나면 자동 통과 | **0회** | 후보가 둘 이상이면 한 번 더 누른다. 잘못 골라도 화면에 그대로 보인다 |
| C. 운영진이 연다 | 모임마다 "게스트 받기" 스위치 | 켜진 것만 후보 | **모임마다 1회** | 켜는 걸 잊으면 게스트가 못 들어온다. PRD 의 "운영진 조작 최소화" 지표를 스스로 깎는다 |

**B 를 권고합니다.** 운영진 조작이 0회로 유지되면서, 잘못된 모임에 붙는 사고가
구조적으로 사라집니다. 후보가 하나뿐인 평일 저녁에는 화면이 자동으로 넘어갑니다.

**후보 조건**은 `guest_sessions(p_code)` 안에 이렇게 둡니다.

```
club_id = (그 guest_code 의 동아리)
and kind = 'session'          -- 대회는 후보가 아니다 (설계 판단 7)
and status = 'live'           -- 'finished' 는 제외. 이게 "운영진이 닫는" 자리다
and (starts_at is null or starts_at between now() - interval '12 hours'
                                        and now() + interval '24 hours')
order by starts_at nulls first
```

> **"서버는 시각을 판단하지 않는다"(마일스톤 2 판단 1)를 어기는 것 아닌가?**
> 아닙니다. 그 규칙이 금지한 것은 **시각으로 행을 바꾸는 것**(크론 · 배치 · 상태 전환)
> 입니다. 여기 시각은 후보를 **줄이는 읽기 필터**이고, 틀려도 남는 결과는 "후보 목록이
> 이상하다" 이지 데이터 오염이 아닙니다. 그리고 여기서는 **사용자 시계를 믿을 수도
> 없습니다** — 상대가 anon 이고, 이건 쓰기 경로입니다. 시계를 클라이언트에 맡기면
> "기기 시계를 2년 뒤로 돌려 지난 모임에 등록" 이 열립니다.
>
> 창을 뒤로 12시간 여는 이유: 20:00 모임을 23:30 에 도착해서 등록하는 게 정상입니다.
> 앞으로 24시간을 여는 이유: 즉석 개설과 내일 모임이 같이 떠도 게스트가 골라 줍니다.

### 5. 게스트는 **지워지지 않는다.** "사라진다" 를 삭제가 아니라 **범위**로 구현한다

이 마일스톤에서 가장 되돌리기 어려운 판단입니다.

| 안 | 언제 | 난이도 | 실패 모드 |
|---|---|---|---|
| A. 모임 종료 시 자동 삭제 | `finished` 로 바꿀 때 delete | 낮음 | **`guard_member_delete` 가 출전 기록 있는 행을 막는다.** 뛴 게스트는 안 지워지고 안 뛴 게스트만 지워진다. **결과가 반반인 삭제는 규칙이 아니다.** 게다가 종료를 안 누르면 영영 남는다 |
| B. 그날이 지나면 자동 삭제 | 크론 · 배치 | 중간 | **마일스톤 2 가 크론을 명시적으로 금지했다.** 시계가 어긋나면 **아직 치고 있는 모임의 명단이 사라진다** |
| C. 운영진이 손으로 지운다 | 기존 `remove_member` | **0줄** | 안 지우면 남는다. A 와 같은 벽에 걸린다 |
| D. **지우지 않는다** | 게스트 행은 그 모임에만 있고, 다음 주는 새 행 집합이다 | **0줄** | 없음 |

**D 를 권고합니다.** 근거 셋:

1. **확정 결정 6("게스트는 그날 모임에만 존재한다")은 이미 100% 달성돼 있습니다.**
   게스트는 `club_members` 에 안 들어가고 `tournament_members` 에만 들어갑니다. 그리고
   `tournament_members` 는 **원래부터 모임 하나에 종속된 테이블**입니다. 다음 주 모임은
   다른 행 집합이고, 시스템은 지난주를 기억하지 않습니다. **지울 것이 없습니다.**
2. **확정 결정 6의 후반부와 정확히 맞습니다** — "이미 치른 경기 기록에는 이름이 남는다".
   A·B 를 하면 `guard_member_delete` 가 그 문장을 절반만 지키게 만듭니다.
3. **삭제는 이 저장소가 가장 조심하는 동작입니다.** `match_team_players` 가 cascade 라,
   지우면 21:19 로 끝난 경기가 조용히 1:2 복식이 됩니다.

지우고 싶은 운영진에게는 이미 `remove_member`(C)가 있습니다. **명시적 조작으로만 남깁니다.**

### 6. `create_session` 의 흐름에 얹지 않는다 — 게스트는 **스냅샷 이후**에 온다

`create_session` 은 동아리 회원 전원을 **생성 시점 스냅샷**으로 심습니다. 게스트를 거기
얹을 자리는 없습니다. 게스트는 그때 존재하지 않았고, 이름조차 아직 적히지 않았습니다.

게스트는 `add_roster_member` 와 같은 자리 — **나중에 한 행씩 추가되는 경로**입니다.
그래서 **`create_session` 은 한 줄도 안 고칩니다.**

> **"회원은 스냅샷 밖이면 못 들어오는데 게스트는 들어온다 — 모순 아닌가?"**
> 층위가 다릅니다. 회원이 못 들어오는 이유는 **읽기 정책**입니다
> (`tournaments_select` 가 `is_tournament_member` 라 모임 자체가 안 보인다). 게스트는
> 애초에 정책으로 읽지 않고 definer RPC 가 후보를 실어 줍니다. 두 사람이 막히는 벽이
> 다르고, 그래서 한쪽만 뚫려도 일관성이 깨지지 않습니다.

### 7. 게스트는 **모임 전용**이다. 대회에는 없다

`guest_sessions` 가 `kind='session'` 으로 거르고, `join_as_guest` 도 아니면 거절합니다.

- **대회 명단은 운영진이 짭니다.** 마일스톤 2 가 `create_tournament` 를 확장하지 않은
  것과 같은 이유입니다
- **대회는 순위가 걸려 있습니다.** 조 편성이 끝난 뒤 명단이 스스로 늘어나면 대진표와
  순위표의 근거가 흔들립니다. 모임에는 조도 순위도 없습니다(1단계 결정)
- **대회에 사람을 넣는 길은 이미 있습니다** — `add_roster_member`. 대회는 1년에 몇
  번이라 운영진 타이핑 비용이 문제가 아닙니다
- 부수 효과로 `tm_fill_rsvp` 와의 충돌 가능성이 **원천 제거**됩니다

### 8. 게스트에게 `rsvp` 는 없다 — **등록이 곧 참가**다

게스트 행은 `rsvp='going'` 으로 들어갑니다.

- `'invited'` 는 "심어졌지만 아직 안 누름" 이라는 뜻입니다. 게스트는 심어진 게 아니라
  **자기 발로 와서 이름을 적은 사람**입니다
- 그리고 `'invited'` 로 넣으면 **화면이 거짓말합니다.** `groupRsvp` 는
  `userId === null && rsvp !== 'going'` 을 `noAccount`("명단만")로 셉니다. 방금 문 앞에서
  이름을 적은 사람이 모임장 화면에 **"명단만 3명"** 으로 잡히고, 모임장은 오지도 않을
  답을 기다리게 됩니다. `'going'` 이 유일하게 맞는 값입니다
- `partitionGoing`(경기 짜기 화면)이 게스트를 앞으로 올려 줍니다

### 부록 — `is_guest` 컬럼이 왜 필요한가 (`user_id is null` 로는 안 되는 이유)

`create_session` 은 **동아리 미가입 회원(`user_id is null`)도 모임 명단에 심습니다.**
즉 지금 이 순간에도 `user_id is null` 인 행에는 두 종류가 섞여 있습니다:

- 운영진이 손으로 올린 동아리 회원 (매주 오는 사람)
- 오늘 문 앞에서 이름을 적은 게스트 (오늘만 오는 사람)

`user_id is null` 로 배지를 그리면 **매주 오는 회원 전원에게 "게스트" 딱지가 붙습니다.**
이건 가정이 아니라 현재 코드의 확정된 동작입니다.

그래서 `tournament_members.is_guest boolean not null default false` 를 둡니다.
기존 행은 `default false` 로 그대로 통과하고, 이 컬럼을 쓰는 곳은 **화면 배지와
게스트 상한 계산 둘뿐**입니다 — 권한 판단에는 절대 쓰지 않습니다.

## Patterns to Mirror

| 범주 | 근거 | 패턴 |
|---|---|---|
| 마이그레이션 이름 | `20260827000001_session_rsvp.sql` | `YYYYMMDD00000N_snake_case.sql` + 머리에 '왜' 주석 + 끝에 "만든 것" 요약 |
| 정책 0개 + definer | `schema.sql:240` `join_attempts` | 테이블 정책을 만들지 않고 definer 함수만 접근하게 둔다 |
| 예외 대신 봉투 | `club_layer.sql` `join_club` | 실패를 `jsonb {ok,error,message}` 로. **예외를 던지면 방금 남긴 기록이 롤백된다** |
| 봉투 파싱 | `src/lib/club.ts` `parseJoinResult` | 아는 코드는 우리 문구로 덮고, 모르는 모양은 `'unknown'` 으로 떨어뜨려 빈 문구를 막는다 |
| 코드 생성 재시도 | `tournament_settings.sql` | 10회 재시도 + `40001` |
| 이름 충돌 | `club_layer.sql` `unique_display_name` | 자르고 붙인다. 기존 이름 불변. 예외를 던지지 않는다 |
| 권한 | `tournament_settings.sql` | `revoke all from public, anon` → `grant to authenticated`. **이번엔 두 함수만 `to anon`** 이고 그 예외를 주석으로 명시 |
| 순수 로직 | `src/lib/rsvp.ts` · `club.ts` | `lib/` 순수 함수 + 같은 이름 `.test.ts` |
| 오류 문구 덮기 | `src/lib/rsvp.ts` `rsvpErrorMessage` | `toUserMessage` 공용 표를 고치지 말고 도메인 파일에서 덮는다 |
| 데이터 접근 | `src/features/club/api.ts` → `queries.ts` → 페이지 | `unwrap(res)` + react-query 훅 |
| 실DB 검증 | `scripts/smoke-rsvp.ts` · `smoke-security.ts` | 번호 붙은 절. 보안 경계는 **막히는 것**을 확인 |

## Files to Change

| 파일 | 동작 | 이유 |
|---|---|---|
| `supabase/migrations/20260828000001_guest_registration.sql` | CREATE | `clubs.guest_code` · `tournament_members.is_guest` · `guest_sessions` · `join_as_guest` · `rotate_guest_code` · anon grant 둘 |
| `src/types/database.ts` | UPDATE | `ClubRow.guest_code` · `is_guest` · 새 RPC 3종 |
| `src/types/database.gen.ts` | UPDATE | `db:push` 후 `db:types` 재생성 |
| `src/lib/guest.ts` | CREATE | `parseGuestSessions` · `parseGuestJoinResult` · `validateGuestName` · `guestLinkUrl` · `guestErrorMessage` |
| `src/lib/guest.test.ts` | CREATE | 특히 봉투가 깨졌을 때 빈 문구가 안 나오는 것 |
| `src/lib/rsvp.ts` | UPDATE | `isGuest` 추가 여부만 검토. **`groupRsvp` 분기는 안 바꾼다** |
| `src/features/club/api.ts` · `queries.ts` | UPDATE | `rotateGuestCode` |
| `src/features/guest/api.ts` | CREATE | **anon 클라이언트로** 두 RPC. 로그인 세션을 요구하지 않는 유일한 api 모듈 |
| `src/features/guest/queries.ts` | CREATE | react-query 훅 |
| `src/pages/GuestJoinPage.tsx` | CREATE | `/g/:guestCode` — 동아리 이름 → 모임 고르기(하나면 자동) → 이름 적기 → 완료 |
| `src/pages/ClubPage.tsx` | UPDATE | 게스트 링크 표시 · 복사 · **재발급**(확인 한 번 더) |
| 모임 명단 화면 | UPDATE | 게스트 배지. `is_guest` 로만 판별 |
| `src/pages/SessionMatchCreatePage.tsx` | UPDATE | 게스트가 목록에 뜨는지 확인 |
| `src/app/routes.tsx` | UPDATE | `/g/:guestCode` 를 **로그인 가드 밖**에 |
| `scripts/smoke-guest.ts` | CREATE | 실DB 검증 |
| `scripts/verify-schema.ts` | UPDATE | 새 컬럼 2개 + **"anon 이 execute 가능한 함수는 정확히 둘"** |
| `package.json` | UPDATE | `db:smoke:guest` |
| `.claude/prds/club-platform.prd.md` | UPDATE | 마일스톤 3 Status · Open Questions 를 Decisions 로 승격 |
| `docs/todo.md` · `docs/이어서시작.md` · `README.md` | UPDATE | 결과 · 화면 구조 · 겪은 함정 |

> **목록에 없는 것 — 전부 의도입니다.**
> `create_session` · `create_tournament` · `set_my_rsvp` · `add_roster_member` ·
> `remove_member` · `link_member_account` · `guard_*` 트리거 5종 ·
> `is_tournament_*` · `is_club_*` · `match_overview` 뷰 · RLS 정책 **전부**.

## Tasks

### Task 1 — 코드와 표시 컬럼
- `clubs.guest_code text unique` + 기존 동아리 backfill. `gen_guest_code()` — 22자 base32,
  `gen_random_bytes` 기반, 10회 재시도 + `40001`.
  `tournament_members.is_guest boolean not null default false`.
  두 컬럼에 `comment on column` 으로 **무엇이 아닌지**를 적는다 —
  `is_guest` 는 권한 판단에 쓰지 않는다, `guest_code` 는 `invite_code` 와 다른 것.
- **Validate**: dry-run → push. smoke 1번

### Task 2 — 후보 조립 RPC (anon 읽기)
- `guest_sessions(p_code text) returns jsonb` — SECURITY DEFINER.
  `{ok:true, club_name, sessions:[{id,name,starts_at}]}` 또는
  `{ok:false, error:'bad_code'|'no_open_session', message}`. **예외를 던지지 않는다.**
  반환에 싣는 것은 **동아리 이름 · 모임 이름 · 모임 시각 셋뿐** —
  회원 명단 · 인원수 · 초대 코드 · 다음 주 일정은 싣지 않는다.
- **Validate**: smoke 2·3·4·5번
- **Risk**: 중간. **반환 필드를 늘리는 순간 마일스톤 4를 앞당겨 열게 된다**

### Task 3 — 등록 RPC (anon 쓰기) ← 이 마일스톤의 핵심
- `join_as_guest(p_code, p_session_id, p_name) returns jsonb` — SECURITY DEFINER. 순서:
  1. 코드로 동아리를 찾는다. 없으면 `bad_code`
  2. `p_session_id` 가 **그 동아리 소속이고** `kind='session'` `status='live'` 시각 창 안인지
     — **Task 2 와 똑같은 필터를 다시 통과**시킨다. 아니면 `session_closed`.
     ⚠ 후보 목록을 봤다는 사실을 신뢰하지 않는다. 인자는 전부 사용자 입력이다
  3. 이름 1~20자. 아니면 `bad_name`
  4. `is_guest` 행이 상한(60) 이상이면 `guest_limit`
  5. INSERT — 컬럼을 **명시적으로 나열**: `user_id = null`(리터럴) · `role = 'member'`(리터럴)
     · `rsvp = 'going'`(리터럴) · `is_guest = true`(리터럴) ·
     `display_name = unique_display_name(...)`. **인자로 role 이나 user_id 를 받지 않는다**
  6. `log_audit(..., 'member.guest_join', ...)` — 링크 유출을 사후에 알아볼 유일한 흔적
  7. `{ok:true, display_name, session_name}` — **적힌 이름을 그대로 돌려준다.**
     접미사가 붙었으면 게스트가 그 사실을 알아야 코트 현황판에서 자기를 찾는다
- **Validate**: smoke 6~14번
- **Risk**: **높음.** 이 함수 하나가 anon 쓰기 경계 전부다

### Task 4 — 회수 수단
- `rotate_guest_code(p_club_id)` — `is_club_admin` 검사 후 새 코드. `log_audit_club`.
  `grant to authenticated` **만**. `guard_club_update` 에 `guest_code` 잠금 추가
  (본문만 교체, 트리거 재생성 없음).
- **Validate**: smoke 15·16번

### Task 5 — 타입 · 순수 로직
- `db:push` 후 `db:types` 재생성, 손으로 넣은 타입과 대조. `lib/guest.ts` + 테스트.
  봉투 파싱은 `parseJoinResult` 와 같은 규율 — **모르는 모양은 `'unknown'`, 빈 문구 금지**
- **Validate**: `npm run typecheck && npm run test`

### Task 6 — 화면
- `GuestJoinPage`(3단계, 후보 하나면 2단계) · `ClubPage` 링크·재발급 · 명단 게스트 배지 ·
  라우트를 **가드 밖**에.
  게스트 화면은 **로그인 유도를 하지 않는다** — 계정을 만들 이유가 없는 사람이다.
  완료 화면에는 되돌아갈 곳을 두지 않는다(마일스톤 4 전까지 볼 것이 없다).
  대신 **"적은 이름"** 을 크게 보여준다.
- **Validate**: `npm run verify`
- **Risk**: 중간. **anon 클라이언트로 호출하는 첫 화면**

### Task 7 — 실DB 검증 (`scripts/smoke-guest.ts`)

*통로*
1. 게스트 코드로 오늘 열린 모임 후보가 나온다 (동아리 이름 포함)
2. 이름을 적으면 `is_guest=true` · `user_id is null` · `rsvp='going'` · `role='member'` 로 들어간다
3. 같은 이름을 다시 적으면 접미사가 붙고, **기존 이름은 안 바뀐다**
4. 등록된 게스트가 모임장 화면(경기 짜기 목록)에 뜬다
5. 열린 모임이 없으면 `no_open_session` 이고, **그 이상 새지 않는다**
6. 후보가 둘일 때 고른 쪽에만 들어간다

*통로만 — 보안 경계*

7. **anon 이 `tournament_members` 를 직접 SELECT/INSERT/PATCH/DELETE 하지 못한다**
8. **anon 이 `tournaments` · `clubs` · `matches` · `courts` 를 직접 못 읽는다**
9. **anon 이 `record_score` · `create_session_match` · `set_my_rsvp` · `add_roster_member` ·
   `join_club` 을 못 부른다**
10. **다른 동아리의 `session_id` 를 넣으면 거절된다** ← 후보 목록을 신뢰하지 않는지
11. **끝난 모임 · 시각 창 밖 모임에는 못 들어간다**
12. **대회 UUID 를 넣으면 거절된다**
13. **게스트를 심판으로 지정하지 못한다**
14. **게스트 상한을 넘기면 거절되고, 넘긴 뒤에도 기존 게스트는 멀쩡하다**
15. 코드를 재발급하면 **옛 링크가 즉시 죽고**, 이미 등록된 게스트는 그대로 남는다
16. **운영진이 아닌 회원은 재발급하지 못한다.** `guest_code` 직접 PATCH 도 막힌다
17. **`is_guest` 를 직접 PATCH 로 켜고 끌 수 없다** (막을지 열지는 Task 3 착수 시 판단하고 결과를 여기 적는다)

*회귀*

18. 동아리 없는 모임 · 대회가 예전과 똑같이 돈다
19. **운영진이 손으로 올린 미가입 회원이 게스트로 표시되지 않는다**
20. 경기에 나간 게스트는 `remove_member` 로 지워지지 않는다 (기록 보존, 의도된 동작)
21. `my_member_id` 가 게스트가 여럿인 모임에서도 정상 동작한다

### Task 8 — 문서
PRD Open Questions 중 답한 것을 Decisions 로 올린다 — 언제 사라지는가(D) ·
열린 모임이 없을 때 · 대회에도 필요한가(아니오) · 이름 말고 무엇을 받는가(아무것도) ·
링크 유출 회수(재발급 있음) · 게스트가 회원이 되면 기록이 이어지는가(아니오, 의도).
**`scripts/smoke-guest.ts` 의 절 번호를 정본으로 삼는다.**

## Validation

```bash
npm run verify
npm run db:push             # dry-run 먼저
npm run db:types            # 선택이 아니다
npm run db:verify           # 새 컬럼 + anon grant 목록
npm run db:smoke:guest      # 신규
npm run db:smoke:security   # anon 경계가 생겼으므로 **필수**
npm run db:smoke:rsvp       # 게스트가 'going' 으로 들어간다
npm run db:smoke:roster     # is_guest 가 옆에 생겼다
npm run db:smoke:club       # guest_code 가 옆에 생겼다
npm run db:smoke:match
npm run db:smoke:session
npm run db:smoke:notify     # 게스트는 알림을 못 받는다(계정 없음)
```

## Risks

| 리스크 | 확률 | 완화 |
|---|---|---|
| **anon 에 정책을 열었다가 `is_direct_api_call()` 이 false 가 되어 가드 3종이 통째로 무력화** | 중 | 정책을 열지 않는다. definer RPC 둘만. smoke 7·8번이 "정책 0개" 를 못 박는다 |
| **게스트 코드로 회원 가입이 된다** | 높 | 코드 분리(`guest_code`). smoke 9번 |
| **anon 은 셀 수 없어 레이트리밋이 원리적으로 불가능** | 높 | 엔트로피(22자) + 모임당 상한 + `status='live'` 창. 억지 이식은 **전역 차단 DoS** 를 연다 |
| **새로고침 연타로 이름이 무한 증식** | 중 | `on conflict` 는 NULL 끼리 안 걸린다. 상한이 유일한 방어선 — smoke 14번 필수 |
| **게스트가 엉뚱한 모임에 조용히 등록** | 중 | 서버가 안 고른다. smoke 6번 |
| **후보 반환값에 필드를 더 실어 마일스톤 4를 앞당겨 연다** | 중 | 반환 필드 셋을 주석에 못 박고 smoke 5번이 확인 |
| **자동 삭제를 켰다가 코트 한복판에서 명단이 사라진다** | 중 | 삭제하지 않는다. 크론도 배치도 없다 |
| **`user_id is null` 로 판별해 미가입 회원 전원에게 게스트 배지** | 높 | `is_guest` 컬럼. smoke 19번이 정면 검사 |
| **`rsvp='invited'` 로 넣어 화면이 "명단만 N명" 으로 거짓말** | 중 | `'going'` 리터럴. `lib/rsvp.ts` 는 안 고친다 |
| **`create_session` 을 고치다 마일스톤 2 회귀** | 중 | 안 고친다. `db:smoke:rsvp` 61항목이 관문 |
| **상시 링크 유출** | 중 | `rotate_guest_code`. 유출로 얻는 것은 **그날 모임에 이름 하나 넣기**뿐 |
| **`/g/:guestCode` 를 가드 안에 두어 정작 게스트가 못 연다** | 중 | 라우트 위치를 `/login` 옆으로. 실기기 확인 항목에 넣는다 |

## Non-goals (마일스톤 3 에서 하지 않음)

- **비로그인 읽기 화면** → **마일스톤 4.** 이번에 뚫는 것은 쓰기 통로 하나이고,
  읽기는 그 통로로 **후보 목록 세 필드**만 나간다
- **게스트의 쓰기 권한** — 점수 · 경기 생성 · 심판. 셋 다 지금 코드가 이미 막고 있다
- **출석 체크인** → 모임 모드 3단계 · **자동 편성** → 4단계
- **게스트가 회원이 되면 지난 기록 잇기** — 확정 결정 6("시스템이 지난주를 기억하지
  않는 것이 의도")의 직접 귀결. 필요하면 `link_member_account` 로 손으로 잇는 길이 있다
- **게스트 연락처 · 전화번호 · 소속 받기** — 확정 결정 1 이 "시스템이 누구인지 알 필요가
  없다" 이고, 받는 순간 보관 · 파기 · 동의를 관리할 책임이 생기는데 이 앱에는 그걸
  다룰 화면도 정책도 없다. 그리고 **쓸 곳이 없다** — 계정이 없으니 알림 수단이 없다
- **게스트를 `club_members` 에 남기기** — 확정 결정 6 이 금지한다
- **대회 게스트** → 설계 판단 7 · **모임마다 게스트 스위치** → 설계 판단 4의 C안
- **게스트 자동 삭제** → 설계 판단 5 · **게스트별 토큰 · 개인 링크** → 확정 결정 3

## Acceptance

- [ ] 게스트가 로그인 없이 링크를 열고, 오늘 모임을 확인하고, 이름을 적어 그날 명단에 들어간다
- [ ] 등록된 게스트가 `is_guest=true` · `user_id is null` · `rsvp='going'` · `role='member'` 다
- [ ] 같은 이름이 겹치면 접미사가 붙고 **기존 이름은 안 바뀐다**
- [ ] 열린 모임이 없으면 안내만 나오고, 그 이상 아무것도 안 샌다
- [ ] **anon 이 테이블에 직접 도달하지 못한다** — SELECT · INSERT · PATCH · DELETE 전부
- [ ] **anon 이 실행할 수 있는 함수가 정확히 둘이다** (`guest_sessions` · `join_as_guest`)
- [ ] 게스트는 심판이 될 수 없고 점수를 넣을 수 없다
- [ ] 다른 동아리의 모임 · 끝난 모임 · 대회에는 들어갈 수 없다
- [ ] 게스트 링크를 재발급하면 옛 링크가 즉시 죽고, 이미 등록된 게스트는 남는다
- [ ] **운영진이 손으로 올린 미가입 회원에게 게스트 배지가 안 붙는다**
- [ ] **기존 대회 · 모임 · 동아리 · 참가 신청 동작이 하나도 안 바뀌었다**
- [ ] `npm run verify` + smoke 7종 통과
