import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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
 * 세로 여백으로 44px 를 만들되 글자 위치는 왼쪽 마이너스 마진으로 상쇄한다.
 */
export function BackLink({
  to,
  children,
  className,
}: {
  /** 되짚을 히스토리가 없을 때만 쓰는 목적지 */
  to: string
  children: React.ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.key !== 'default'

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(to))}
      className={cn(
        '-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2',
        'text-sm font-medium text-ink-2 transition-colors hover:text-ink-1',
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
