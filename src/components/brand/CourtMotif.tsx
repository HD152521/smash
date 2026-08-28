import { cn } from '@/lib/utils'

/**
 * 코트 라인 모티프 — 로그인 · 홈 머리에 아주 옅게 까는 배경 장식.
 *
 * docs/design.md 「재료」 절의 코트 라인(흰 선, 좌우 대칭 — 서비스 라인 ·
 * 센터 라인 · 복식 사이드라인)을 그대로 옮긴다. **배경 레이어**로만 쓴다 —
 * 글자 위에 얹지 않고, 코트 카드(`CourtBoard`)의 `--court-line` 토큰과 옅은
 * 정도(0.06~0.07)를 그대로 맞춰 같은 재료로 보이게 한다. 항상
 * `aria-hidden` — 장식일 뿐 정보가 없다.
 *
 * 획 두께를 `vector-effect="non-scaling-stroke"` 로 고정해 컨테이너 크기가
 * 바뀌어도 선이 가늘어지지 않는다.
 */
export function CourtMotif({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      // SVG 는 대체 요소(replaced element)라 `inset-x-0` 만으로는 안 늘어난다
      // — `w-full` 을 명시해야 컨테이너 너비를 그대로 따라간다.
      //
      // 불투명도는 코트 카드(`CourtBoard`)의 가장 옅은 값(0.07)보다 조금
      // 올린다(0.11) — 카드는 이름·점수라는 확실한 내용 위의 질감이지만,
      // 여기는 배경 그 자체가 "장식이 있다" 는 걸 알려야 하는 자리다.
      className={cn('pointer-events-none w-full text-court-line opacity-[0.11]', className)}
    >
      {/* 바깥 라인 */}
      <rect
        x={4}
        y={4}
        width={392}
        height={152}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      {/* 복식 사이드라인 */}
      <rect
        x={26}
        y={4}
        width={348}
        height={152}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {/* 서비스 라인 (위·아래) */}
      <line x1={4} y1={34} x2={396} y2={34} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <line x1={4} y1={126} x2={396} y2={126} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* 네트 — 센터 라인 */}
      <line x1={200} y1={4} x2={200} y2={156} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
