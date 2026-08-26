import { useNavigate, useParams } from 'react-router-dom'
import { LogOut, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ClubScreen } from '@/features/club/ClubScreen'
import { useDeleteClub, useRemoveClubMember, useRenameClub } from '@/features/club/queries'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { CLUB_NAME_MAX } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'

/**
 * 동아리 설정 — **이 동아리를 고치거나 떠난다.** 그것만 한다.
 *
 * 이름 바꾸기와 나가기·지우기를 함께 둔다. 셋 다 "이 동아리 자체를
 * 어떻게 할까" 라는 한 질문의 답이고, 셋 다 **자주 하는 일이 아니다.**
 * 자주 하는 일(게스트 링크·명단)과 섞여 있으면, 급할 때 그 사이에서
 * 지우기 버튼을 스치게 된다.
 */
export function ClubSettingsPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()

  const rename = useRenameClub(clubId ?? '')
  const leave = useRemoveClubMember(clubId ?? '')
  const remove = useDeleteClub()

  return (
    <ClubScreen clubId={clubId!} title="동아리 설정">
      {({ club, me }) => {
        const isOwner = me?.role === 'owner'
        const canRename = isOwner || me?.role === 'admin'

        async function handleLeave() {
          if (!me) return
          if (!confirm(`${club.name}에서 나갈까요?`)) return
          try {
            await leave.mutateAsync(me.id)
            navigate('/clubs', { replace: true })
          } catch {
            // leave.error 로 화면에 뿌린다
          }
        }

        async function handleDelete() {
          if (!clubId) return
          if (!confirm(`${club.name}를 지울까요? 되돌릴 수 없습니다.`)) return
          try {
            await remove.mutateAsync(clubId)
            navigate('/clubs', { replace: true })
          } catch {
            // remove.error 로 화면에 뿌린다
          }
        }

        return (
          <>
            <h2 className="font-bold text-ink-1">이름</h2>
            {canRename ? (
              <div className="mt-2 flex items-center rounded-2xl border border-border-subtle bg-surface-1 px-4 py-2">
                <InlineEdit
                  value={club.name}
                  label="동아리"
                  maxLength={CLUB_NAME_MAX}
                  pending={rename.isPending}
                  error={
                    rename.error ? toUserMessage(rename.error, '이름을 바꾸지 못했습니다') : null
                  }
                  onSave={async (next) => {
                    await rename.mutateAsync(next)
                  }}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-2">운영진만 바꿀 수 있습니다.</p>
            )}

            {/*
              동아리장은 나갈 수 없다 (`remove_club_member` 가 막는다).
              나가면 아무도 운영할 수 없는 동아리가 남기 때문이다.
              대신 지우는 길이 있다.
            */}
            <section className="mt-12 border-t border-border-subtle pt-6">
              {me && !isOwner && (
                <>
                  <Button
                    variant="secondary"
                    loading={leave.isPending}
                    onClick={() => void handleLeave()}
                  >
                    <LogOut className="size-4" aria-hidden />
                    동아리 나가기
                  </Button>
                  <p className="mt-2 text-xs text-ink-3">
                    이미 치른 대회의 기록과 명단은 그대로 남습니다.
                  </p>
                  {leave.error && (
                    <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                      {toUserMessage(leave.error, '나가지 못했습니다')}
                    </p>
                  )}
                </>
              )}

              {isOwner && (
                <>
                  <Button
                    variant="danger"
                    loading={remove.isPending}
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    동아리 지우기
                  </Button>
                  <p className="mt-2 text-xs text-ink-3">
                    산하 대회·모임과 경기 기록은 남고 소속만 풀립니다. 사라지는 것은 동아리와 이
                    명단뿐입니다.
                  </p>
                  {remove.error && (
                    <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                      {toUserMessage(remove.error, '동아리를 지우지 못했습니다')}
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )
      }}
    </ClubScreen>
  )
}
