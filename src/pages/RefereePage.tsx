import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Gavel, Play } from 'lucide-react'
import { LiveBadge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import { useMatches, useMembers, useTournament } from '@/features/tournament/queries'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 내가 심판인 경기.
 *
 * 심판은 관리자가 아니라 경기를 편성할 때 지정된 참가자다.
 * 그 사람이 폰을 꺼내는 이유는 하나뿐이다 — "내가 봐야 할 경기가 뭐지".
 * 그래서 이 화면은 그것만 보여주고, 누르면 바로 채점 화면으로 들어간다.
 */
export function RefereePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  useRealtimeMatches(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const myName = me?.displayName

  const mine = (matches.data ?? []).filter(
    (m) => myName && m.referees?.includes(myName) && m.status !== 'void',
  )
  const live = mine.filter((m) => m.status === 'live')
  const upcoming = mine.filter((m) => m.status === 'scheduled')
  const done = mine.filter((m) => m.status === 'finished')

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to={`/t/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />
        대회로
      </Link>

      <header className="mt-6">
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-ink-1">
          <Gavel className="size-7 text-brand-600" aria-hidden />내 심판 경기
        </h1>
        <p className="mt-2 text-sm text-ink-2">{tournament.data?.name}</p>
      </header>

      {matches.isPending || members.isPending ? (
        <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : mine.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border-subtle px-6 py-12 text-center">
          <p className="text-lg font-bold text-ink-1">배정된 경기가 없습니다</p>
          <p className="mt-1.5 text-sm text-ink-2">
            관리자가 경기를 편성하면서 심판으로 지정하면 여기에 나타납니다.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {live.length > 0 && (
            <Group title="진행 중" matches={live} tournamentId={id!} action="이어서 채점" />
          )}
          {upcoming.length > 0 && (
            <Group title="시작 대기" matches={upcoming} tournamentId={id!} action="경기 시작" />
          )}
          {done.length > 0 && (
            <Group title="끝난 경기" matches={done} tournamentId={id!} action="결과 보기" muted />
          )}
        </div>
      )}
    </main>
  )
}

function Group({
  title,
  matches,
  tournamentId,
  action,
  muted = false,
}: {
  title: string
  matches: MatchOverviewRow[]
  tournamentId: string
  action: string
  muted?: boolean
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-widest text-ink-3 uppercase">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {matches.map((m) => (
          <li key={m.id}>
            <Link
              to={`/t/${tournamentId}/matches/${m.id}`}
              className={cn(
                'flex items-center gap-4 rounded-2xl border p-4 transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                muted
                  ? 'border-border-subtle bg-surface-1 opacity-70 hover:opacity-100'
                  : m.status === 'live'
                    ? 'border-live/40 bg-surface-1 hover:bg-surface-2'
                    : 'border-brand-500/40 bg-brand-50 hover:bg-brand-100',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {m.court_name && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-ink-2">
                      {m.court_name}
                    </span>
                  )}
                  {m.status === 'live' && <LiveBadge />}
                </div>

                <p className="mt-1.5 truncate font-bold text-ink-1">
                  {m.group_a_joker && '🃏 '}
                  {m.group_a_name}
                  <span className="tabular mx-2 text-ink-2">
                    {m.score_a ?? 0} : {m.score_b ?? 0}
                  </span>
                  {m.group_b_joker && '🃏 '}
                  {m.group_b_name}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {(m.players_a ?? []).join(' · ')} vs {(m.players_b ?? []).join(' · ')}
                </p>
                <p className="tabular mt-1 text-xs font-semibold text-ink-3">
                  목표 {m.target_a ?? '?'}점 · {m.target_b ?? '?'}점
                </p>
              </div>

              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand-600">
                {m.status === 'scheduled' && <Play className="size-4" aria-hidden />}
                {action}
                <ChevronRight className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
