import { Shield, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useSetMemberGroup, useSetMemberRole } from '@/features/tournament/queries'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow } from '@/types/database'

interface MemberManagerProps {
  tournamentId: string
  members: MemberSummary[]
  groups: GroupRow[]
  /** 본인 행에는 권한 버튼을 띄우지 않는다 (스스로 강등해 잠기는 걸 막는다) */
  myMemberId: string | undefined
}

export function MemberManager({ tournamentId, members, groups, myMemberId }: MemberManagerProps) {
  const setRole = useSetMemberRole(tournamentId)
  const setGroup = useSetMemberGroup(tournamentId)
  const error = setRole.error ?? setGroup.error

  const ungrouped = members.filter((m) => !m.groupId)

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink-1">참가자 {members.length}명</h2>
        {ungrouped.length > 0 && (
          <span className="text-xs font-semibold text-warn">조 미정 {ungrouped.length}명</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b">
          {toUserMessage(error, '변경하지 못했습니다')}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.id === myMemberId
          const isOwner = m.role === 'owner'
          const group = groups.find((g) => g.id === m.groupId)

          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink-1">{m.displayName}</span>
                  {isOwner && <Badge>주최자</Badge>}
                  {m.role === 'admin' && <Badge tone="ok">관리자</Badge>}
                  {isSelf && <span className="text-xs text-ink-3">(나)</span>}
                </div>
                {!m.groupId && (
                  <p className="mt-1 text-xs font-semibold text-warn">조가 정해지지 않음</p>
                )}
              </div>

              {/* 조 재배정 — 대회 시작 뒤에는 관리자만 할 수 있는 유일한 경로다 */}
              <label className="shrink-0">
                <span className="sr-only">{m.displayName} 조 변경</span>
                <select
                  value={m.groupId ?? ''}
                  onChange={(e) =>
                    setGroup.mutate({ memberId: m.id, groupId: e.target.value || null })
                  }
                  disabled={setGroup.isPending}
                  className={cn(
                    'h-9 rounded-lg border bg-surface-1 px-2 text-sm font-semibold text-ink-1',
                    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none',
                    m.groupId ? 'border-border-subtle' : 'border-warn/50',
                  )}
                >
                  <option value="">조 미정</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.is_joker ? ' 🃏' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* 주최자는 강등할 수 없다 — 대회 삭제 권한이 딸려 있어 잠길 수 있다 */}
              {!isOwner && !isSelf && (
                <button
                  type="button"
                  disabled={setRole.isPending}
                  onClick={() =>
                    setRole.mutate({
                      memberId: m.id,
                      role: m.role === 'admin' ? 'member' : 'admin',
                    })
                  }
                  aria-label={
                    m.role === 'admin'
                      ? `${m.displayName} 관리자 해제`
                      : `${m.displayName} 관리자 임명`
                  }
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
                    m.role === 'admin'
                      ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/20'
                      : 'border-border-subtle text-ink-3 hover:bg-surface-2 hover:text-ink-1',
                  )}
                >
                  {m.role === 'admin' ? (
                    <Shield className="size-4" aria-hidden />
                  ) : (
                    <ShieldOff className="size-4" aria-hidden />
                  )}
                </button>
              )}

              {group?.is_joker && <span className="sr-only">{group.name}는 조커조입니다</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
