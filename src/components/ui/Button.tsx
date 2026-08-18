import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-900 focus-visible:outline-brand-600',
  secondary:
    'bg-surface-1 text-ink-1 border border-border-subtle hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-brand-600',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink-1 focus-visible:outline-brand-600',
  danger:
    'bg-team-b text-white hover:brightness-95 active:brightness-90 focus-visible:outline-team-b',
}

// 체육관에서 폰으로 누른다. 최소 44px 는 접근성 권고이자 실전 요구사항이다.
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] rounded-xl gap-2',
  lg: 'h-13 px-5 text-base rounded-xl gap-2',
  xl: 'h-16 px-6 text-lg rounded-2xl gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-[background-color,transform,filter] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
})
