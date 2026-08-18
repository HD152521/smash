import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { StandingsTable } from '@/features/standings/StandingsTable'
import { useMatches, useMembers, useStandings, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/** 조별 순위만 보는 화면. 대회 메인에 얹으면 코트 현황이 묻힌다. */
export function StandingsPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const standings = useStandings(id)
  const matches = useMatches(id)
  const members = useMembers(id)

  const me = members.data?.find((m) => m.userId === user?.id)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to={`/t/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />
        대회로
      </Link>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">조별 순위</h1>
      <p className="mt-2 text-sm text-ink-2">{tournament.data?.name}</p>

      {standings.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b">
          {toUserMessage(standings.error, '순위를 불러오지 못했습니다')}
        </p>
      )}

      <div className="mt-6">
        {standings.isPending ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        ) : (
          <StandingsTable
            standings={standings.data ?? []}
            matches={matches.data ?? []}
            myGroupId={me?.groupId}
          />
        )}
      </div>

      <p className="mt-4 text-xs text-ink-3">승점 → 승자승 → 득실차 → 총득점 순으로 정렬합니다.</p>
    </main>
  )
}
