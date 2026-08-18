import { useState, type FormEvent } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useCreateTournament, useProfileName } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

const MIN_GROUPS = 2
const MAX_GROUPS = 20
const DEFAULT_NORMAL_POINTS = 21
const DEFAULT_JOKER_POINTS = 11

export function CreateTournamentPage() {
  const navigate = useNavigate()
  const create = useCreateTournament()
  const { data: profileName } = useProfileName()

  const [name, setName] = useState('')
  const [groupCount, setGroupCount] = useState(4)
  const [jokerCount, setJokerCount] = useState(0)
  const [normalPoints, setNormalPoints] = useState(DEFAULT_NORMAL_POINTS)
  const [jokerPoints, setJokerPoints] = useState(DEFAULT_JOKER_POINTS)

  // 조를 줄였는데 조커 수가 그대로면 말이 안 된다. 같이 줄인다.
  function changeGroupCount(next: number) {
    const clamped = Math.min(MAX_GROUPS, Math.max(MIN_GROUPS, next))
    setGroupCount(clamped)
    if (jokerCount > clamped) setJokerCount(clamped)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const tournament = await create.mutateAsync({
        name: name.trim(),
        groupCount,
        jokerGroupCount: jokerCount,
        displayName: profileName ?? '주최자',
        normalPoints,
        jokerPoints,
      })
      navigate(`/t/${tournament.id}`, { replace: true })
    } catch {
      // create.error 로 화면에 뿌린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 pt-6 pb-16">
      <BackLink to="/">메인으로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">대회 만들기</h1>
      <p className="mt-2 text-sm text-ink-2">
        조 구성은 만든 뒤에도 바꿀 수 있지만, 경기를 시작하면 결과에 영향을 줍니다.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-7">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">대회 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoFocus
            placeholder="예) 2026 상반기 정기전"
            className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>

        <Stepper
          label="조 개수"
          hint="참가자는 나중에 직접 조를 고릅니다"
          value={groupCount}
          min={MIN_GROUPS}
          max={MAX_GROUPS}
          onChange={changeGroupCount}
        />

        <Stepper
          label="조커조 개수"
          hint={`1조부터 순서대로 지정됩니다 · 조커조는 ${jokerPoints}점만 내면 이기지만 승점은 0.5점`}
          value={jokerCount}
          min={0}
          max={groupCount}
          onChange={setJokerCount}
        />

        {/* 조커가 어디에 붙는지 글로 설명하면 헷갈린다. 그냥 보여준다. */}
        <section aria-label="조 구성 미리보기">
          <p className="mb-2 text-sm font-semibold text-ink-2">이렇게 만들어집니다</p>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-surface-2 p-3">
            {Array.from({ length: groupCount }, (_, i) => {
              const isJoker = i < jokerCount
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold',
                    isJoker
                      ? 'bg-joker-soft text-joker-ink ring-1 ring-joker/40'
                      : 'bg-surface-1 text-ink-1 ring-1 ring-border-subtle',
                  )}
                >
                  {i + 1}조
                  {isJoker ? (
                    <span className="tabular text-xs font-black">🃏 {jokerPoints}점</span>
                  ) : (
                    <span className="tabular text-xs font-medium text-ink-3">{normalPoints}점</span>
                  )}
                </span>
              )
            })}
          </div>
          {jokerCount === groupCount && groupCount > 0 && (
            <p className="mt-2 text-xs text-warn">
              모든 조가 조커조입니다. 전부 같은 조건이라 핸디캡 효과가 없습니다.
            </p>
          )}
        </section>

        <details className="rounded-2xl border border-border-subtle p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink-2">
            경기 규칙 바꾸기
            <span className="ml-2 font-normal text-ink-3">
              복식 · {normalPoints}점 단판 · 듀스 없음
            </span>
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            <Stepper
              label="일반조 목표 점수"
              value={normalPoints}
              min={1}
              max={99}
              onChange={setNormalPoints}
            />
            <Stepper
              label="조커조 목표 점수"
              value={jokerPoints}
              min={1}
              max={99}
              onChange={setJokerPoints}
            />
            {jokerPoints >= normalPoints && jokerCount > 0 && (
              <p className="text-xs text-warn">
                조커조 목표가 일반조보다 낮지 않으면 핸디캡이 되지 않습니다.
              </p>
            )}
          </div>
        </details>

        {create.error && (
          <p role="alert" className="text-sm font-medium text-team-b">
            {toUserMessage(create.error, '대회를 만들지 못했습니다')}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          className="w-full"
          loading={create.isPending}
          disabled={!name.trim()}
        >
          대회 만들기
        </Button>
      </form>
    </main>
  )
}

interface StepperProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}

function Stepper({ label, hint, value, min, max, onChange }: StepperProps) {
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
            onClick={() => onChange(value - 1)}
            disabled={value <= min}
            aria-label={`${label} 줄이기`}
            className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors
                       hover:bg-surface-2 hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                       disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <output className="tabular w-9 text-center text-lg font-black text-ink-1">{value}</output>
          <button
            type="button"
            onClick={() => onChange(value + 1)}
            disabled={value >= max}
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
