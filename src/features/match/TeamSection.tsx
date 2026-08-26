import { Check } from 'lucide-react'
import { Chip } from './Chip'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow } from '@/types/database'

interface TeamSectionProps {
  side: 'A' | 'B'
  label: string
  groups: GroupRow[]
  members: MemberSummary[]
  selectedGroup: string
  disabledGroup: string
  onSelectGroup: (groupId: string) => void
  selectedPlayers: string[]
  onTogglePlayer: (memberId: string) => void
  squadSize: number
  target: number
  isJoker: boolean
}

/**
 * 한 편 고르기 — 조를 고르고, 그 조에서 선수를 고른다.
 *
 * 편성 · 지난 결과 입력 · 수정, 세 화면이 **똑같이** 하는 유일한 절차라
 * 화면을 가르면서 여기로 뺐다. 세 화면이 이 파일 하나를 본다 —
 * 복사본을 만들면 조커조 규칙이 한쪽에서만 바뀌는 날이 온다.
 */
export function TeamSection({
  side,
  label,
  groups,
  members,
  selectedGroup,
  disabledGroup,
  onSelectGroup,
  selectedPlayers,
  onTogglePlayer,
  squadSize,
  target,
  isJoker,
}: TeamSectionProps) {
  const roster = members.filter((m) => m.groupId === selectedGroup)

  return (
    <section aria-label={label} className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink-2">
          <span className={cn('font-black', side === 'A' ? 'text-team-a' : 'text-team-b-fg')}>
            {label}
          </span>
        </h2>
        {selectedGroup && (
          <span className="tabular text-xs font-bold text-ink-3">
            {isJoker && '🃏 '}
            목표 {target}점
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {groups.map((g) => (
          <Chip
            key={g.id}
            active={selectedGroup === g.id}
            disabled={disabledGroup === g.id}
            onClick={() => onSelectGroup(g.id)}
          >
            {g.name}
            {g.is_joker && ' 🃏'}
          </Chip>
        ))}
      </div>

      {selectedGroup && (
        <>
          <p className="mt-3 text-xs text-ink-3">
            {selectedPlayers.length} / {squadSize}명 선택
          </p>
          {roster.length === 0 ? (
            <p className="mt-2 text-sm text-warn-fg">이 조에 배정된 참가자가 없습니다.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roster.map((m) => {
                const on = selectedPlayers.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onTogglePlayer(m.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition-colors',
                      on
                        ? side === 'A'
                          ? 'border-team-a bg-team-a-soft text-ink-1'
                          : 'border-team-b bg-team-b-soft text-ink-1'
                        : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
