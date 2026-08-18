import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import { useGroups, useMembers, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow, TournamentConfig } from '@/types/database'

/**
 * 참가자 목록 — 조별로 묶어서 보여준다.
 *
 * "우리 조에 누구 있지", "저 사람 몇 조지" 가 전부다.
 * 이름만 나열하면 그 두 질문에 답이 안 되므로 조가 뼈대가 된다.
 *
 * 누구나 볼 수 있다. 조 배정은 관리에서만 바꾼다 — 여기는 읽기 전용이다.
 */
export function MembersPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const config = tournament.data?.config as TournamentConfig | undefined
  const ungrouped = (members.data ?? []).filter((m) => !m.groupId)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to={`/t/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />
        대회로
      </Link>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">참가자</h1>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
        <Users className="size-4" aria-hidden />
        {tournament.data?.name} · {members.data?.length ?? 0}명
      </p>

      {members.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b">
          {toUserMessage(members.error, '참가자를 불러오지 못했습니다')}
        </p>
      )}

      {members.isPending || groups.isPending ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {(groups.data ?? []).map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              members={(members.data ?? []).filter((m) => m.groupId === g.id)}
              config={config}
              myMemberId={me?.id}
            />
          ))}

          {ungrouped.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-dashed border-warn/50">
              <header className="flex items-center justify-between border-b border-border-subtle bg-warn/5 px-4 py-2.5">
                <h2 className="font-bold text-ink-1">조 미정</h2>
                <span className="tabular text-xs font-semibold text-warn">
                  {ungrouped.length}명
                </span>
              </header>
              <MemberRows members={ungrouped} myMemberId={me?.id} />
            </section>
          )}
        </div>
      )}
    </main>
  )
}

function GroupCard({
  group,
  members,
  config,
  myMemberId,
}: {
  group: GroupRow
  members: MemberSummary[]
  config: TournamentConfig | undefined
  myMemberId: string | undefined
}) {
  const over = members.length > group.capacity
  const target = group.is_joker ? config?.jokerPoints : config?.normalPoints

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-black text-ink-1">{group.name}</h2>
          {group.is_joker && (
            <Badge tone="joker">
              <span aria-hidden>🃏</span>
              조커
              {target !== undefined && <span className="tabular">· {target}점</span>}
            </Badge>
          )}
        </div>
        <span
          className={cn('tabular text-xs font-semibold', over ? 'text-warn' : 'text-ink-3')}
        >
          {members.length} / {group.capacity}명{over && ' · 정원 초과'}
        </span>
      </header>

      {members.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-ink-3">아직 아무도 없습니다</p>
      ) : (
        <MemberRows members={members} myMemberId={myMemberId} />
      )}
    </section>
  )
}

function MemberRows({
  members,
  myMemberId,
}: {
  members: MemberSummary[]
  myMemberId: string | undefined
}) {
  return (
    <ul className="divide-y divide-border-subtle">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-2 px-4 py-2.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-semibold',
              m.id === myMemberId ? 'text-brand-600' : 'text-ink-1',
            )}
          >
            {m.displayName}
          </span>
          {m.id === myMemberId && <span className="text-xs font-bold text-brand-600">나</span>}
          {m.role === 'owner' && <Badge>주최자</Badge>}
          {m.role === 'admin' && <Badge tone="ok">관리자</Badge>}
        </li>
      ))}
    </ul>
  )
}
