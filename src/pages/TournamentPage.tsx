import { Plus } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { CourtBoard } from '@/features/match/CourtBoard'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { useCourts, useMatches, useMembers, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { isSession } from '@/lib/session'


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
  // 모임에는 조가 없다 — 여기로 보내면 고를 게 없는 화면에 갇힌다.
  if (
    !isSession(tournament.data.kind) &&
    me &&
    !me.groupId &&
    tournament.data.status === 'draft'
  ) {
    return <Navigate to={`/t/${id}/setup`} replace />
  }

  const t = tournament.data
  const session = isSession(t.kind)

  return (
    <Shell id={id}>
      {/* 조 안내는 대회에서만 뜻이 있다. 모임에는 조가 없다. */}
      {!session && me && !me.groupId && t.status !== 'draft' && (
        <p className="mt-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm font-semibold text-ink-1">
          조가 정해지지 않았습니다. 대회가 시작돼서 스스로 바꿀 수 없으니 관리자에게 요청해 주세요.
        </p>
      )}

      {/*
        모임에서 가장 자주 누르는 버튼. 관리 화면 안에 두지 않는다 —
        모임장이 아닌 사람도 비는 코트를 보고 자기들끼리 들어가기 때문이다
        (create_session_match 가 '뛰는 사람 본인' 을 허용한다).
      */}
      {session && me && (
        <Link
          to={`/t/${id}/matches/new-session`}
          className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-2xl
                     bg-brand-600 px-5 font-black text-white shadow-sm transition-colors
                     hover:bg-brand-700
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Plus className="size-5" aria-hidden />
          경기 짜기
        </Link>
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
            /*
             * 모임에는 지정 심판이 없다. 뛰는 사람이 자기 경기를 시작하고
             * 끝낸다(can_run_match). 여기서 admin 만 열어 두면 화살표가 안 보여
             * 아무도 코트에 못 들어간다.
             */
            canScore={isAdmin || session}
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
