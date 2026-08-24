import { Stepper } from '@/components/ui/Stepper'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/lib/utils'
import type { RuleSettings } from '@/lib/ruleSettings'

/**
 * 대회에 하나뿐인 경기 규칙을 고르는 입력 묶음.
 * 만들 때(CreateTournamentPage)와 만든 뒤(AdminRulesPage)가 같은 화면을 쓴다.
 *
 * 두 화면이 각자 입력을 그리면 한쪽에만 새 설정이 붙는 일이 반드시 생긴다.
 * 실제로 format(단식/복식)과 승점은 서버가 읽어 쓰는데도 화면이 없어서
 * 아무도 바꿀 수 없었다.
 *
 * 값의 모양과 기본값은 lib/ruleSettings.ts 에 있다.
 */
interface RuleFieldsProps {
  value: RuleSettings
  onChange: (next: RuleSettings) => void
  /** 조커조가 없으면 조커 관련 입력을 통째로 숨긴다 */
  jokerCount: number
  disabled?: boolean
}

export function RuleFields({ value, onChange, jokerCount, disabled = false }: RuleFieldsProps) {
  // 불변으로 바꾼다 — 원본을 건드리면 부모의 이전 상태와 같은 객체가 되어
  // 리렌더가 안 돈다.
  function set<K extends keyof RuleSettings>(key: K, v: RuleSettings[K]) {
    onChange({ ...value, [key]: v })
  }

  const hasJoker = jokerCount > 0

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-4">
        <h3 className="text-xs font-black tracking-wide text-ink-3 uppercase">경기 방식</h3>
        <Segmented
          label="한 팀 인원"
          value={value.format}
          disabled={disabled}
          onChange={(v) => set('format', v)}
          options={[
            { value: 'doubles', label: '복식 2:2' },
            { value: 'singles', label: '단식 1:1' },
          ]}
        />
      </section>

      <section className="flex flex-col gap-5">
        <h3 className="text-xs font-black tracking-wide text-ink-3 uppercase">점수</h3>

        <Stepper
          label="일반조 목표 점수"
          value={value.normalPoints}
          min={1}
          max={99}
          suffix="점"
          disabled={disabled}
          onChange={(v) => set('normalPoints', v)}
        />
        {hasJoker && (
          <Stepper
            label="조커조 목표 점수"
            hint="적은 점수로 이기는 대신 승점이 절반입니다"
            value={value.jokerPoints}
            min={1}
            max={99}
            suffix="점"
            disabled={disabled}
            onChange={(v) => set('jokerPoints', v)}
          />
        )}
        {hasJoker && value.jokerPoints >= value.normalPoints && (
          <p className="text-xs text-warn-fg">
            조커조 목표가 일반조보다 낮지 않으면 핸디캡이 되지 않습니다.
          </p>
        )}

        <Toggle
          label="듀스"
          hint="목표 점수에 닿아도 2점 차가 나야 끝납니다"
          checked={value.deuce}
          disabled={disabled}
          onChange={(v) =>
            // 켜면서 상한을 기본값으로 채운다. 상한 없는 듀스는 끝이 안 나는
            // 경기를 만들 수 있어서, 그건 일부러 고르게 한다.
            onChange({
              ...value,
              deuce: v,
              deuceCap: v ? (value.deuceCap ?? Math.min(99, value.normalPoints + 9)) : null,
              jokerDeuceCap: v
                ? (value.jokerDeuceCap ?? Math.min(99, value.jokerPoints + 4))
                : null,
            })
          }
        />

        {value.deuce && (
          <div className="flex flex-col gap-5 border-l-2 border-border-subtle pl-4">
            <OptionalStepper
              label="일반조 듀스 상한"
              hint="이 점수에 닿으면 2점 차가 아니어도 끝납니다"
              offLabel="상한 없음 (2점 차 날 때까지)"
              value={value.deuceCap}
              min={value.normalPoints}
              max={99}
              fallback={Math.min(99, value.normalPoints + 9)}
              disabled={disabled}
              onChange={(v) => set('deuceCap', v)}
            />
            {hasJoker && (
              <OptionalStepper
                label="조커조 듀스 상한"
                offLabel="상한 없음"
                value={value.jokerDeuceCap}
                min={value.jokerPoints}
                max={99}
                fallback={Math.min(99, value.jokerPoints + 4)}
                disabled={disabled}
                onChange={(v) => set('jokerDeuceCap', v)}
              />
            )}
          </div>
        )}

        <Stepper
          label="일반조 승점"
          hint="이겼을 때 순위표에 더해지는 점수"
          value={value.winPoints}
          min={0}
          max={99}
          step={0.5}
          disabled={disabled}
          onChange={(v) => set('winPoints', v)}
        />
        {hasJoker && (
          <Stepper
            label="조커조 승점"
            value={value.jokerWinPoints}
            min={0}
            max={99}
            step={0.5}
            disabled={disabled}
            onChange={(v) => set('jokerWinPoints', v)}
          />
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h3 className="text-xs font-black tracking-wide text-ink-3 uppercase">코트 체인지</h3>
        <Toggle
          label="코트 바꾸기 안내"
          hint="정해진 점수가 되면 심판 화면에 알려 줍니다"
          checked={value.courtChange}
          disabled={disabled}
          onChange={(v) => set('courtChange', v)}
        />
        {value.courtChange && (
          <div className="border-l-2 border-border-subtle pl-4">
            <OptionalStepper
              label="바꾸는 점수"
              offLabel={`목표 점수의 절반 (${Math.ceil(value.normalPoints / 2)}점)`}
              value={value.courtChangeAt}
              min={1}
              max={Math.max(1, Math.max(value.normalPoints, value.jokerPoints) - 1)}
              fallback={Math.ceil(value.normalPoints / 2)}
              disabled={disabled}
              onChange={(v) => set('courtChangeAt', v)}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h3 className="text-xs font-black tracking-wide text-ink-3 uppercase">알림</h3>
        <Stepper
          label="'곧 차례' 알림"
          hint="코트 대기 순번이 이 번호 이하가 되면 알립니다"
          value={value.readyQueuePosition}
          min={1}
          max={10}
          suffix="번째"
          disabled={disabled}
          onChange={(v) => set('readyQueuePosition', v)}
        />
      </section>
    </div>
  )
}

/**
 * 값이 없을 수도 있는 숫자.
 *
 * null 은 '아직 안 정함' 이 아니라 뜻이 있는 값이다 (상한 없음 / 자동 계산).
 * 그래서 0 이나 빈칸으로 표현하지 않고 상태를 글로 쓴다.
 */
function OptionalStepper({
  label,
  hint,
  offLabel,
  value,
  min,
  max,
  fallback,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  /** null 일 때 그 뜻을 설명하는 문구 */
  offLabel: string
  value: number | null
  min: number
  max: number
  /** 켤 때 채울 값 */
  fallback: number
  disabled?: boolean
  onChange: (v: number | null) => void
}) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-2">{label}</p>
          <p className="mt-0.5 text-xs text-ink-3">{offLabel}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(Math.min(max, Math.max(min, fallback)))}
          className="h-11 shrink-0 rounded-xl border border-border-subtle px-3 text-sm font-bold
                     text-brand-fg transition-colors hover:bg-surface-2
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                     disabled:opacity-40"
        >
          직접 정하기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Stepper
        label={label}
        hint={hint}
        value={Math.min(max, Math.max(min, value))}
        min={min}
        max={max}
        suffix="점"
        disabled={disabled}
        onChange={onChange}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className="w-fit rounded-lg px-1 py-0.5 text-xs font-semibold text-ink-3 underline
                   underline-offset-2 transition-colors hover:text-ink-1
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {offLabel}로 두기
      </button>
    </div>
  )
}

/** 둘 중 하나 고르기 — 라디오지만 손가락으로 누르는 크기로 */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-12 flex-1 rounded-xl border text-sm font-bold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
            'disabled:opacity-40',
            value === o.value
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border-subtle bg-surface-1 text-ink-2 hover:bg-surface-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
