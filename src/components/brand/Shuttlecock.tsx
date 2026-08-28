/**
 * 셔틀콕 — 이 앱의 마크.
 *
 * 배드민턴 셔틀콕은 코르크 반구 위에 깃털 16개가 원뿔로 퍼지는 모양이다.
 * 실루엣이 아주 특징적이라 단순화해도 알아본다 — 코르크(채운 타원) +
 * 위로 퍼지는 깃 테두리 + 갈비 세 줄이면 충분하다.
 *
 * `currentColor` 를 써서 다크 모드가 저절로 따라온다. `size` 로 크기를
 * 받되 획 두께는 `vector-effect="non-scaling-stroke"` 로 고정한다 —
 * viewBox 를 그대로 늘리면 작은 화면에서 선이 가늘어져 뭉개진다
 * (docs/design.md 「선화」).
 *
 * 장식이면 `aria-hidden`, 뜻이 있으면 `title` 을 넘겨 `role="img"` 로 읽힌다.
 */
interface ShuttlecockProps {
  size?: number
  className?: string
  /** 뜻이 있는 경우에만 넘긴다. 넘기면 aria-hidden 대신 role="img" 로 읽힌다 */
  title?: string
}

export function Shuttlecock({ size = 24, className, title }: ShuttlecockProps) {
  const decorative = !title

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
    >
      {title && <title>{title}</title>}
      {/* 깃 테두리 — 좌우 대칭으로 퍼지는 선 */}
      <path
        d="M17.8 35 C12 29 6 19 5 9"
        strokeWidth={2.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M30.2 35 C36 29 42 19 43 9"
        strokeWidth={2.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 깃 위쪽 테두리 */}
      <path
        d="M5 9 Q24 3 43 9"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 깃살 세 줄 — 원뿔로 퍼지는 결 */}
      <path
        d="M20 34.5 L15 10.5"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M24 35 L24 8"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M28 34.5 L33 10.5"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 코르크 — 채운 도형 하나로 "진하게" 무게를 준다 */}
      <ellipse cx={24} cy={38.5} rx={6.6} ry={5} fill="currentColor" stroke="none" />
    </svg>
  )
}
