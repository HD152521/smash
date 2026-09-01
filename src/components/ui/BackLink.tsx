import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 화면 하나를 떠나는 **길 하나** — 정해진 곳으로, 이름을 말하면서.
 *
 * ## 2026-09-01 — 히스토리 되짚기를 걷어냈다
 *
 * 어제까지 이 버튼은 `navigate(-1)` 이었다. 그때는 그게 맞았다. 전역
 * 탭바가 없어서 **이 버튼이 유일한 출구**였고, 유일한 출구라면 온 길을
 * 그대로 되짚는 것이 가장 덜 놀랍다.
 *
 * 그 전제가 무너졌다. 이제 대부분의 화면은 하단탭(`AppTabBar` ·
 * `TournamentTabBar`)으로 나갈 수 있다. 그러면 이 버튼은 **두 번째 출구**가
 * 되는데, 하필 자기가 어디로 가는지 말하지 못한다 — 되짚는 동안에는 목적지를
 * 알 수 없어서 글자가 '뒤로' 로 고정됐다. 출구가 둘인데 하나는 어디로
 * 가는지 안 적혀 있으면, 사람은 둘 다 덜 믿고 아무거나 눌러 본다.
 *
 * 그래서 되짚기를 버리고 **못 박은 목적지 하나**만 남긴다. 글자와 실제로
 * 가는 곳이 항상 같다 — 누르기 전에 어디로 가는지 읽을 수 있다.
 *
 * 잃은 것은 "방금 보던 목록으로 정확히 돌아가기" 다. 대신 얻은 것이
 * 크다: 카톡 링크로 바로 들어온 사람이든 세 화면을 지나온 사람이든
 * **같은 글자를 누르면 같은 곳에 떨어진다.** 되짚기가 진짜 필요한 곳
 * (모임 경기 고치기 — 코트에서 왔는지 대진표에서 왔는지)은 히스토리가
 * 아니라 `location.state` 로 어디서 왔는지를 넘겨 목적지를 정한다
 * (`SessionMatchEditPage`) — 그건 되짚기가 아니라 **아는 곳으로 가기**다.
 *
 * ## 버튼이 아니라 링크다
 *
 * 목적지가 못 박혀 있으므로 진짜 `<a>` 여야 한다. 화면 낭독기가 링크로
 * 읽고, 길게 눌러 새 탭으로 열 수 있고, 무엇보다 **주소가 코드가 아니라
 * 마크업에 적힌다** — 예전 `<button onClick={navigate}>` 은 어디로 가는지
 * 눌러 봐야만 알 수 있었다.
 *
 * ## 탭 영역
 *
 * 폰에서 화면 맨 위 구석의 20px 짜리 표적은 엄지로 잘 안 맞는다. 세로
 * 여백으로 48px 를 만들되 글자 위치는 왼쪽 마이너스 마진으로 상쇄한다.
 * 44px(권장 최소치)에서 48px 로 키웠다 — 저녁 내내 한 손으로 쓰는 화면에서
 * 최소치에 딱 맞추면 걸어 다니며 누를 때 실제로 빗나간다. 좌우 여백도
 * 8px→12px 로 넓혀 표적을 가로로도 키웠다.
 */
export function BackLink({
  to,
  children,
  className,
}: {
  /** 항상 여기로 간다. 히스토리를 보지 않는다 */
  to: string
  /** 가는 곳의 이름. '뒤로' 처럼 목적지를 감추는 말은 쓰지 않는다 */
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        // `shrink-0 whitespace-nowrap` — 출구가 줄바꿈되면 안 된다. 옆에 제목이
        // 서면서 좁은 폰(320px)에서 글자가 세 줄로 접힌 적이 있다.
        '-ml-3 inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-3 whitespace-nowrap',
        'text-sm font-medium text-ink-2 transition-colors hover:text-ink-1',
        // 눌렀다는 표시. 폰에서는 hover 가 없다.
        'active:bg-surface-2 active:text-ink-1',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  )
}
