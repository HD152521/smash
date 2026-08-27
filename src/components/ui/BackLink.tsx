import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCanGoBack } from '@/hooks/useCanGoBack'
import { cn } from '@/lib/utils'

/**
 * 뒤로가기.
 *
 * 고정된 곳으로 보내면 안 된다. 대진표에서 경기로 들어갔는데 뒤로가 대회
 * 메인이면, 방금 보던 목록으로 돌아가려고 한 번 더 눌러야 한다.
 * 실제로 온 길을 되짚어야 한다 — 브라우저 히스토리를 쓴다.
 *
 * 다만 링크를 눌러 이 화면으로 바로 들어온 경우(카톡으로 받은 주소 등)에는
 * 되짚을 히스토리가 없다. 그대로 back 하면 앱 밖으로 나가버리므로,
 * 그때만 to 로 보낸다. location.key 가 'default' 면 이 앱에서 연 첫 화면이다.
 *
 * 탭 영역: 폰에서 화면 맨 위 구석의 20px 짜리 표적은 엄지로 잘 안 맞는다.
 * 세로 여백으로 48px 를 만들되 글자 위치는 왼쪽 마이너스 마진으로 상쇄한다.
 * 44px(권장 최소치)에서 48px 로 키웠다 — 저녁 내내 한 손으로 쓰는 화면에서
 * 최소치에 딱 맞추면 걸어 다니며 누를 때 실제로 빗나간다. 좌우 여백도
 * 8px→12px 로 넓혀 표적을 가로로도 키웠다.
 */
export function BackLink({
  to,
  children,
  className,
  fixed = false,
}: {
  /** 되짚을 히스토리가 없을 때만 쓰는 목적지 (fixed 면 항상 여기로) */
  to: string
  children: React.ReactNode
  className?: string
  /**
   * 히스토리를 무시하고 항상 to 로 간다.
   *
   * 한 화면에서 같은 일을 반복하는 곳(경기 편성)에서는 히스토리가 그 화면으로
   * 잔뜩 쌓인다. 그때 뒤로가기가 히스토리를 따라가면 같은 화면을 몇 번이고
   * 지나야 빠져나온다. 그런 곳은 부모 화면을 못 박는 게 낫다.
   */
  fixed?: boolean
}) {
  const navigate = useNavigate()
  const canGoBack = useCanGoBack(fixed)

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(to))}
      className={cn(
        // `shrink-0 whitespace-nowrap` — 출구가 줄바꿈되면 안 된다. 오른쪽에
        // 홈까지 서면서 좁은 폰(320px)에서 '나가기' 가 세 줄로 접혔다.
        '-ml-3 inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-3 whitespace-nowrap',
        'text-sm font-medium text-ink-2 transition-colors hover:text-ink-1',
        // 눌렀다는 표시. 폰에서는 hover 가 없다.
        'active:bg-surface-2 active:text-ink-1',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {/* 실제로 가는 곳과 글자가 달라지면 안 된다. 히스토리로 갈 때는
          어디로 갈지 알 수 없으므로 '뒤로' 라고만 쓴다. */}
      {canGoBack ? '뒤로' : children}
    </button>
  )
}
