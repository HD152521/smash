import { useState, type FormEvent } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { RuleFields } from '@/features/tournament/RuleFields'
import { DEFAULT_RULES, ruleSummary, type RuleSettings } from '@/lib/ruleSettings'
import { useCreateTournament, useProfileName } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

const MIN_GROUPS = 2
const MAX_GROUPS = 20

export function CreateTournamentPage() {
  const navigate = useNavigate()
  const create = useCreateTournament()
  const { data: profileName } = useProfileName()

  const [name, setName] = useState('')
  const [groupCount, setGroupCount] = useState(4)
  const [jokerCount, setJokerCount] = useState(0)
  const [rules, setRules] = useState<RuleSettings>(DEFAULT_RULES)

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
        config: rules,
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
        조 구성과 경기 규칙은 만든 뒤에도 바꿀 수 있지만, 경기를 시작하면 결과에 영향을 줍니다.
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
          hint={`1조부터 순서대로 지정됩니다 · 조커조는 ${rules.jokerPoints}점만 내면 이기지만 승점은 ${rules.jokerWinPoints}점`}
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
                    <span className="tabular text-xs font-black">🃏 {rules.jokerPoints}점</span>
                  ) : (
                    <span className="tabular text-xs font-medium text-ink-3">
                      {rules.normalPoints}점
                    </span>
                  )}
                </span>
              )
            })}
          </div>
          {jokerCount === groupCount && groupCount > 0 && (
            <p className="mt-2 text-xs text-warn-fg">
              모든 조가 조커조입니다. 전부 같은 조건이라 핸디캡 효과가 없습니다.
            </p>
          )}
        </section>

        {/*
          접어 둔다. 기본값(복식 21점)으로 여는 대회가 대부분인데 설정을 전부
          펼쳐 두면 이름만 쓰고 만들려던 사람이 읽을 게 늘어난다.
          접힌 채로도 뭐가 들었는지는 요약으로 보인다.
        */}
        <details className="rounded-2xl border border-border-subtle p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink-2">
            경기 규칙 바꾸기
            <span className="ml-2 font-normal text-ink-3">{ruleSummary(rules)}</span>
          </summary>
          <div className="mt-5">
            <RuleFields value={rules} onChange={setRules} jokerCount={jokerCount} />
          </div>
        </details>

        {create.error && (
          <p role="alert" className="text-sm font-medium text-team-b-fg">
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
