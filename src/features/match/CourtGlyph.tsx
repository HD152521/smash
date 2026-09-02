import { cn } from '@/lib/utils'

/**
 * 코트 번호 옆 정비율 코트 도형 — **이 앱의 서명 요소.**
 *
 * ── 왜 전폭 배경이 아니라 작은 도형인가 (그대로 유효) ────────────────
 * v6 · v7 리뷰(찍어서 봄)에서 카드 전체를 코트 비율로 늘리는 배경 마킹을
 * 두 번 고쳤다 — 서비스 박스를 네트 쪽으로 붙이고, 카드 자체 테두리를
 * 코트 경계로 재사용해도 봤다. 그래도 카드가 5:1 에 가까운 가로로 긴
 * 비율이라 "빈 표 셀 두 개" 로만 보이고 코트로 안 읽혔다(코디네이터
 * 확인 — 두 번의 시도로 결론 남). **다음 사람이 전폭 배경 마킹을 또
 * 시도하지 않도록 이 판단을 여기 남긴다.**
 *
 * ── 2026-09-01. 시안(design/neon)에서 가져온 것 ──────────────────────
 * 시안은 코트를 **네온 와이어프레임 + 글로우**로 그리고 **번호를 원 안에
 * 크게** 넣는다. 셋 다 가져왔다:
 *   1. 상태를 **진하기가 아니라 색**으로 말한다 —
 *      라임 = 비었다(들어갈 수 있다) / 시안 = 진행 중 / 회색 = 넣을 게 없다
 *   2. 번호가 네트 한가운데 원 안에 앉는다. 원 안쪽을 카드 면색으로 채워
 *      코트 선이 숫자를 가로지르지 않게 한다
 *   3. 글로우는 `drop-shadow` **한 겹**뿐이고 **정적**이다. `box-shadow` 를
 *      여러 겹 쌓으면 코트가 넷·여덟일 때 폰에서 스크롤이 끊긴다.
 *      라이트 테마에서는 토큰(--glow-*)이 투명이라 저절로 꺼진다 —
 *      흰 면 위의 발광은 빛이 아니라 얼룩으로 보인다
 *
 * ⚠ **색 단독으로 상태를 말하지 않는다**(docs/design.md). 이 도형 옆에는
 * 항상 "비었습니다" · 점수 · "비어 있음" 글자가 함께 선다. 색은 멀리서
 * 훑을 때의 신호고, 판단은 글자가 한다.
 *
 * ⚠ 시안은 데스크톱 대시보드라 코트를 크게 그리지만 여기는 폰이다.
 * 높이는 28px 를 넘기지 않는다 — 코트가 넷일 때 첫 화면에서 코트 수가
 * 줄면 예뻐도 실패다(docs/design.md '높이를 늘리지 않고 진해진다').
 */
export type CourtGlyphState = 'open' | 'busy' | 'idle'

/**
 * 코트 이름에서 번호를 뽑는다 — **표시용일 뿐이다.**
 *
 * 코트 이름은 사람이 고칠 수 있어서('입구쪽' 처럼) 늘 숫자가 있지는 않다.
 * 없으면 원을 안 그린다. 여기서 억지로 순번(index+1)을 만들지 않는다 —
 * 이름이 '입구쪽' 인데 원 안에 3 이 떠 있으면 그게 뭔지 아무도 모른다.
 */
function courtNumber(name: string): string | null {
  return /\d{1,2}/.exec(name)?.[0] ?? null
}

const TONE: Record<CourtGlyphState, { color: string; glow: string; opacity: string }> = {
  // 들어갈 수 있다 — 네온 라임. 멀리서도 이것만 튄다
  open: { color: 'text-state-open', glow: 'drop-shadow(var(--glow-open))', opacity: 'opacity-100' },
  // 진행 중 — 시안. 경고가 아니라 '지금 살아 있다' 는 뜻이다(정체성 색)
  busy: { color: 'text-accent-500', glow: 'drop-shadow(var(--glow-busy))', opacity: 'opacity-80' },
  // 넣을 게 없다 — 조용히 둔다. 발광하지 않는다
  idle: { color: 'text-court-line', glow: 'none', opacity: 'opacity-40' },
}

export function CourtGlyph({ state, name }: { state: CourtGlyphState; name: string }) {
  const num = courtNumber(name)
  const tone = TONE[state]
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke' as const,
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 40 18"
      // 실제 코트 비율(13.4:6.1 ≈ 2.2:1). 높이 26px → 너비 58px
      className={cn('h-[26px] w-[58px] shrink-0', tone.color, tone.opacity)}
      style={{ filter: tone.glow }}
    >
      {/* 바깥 경계 — 작은 도형 안에서는 이게 있어야 '코트'로 읽힌다 */}
      <rect x="1" y="1" width="38" height="16" {...stroke} />
      {/* 네트 — 두 줄이라 '구분선'이 아니라 '네트'로 읽힌다 */}
      <line x1="19.3" y1="1" x2="19.3" y2="17" {...stroke} />
      <line x1="20.7" y1="1" x2="20.7" y2="17" {...stroke} />
      {/* 숏 서비스 라인 — 네트 가까이, 좌우 대칭 */}
      <line x1="14" y1="1" x2="14" y2="17" {...stroke} />
      <line x1="26" y1="1" x2="26" y2="17" {...stroke} />
      {/* 센터 라인 — 네트에서 바깥 경계까지, 서비스 코트를 위아래로 가른다 */}
      <line x1="1" y1="9" x2="19.3" y2="9" {...stroke} />
      <line x1="20.7" y1="9" x2="39" y2="9" {...stroke} />

      {num && (
        <>
          {/*
            원 안쪽을 카드 면색으로 채운다. 채우지 않으면 네트 두 줄과
            센터 라인이 숫자를 정확히 가로질러 번호를 못 읽는다.
          */}
          <circle cx="20" cy="9" r="6.2" fill="var(--surface-1)" />
          <circle cx="20" cy="9" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <text
            x="20"
            y="9"
            textAnchor="middle"
            dominantBaseline="central"
            /* 두 자리는 좁혀야 원 밖으로 안 나간다 */
            fontSize={num.length > 1 ? 6.4 : 8.4}
            fontWeight={900}
            fill="currentColor"
          >
            {num}
          </text>
        </>
      )}
    </svg>
  )
}
