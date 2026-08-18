import { Link, Navigate, useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Monitor, Play, RefreshCw, ScrollText, Square } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MemberManager } from '@/features/admin/MemberManager'
import { CourtManager } from '@/features/admin/CourtManager'
import { useAuth } from '@/features/auth/useAuth'
import {
  useCourts,
  useGroups,
  useMatches,
  useMembers,
  useRegenerateInviteCode,
  useSetTournamentStatus,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

export function TournamentAdminPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const courts = useCourts(id)
  const matches = useMatches(id)
  const setStatus = useSetTournamentStatus(id ?? '')
  const regenerate = useRegenerateInviteCode(id ?? '')

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  if (members.data && !isAdmin) return <Navigate to={`/t/${id}`} replace />

  if (!tournament.data || !members.data || !groups.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const t = tournament.data
  const ungrouped = members.data.filter((m) => !m.groupId).length

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to={`/t/${id}`}>대회로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">관리</h1>
      <p className="mt-1 text-sm text-ink-2">{t.name}</p>

      {/* ── 대회 상태 ─────────────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-border-subtle bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink-1">대회 상태</h2>
              {t.status === 'live' ? (
                <LiveBadge />
              ) : (
                <Badge tone={t.status === 'finished' ? 'neutral' : 'ok'}>
                  {t.status === 'draft' ? '준비중' : '종료'}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {t.status === 'draft' && '시작하면 참가자가 스스로 조를 바꿀 수 없게 됩니다.'}
              {t.status === 'live' && '경기를 편성하고 점수를 기록할 수 있습니다.'}
              {t.status === 'finished' && '종료된 대회입니다. 새 참가자를 받지 않습니다.'}
            </p>
          </div>

          {t.status === 'draft' && (
            <Button
              loading={setStatus.isPending}
              disabled={ungrouped > 0}
              onClick={() => setStatus.mutate('live')}
            >
              <Play className="size-4" aria-hidden />
              대회 시작
            </Button>
          )}
          {t.status === 'live' && (
            <Button
              variant="secondary"
              loading={setStatus.isPending}
              onClick={() => setStatus.mutate('finished')}
            >
              <Square className="size-4" aria-hidden />
              대회 종료
            </Button>
          )}
        </div>

        {t.status === 'draft' && ungrouped > 0 && (
          <p className="mt-3 text-sm font-semibold text-warn">
            아직 조를 고르지 않은 참가자가 {ungrouped}명 있습니다. 아래에서 배정해 주세요.
          </p>
        )}

        {setStatus.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b">
            {toUserMessage(setStatus.error, '상태를 바꾸지 못했습니다')}
          </p>
        )}
      </section>

      {/* ── 초대 코드 ─────────────────────────────────────────────── */}
      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink-2">초대 코드</h2>
          <p className="tabular mt-0.5 text-2xl font-black tracking-[0.2em] text-ink-1">
            {t.invite_code}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={regenerate.isPending}
          onClick={() => regenerate.mutate()}
          title="기존 코드는 더 이상 쓸 수 없게 됩니다"
        >
          <RefreshCw className="size-4" aria-hidden />
          재발급
        </Button>
      </section>

      {/* ── 경기 편성 진입 ────────────────────────────────────────── */}
      <section className="mt-4">
        <Link
          to={`/t/${id}/matches/new`}
          className="flex items-center justify-between rounded-2xl bg-brand-600 p-5 text-white
                     transition-transform hover:-translate-y-0.5
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <div>
            <p className="text-lg font-black">경기 편성</p>
            <p className="mt-0.5 text-sm text-brand-100">조 vs 조 · 각 조에서 2명씩 · 심판 지정</p>
          </div>
          <span aria-hidden className="text-2xl">
            →
          </span>
        </Link>
      </section>

      <section className="mt-4">
        <Link
          to={`/t/${id}/live`}
          className="flex items-center justify-between rounded-2xl border border-border-subtle
                     bg-surface-1 p-4 transition-colors hover:bg-surface-2"
        >
          <span className="flex items-center gap-2 font-semibold text-ink-1">
            <Monitor className="size-4 text-ink-2" aria-hidden />
            관전 화면
          </span>
          <span className="text-sm text-ink-3">코트 옆 태블릿·TV 용</span>
        </Link>
      </section>

      <section className="mt-4">
        <Link
          to={`/t/${id}/audit`}
          className="flex items-center justify-between rounded-2xl border border-border-subtle
                     bg-surface-1 p-4 transition-colors hover:bg-surface-2"
        >
          <span className="flex items-center gap-2 font-semibold text-ink-1">
            <ScrollText className="size-4 text-ink-2" aria-hidden />
            변경 기록
          </span>
          <span className="text-sm text-ink-3">누가 무엇을 바꿨는지</span>
        </Link>
      </section>

      <div className="mt-10">
        <CourtManager tournamentId={id!} courts={courts.data ?? []} matches={matches.data ?? []} />
      </div>

      <div className="mt-10">
        <MemberManager
          tournamentId={id!}
          members={members.data}
          groups={groups.data}
          myMemberId={me?.id}
        />
      </div>
    </main>
  )
}
