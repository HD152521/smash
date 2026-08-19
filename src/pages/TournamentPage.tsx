import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { CourtBoard } from '@/features/match/CourtBoard'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { useCourts, useMatches, useMembers, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'


/**
 * 대회 메인 — 코트별 현황.
 *
 * 체육관에서 이 화면을 여는 이유는 하나다: "지금 어느 코트에서 뭐 하고 있지".
 * 그래서 코트 현황만 둔다. 순위·심판·관리는 각자 자기 화면으로 보낸다.
 * 한 화면에 다 얹으면 정작 필요한 점수가 아래로 밀린다.
 */
export function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const courts = useCourts(id)
  const realtime = useRealtimeMatches(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  if (tournament.error) {
    return (
      <Shell id={id}>
        <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
          {toUserMessage(tournament.error, '대회를 불러오지 못했습니다')}
        </p>
      </Shell>
    )
  }

  if (!tournament.data || !members.data) {
    return (
      <Shell id={id}>
        <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </Shell>
    )
  }

  // 아직 조를 안 고른 참가자는 온보딩으로 보낸다.
  // 대회가 시작된 뒤라면 스스로 고칠 수 없으므로 보내지 않는다 (관리자 몫).
  if (me && !me.groupId && tournament.data.status === 'draft') {
    return <Navigate to={`/t/${id}/setup`} replace />
  }

  const t = tournament.data

  return (
    <Shell id={id}>

      {me && !me.groupId && t.status !== 'draft' && (
        <p className="mt-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm font-semibold text-ink-1">
          조가 정해지지 않았습니다. 대회가 시작돼서 스스로 바꿀 수 없으니 관리자에게 요청해 주세요.
        </p>
      )}

      {/* ── 코트별 현황 (이 화면의 본론) ─────────────────────────── */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-1">코트 현황</h2>
          {realtime === 'live' && <span className="text-xs font-semibold text-ok-fg">실시간</span>}
        </div>
        {matches.isPending || courts.isPending ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        ) : (
          <CourtBoard
            tournamentId={id!}
            courts={courts.data ?? []}
            matches={matches.data ?? []}
            myDisplayName={me?.displayName}
            canScore={isAdmin}
          />
        )}
      </section>

    </Shell>
  )
}

function Shell({ id, children }: { id: string | undefined; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      {id && <TournamentNav id={id} active="court" />}
      {children}
    </main>
  )
}
