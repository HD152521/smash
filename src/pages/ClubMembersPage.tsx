import { useParams } from 'react-router-dom'
import { ClubScreen } from '@/features/club/ClubScreen'
import { ClubStaffManager } from '@/features/club/ClubStaffManager'

/**
 * 동아리 명단 — **누가 회원이고 누가 운영진인가.** 그것만 한다.
 *
 * 회원이 늘면 이 화면은 계속 길어진다. 그게 정상이라, 짧게 유지해야 하는
 * 것들(게스트 링크·동아리 코드)과 같은 화면에 두면 안 됐다. 전에는
 * 명단 30줄 위에 그 둘이 얹혀 있었다.
 */
export function ClubMembersPage() {
  const { clubId } = useParams<{ clubId: string }>()

  return (
    <ClubScreen clubId={clubId!} title="명단">
      {({ club, members, me }) => (
        <ClubStaffManager
          clubId={club.id}
          members={members}
          myMemberId={me?.id}
          canManage={me?.role === 'owner' || me?.role === 'admin'}
        />
      )}
    </ClubScreen>
  )
}
