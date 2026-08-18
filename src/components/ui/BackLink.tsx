import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 뒤로가기 링크.
 *
 * 14개 화면에 같은 마크업이 복사돼 있었고, 전부 높이 20px 였다.
 * 폰에서 화면 맨 위 구석에 있는 20px 짜리 표적은 엄지로 잘 안 맞는다.
 * 세로 여백을 줘서 탭 영역을 44px 로 만들되, 글자 위치는 그대로 보이게
 * 왼쪽 마이너스 마진으로 상쇄한다.
 */
export function BackLink({
  to,
  children,
  className,
}: {
  to: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        '-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2',
        'text-sm font-medium text-ink-2 transition-colors hover:text-ink-1',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  )
}
