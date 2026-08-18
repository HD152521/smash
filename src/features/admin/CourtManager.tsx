import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LiveBadge } from '@/components/ui/Badge'
import { toUserMessage } from '@/lib/errors'
import { useCreateCourt, useDeleteCourt } from '@/features/tournament/queries'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

interface CourtManagerProps {
  tournamentId: string
  courts: CourtRow[]
  matches: MatchOverviewRow[]
}

/**
 * 코트 관리.
 *
 * 코트의 "사용중" 여부는 컬럼으로 두지 않고 진행 중인 경기에서 파생한다.
 * 컬럼으로 두면 경기가 비정상 종료될 때 코트가 영영 사용중으로 남는다.
 */
export function CourtManager({ tournamentId, courts, matches }: CourtManagerProps) {
  const [name, setName] = useState('')
  const create = useCreateCourt(tournamentId)
  const remove = useDeleteCourt(tournamentId)
  const error = create.error ?? remove.error

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const nextOrder = Math.max(0, ...courts.map((c) => c.sort_order)) + 1
    create.mutate(
      { name: trimmed, sortOrder: nextOrder },
      { onSuccess: () => setName('') },
    )
  }

  function liveMatchOn(courtId: string) {
    return matches.find((m) => m.court_id === courtId && m.status === 'live')
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-ink-1">코트 {courts.length}개</h2>
      <p className="mt-1 text-sm text-ink-2">경기를 편성할 때 코트를 고릅니다.</p>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b">
          {toUserMessage(error, '코트를 변경하지 못했습니다')}
        </p>
      )}

      {courts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {courts.map((c) => {
            const live = liveMatchOn(c.id)
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink-1">{c.name}</span>
                    {live && <LiveBadge />}
                  </div>
                  {live && (
                    <p className="tabular mt-1 truncate text-xs text-ink-2">
                      {live.group_a_name} {live.score_a} : {live.score_b} {live.group_b_name}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  // 경기가 도는 코트를 지우면 진행 중인 경기가 코트를 잃는다
                  disabled={Boolean(live) || remove.isPending}
                  onClick={() => remove.mutate(c.id)}
                  aria-label={`${c.name} 삭제`}
                  title={live ? '경기가 진행 중인 코트는 지울 수 없습니다' : undefined}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-3
                             transition-colors hover:bg-team-b/10 hover:text-team-b
                             disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="예) 1번 코트"
          aria-label="코트 이름"
          className="h-11 flex-1 rounded-xl border border-border-subtle bg-surface-1 px-3.5
                     text-ink-1 outline-none placeholder:text-ink-3
                     focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />
        <Button type="submit" variant="secondary" loading={create.isPending} disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden />
          추가
        </Button>
      </form>
    </section>
  )
}
