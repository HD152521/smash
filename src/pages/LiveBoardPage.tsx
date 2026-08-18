import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Radio } from 'lucide-react'
import { useMatches, useTournament } from '@/features/tournament/queries'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 관전 화면 — 코트 옆 태블릿이나 TV 에 걸어두는 용도.
 *
 * 아무도 조작하지 않는다. 멀리서 읽히는 게 전부다.
 * 그래서 점수를 화면 폭에 맞춰 최대한 키우고, 그 외 정보는 최소로 둔다.
 */
export function LiveBoardPage() {
  const { id } = useParams<{ id: string }>()
  const tournament = useTournament(id)
  const matches = useMatches(id)
  const realtime = useRealtimeMatches(id)

  const live = (matches.data ?? []).filter((m) => m.status === 'live')
  const upcoming = (matches.data ?? []).filter((m) => m.status === 'scheduled').slice(0, 4)

  return (
    <div data-theme="dark" className="min-h-dvh bg-surface-0 p-4">
      <header className="flex items-center justify-between gap-3">
        <Link
          to={`/t/${id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
        >
          <ArrowLeft className="size-4" aria-hidden />
          나가기
        </Link>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-ink-2">{tournament.data?.name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold',
              realtime === 'live' ? 'bg-live/15 text-live' : 'bg-surface-2 text-ink-3',
            )}
            title={realtime === 'live' ? '실시간 연결됨' : '연결이 끊겨 주기적으로 새로고침 중'}
          >
            <Radio className={cn('size-3.5', realtime === 'live' && 'animate-pulse')} aria-hidden />
            {realtime === 'live' ? '실시간' : '재연결 중'}
          </span>
        </div>
      </header>

      {live.length === 0 ? (
        <div className="grid min-h-[70dvh] place-items-center">
          <p className="text-xl font-bold text-ink-3">진행 중인 경기가 없습니다</p>
        </div>
      ) : (
        <div
          className={cn(
            'mt-4 grid gap-4',
            live.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2',
          )}
        >
          {live.map((m) => (
            <LiveCard key={m.id} m={m} solo={live.length === 1} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold tracking-widest text-ink-3 uppercase">다음 경기</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {upcoming.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm text-ink-2">
                {m.court_name && (
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold">
                    {m.court_name}
                  </span>
                )}
                <span className="truncate">
                  {m.group_a_joker && '🃏'}
                  {m.group_a_name} vs {m.group_b_joker && '🃏'}
                  {m.group_b_name}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function LiveCard({ m, solo }: { m: MatchOverviewRow; solo: boolean }) {
  return (
    <article className="rounded-3xl bg-surface-1 p-5">
      {m.court_name && (
        <p className="text-center text-sm font-bold tracking-widest text-ink-3 uppercase">
          {m.court_name}
        </p>
      )}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Side
          name={m.group_a_name}
          joker={m.group_a_joker}
          players={m.players_a}
          score={m.score_a}
          target={m.target_a}
          solo={solo}
        />
        <span className="text-2xl font-black text-ink-3">:</span>
        <Side
          name={m.group_b_name}
          joker={m.group_b_joker}
          players={m.players_b}
          score={m.score_b}
          target={m.target_b}
          solo={solo}
        />
      </div>
    </article>
  )
}

function Side({
  name,
  joker,
  players,
  score,
  target,
  solo,
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  // 뷰 컬럼은 Postgres 가 NOT NULL 을 보존하지 않아 전부 nullable 로 온다
  score: number | null
  target: number | null
  solo: boolean
}) {
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-base font-black text-ink-1">
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? '—'}
      </p>
      {players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
      <output
        className={cn(
          'tabular block leading-none font-black text-ink-1',
          solo ? 'mt-2 text-[clamp(4rem,18vw,12rem)]' : 'mt-2 text-[clamp(3rem,12vw,7rem)]',
        )}
      >
        {score ?? 0}
      </output>
      {target !== null && (
        <p className="tabular mt-1 text-xs font-bold text-ink-3">목표 {target}점</p>
      )}
    </div>
  )
}
