import { useState } from 'react'
import { Plus, Shield, ShieldOff, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { NameEditor } from '@/features/tournament/NameEditor'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import {
  useAddRosterMember,
  useRemoveMember,
  useSetMemberGroup,
  useSetMemberRole,
} from '@/features/tournament/queries'
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
  const addMember = useAddRosterMember(tournamentId)
  const removeMember = useRemoveMember(tournamentId)
  const [newName, setNewName] = useState('')

  const error =
    setRole.error ?? setGroup.error ?? addMember.error ?? removeMember.error

  const ungrouped = members.filter((m) => !m.groupId)
  const pending = members.filter((m) => !m.userId)

  async function add() {
    const name = newName.trim()
    if (!name) return
    try {
      await addMember.mutateAsync(name)
      setNewName('')
    } catch {
      // 오류는 위에 표시된다 (중복 이름 등)
    }
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink-1">참가자 {members.length}명</h2>
        {ungrouped.length > 0 && (
          <span className="text-xs font-semibold text-warn-fg">조 미정 {ungrouped.length}명</span>
        )}
      </div>

      {pending.length > 0 && (
        <p className="mt-1 text-xs text-ink-3">
          미가입 {pending.length}명 — 조 배정과 경기는 되지만 심판은 맡을 수 없습니다.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '변경하지 못했습니다')}
        </p>
      )}

      {/* 명단에 미리 넣기 — 대회 날 아침에 20명이 각자 코드를 치길 기다릴 수 없다 */}
      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          maxLength={20}
          placeholder="이름으로 참가자 추가"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          aria-label="추가할 참가자 이름"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-1 px-3
                     text-base text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
        />
        <Button
          onClick={() => void add()}
          loading={addMember.isPending}
          disabled={newName.trim().length === 0}
          className="shrink-0"
        >
          <Plus className="size-4" aria-hidden />
          추가
        </Button>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.id === myMemberId
          const isOwner = m.role === 'owner'
          const group = groups.find((g) => g.id === m.groupId)

          return (
            /*
             * 한 줄에 담는다. 조작이 가로를 먹지 않게 만드는 게 관건이라
             * 조 선택은 폭을 못 박고(w-16) 글자도 '미정' 처럼 짧게 줄였다.
             * 예전엔 이 드롭다운 하나가 135px 를 먹어 이름이 밀렸다.
             */
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-xl border border-border-subtle
                         bg-surface-1 py-2 pr-2 pl-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* 오타로 들어온 이름을 관리자가 고쳐 준다. 본인이 못 고치는
                      상황(폰이 없거나 이미 대회 중)이 흔하다. */}
                  <NameEditor
                    tournamentId={tournamentId}
                    memberId={m.id}
                    name={m.displayName}
                    label={m.displayName}
                    compact
                  />
                  {/*
                    좁은 화면에서 배지가 이름 폭을 먹는다. 글자를 줄인다.
                    '(나)' 는 뺐다 — 본인 행에는 애초에 조작 버튼이 안 나오므로
                    그 자체가 표시다.
                    '관리자' 는 방패 버튼이 이미 상태를 보여 주지만, 버튼이
                    안 보이는 좁은 화면도 있으므로 배지는 남긴다.
                  */}
                  <span className="flex shrink-0 items-center gap-1">
                  {isOwner && <Badge>주최</Badge>}
                  {m.role === 'admin' && <Badge tone="ok">관리</Badge>}
                  {!m.userId && <Badge tone="neutral">미가입</Badge>}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
              {/* 조 재배정 — 대회 시작 뒤에는 관리자만 할 수 있는 유일한 경로다 */}
              <label>
                <span className="sr-only">{m.displayName} 조 변경</span>
                <select
                  value={m.groupId ?? ''}
                  onChange={(e) =>
                    setGroup.mutate({ memberId: m.id, groupId: e.target.value || null })
                  }
                  disabled={setGroup.isPending}
                  className={cn(
                    // 폭을 못 박는다. 내용에 맡기면 '조 미정' 이 135px 를 먹는다.
                    'h-10 w-[4.5rem] rounded-lg border bg-surface-1 pr-1 pl-2',
                    'text-xs font-bold text-ink-1',
                    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none',
                    m.groupId ? 'border-border-subtle' : 'border-warn/50 text-warn-fg',
                  )}
                >
                  <option value="">미정</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.is_joker ? '🃏' : ''}
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
                    'grid size-10 shrink-0 place-items-center rounded-lg border transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                    m.role === 'admin'
                      ? 'border-ok/40 bg-ok/10 text-ok-fg hover:bg-ok/20'
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

              {/* 경기에 나간 사람은 서버가 막는다 — 지우면 그 경기 기록에서도 사라진다 */}
              {!isOwner && !isSelf && (
                <button
                  type="button"
                  disabled={removeMember.isPending}
                  onClick={() => {
                    if (confirm(`${m.displayName}님을 이 대회에서 뺄까요?`)) {
                      removeMember.mutate(m.id)
                    }
                  }}
                  aria-label={`${m.displayName} 제외`}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border
                             border-border-subtle text-ink-3 transition-colors
                             hover:border-team-b/40 hover:bg-team-b/10 hover:text-team-b-fg
                             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <UserMinus className="size-4" aria-hidden />
                </button>
              )}
              </div>

              {group?.is_joker && <span className="sr-only">{group.name}는 조커조입니다</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
