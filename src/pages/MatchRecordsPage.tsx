import { useState } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useGroups, useMatches, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 경기 기록 — 끝난 경기를 몇 대 몇으로 누가 이겼는지.
 *
 * 대회가 끝난 뒤 가장 많이 열리는 화면이다. "그때 그 경기 몇 대 몇이었지"
 * 를 찾으려면 조나 사람으로 걸러야 한다. 정렬은 최신순 고정 —
 * 대회 중에는 방금 끝난 경기를 보고, 끝난 뒤에는 훑어 내려간다.
 */
export function MatchRecordsPage() {
  const { id } = useParams<{ id: string }>()
  const tournament = useTournament(id)
  const matches = useMatches(id)
  const groups = useGroups(id)

  const [groupFilter, setGroupFilter] = useState('')
  const [query, setQuery] = useState('')

  const finished = (matches.data ?? []).filter(
    (m) => m.status === 'finished' || m.status === 'void',
  )

  const q = query.trim().toLowerCase()
  const filtered = finished.filter((m) => {
    if (groupFilter && m.group_a_id !== groupFilter && m.group_b_id !== groupFilter) return false
    if (!q) return true
    const names = [...(m.players_a ?? []), ...(m.players_b ?? []), ...(m.referees ?? [])]
    return names.some((n) => n.toLowerCase().includes(q))
  })

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to={`/t/${id}`}>대회로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">경기 기록</h1>
      <p className="mt-2 text-sm text-ink-2">{tournament.data?.name}</p>

      {/* 필터 */}
      <div className="mt-6 flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">선수 또는 심판 이름으로 찾기</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="선수 · 심판 이름"
            className="h-11 w-full rounded-xl border border-border-subtle bg-surface-1 pr-3.5 pl-10
                       text-ink-1 outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>

        {groups.data && groups.data.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="조로 거르기">
            <Chip active={groupFilter === ''} onClick={() => setGroupFilter('')}>
              전체
            </Chip>
            {groups.data.map((g) => (
              <Chip
                key={g.id}
                active={groupFilter === g.id}
                onClick={() => setGroupFilter(groupFilter === g.id ? '' : g.id)}
              >
                {g.name}
                {g.is_joker && ' 🃏'}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {matches.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(matches.error, '기록을 불러오지 못했습니다')}
        </p>
      )}

      {matches.isPending ? (
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-ink-2">
          {finished.length === 0 ? '아직 끝난 경기가 없습니다.' : '조건에 맞는 경기가 없습니다.'}
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs text-ink-3">
            {filtered.length}경기
            {filtered.length !== finished.length && ` (전체 ${finished.length})`}
          </p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {filtered.map((m) => (
              <li key={m.id}>
                <RecordCard m={m} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

function RecordCard({ m }: { m: MatchOverviewRow }) {
  const voided = m.status === 'void'
  const when = m.finished_at ?? m.created_at

  return (
    <article
      className={cn(
        'rounded-2xl border border-border-subtle bg-surface-1 p-4',
        voided && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {when && (
          <time className="tabular text-ink-3" dateTime={when}>
            {new Date(when).toLocaleString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        )}
        {m.court_name && <span className="font-semibold text-ink-3">{m.court_name}</span>}
        {voided && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink-3">
            무효
          </span>
        )}
        {m.source === 'manual' && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink-2">
            직접 입력
          </span>
        )}
        {m.edited_at && !voided && m.source !== 'manual' && (
          <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn-fg">
            수정됨
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Side
          name={m.group_a_name}
          joker={m.group_a_joker}
          players={m.players_a}
          won={!voided && m.winner_side === 'A'}
        />
        <span className="tabular shrink-0 text-2xl font-black text-ink-1">
          {m.score_a ?? 0} : {m.score_b ?? 0}
        </span>
        <Side
          name={m.group_b_name}
          joker={m.group_b_joker}
          players={m.players_b}
          won={!voided && m.winner_side === 'B'}
          align="right"
        />
      </div>

      {(m.referees?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
      )}
    </article>
  )
}

function Side({
  name,
  joker,
  players,
  won,
  align = 'left',
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  won: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className={cn('truncate font-bold', won ? 'text-brand-fg' : 'text-ink-1')}>
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? '—'}
        {won && <span className="ml-1 text-xs">승</span>}
      </p>
      {players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
