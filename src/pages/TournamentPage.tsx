import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Gavel, History, Settings, Sliders, Trophy } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import { CourtBoard } from '@/features/match/CourtBoard'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import {
  useCourts,
  useGroups,
  useMatches,
  useMembers,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import type { TournamentStatus } from '@/types/database'

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

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
  const groups = useGroups(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const courts = useCourts(id)
  const realtime = useRealtimeMatches(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const myGroup = groups.data?.find((g) => g.id === me?.groupId)
  const myRefereeCount = me
    ? (matches.data ?? []).filter(
        (m) =>
          m.referees?.includes(me.displayName) && m.status !== 'finished' && m.status !== 'void',
      ).length
    : 0

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
      </header>

      {me && !me.groupId && t.status !== 'draft' && (
        <p className="mt-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm font-semibold text-ink-1">
          조가 정해지지 않았습니다. 대회가 시작돼서 스스로 바꿀 수 없으니 관리자에게 요청해 주세요.
        </p>
      )}

      {/* ── 코트별 현황 (이 화면의 본론) ─────────────────────────── */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-1">코트 현황</h2>
          {realtime === 'live' && <span className="text-xs font-semibold text-ok">실시간</span>}
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

      {/* ── 다른 화면으로 ─────────────────────────────────────────── */}
      <nav className="mt-8 flex flex-col gap-2.5" aria-label="대회 메뉴">
        <NavCard
          to={`/t/${id}/referee`}
          icon={<Gavel className="size-5" aria-hidden />}
          title="심판"
          desc="내가 맡은 경기를 채점합니다"
          badge={myRefereeCount > 0 ? `${myRefereeCount}경기` : undefined}
          accent={myRefereeCount > 0}
        />
        <NavCard
          to={`/t/${id}/records`}
          icon={<History className="size-5" aria-hidden />}
          title="경기 기록"
          desc="누가 몇 대 몇으로 이겼는지"
        />
        <NavCard
          to={`/t/${id}/standings`}
          icon={<Trophy className="size-5" aria-hidden />}
          title="조별 순위"
          desc="승점 · 승패 · 득실차"
        />
        {isAdmin && (
          <NavCard
            to={`/t/${id}/admin`}
            icon={<Sliders className="size-5" aria-hidden />}
            title="대회 관리"
            desc="멤버 · 코트 · 경기 편성 · 초대 코드"
          />
        )}
      </nav>
    </Shell>
  )
}

function NavCard({
  to,
  icon,
  title,
  desc,
  badge,
  accent = false,
}: {
  to: string
  icon: React.ReactNode
  title: string
  desc: string
  badge?: string
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className={
        accent
          ? 'flex items-center gap-3 rounded-2xl bg-brand-600 p-4 text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'
          : 'flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'
      }
    >
      <span className={accent ? 'text-white' : 'text-ink-2'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={accent ? 'block font-bold' : 'block font-bold text-ink-1'}>
          {title}
          {badge && (
            <span
              className={
                accent
                  ? 'ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-black'
                  : 'ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink-2'
              }
            >
              {badge}
            </span>
          )}
        </span>
        <span className={accent ? 'block text-sm text-brand-100' : 'block text-sm text-ink-2'}>
          {desc}
        </span>
      </span>
      <ChevronRight
        className={accent ? 'size-5 shrink-0' : 'size-5 shrink-0 text-ink-3'}
        aria-hidden
      />
    </Link>
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
