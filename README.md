# SMASH (smash-competition)

배드민턴 대회 운영 웹앱. 대진표 · 실시간 점수 · 조별 순위를 코트에서 폰으로 바로 관리합니다.

- **배포 도메인**: `smash.juganlab.com`
- **스택**: React 19 + Vite + TypeScript / Supabase (Auth · Postgres · Realtime) / Tailwind v4

---

## 핵심 규칙 (조커 제도)

```
대회 생성 시   조 개수 N,  조커조 개수 K  →  1조 ~ K조가 조커조로 고정
목표 점수      일반조 21점  /  조커조 11점
승점           일반조 승리 1.0  /  조커조 승리 0.5  /  패배 0
경기 구성      조 vs 조,  각 조에서 관리자가 2명씩 선택 (복식 2:2)
조 인원        권장 4명 (소프트 정원 — 초과해도 막지 않고 경고만)
```

조커조는 적은 점수로 이기지만 승점이 절반이라 순위에서 균형이 맞습니다.

---

## 대회 설정

위 값은 전부 기본값입니다. 대회를 만들 때와 **관리 → 경기 규칙** 에서 바꿉니다.

| 설정 | 기본 | 무엇 |
|---|---|---|
| 경기 방식 | 복식 2:2 | 단식으로 바꾸면 편성에서 한 명씩만 고릅니다 |
| 목표 점수 | 21 / 11 | 일반조 · 조커조 따로 |
| 듀스 | 꺼짐 | 켜면 목표에 닿아도 2점 차가 나야 끝납니다 |
| 듀스 상한 | 30 / 15 | 여기 닿으면 2점 차 없이 끝. 없애면 2점 차 날 때까지 |
| 승점 | 1.0 / 0.5 | 이겼을 때 순위표에 더해지는 점수 |
| 코트 체인지 | 꺼짐 | 정한 점수(기본 목표의 절반)에서 심판 화면에 안내 |
| '곧 차례' 알림 | 2번째 | 코트 대기 순번이 이 번호 이하가 되면 알립니다 |

설정을 바꾸면 **아직 시작하지 않은 경기**는 새 규칙으로 다시 굳고,
진행 중이거나 끝난 경기는 그대로 둡니다 — 이미 나온 결과와 순위가
소급 변조되면 안 되기 때문입니다.

---

## 설정

### 1. 환경변수

`.env.local` 을 채웁니다 (`.env.example` 참고).

| 변수 | 언제 | 어디서 |
|---|---|---|
| `VITE_SUPABASE_URL` | 지금 | Settings → **Data API** → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 지금 | Settings → **API Keys** → Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | 나중 | Settings → **API Keys** → Secret keys → Reveal (`sb_secret_…`) |

Project Ref (마이그레이션용)는 대시보드 주소창에서 바로 읽습니다:
`supabase.com/dashboard/project/` **`<이 부분>`**

**두 키의 차이**

Supabase 가 2025 년에 키 이름을 바꿨습니다. 대시보드에 보이는 새 이름 기준입니다.

| | Publishable key | Secret key |
|---|---|---|
| 예전 이름 | `anon` | `service_role` |
| 접두사 | `sb_publishable_…` | `sb_secret_…` |
| 쓰는 곳 | 브라우저 (앱 전체) | 로컬 스크립트 (시드) |
| 권한 | **없음** — RLS 정책이 결정 | **전부** — `BYPASSRLS` 로 RLS 무시 |
| 노출돼도 되나 | 네 (공개 전제로 설계됨) | **절대 안 됨** |
| 유출되면 | 아무 일 없음 | 전 대회 데이터 열람·조작·삭제 → 즉시 폐기·재발급 |

`VITE_` 가 붙은 값은 빌드 시 브라우저 번들에 문자열로 박힙니다.
Publishable key 는 그래도 되도록 만들어진 키지만, Secret key 에 붙이면
사이트 방문자 전원에게 마스터 키를 배포하는 셈이 됩니다.

레거시 `anon`/`service_role` 키도 2026 년 폐지 시한까지는 동작하지만,
새 프로젝트는 새 키(`sb_…`)를 쓰면 됩니다.

### 2. OAuth 콘솔 설정

**Redirect URI 는 3곳 모두 Supabase 주소입니다** (앱 도메인이 아님):

```
https://<project-ref>.supabase.co/auth/v1/callback
```

앱 도메인(`https://smash.juganlab.com`)이 들어가는 곳은 따로입니다:

