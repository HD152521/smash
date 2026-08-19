import { Link, useParams } from 'react-router-dom'
import { CircleDot } from 'lucide-react'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { useAssignCourt, useCourts, useMatches } from '@/features/tournament/queries'
import { useTournamentNav } from '@/features/tournament/useTournamentNav'
import { buildSchedule, matchTitle } from '@/lib/schedule'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 대진표 — 앞으로 할 경기 목록.
 *
 * 코트별 줄을 먼저, 코트 미배정을 맨 아래에 둔다.
 * 체육관에서 실제로 눈이 가는 건 '지금 어느 코트에 뭐가 걸려 있나' 이고,
 * 미배정은 아직 판에 오르지 않은 대기 물량이다.
 */
export function SchedulePage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatches(id)
  const courts = useCourts(id)
  const assign = useAssignCourt(id ?? '')
  const nav = useTournamentNav(id)
  const isAdmin = nav.isAdmin

  const s = buildSchedule(matches.data ?? [], courts.data ?? [])
  const loading = matches.isPending || courts.isPending
  const error = matches.error ?? courts.error

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <TournamentNav id={id!} active="schedule" />
      <h2 className="sr-only">대진표</h2>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '대진표를 불러오지 못했습니다')}
        </p>
      )}
      {assign.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(assign.error, '코트를 배정하지 못했습니다')}
        </p>
      )}

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : s.scheduledCount === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
          예정된 경기가 없습니다.
          {isAdmin && ' 관리에서 경기를 편성해 주세요.'}
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm font-semibold text-ink-1">
            예정 {s.scheduledCount}경기
            {s.liveCount > 0 && <span className="ml-2 text-live-fg">· 진행 중 {s.liveCount}</span>}
          </p>

          {/* 코트별 줄 — 지금 돌아가는 판 */}
          {s.courts.map((q) => (
            <section key={q.court.id} className="mt-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink-2">
                <CircleDot
                  className={cn('size-4', q.live ? 'text-live-fg' : 'text-ink-3')}
                  aria-hidden
                />
                {q.court.name}
                <span className="text-ink-3">대기 {q.waiting.length}</span>
                {q.live && <span className="text-xs font-black text-live-fg">진행 중</span>}
              </h2>
              {q.waiting.length === 0 ? (
                <p className="mt-2 text-sm text-ink-3">대기 중인 경기가 없습니다.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {q.waiting.map((m, i) => (
                    <li key={m.id}>
                      <MatchCard
                        m={m}
                        tournamentId={id!}
                        canOpen={isAdmin}
                        order={i + 1}
                        courts={isAdmin ? (courts.data ?? []) : []}
                        currentCourtId={q.court.id}
                        onAssign={(courtId) => m.id && assign.mutate({ matchId: m.id, courtId })}
                        pending={assign.isPending}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {/* 코트에 아직 안 올린 경기는 맨 아래. 코트별 줄이 지금 돌아가는
              판이고, 이건 아직 판에 오르지 않은 대기 물량이다. */}
          <section className="mt-8">
            <h2 className="text-sm font-bold text-ink-2">
              코트 미배정 <span className="text-ink-3">{s.unassigned.length}</span>
            </h2>
            {s.unassigned.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">모든 경기가 코트에 배정됐습니다.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {s.unassigned.map((m) => (
                  <li key={m.id}>
                    <MatchCard
                      m={m}
                      tournamentId={id!}
                      canOpen={false}
                      courts={isAdmin ? (courts.data ?? []) : []}
                      onAssign={(courtId) => m.id && assign.mutate({ matchId: m.id, courtId })}
                      pending={assign.isPending}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

        </>
      )}
    </main>
  )
}

function MatchCard({
  m,
  tournamentId,
  canOpen,
  order,
  courts,
  currentCourtId,
  onAssign,
  pending,
}: {
  m: MatchOverviewRow
  tournamentId: string
  /**
   * 눌러서 채점 화면으로 들어갈 수 있는가.
   * 관리자만 연다 — 심판은 '심판' 탭에서 자기 경기를 받는다.
   * 여기서까지 열어주면 남의 경기를 눌러 보게 되고, 이 화면의 목적
   * (판이 어떻게 짜였나 보기) 도 흐려진다.
   */
  canOpen: boolean
  order?: number
  /** 비어 있으면 배정 버튼을 아예 안 그린다 (관리자가 아님) */
  courts: CourtRow[]
  currentCourtId?: string
  onAssign: (courtId: string | null) => void
  pending: boolean
}) {
  const hasPlayers = (m.players_a?.length ?? 0) > 0 || (m.players_b?.length ?? 0) > 0

  const body = (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 font-bold text-ink-1">
        {order !== undefined && (
          <span className="tabular text-xs font-black text-ink-3">{order}</span>
        )}
        <span className="truncate">
          {m.group_a_joker && <span aria-hidden>🃏 </span>}
          {matchTitle(m)}
          {m.group_b_joker && <span aria-hidden> 🃏</span>}
        </span>
      </p>
      {hasPlayers && (
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {m.players_a?.join(' · ')} / {m.players_b?.join(' · ')}
        </p>
      )}
      {(m.referees?.length ?? 0) > 0 && (
        <p className="mt-0.5 truncate text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
      )}
    </div>
  )

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
      {canOpen && m.id ? (
        <Link
          to={`/t/${tournamentId}/matches/${m.id}`}
          className="flex min-h-11 items-center gap-2 rounded-lg
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {body}
          <span className="shrink-0 text-sm font-bold text-brand-fg">시작</span>
        </Link>
      ) : (
        <div className="flex min-h-11 items-center">{body}</div>
      )}

      {courts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-2">
          <span className="text-xs font-semibold text-ink-3">코트</span>
          {courts.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={pending || c.id === currentCourtId}
              onClick={() => onAssign(c.id)}
              className={cn(
                'min-h-9 rounded-full px-3 text-xs font-bold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                c.id === currentCourtId
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-2 text-ink-2 hover:text-ink-1 disabled:opacity-50',
              )}
            >
              {c.name}
            </button>
          ))}
          {currentCourtId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAssign(null)}
              className="min-h-9 rounded-full px-3 text-xs font-bold text-ink-3
                         transition-colors hover:text-ink-1 disabled:opacity-50
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              배정 해제
            </button>
          )}
        </div>
      )}
    </div>
  )
}
