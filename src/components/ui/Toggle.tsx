import { cn } from '@/lib/utils'

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

/**
 * 켜고 끄는 스위치.
 *
 * 진짜 checkbox 위에 모양만 올린다. 버튼에 role="switch" 를 다는 방법도 있지만,
 * label 로 감싼 input 은 라벨 아무 데나 눌러도 켜지고 폼 안에서 그냥 동작한다 —
 * 코트 옆에서 엄지로 누르는 화면에서는 누를 수 있는 면적이 넓은 쪽이 낫다.
 */
export function Toggle({ label, hint, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4',
        'focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-brand-600',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div>
        <p className="text-sm font-semibold text-ink-2">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      </div>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'block h-7 w-12 rounded-full transition-colors',
            checked ? 'bg-brand-600' : 'bg-surface-2 ring-1 ring-border-subtle ring-inset',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  )
}