| 서비스 | 항목 | 값 |
|---|---|---|
| Google | Authorized redirect URIs | `https://<ref>.supabase.co/auth/v1/callback` |
| Google | Authorized JavaScript origins | `http://localhost:5173`, `https://smash.juganlab.com` |
| Kakao | Redirect URI | `https://<ref>.supabase.co/auth/v1/callback` |
| Kakao | 플랫폼 → Web 사이트 도메인 | `http://localhost:5173`, `https://smash.juganlab.com` |
| Supabase | Auth → URL Config → Site URL | `https://smash.juganlab.com` |
| Supabase | Auth → URL Config → Redirect URLs | `http://localhost:5173/**`, `https://smash.juganlab.com/**` |

**함정 3가지**
1. Google OAuth 동의화면을 게시(Publish)하기 전엔 **Test users 에 등록된 계정만** 로그인됩니다.
2. Kakao 는 Client Secret 을 **생성**만 하고 "활성화 상태: 사용함"으로 바꾸지 않으면 조용히 실패합니다.
3. Kakao 이메일을 **필수 동의**로 설정하려면 비즈 앱 전환(사업자등록번호)이 필요합니다.
   이 앱은 이메일 없이 동작하도록 설계했으니 **선택 동의**로 두세요.

### 3. DB 마이그레이션

```bash
export SUPABASE_PROJECT_REF=<project-ref>
npm run db:link     # 원격 프로젝트에 연결 (DB 비밀번호를 한 번 물어봄)
npm run db:push     # supabase/migrations/*.sql 을 적용
npm run db:types    # 실제 스키마에서 src/types/database.ts 재생성
```

> `src/types/database.ts` 는 현재 **수기 임시 정의**입니다.
> `db:types` 를 한 번 돌리면 실제 스키마 기반으로 교체됩니다.

---

## 명령어

```bash
npm run dev         # 개발 서버 (localhost:5173)
npm run build       # 타입체크 + 프로덕션 빌드
npm run typecheck   # tsc -b
npm run lint        # eslint
npm run test        # vitest
npm run test:cov    # 커버리지 (임계 80%)
```

---

## 구조

```
src/
├── app/routes.tsx           라우팅 + 인증 가드
├── components/
│   ├── ui/                  Button, Badge(JokerBadge/LiveBadge)
│   ├── layout/ tournament/ match/ scoring/
├── features/auth/           AuthContext · AuthProvider · useAuth
├── lib/
│   ├── env.ts               환경변수 부팅 시 검증 (Zod)
│   ├── supabase.ts          Supabase 클라이언트
│   ├── rules.ts             ★ 경기 규칙 (목표점수·듀스·승자판정·멱등키)
│   ├── ruleSettings.ts      대회 설정의 모양과 기본값
│   ├── schedule.ts          대진표 · 코트 대기 순번
│   ├── records.ts           기록 정렬(최신순)과 이름 찾기
│   └── standings.ts         ★ 순위 정렬 (승점 → 승자승 → 득실차)
├── pages/                   화면
└── types/database.ts        DB 타입 (생성물)

supabase/migrations/
├── ..._schema.sql           테이블 · 인덱스 · 트리거
├── ..._rls.sql              RLS 헬퍼 + 정책  ← 이 앱의 유일한 보안 경계
├── ..._rpc.sql              참가 · 득점 · 취소 · 종료
└── ..._matches_standings.sql  경기 편성 · 순위 · Realtime
```

### 설계상 중요한 두 가지

**1. 점수는 원장 + 투영 구조**
`score_events` 에 append 하고 `matches.score_a/score_b` 로 투영합니다.
원장은 감사·되돌리기용, 투영은 Realtime 구독용입니다.
`client_event_id` 멱등키 덕분에 같은 요청이 두 번 도착해도 점수는 한 번만 오릅니다.

**2. 규칙은 편성 시점에 스냅샷**
목표점수·승점·듀스·상한을 `match_teams` 에 굳혀 둡니다.
대회 도중 조커 구성이나 설정을 바꿔도 이미 치른 경기의 결과와 순위가 소급 변조되지 않습니다.
컬럼을 채우는 건 `match_teams_fill_rules` 트리거입니다 — 편성 함수가 셋이라
(create_match · update_match · record_manual_match) 각자 채우게 두면 반드시 하나를 빠뜨립니다.

### 보안 경계

프론트가 Supabase 에 직접 붙으므로 **RLS 가 유일한 보안벽**입니다.
프론트의 조건부 렌더링은 UX 일 뿐 보안이 아닙니다.

- `score_events` 에는 **쓰기 정책이 하나도 없습니다** → RPC 를 우회할 방법이 없음
- `profiles` 는 본인만 조회 가능 → 남의 이메일·실명이 새지 않음
  (대회 안에서 보이는 이름은 `tournament_members.display_name`)
