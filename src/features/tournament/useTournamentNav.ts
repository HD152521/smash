import { useAuth } from '@/features/auth/useAuth'
import { useMatches, useMembers } from './queries'

/**
 * 탭 줄이 필요로 하는 것 — 관리자인가, 내가 맡은 심판 경기가 몇 개인가.
 *
 * 여섯 화면이 각자 계산하면 같은 코드가 여섯 벌 생기고, 나중에 규칙이
 * 바뀔 때 한 곳을 빠뜨린다. 쿼리는 캐시를 공유하므로 요청이 늘지 않는다.
 */
export function useTournamentNav(id: string | undefined) {
  const { user } = useAuth()
  const members = useMembers(id)
  const matches = useMatches(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const myName = me?.displayName

  return {
    isAdmin: me?.role === 'owner' || me?.role === 'admin',
    // 끝난 경기는 셀 이유가 없다 — 심판이 지금 할 일만 배지에 뜬다
    refereeCount: myName
      ? (matches.data ?? []).filter(
          (m) => m.status !== 'finished' && m.status !== 'void' && m.referees?.includes(myName),
        ).length
      : 0,
  }
}
