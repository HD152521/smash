import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  ChevronRight,
  Layers,
  LayoutGrid,
  Monitor,
  Play,
  RefreshCw,
  ScrollText,
  SlidersHorizontal,
  Square,
  Users,
} from 'lucide-react'
import { BackBar } from '@/components/ui/BackBar'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useAdminGate } from '@/features/admin/useAdminGate'
import { ruleSummary } from '@/lib/ruleSettings'
import {
  useCourts,
  useGroups,
  useRegenerateInviteCode,
  useRenameTournament,
  useSetTournamentStatus,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 관리 — 대회 자체를 다루는 것만 남기고 나머지는 각자 화면으로 보낸다.
 *
 * 예전에는 조 · 코트 · 참가자 목록이 전부 이 화면에 세로로 쌓여 있었다.
 * 참가자가 스무 명이면 코트 하나 고치려고 화면을 한참 굴려야 했고, 정작
 * 대회 도중 급한 '시작 · 종료' 와 초대 코드가 위로 밀려 올라갔다.
 *
 * 여기 남는 건 세 가지다 — 대회 이름, 상태, 초대 코드. 셋 다 대회에 하나뿐이고
 * 목록이 아니라서 길어지지 않는다. 목록인 것들은 전부 아래 메뉴로 내보낸다.
 */
export function TournamentAdminPage() {
  const { id } = useParams<{ id: string }>()

  const gate = useAdminGate(id)
  const tournament = useTournament(id)
  const groups = useGroups(id)
  const courts = useCourts(id)
  const renameT = useRenameTournament(id ?? '')
  const setStatus = useSetTournamentStatus(id ?? '')
  const regenerate = useRegenerateInviteCode(id ?? '')

  if (gate.denied) return <Navigate to={`/t/${id}`} replace />

  if (!tournament.data || gate.loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const t = tournament.data
  const members = gate.members ?? []
  const ungrouped = members.filter((m) => !m.groupId).length

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      {/* 관리에서 뒤로는 늘 대회 화면이다. 편성을 여러 번 오간 뒤에도 한 번에 나간다. */}
      <BackBar to={`/t/${id}`} label="대회로" fixed />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">관리</h1>
      {/* 오타는 대회가 끝날 때까지 남는다. 여기서 바로 고친다. */}
      <div className="mt-1 flex items-center">
        <InlineEdit
          value={t.name}
          label="대회"
          maxLength={40}
          pending={renameT.isPending}
          error={renameT.error ? toUserMessage(renameT.error, '이름을 바꾸지 못했습니다') : null}
          onSave={async (next) => {
            await renameT.mutateAsync(next)
          }}
        />
      </div>

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

        {/*
          조 없는 사람이 남으면 시작을 막는다. 배정하는 곳이 이 화면에서 빠졌으므로
          문구로만 알리면 어디로 가야 하는지 알 수 없다 — 바로 그 화면으로 보낸다.
        */}
        {t.status === 'draft' && ungrouped > 0 && (
          <p className="mt-3 text-sm font-semibold text-warn-fg">
            아직 조를 고르지 않은 참가자가 {ungrouped}명 있습니다.{' '}
            <Link
              to={`/t/${id}/admin/members`}
              className="underline underline-offset-2 focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              참가자에서 배정
            </Link>
            해 주세요.
          </p>
        )}

        {setStatus.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
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
          className="flex items-center justify-between rounded-2xl bg-brand-600 p-5 text-brand-ink
                     transition-transform hover:-translate-y-0.5
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <div>
            <p className="text-lg font-black">경기 편성</p>
            <p className="mt-0.5 text-sm text-brand-ink-soft">조 vs 조 · 각 조에서 2명씩 · 심판 지정</p>
          </div>
          <span aria-hidden className="text-2xl">
            →
          </span>
        </Link>

        {/*
          지난 결과 입력은 **다른 일**이라 다른 화면이다 — 편성 화면 안의
          토글이 아니다. 쓰는 시점부터 다르다: 편성은 대회 중, 이쪽은
          대회가 끝난 뒤 정산할 때다. 그래서 눈에 띄기는 하되 편성보다
          한 단 아래에 둔다.
        */}
        <Link
          to={`/t/${id}/matches/record`}
          className="mt-2 flex items-center justify-between rounded-2xl border border-border-subtle
                     bg-surface-1 p-4 transition-colors hover:bg-surface-2
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <div>
            <p className="text-sm font-black text-ink-1">지난 결과 입력</p>
            <p className="mt-0.5 text-xs text-ink-3">앱 없이 치른 경기의 점수만 남깁니다</p>
          </div>
          <span aria-hidden className="text-lg text-ink-3">
            →
          </span>
        </Link>
      </section>

      {/*
        바꾸는 것들. 목록이라 길어지므로 각자 화면을 준다.
        개수를 여기 적어 두면 들어가 보지 않고도 뭘 손봐야 할지 안다.
      */}
      <nav aria-label="대회 구성" className="mt-8">
        <h2 className="text-sm font-semibold text-ink-2">구성 바꾸기</h2>
        <ul className="mt-2 flex flex-col gap-2">
          <AdminMenuItem
            to={`/t/${id}/admin/groups`}
            icon={<Layers className="size-4" aria-hidden />}
            label="조"
            count={groups.data?.length}
            hint="조 이름 바꾸기"
          />
          <AdminMenuItem
            to={`/t/${id}/admin/courts`}
            icon={<LayoutGrid className="size-4" aria-hidden />}
            label="코트"
            count={courts.data?.length}
            hint="추가 · 이름 · 순서"
          />
          <AdminMenuItem
            to={`/t/${id}/admin/members`}
            icon={<Users className="size-4" aria-hidden />}
            label="참가자"
            count={members.length}
            hint="조 배정 · 권한 · 명단"
            warn={ungrouped > 0 ? `조 없음 ${ungrouped}` : undefined}
          />
          <AdminMenuItem
            to={`/t/${id}/admin/rules`}
            icon={<SlidersHorizontal className="size-4" aria-hidden />}
            label="경기 규칙"
            hint={ruleSummary(t.config)}
          />
        </ul>
      </nav>

      <nav aria-label="보기" className="mt-6">
        <h2 className="text-sm font-semibold text-ink-2">보기</h2>
        <ul className="mt-2 flex flex-col gap-2">
          <AdminMenuItem
            to={`/t/${id}/live`}
            icon={<Monitor className="size-4" aria-hidden />}
            label="관전 화면"
            hint="코트 옆 태블릿·TV 용"
          />
          <AdminMenuItem
            to={`/t/${id}/audit`}
            icon={<ScrollText className="size-4" aria-hidden />}
            label="변경 기록"
            hint="누가 무엇을 바꿨는지"
          />
        </ul>
      </nav>
    </main>
  )
}

function AdminMenuItem({
  to,
  icon,
  label,
  hint,
  count,
  warn,
}: {
  to: string
  icon: ReactNode
  label: string
  hint: string
  /** 아직 안 왔으면 자리를 비운다 — 0 을 깜빡 보여주면 없는 줄 안다 */
  count?: number
  /** 손봐야 할 게 있을 때만 */
  warn?: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-border-subtle
                   bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span className="text-ink-2">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink-1">
              {label}
              {count !== undefined && <span className="tabular ml-1.5 text-ink-3">{count}</span>}
            </span>
            {warn && <Badge tone="warn">{warn}</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-sm text-ink-3">{hint}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  )
}
