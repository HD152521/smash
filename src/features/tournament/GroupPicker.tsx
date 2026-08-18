import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupRow, TournamentConfig } from '@/types/database'
import type { MemberSummary } from './api'

interface GroupPickerProps {
  groups: GroupRow[]
  members: MemberSummary[]
  config: TournamentConfig | undefined
  selectedGroupId: string | null
  onSelect: (groupId: string) => void
  disabled?: boolean
  /** 이미 고른 조를 다시 눌러 해제할 수 있는지. 온보딩에서는 막는다. */
  allowDeselect?: boolean
}

/**
 * 조 선택 UI. 온보딩(setup)과 설정(settings) 두 곳에서 같은 걸 쓴다.
 *
 * 조커 여부는 색만으로 구분하지 않는다 — 배지 + "조커" 글자 + 목표 점수를
 * 함께 보여준다. 조를 고르는 순간이 참가자가 조커 규칙을 처음 만나는
 * 지점이라, 여기서 이해가 안 되면 경기 중에 심판에게 묻게 된다.
 */
export function GroupPicker({
  groups,
  members,
  config,
  selectedGroupId,
  onSelect,
  disabled = false,
  allowDeselect = false,
}: GroupPickerProps) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {groups.map((g) => {
        const count = members.filter((m) => m.groupId === g.id).length
        const mine = selectedGroupId === g.id
        const over = count > g.capacity
        const target = g.is_joker ? config?.jokerPoints : config?.normalPoints

        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled || (mine && !allowDeselect)}
            onClick={() => onSelect(g.id)}
            aria-pressed={mine}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              'disabled:cursor-default',
              mine
                ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/30'
                : 'border-border-subtle bg-surface-1 hover:bg-surface-2 disabled:opacity-60',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black text-ink-1">{g.name}</span>
                {g.is_joker && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-joker/40 bg-joker-soft px-2 py-0.5 text-xs font-bold text-joker-ink">
                    🃏 조커
                    {target !== undefined && <span className="tabular">· {target}점</span>}
                  </span>
                )}
              </div>
              <p className={cn('tabular mt-1 text-xs', over ? 'text-warn' : 'text-ink-3')}>
                {count} / {g.capacity}명{over && ' · 정원 초과'}
              </p>
            </div>
            {mine && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
