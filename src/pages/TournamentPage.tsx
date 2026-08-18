import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Settings, Sliders, Users } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import {
  useCourts,
  useGroups,
  useMatches,
  useMembers,
  useStandings,
  useTournament,
} from '@/features/tournament/queries'
import { MatchList } from '@/features/match/MatchList'
import { CourtBoard } from '@/features/match/CourtBoard'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { StandingsTable } from '@/features/standings/StandingsTable'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { TournamentStatus } from '@/types/database'

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

export function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const realtime = useRealtimeMatches(id)
  const standings = useStandings(id)
  const courts = useCourts(id)
  const [matchView, setMatchView] = useState<'court' | 'all'>('court')

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const myGroup = groups.data?.find((g) => g.id === me?.groupId)

  if (tournament.error) {
    return (
      <Shell id={id}>
        <p role="alert" className="mt-8 text-sm font-medium text-team-b">
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
      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          {t.status === 'live' ? (
            <LiveBadge />
          ) : (
            <Badge tone={t.status === 'finished' ? 'neutral' : 'ok'}>
              {STATUS_LABEL[t.status]}
            </Badge>
          )}
          {me && me.role !== 'member' && <Badge>{me.role === 'owner' ? '주최자' : '관리자'}</Badge>}
          {myGroup && (
            <Badge tone={myGroup.is_joker ? 'joker' : 'neutral'}>
              {myGroup.is_joker && <span aria-hidden>🃏</span>}내 조 · {myGroup.name}
            </Badge>
          )}
        </div>

        <h1 className="mt-2 text-3xl leading-tight font-black tracking-tight text-ink-1">
          {t.name}
        </h1>
        {t.description && <p className="mt-2 text-sm text-ink-2">{t.description}</p>}
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
          <Users className="size-4" aria-hidden />
          참가자 {members.data.length}명
        </p>
      </header>

      {isAdmin && (
        <>
          <InviteCodeCard code={t.invite_code} />
          <Link
            to={`/t/${id}/admin`}
            className="mt-3 flex items-center justify-between rounded-2xl border border-border-subtle
                       bg-surface-1 p-4 transition-colors hover:bg-surface-2"
          >
            <span className="flex items-center gap-2 font-semibold text-ink-1">
              <Sliders className="size-4 text-ink-2" aria-hidden />
              대회 관리
            </span>
            <span className="text-sm text-ink-3">멤버 · 코트 · 경기 편성</span>
          </Link>
        </>
      )}

      {me && !me.groupId && t.status !== 'draft' && (
        <p className="mt-6 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm font-semibold text-ink-1">
          조가 정해지지 않았습니다. 대회가 시작돼서 스스로 바꿀 수 없으니 관리자에게 요청해 주세요.
        </p>
      )}

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink-1">
            경기
            {realtime === 'live' && (
              <span className="ml-2 text-xs font-semibold text-ok">실시간</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {/* 경기는 코트 단위로 돌아간다. 코트별 보기가 기본이다. */}
            <div
              role="group"
              aria-label="보기 방식"
              className="flex rounded-lg border border-border-subtle p-0.5"
            >
              {(['court', 'all'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMatchView(v)}
                  aria-pressed={matchView === v}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-bold transition-colors',
                    matchView === v ? 'bg-brand-600 text-white' : 'text-ink-2 hover:text-ink-1',
                  )}
                >
                  {v === 'court' ? '코트별' : '전체'}
                </button>
              ))}
            </div>
            {(matches.data ?? []).some((m) => m.status === 'live') && (
              <Link
                to={`/t/${id}/live`}
                className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand-600 hover:bg-surface-2"
              >
                관전 화면
              </Link>
            )}
          </div>
        </div>
        {matches.isPending ? (
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        ) : (
          matchView === 'court' ? (
            <CourtBoard
              tournamentId={id!}
              courts={courts.data ?? []}
              matches={matches.data ?? []}
              myDisplayName={me?.displayName}
              canScore={isAdmin}
            />
          ) : (
            <MatchList
              tournamentId={id!}
              matches={matches.data ?? []}
              myDisplayName={me?.displayName}
              canScore={isAdmin}
            />
          )
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-ink-1">조별 순위</h2>
        {standings.isPending ? (
          <div className="h-32 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        ) : (
          <StandingsTable
            standings={standings.data ?? []}
            matches={matches.data ?? []}
            myGroupId={me?.groupId}
          />
        )}
      </section>
    </Shell>
  )
}

function Shell({ id, children }: { id: string | undefined; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <div className="flex items-center justify-between">
        <Link
          to="/my"
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
        >
          <ArrowLeft className="size-4" aria-hidden />내 대회
        </Link>
        {id && (
          <Link
            to={`/t/${id}/settings`}
            aria-label="설정"
            className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </main>
  )
}

/**
 * 초대 코드는 체육관에서 구두로 불러주거나 카톡으로 보낸다.
 * 크게 띄우고, 복사는 한 번에 되게 한다.
 */
function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 읽으면 된다. 코드는 이미 화면에 크게 있다.
    }
  }

  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-brand-900 p-5 text-white">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-brand-100">초대 코드</p>
        <p className="tabular mt-0.5 text-3xl font-black tracking-[0.25em]">{code}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="초대 코드 복사"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 transition-colors hover:bg-white/25"
      >
        {copied ? (
          <Check className="size-5" aria-hidden />
        ) : (
          <Copy className="size-5" aria-hidden />
        )}
      </button>
    </div>
  )
}
