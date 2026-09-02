import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { fetchMyProfile, updateMyProfile, type MyProfilePatch } from './api'

const profileKeys = {
  me: (uid: string) => ['profile', uid, 'me'] as const,
}

/**
 * 내 계정 정보.
 *
 * 로그인 전에는 안 부른다(`enabled`). `/me` 는 `Protected` 안에 있어 실제로
 * 그런 순간이 거의 없지만, 세션 복원 중 한 프레임 동안 `user` 가 null 이라
 * 그때 `userId!` 로 부르면 남의 것도 내 것도 아닌 조회가 나간다.
 */
export function useMyProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: profileKeys.me(user?.id ?? ''),
    queryFn: () => fetchMyProfile(user!.id),
    enabled: Boolean(user?.id),
  })
}

/**
 * 이름·급수·성별을 한 번에 저장한다.
 *
 * 셋을 따로 저장하지 않는 이유: 마이페이지는 폼 하나이고 저장 버튼도
 * 하나다. 칸마다 요청을 나누면 "이름만 저장되고 급수는 안 된" 중간 상태가
 * 생기는데, 그 상태를 화면이 설명할 방법이 없다.
 *
 * ⚠ 여기서 바꾼 값은 **이미 들어간 명단으로 따라가지 않는다**(스냅샷 —
 * api.ts 의 `MyProfile.grade` 주석). 그래서 명단 캐시를 무효화하지 않는다:
 * 무효화하면 화면이 다시 읽어 와도 같은 값이라 "왜 안 바뀌지" 만 남는다.
 * 오늘 명단의 내 값은 명단 화면에서 따로 고친다.
 */
export function useUpdateMyProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: MyProfilePatch) => updateMyProfile(user!.id, patch),
    onSuccess: (next) => {
      qc.setQueryData(profileKeys.me(user?.id ?? ''), next)
      // 대회 만들기·모임 열기 화면이 표시 이름 기본값으로 쓰는 값이다
      void qc.invalidateQueries({ queryKey: ['profile', user?.id ?? '', 'name'] })
    },
  })
}
