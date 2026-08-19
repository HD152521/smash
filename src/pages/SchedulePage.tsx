import { Link, useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { MatchupGrid } from '@/features/schedule/MatchupGrid'
import { useAuth } from '@/features/auth/useAuth'
import { useGroups, useMatches, useMembers, useTournament } from '@/features/tournament/queries'
import { buildMatchupIndex, remainingPairings, scheduleProgress } from '@/lib/schedule'
import { toUserMessage } from '@/lib/errors'

/**
 * 대진표 — 어떤 조끼리 붙었고 뭐가 남았나.
 *
 * 경기 기록은 "끝난 것", 코트 현황은 "지금 하는 것" 을 보여준다.
 * 판 전체를 보는 화면이 따로 필요하다.
 */
export function SchedulePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const groups = useGroups(id)
  const matches = useMatches(id)
  const members = useMembers(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  const groupList = groups.data ?? []
  const matchList = matches.data ?? []
  const index = buildMatchupIndex(matchList)
  const progress = scheduleProgress(groupList, index)
  const remaining = remainingPairings(groupList, index)

  const loading = groups.isPending || matches.isPending
  const error = groups.error ?? matches.error

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to={`/t/${id}`}>대회로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">대진표</h1>
      <p className="mt-2 text-sm text-ink-2">{tournament.data?.name}</p>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '대진표를 불러오지 못했습니다')}
        </p>
      )}

      {loading ? (
        <div className="mt-6 h-56 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        <>
          <p className="mt-5 text-sm font-semibold text-ink-1">
            맞대결 {progress.playedPairings}
            <span className="text-ink-3"> / {progress.totalPairings}</span>
            {progress.liveMatches > 0 && (
              <span className="ml-2 text-live-fg">· 진행 중 {progress.liveMatches}</span>
            )}
          </p>

          <div className="mt-3">
            <MatchupGrid
              tournamentId={id!}
              groups={groupList}
              matches={matchList}
              myGroupId={me?.groupId}
              isAdmin={isAdmin}
            />
          </div>

          <Legend isAdmin={isAdmin} />

          <section className="mt-8">
            <h2 className="text-lg font-bold text-ink-1">
              남은 대진
              <span className="ml-2 text-sm font-semibold text-ink-3">{remaining.length}</span>
            </h2>

            {remaining.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">모든 조합이 한 번씩 끝났습니다.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {remaining.map((p) => (
                  <li key={`${p.a.id}|${p.b.id}`}>
                    <PairRow pairing={p} tournamentId={id!} isAdmin={isAdmin} />
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

function PairRow({
  pairing,
  tournamentId,
  isAdmin,
}: {
  pairing: ReturnType<typeof remainingPairings>[number]
  tournamentId: string
  isAdmin: boolean
}) {
  const text = (
    <span className="flex min-h-11 flex-1 items-center gap-2 text-sm font-semibold text-ink-1">
      <span>
        {pairing.a.name}
        {pairing.a.isJoker && <span className="ml-0.5 text-xs text-warn-fg">★</span>}
      </span>
      <span className="text-ink-3">vs</span>
      <span>
        {pairing.b.name}
        {pairing.b.isJoker && <span className="ml-0.5 text-xs text-warn-fg">★</span>}
      </span>
    </span>
  )

  if (!isAdmin) {
    return (
      <div className="flex items-center rounded-xl border border-border-subtle bg-surface-1 px-4">
        {text}
      </div>
    )
  }

  return (
    <Link
      to={`/t/${tournamentId}/matches/new?a=${pairing.a.id}&b=${pairing.b.id}`}
      className="flex items-center rounded-xl border border-border-subtle bg-surface-1 px-4
                 transition-colors hover:bg-surface-2
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {text}
      <span className="text-sm font-bold text-brand-fg">편성</span>
    </Link>
  )
}

function Legend({ isAdmin }: { isAdmin: boolean }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      <li>
        <span className="font-black text-ok-fg">21:15</span> 우리 조 승
      </li>
      <li>
        <span className="font-black text-ink-3">15:21</span> 패
      </li>
      <li>
        <span className="font-black text-live-fg">LIVE</span> 진행 중
      </li>
      <li>
        <span className="text-warn-fg">★</span> 조커조
      </li>
      {isAdmin && <li>+ 눌러서 편성</li>}
    </ul>
  )
}
