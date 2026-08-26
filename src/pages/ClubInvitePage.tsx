import { useParams } from 'react-router-dom'
import { ClubScreen } from '@/features/club/ClubScreen'

/**
 * 동아리 코드 — **회원을 명단에 들이는 코드 하나.** 그것만 한다.
 *
 * 게스트 링크와 갈라 둔다. 이 코드로 들어온 사람은 **명단에 영구히
 * 남고**, 앞으로 이 동아리 밑에 열리는 모든 모임에 자동으로 초대된다.
 * 게스트는 오늘 하루 이름만 적고 끝이다. 한 화면에 두 코드를 나란히 두면
 * 급할 때 엉뚱한 것을 복사해 뿌리게 된다.
 *
 * 재발급이 없다. 대회 코드와 달리 자주 바꿀 일이 없고, 바꾸면 **아직 안
 * 들어온 회원에게 뿌린 코드가 한꺼번에 죽는다.**
 */
export function ClubInvitePage() {
  const { clubId } = useParams<{ clubId: string }>()

  return (
    <ClubScreen
      clubId={clubId!}
      title="동아리 코드"
      description="이 코드로 들어온 사람은 명단에 남고, 앞으로 여는 모임에 자동으로 초대됩니다."
      staffOnly
    >
      {({ club }) => (
        <>
          <p className="tabular rounded-xl bg-surface-2 px-3 py-5 text-center text-3xl font-black tracking-[0.2em] text-ink-1">
            {club.invite_code}
          </p>

          <p className="mt-4 text-sm text-ink-2">
            회원은 <b>동아리 들어가기</b> 화면에서 이 코드를 넣습니다. 대회 초대 코드와 다릅니다.
          </p>

          {/*
            명단은 앞으로 열리는 모든 모임 명단의 원본이다. 코드가 새면
            모르는 사람이 그 원본에 남으므로, 경고를 코드 바로 밑에 둔다.
          */}
          <p className="mt-2 text-sm text-ink-3">
            아무 데나 올리지 마세요. 이 코드로 들어온 사람은 명단에서 직접 빼기 전까지 남습니다.
          </p>
        </>
      )}
    </ClubScreen>
  )
}
