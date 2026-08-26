import { cn } from '@/lib/utils'

/**
 * 고르기 단추 하나 — 코트 · 조 · 심판이 같은 모양을 쓴다.
 *
 * 편성·지난 결과·수정이 한 화면에 겹쳐 있을 때는 그 파일 안의 지역
 * 컴포넌트였다. 화면을 셋으로 가르면서 세 곳이 같이 쓰게 돼 여기로 나왔다.
 */
export function Chip({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-30',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
