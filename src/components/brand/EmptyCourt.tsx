/**
 * 빈 코트 — 위에서 본 코트, 선화.
 *
 * `Shuttlecock` 과 짝을 이루는 두 번째(이자 마지막) 빈 상태 일러스트다
 * (docs/design.md — "두세 종류면 충분하다").
 *
 * ⚠ **정비율을 지킨다 (2026-08-28, 코디네이터 확인).** 처음엔 가로로 눌린
 * 사각형(48:40 ≈ 1.2:1)이었는데 "격자로 보인다" — 코트로 안 읽혔다.
 * 코트 카드에서 `CourtBadge` 가 똑같은 문제를 두 번 겪고 정비율(실제 코트
 * 13.4:6.1 ≈ 2.2:1)로 해결한 걸 그대로 가져온다 — 같은 viewBox 비율,
 * 같은 마킹 구성(바깥 경계 · 네트 · 숏 서비스 라인 · 센터 라인)이다.
 * `CourtBadge` 는 40×18px 짜리 작은 배지라 선이 가늘어도 됐지만, 여기는
 * 빈 상태의 주 일러스트라 훨씬 크게 그린다 — 획도 그만큼 굵게 둔다.
 *
 * `currentColor` · `vector-effect="non-scaling-stroke"` 로 `Shuttlecock` 과
 * 같은 규칙을 따른다.
 */
interface EmptyCourtProps {
  /** 세로 높이(px). 가로는 실제 코트 비율(2.2:1)로 자동 계산한다 */
  height?: number
  className?: string
  title?: string
}

/** 실제 코트 비율 — 13.4m : 6.1m. `CourtBadge` 의 viewBox(0 0 40 18)와 같다 */
const COURT_RATIO = 40 / 18

export function EmptyCourt({ height = 80, className, title }: EmptyCourtProps) {
  const decorative = !title
  const width = Math.round(height * COURT_RATIO)

  const line = {
    stroke: 'currentColor',
    vectorEffect: 'non-scaling-stroke' as const,
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 18"
      fill="none"
      className={className}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
    >
      {title && <title>{title}</title>}
      {/* 바깥 경계 — 이게 있어야 '코트' 로 읽힌다 */}
      <rect x={1} y={1} width={38} height={16} strokeWidth={2} {...line} />
      {/* 네트 — 두 줄이라 '구분선' 이 아니라 '네트' 로 읽힌다 */}
      <line x1={19.3} y1={1} x2={19.3} y2={17} strokeWidth={2} {...line} />
      <line x1={20.7} y1={1} x2={20.7} y2={17} strokeWidth={2} {...line} />
      {/* 숏 서비스 라인 — 네트 가까이, 좌우 대칭 */}
      <line x1={14} y1={1} x2={14} y2={17} strokeWidth={1.3} {...line} />
      <line x1={26} y1={1} x2={26} y2={17} strokeWidth={1.3} {...line} />
      {/* 센터 라인 — 네트에서 바깥 경계까지, 서비스 코트를 위아래로 가른다 */}
      <line x1={1} y1={9} x2={19.3} y2={9} strokeWidth={1.3} {...line} />
      <line x1={20.7} y1={9} x2={39} y2={9} strokeWidth={1.3} {...line} />
    </svg>
  )
}
