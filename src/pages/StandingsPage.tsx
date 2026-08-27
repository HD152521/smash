import { useParams } from 'react-router-dom'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { useAuth } from '@/features/auth/useAuth'
import { StandingsTable } from '@/features/standings/StandingsTable'
import { useMembers, useStandings } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/** 조별 순위만 보는 화면. 대회 메인에 얹으면 코트 현황이 묻힌다. */
export function StandingsPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const standings = useStandings(id)
  const members = useMembers(id)

  const me = members.data?.find((m) => m.userId === user?.id)

  return (
    <main
      className="mx-auto w-full max-w-2xl px-5 pt-6"
      // 하단탭에 가려지지 않을 여백. 근거는 TournamentPage 의 Shell 주석.
      style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
    >
      <TournamentNav id={id!} active="standings" />
      <h2 className="sr-only">조별 순위</h2>

      {standings.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(standings.error, '순위를 불러오지 못했습니다')}
        </p>
      )}

      <div className="mt-6">
        {standings.isPending ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        ) : (
          <StandingsTable standings={standings.data ?? []} myGroupId={me?.groupId} />
        )}
      </div>

      <p className="mt-4 text-xs text-ink-3">승점 → 조커조 → 득실차 → 총득점 순으로 정렬합니다.</p>
    </main>
  )
}
