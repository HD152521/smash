import { Shield, ShieldOff, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { clubRoleLabel } from '@/lib/club'
import { useRemoveClubMember, useSetClubMemberRole } from './queries'
import type { ClubMemberSummary } from './api'

interface ClubStaffManagerProps {
  clubId: string
  members: ClubMemberSummary[]
  /** 내 club_members 행. 본인 행에는 조작 버튼을 띄우지 않는다 */
  myMemberId: string | undefined
  /**
   * 운영진인가. 아니면 같은 목록을 읽기 전용으로 그린다.
   *
   * 화면을 두 벌로 가르지 않는 건 명단이 회원에게도 보이기 때문이다
   * (`cm_select` 는 `is_club_member`). 목록은 하나고 조작만 사라진다.
   */
  canManage: boolean
}

/**
 * 동아리 명단 · 운영진 지정 해제.
 *
 * `MemberManager` 를 본떴지만 조 배정 · 이름 고치기 · 명단에 미리 넣기가 없다.
 * 동아리 명단은 코드로 들어온 사람들이고(마일스톤 2 전까지는 그것뿐이다),
 * 이름은 각자 대회에서 쓰는 이름의 원본이라 남이 함부로 고칠 것이 아니다.
 */
export function ClubStaffManager({
  clubId,
  members,
  myMemberId,
  canManage,
}: ClubStaffManagerProps) {
  const setRole = useSetClubMemberRole(clubId)
  const removeMember = useRemoveClubMember(clubId)

  const error = setRole.error ?? removeMember.error
  const staffCount = members.filter((m) => m.role !== 'member').length

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink-1">회원 {members.length}명</h2>
        <span className="text-xs font-semibold text-ink-3">운영진 {staffCount}명</span>
      </div>

      {canManage && (
        <p className="mt-1 text-xs text-ink-3">
          운영진으로 올리면 <b>앞으로 여는</b> 산하 대회·모임에 관리자로 들어갑니다. 내리면 아직 안
          끝난 산하 대회의 관리자 권한도 함께 사라집니다.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '변경하지 못했습니다')}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.id === myMemberId
          const isOwner = m.role === 'owner'
          const isStaff = m.role === 'admin'
          /*
           * 계정이 없는 회원은 운영진이 될 수 없다 — DB 의
           * `check (role = 'member' or user_id is not null)` 이 막는다.
           * 눌러 보고 제약 위반 오류를 보게 두지 말고 미리 잠근다.
           * (마일스톤 2 에서 계정 없는 회원이 명단에 들어온다)
           */
          const canPromote = m.userId !== null

          return (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-xl border border-border-subtle
                         bg-surface-1 py-2 pr-2 pl-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate font-bold text-ink-1">{m.displayName}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {isOwner && <Badge>동아리장</Badge>}
                  {isStaff && <Badge tone="ok">운영진</Badge>}
                  {!m.userId && <Badge tone="neutral">미가입</Badge>}
                </span>
              </div>

              {/*
                동아리장 행은 어느 쪽도 못 건드린다. 서버도 막지만
                (`set_club_member_role` · `remove_club_member`), 눌리는 버튼을
                두면 눌러 본 사람은 앱이 고장 났다고 읽는다.
                본인 행도 뺀다 — 스스로 내려 동아리를 잠그는 걸 막는다.
              */}
              {canManage && !isOwner && !isSelf && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={setRole.isPending || !canPromote}
                    title={
                      canPromote
                        ? undefined
                        : '계정이 없는 회원은 운영진이 될 수 없습니다 (아무도 열 수 없는 권한이 됩니다)'
                    }
                    onClick={() =>
                      setRole.mutate({ memberId: m.id, role: isStaff ? 'member' : 'admin' })
                    }
                    aria-label={
                      isStaff
                        ? `${m.displayName} 운영진 해제`
                        : canPromote
                          ? `${m.displayName} 운영진 지정`
                          : `${m.displayName} 운영진 지정 불가 — 계정이 없습니다`
                    }
                    className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-lg border transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                      'disabled:cursor-not-allowed disabled:opacity-35',
                      isStaff
                        ? 'border-ok/40 bg-ok/10 text-ok-fg hover:bg-ok/20'
                        : 'border-border-subtle text-ink-3 hover:bg-surface-2 hover:text-ink-1',
                    )}
                  >
                    {isStaff ? (
                      <Shield className="size-4" aria-hidden />
                    ) : (
                      <ShieldOff className="size-4" aria-hidden />
                    )}
                  </button>

                  {/*
                    동아리에서 빼도 이미 치른 대회의 멤버 행과 기록은 남는다.
                    명단에서 사라지는 것과 기록이 지워지는 것은 다르다.
                  */}
                  <button
                    type="button"
                    disabled={removeMember.isPending}
                    onClick={() => {
                      if (confirm(`${m.displayName}님을 이 동아리에서 뺄까요?`)) {
                        removeMember.mutate(m.id)
                      }
                    }}
                    aria-label={`${m.displayName} 내보내기`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg border
                               border-border-subtle text-ink-3 transition-colors
                               hover:border-team-b/40 hover:bg-team-b/10 hover:text-team-b-fg
                               disabled:cursor-not-allowed disabled:opacity-35
                               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <UserMinus className="size-4" aria-hidden />
                  </button>
                </div>
              )}

              {/* 조작이 없는 줄에는 역할을 글자로 남긴다 — 배지 없는 '회원' 도 있다 */}
              {(!canManage || isOwner || isSelf) && (
                <span className="shrink-0 pr-1 text-xs font-semibold text-ink-3">
                  {isSelf ? '나' : clubRoleLabel(m.role)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
