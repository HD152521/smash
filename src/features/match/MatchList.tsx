import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { LiveBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

interface MatchListProps {
  tournamentId: string
  matches: MatchOverviewRow[]
  /** 내 표시 이름 — 내가 심판인 경기를 위로 올린다 */
  myDisplayName: string | undefined
  /** 점수를 기록할 수 있는 사람인가 (심판 또는 관리자) */
  canScore: boolean
}

/**
 * 경기 목록.
 *
 * 체육관에서 폰을 꺼내는 이유는 대부분 둘 중 하나다:
 *  "지금 몇 대 몇이지" 또는 "내가 심판인 경기가 뭐지".
 * 그래서 진행 중인 경기를 맨 위에, 내가 심판인 경기를 그 안에서도 먼저 둔다.
 */
export function MatchList({ tournamentId, matches, myDisplayName, canScore }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        아직 편성된 경기가 없습니다.
      </p>
    )
  }

  const rank = (m: MatchOverviewRow) => {
    const mine = myDisplayName ? m.referees?.includes(myDisplayName) : false
    if (m.status === 'live') return mine ? 0 : 1
    if (m.status === 'scheduled') return mine ? 2 : 3
    if (m.status === 'finished') return 4
    return 5
  }
  const sorted = [...matches].sort((a, b) => rank(a) - rank(b))

  return (
    <ul className="flex flex-col gap-2.5">
      {sorted.map((m) => {
        const iAmReferee = myDisplayName ? Boolean(m.referees?.includes(myDisplayName)) : false
        const clickable = canScore || iAmReferee
        const body = <MatchRowBody m={m} iAmReferee={iAmReferee} />

        return (
          <li key={m.id}>
            {clickable && m.status !== 'void' ? (
              <Link
                to={`/t/${tournamentId}/matches/${m.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4
                           transition-colors hover:bg-surface-2
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {body}
                <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4">
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function MatchRowBody({ m, iAmReferee }: { m: MatchOverviewRow; iAmReferee: boolean }) {
  const finished = m.status === 'finished'
  const voided = m.status === 'void'

  return (
    <div className={cn('min-w-0 flex-1', voided && 'opacity-50')}>
      <div className="flex flex-wrap items-center gap-2">
        {m.status === 'live' && <LiveBadge />}
        {m.status === 'scheduled' && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
            예정
          </span>
        )}
        {voided && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-3">
            무효
          </span>
        )}
        {m.court_name && <span className="text-xs font-semibold text-ink-3">{m.court_name}</span>}
        {iAmReferee && m.status !== 'finished' && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
            내가 심판
          </span>
        )}
        {m.edited_at && (
          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
            수정됨
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <TeamLabel
          name={m.group_a_name}
          joker={m.group_a_joker}
          players={m.players_a}
          won={finished && m.winner_side === 'A'}
        />
        <span className="tabular shrink-0 text-lg font-black text-ink-1">
          {m.score_a ?? 0} : {m.score_b ?? 0}
        </span>
        <TeamLabel
          name={m.group_b_name}
          joker={m.group_b_joker}
          players={m.players_b}
          won={finished && m.winner_side === 'B'}
          align="right"
        />
      </div>
    </div>
  )
}

function TeamLabel({
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
      <p className={cn('truncate text-sm font-bold', won ? 'text-brand-600' : 'text-ink-1')}>
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? '—'}
        {won && ' 승'}
      </p>
      {players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}
