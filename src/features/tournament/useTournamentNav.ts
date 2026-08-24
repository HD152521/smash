import { useAuth } from '@/features/auth/useAuth'
import { useGroups, useMatches, useMembers, useTournament } from './queries'
import { isSession } from '@/lib/session'
import type { TournamentStatus } from '@/types/database'

export interface TournamentNavState {
  name: string | undefined
  status: TournamentStatus | undefined
  /** 모임인가 — 조 · 순위 · 심판을 숨길지 정한다 */
  isSession: boolean
  isAdmin: boolean
  isOwner: boolean
  /** 대회 안에서 쓰는 내 이름. 대진표가 '내 경기' 를 가려내는 데 쓴다 */
  myName: string | undefined
  myGroupName: string | undefined
  myGroupIsJoker: boolean
  /** 내가 심판으로 걸린, 아직 안 끝난 경기 수 */
  refereeCount: number
}

/**
 * 머리말(대회 이름 · 배지 · 탭)이 필요로 하는 것들.
 *
 * 여섯 화면이 각자 계산하면 같은 코드가 여섯 벌 생기고, 나중에 규칙이
 * 바뀔 때 한 곳을 빠뜨린다. 쿼리는 캐시를 공유하므로 요청이 늘지 않는다.
 */
export function useTournamentNav(id: string | undefined): TournamentNavState {
  const { user } = useAuth()
  const tournament = useTournament(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const groups = useGroups(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const myName = me?.displayName
  const myGroup = groups.data?.find((g) => g.id === me?.groupId)

  return {
    name: tournament.data?.name,
    status: tournament.data?.status,
    isSession: isSession(tournament.data?.kind),
    isAdmin: me?.role === 'owner' || me?.role === 'admin',
    isOwner: me?.role === 'owner',
    myName,
    myGroupName: myGroup?.name,
    myGroupIsJoker: Boolean(myGroup?.is_joker),
    // 끝난 경기는 셀 이유가 없다 — 심판이 지금 할 일만 배지에 뜬다
    refereeCount: myName
      ? (matches.data ?? []).filter(
          (m) => m.status !== 'finished' && m.status !== 'void' && m.referees?.includes(myName),
        ).length
      : 0,
  }
}
