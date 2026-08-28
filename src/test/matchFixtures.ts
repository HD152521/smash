import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MemberSummary } from '@/features/tournament/api'
import type { CourtRow, GroupRow, TournamentConfig, TournamentRow } from '@/types/database'

/**
 * 경기를 만들고 고치는 화면 셋이 함께 쓰는 붙박이 데이터.
 *
 * 셋은 같은 절차(조 → 선수)를 공유하므로 테스트가 쓰는 명단도 같아야 한다.
 * 화면마다 다른 명단을 두면 "이 화면에서만 되는 것" 이 생겨도 안 걸린다.
 */

export const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

const CONFIG: TournamentConfig = {
  format: 'doubles',
  normalPoints: 21,
  jokerPoints: 11,
  deuce: true,
  deuceCap: 30,
  jokerDeuceCap: null,
  winPoints: 3,
  jokerWinPoints: 1,
  lossPoints: 0,
  jokerGroupCount: 1,
  courtChange: false,
  courtChangeAt: null,
  readyQueuePosition: 2,
}

export const TOURNAMENT = { id: TOURNAMENT_ID, config: CONFIG } as TournamentRow

/** 2조는 조커조 — 목표 점수가 다르게 나와야 한다 */
export const GROUPS = [
  { id: 'group-a', name: '1조', is_joker: false },
  { id: 'group-b', name: '2조', is_joker: true },
] as GroupRow[]

export const COURT = { id: 'court-1', name: '1번 코트' } as CourtRow

/** m1 이 나(관리자)다. 심판이는 어느 조에도 없어 늘 심판 후보로 남는다. */
export const MEMBERS: MemberSummary[] = [
  member('m1', '가나', 'group-a', { userId: 'u1', role: 'owner' }),
  member('m2', '나다', 'group-a'),
  member('m3', '다라', 'group-b'),
  member('m4', '라마', 'group-b'),
  member('m5', '심판이', null),
]

function member(
  id: string,
  displayName: string,
  groupId: string | null,
  over?: Partial<MemberSummary>,
): MemberSummary {
  return {
    id,
    userId: null,
    displayName,
    role: 'member',
    groupId,
    rsvp: 'going',
    isGuest: false,
    // 기본은 '모른다'. 급수는 경기 편성 화면의 판단에 안 들어간다 —
    // 여기서 값을 주면 이 픽스처를 쓰는 화면이 급수를 본다는 착각을 준다
    grade: null,
    ...over,
  }
}

/** 한 편 고르기 — 조를 누르고, 그 조에서 두 명을 누른다 */
async function pickTeam(label: string, group: RegExp, players: string[]) {
  const team = within(screen.getByRole('region', { name: label }))
  await userEvent.click(team.getByRole('button', { name: group }))
  for (const name of players) {
    await userEvent.click(team.getByRole('button', { name }))
  }
}

/** 양 팀을 다 고른 상태 — 저장 바가 뜨는 최소 조건 */
export async function pickBothTeams() {
  await pickTeam('A팀', /1조/, ['가나', '나다'])
  await pickTeam('B팀', /2조/, ['다라', '라마'])
}
