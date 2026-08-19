import { InlineEdit } from '@/components/ui/InlineEdit'
import { useSetDisplayName } from './queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 참가자 표시 이름 바꾸기.
 *
 * 본인이 자기 이름을 바꾸는 경우와 관리자가 남의 이름을 고쳐 주는 경우가
 * 하는 일이 같아서 한 컴포넌트로 쓴다. 누가 바꿀 수 있는지는 서버가 정한다
 * (set_display_name) — 화면은 버튼을 안 그릴 뿐이다.
 */
export function NameEditor({
  tournamentId,
  memberId,
  name,
  label,
  compact,
}: {
  tournamentId: string
  memberId: string
  name: string
  label?: string
  compact?: boolean
}) {
  const rename = useSetDisplayName(tournamentId)

  return (
    <InlineEdit
      value={name}
      label={label}
      compact={compact}
      pending={rename.isPending}
      error={rename.error ? toUserMessage(rename.error, '이름을 바꾸지 못했습니다') : null}
      onSave={async (next) => {
        await rename.mutateAsync({ memberId, name: next })
      }}
    />
  )
}
