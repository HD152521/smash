import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  /** 값 옆에 붙는 단위 (점, 번째 …) */
  suffix?: string
  /** 소수 단위로 오르내려야 할 때 (승점 0.5) */
  step?: number
  disabled?: boolean
}

/**
 * 숫자 하나를 올리고 내린다.
 *
 * 체육관에서 폰으로 누른다. 숫자 입력창을 쓰면 키패드가 화면 절반을 덮고,
 * 소수점·마이너스를 넣을 수 있어서 검증할 게 늘어난다. 버튼 두 개면
 * 범위를 벗어난 값이 애초에 만들어지지 않는다.
 */
export function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  suffix,
  step = 1,
  disabled = false,
}: StepperProps) {
  // 0.5 씩 더하면 부동소수 찌꺼기가 붙는다 (1.1 + 0.5 = 1.6000000000000001)
  const round = (n: number) => Math.round(n * 100) / 100

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-2">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => onChange(round(value - step))}
            disabled={disabled || value <= min}
            aria-label={`${label} 줄이기`}
            className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors
                       hover:bg-surface-2 hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                       disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <output className="tabular min-w-9 px-1 text-center text-lg font-black text-ink-1">
            {value}
            {suffix && <span className="ml-0.5 text-xs font-bold text-ink-3">{suffix}</span>}
          </output>
          <button
            type="button"
            onClick={() => onChange(round(value + step))}
            disabled={disabled || value >= max}
            aria-label={`${label} 늘리기`}
            className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors
                       hover:bg-surface-2 hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                       disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
