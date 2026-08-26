import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 코트 하나의 상태 판단 — 코트 카드가 코트처럼 보이려면 색이 먼저 갈려야 한다.
 *
 * design.md '색은 상태다' 원칙:
 *   busy — 진행 중인 경기가 있다. 지금은 건들 것 없다 (중립)
 *   open — 비었는데 잡을 수 있는 경기가 있다(이 코트 대기 또는 공용 대기).
 *          들어갈 수 있다 (초록)
 *   idle — 비었고 잡을 것도 없다. 넣을 게 없으니 조용히 둔다
 *
 * 화면(CourtBoard)이 이 갈래를 직접 계산하면 카드 컴포넌트마다 조건이
 * 흩어진다. 여기 한 곳에서 갈라야 '빈 코트인데 안 튄다' 같은 어긋남이
 * 생기지 않는다.
 */
export type CourtState = 'busy' | 'open' | 'idle'

export interface CourtQueue {
  court: CourtRow
  /** 이 코트에서 지금 하는 경기 (한 코트 한 경기) */
  live: MatchOverviewRow | null
  /**
   * **이 코트에 배정된** 예정 경기만 — 공용 대기는 안 섞는다.
   *
   * 예전엔 공용 대기를 모든 코트 대기열에 같이 붙였다. 그러면 코트가
   * 넷이고 공용 대기가 2경기일 때 "대기 2경기" 가 코트마다 찍혀 마치
   * 8경기가 있는 것처럼 보인다 — 실제로는 먼저 비는 코트 하나가 집어갈
   * 같은 2경기다. 공용 대기는 `unassignedQueue` 로 따로 센다.
   */
  own: MatchOverviewRow[]
  /** 이 코트에서 이미 끝난 경기 수 */
  finishedCount: number
}

export function courtQueue(court: CourtRow, matches: readonly MatchOverviewRow[]): CourtQueue {
  const onCourt = matches.filter((m) => m.court_id === court.id)
  const live = onCourt.find((m) => m.status === 'live') ?? null
  const finishedCount = onCourt.filter((m) => m.status === 'finished').length
  const own = onCourt.filter((m) => m.status === 'scheduled')
  return { court, live, own, finishedCount }
}

/**
 * 코트를 아직 안 정한 예정 경기 — 모든 코트가 함께 보는 하나의 줄.
 * 먼저 비는 코트가 맨 앞을 집어간다. 코트별 카드가 아니라 코트 목록
 * 아래에 한 번만 표시한다(design.md 서명 요소 재검토 — "이 코트 대기" 와
 * "공용 대기" 는 다른 숫자다).
 */
export function unassignedQueue(matches: readonly MatchOverviewRow[]): MatchOverviewRow[] {
  return matches.filter((m) => !m.court_id && m.status === 'scheduled')
}

export function courtState(input: {
  live: MatchOverviewRow | null
  own: readonly MatchOverviewRow[]
  /** 이 코트가 없어도 잡을 수 있는 공용 대기 수 — 0 이면 idle 판단에서 뺀다 */
  sharedCount: number
}): CourtState {
  if (input.live) return 'busy'
  if (input.own.length > 0 || input.sharedCount > 0) return 'open'
  return 'idle'
}
