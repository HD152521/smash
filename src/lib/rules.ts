import type { TeamSide, TournamentConfig } from '@/types/database'

/**
 * 경기 규칙 — SQL(record_score)과 같은 판정을 클라이언트에서도 한다.
 *
 * 왜 두 곳에 있나:
 *   심판이 +1 을 누르는 순간 화면은 즉시 반응해야 한다 (낙관적 UI).
 *   서버 응답을 기다리면 체육관 네트워크에서 1~2초씩 멈춘 것처럼 보인다.
 *   그래서 같은 판정을 여기서도 한 번 하고, 서버 응답이 오면 덮어쓴다.
 *
 * ⚠ 이 파일의 규칙이 바뀌면 supabase/migrations 의 record_score 도 함께 바꿔야 한다.
 *   진실의 원천은 서버다. 여기는 화면을 먼저 움직이기 위한 사본일 뿐이다.
 */

export interface ScoreEvent {
  side: TeamSide
  delta: number
  voided?: boolean
}

export interface MatchScore {
  a: number
  b: number
}

/** 조커조는 더 적은 점수로 이긴다. 대신 승점이 절반이다. */
export function targetScoreFor(isJoker: boolean, config: TournamentConfig): number {
  return isJoker ? config.jokerPoints : config.normalPoints
}

export function winPointsFor(isJoker: boolean, config: TournamentConfig): number {
  return isJoker ? config.jokerWinPoints : config.winPoints
}

/**
 * 원장에서 현재 점수를 투영한다. SQL 의 sum(delta) filter (where not voided) 와 동일.
 * 무효 처리된 이벤트는 지우지 않고 건너뛴다 — 감사 추적을 남기기 위해서다.
 */
export function projectScore(events: readonly ScoreEvent[]): MatchScore {
  return events.reduce<MatchScore>(
    (acc, e) => {
      if (e.voided) return acc
      return e.side === 'A' ? { a: acc.a + e.delta, b: acc.b } : { a: acc.a, b: acc.b + e.delta }
    },
    { a: 0, b: 0 },
  )
}

/**
 * 승자 판정. 듀스가 없으므로 자기 목표 점수에 닿는 순간 끝난다.
 * 팀마다 목표가 다르다는 점이 핵심이다 (조커 11 / 일반 21).
 *
 * 양쪽이 동시에 목표에 닿는 일은 +1 씩 오르는 한 생기지 않지만,
 * 관리자가 점수를 수기로 넣는 경로가 있으므로 A 를 우선으로 결정한다.
 */
export function decideWinner(
  score: MatchScore,
  targetA: number,
  targetB: number,
): TeamSide | null {
  if (score.a >= targetA) return 'A'
  if (score.b >= targetB) return 'B'
  return null
}

/** 목표까지 몇 점 남았나. 스코어보드에 "매치포인트"를 띄우는 데 쓴다. */
export function pointsToWin(score: MatchScore, side: TeamSide, target: number): number {
  const current = side === 'A' ? score.a : score.b
  return Math.max(0, target - current)
}

/** 한 점만 더 내면 이기는 상태 */
export function isMatchPoint(score: MatchScore, targetA: number, targetB: number): boolean {
  if (decideWinner(score, targetA, targetB)) return false
  return pointsToWin(score, 'A', targetA) === 1 || pointsToWin(score, 'B', targetB) === 1
}

/**
 * 멱등키. 같은 탭이 두 번 전송돼도 서버에서 한 번만 반영되게 하는 열쇠다.
 * crypto.randomUUID 가 없는 구형 웹뷰를 위한 폴백을 둔다 — 체육관 폰은 다양하다.
 */
export function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const rand = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${rand}-${Math.random().toString(36).slice(2)}`
}
