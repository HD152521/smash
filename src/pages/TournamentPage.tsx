import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Users } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import { useGroups, useMembers, useSetMyGroup, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { TournamentConfig, TournamentStatus } from '@/types/database'

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
  const setGroup = useSetMyGroup(id ?? '')

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const config = tournament.data?.config as TournamentConfig | undefined
  const canPickGroup = tournament.data?.status === 'draft' || isAdmin

  if (tournament.error) {
    return (
      <Shell>
        <p role="alert" className="mt-8 text-sm font-medium text-team-b">
          {toUserMessage(tournament.error, '대회를 불러오지 못했습니다')}
        </p>
      </Shell>
    )
  }

  if (!tournament.data) {
    return (
      <Shell>
        <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </Shell>
    )
  }

  const t = tournament.data

  return (
    <Shell>
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
        </div>
        <h1 className="mt-2 text-3xl leading-tight font-black tracking-tight text-ink-1">
          {t.name}
        </h1>
        {t.description && <p className="mt-2 text-sm text-ink-2">{t.description}</p>}
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
          <Users className="size-4" aria-hidden />
          참가자 {members.data?.length ?? 0}명
        </p>
      </header>

      {isAdmin && <InviteCodeCard code={t.invite_code} />}

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink-1">내 조 선택</h2>
        <p className="mt-1 text-sm text-ink-2">
          {canPickGroup
            ? '잘못 골랐다면 언제든 다시 바꿀 수 있습니다.'
            : '대회가 시작되어 관리자만 조를 바꿀 수 있습니다.'}
        </p>

        {setGroup.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b">
            {toUserMessage(setGroup.error, '조를 바꾸지 못했습니다')}
          </p>
        )}

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {groups.data?.map((g) => {
            const count = members.data?.filter((m) => m.groupId === g.id).length ?? 0
            const mine = me?.groupId === g.id
            const over = count > g.capacity
            const target = g.is_joker ? config?.jokerPoints : config?.normalPoints

            return (
              <button
                key={g.id}
                type="button"
                disabled={!canPickGroup || setGroup.isPending}
                onClick={() => setGroup.mutate(mine ? null : g.id)}
                aria-pressed={mine}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  mine
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/30'
                    : 'border-border-subtle bg-surface-1 hover:bg-surface-2',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-ink-1">{g.name}</span>
                    {g.is_joker && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-joker/40 bg-joker-soft px-2 py-0.5 text-xs font-bold text-joker-ink">
                        🃏 조커
                        {target !== undefined && <span className="tabular">· {target}점</span>}
                      </span>
                    )}
                  </div>
                  <p className={cn('tabular mt-1 text-xs', over ? 'text-warn' : 'text-ink-3')}>
                    {count} / {g.capacity}명{over && ' · 정원 초과'}
                  </p>
                </div>
                {mine && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
              </button>
            )
          })}
        </div>

        {me && !me.groupId && (
          <p className="mt-4 text-sm font-semibold text-warn">
            아직 조를 고르지 않았습니다. 대회를 시작하려면 모두 조를 정해야 합니다.
          </p>
        )}
      </section>

      <section className="mt-12 rounded-2xl border border-dashed border-border-subtle p-6 text-center">
        <p className="text-sm text-ink-2">경기 현황 · 대진표 · 순위표는 다음 단계에서 붙습니다.</p>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to="/my"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />내 대회
      </Link>
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
