import type { TeamSide, TournamentConfig } from '@/types/database'

/**
 * 경기 규칙 — SQL(record_score)과 같은 판정을 클라이언트에서도 한다.
 *
 * 왜 두 곳에 있나:
 *   심판이 +1 을 누르는 순간 화면은 즉시 반응해야 한다 (낙관적 UI).
 *   서버 응답을 기다리면 체육관 네트워크에서 1~2초씩 멈춘 것처럼 보인다.
 *   그래서 같은 판정을 여기서도 한 번 하고, 서버 응답이 오면 덮어쓴다.
 *
 * ⚠ 이 파일의 규칙이 바뀌면 supabase/migrations 의 side_wins / decide_winner 도
 *   함께 바꿔야 한다. 진실의 원천은 서버다. 여기는 화면을 먼저 움직이기 위한
 *   사본일 뿐이다.
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

/**
 * 한 팀의 승리 조건. 편성 시점에 굳혀 둔 스냅샷(match_teams)에서 온다.
 *
 * 팀마다 다르다는 게 핵심이다 — 조커조는 11점, 일반조는 21점으로 같은
 * 경기를 뛴다. 그래서 판정이 비대칭이다.
 */
export interface SideRule {
  target: number
  /** 목표에 닿아도 2점 차가 나야 끝난다 */
  deuce: boolean
  /** 듀스 상한. 여기 닿으면 2점 차 없이 끝난다. null 이면 상한 없음 */
  max: number | null
}

/**
 * match_overview 의 컬럼에서 규칙을 만든다.
 *
 * 뷰 컬럼은 Postgres 가 NOT NULL 을 보존하지 않아 생성 타입이 전부 nullable 이다.
 * 목표 점수가 없는 경기는 편성이 덜 된 것이므로 21점으로 본다 — 화면이
 * 죽는 것보다는 낫고, 어차피 서버가 진짜 판정을 한다.
 */
export function sideRuleFrom(
  target: number | null,
  deuce: boolean | null,
  max: number | null,
): SideRule {
  return { target: target ?? 21, deuce: deuce ?? false, max }
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
 * 이 점수로 이 팀이 이겼나. SQL 의 side_wins 와 같은 순서로 따진다.
 *
 *   듀스 끔    목표에 닿으면 끝
 *   듀스 켬    목표에 닿고 2점 차가 나야 끝. 단 상한에 닿으면 2점 차 없이 끝.
 */
export function sideWins(mine: number, theirs: number, rule: SideRule): boolean {
  if (mine < rule.target) return false
  if (!rule.deuce) return true
  if (rule.max !== null && mine >= rule.max) return true
  return mine - theirs >= 2
}

/**
 * 승자 판정.
 *
 * 양쪽이 동시에 조건을 만족하는 일은 +1 씩 오르는 한 생기지 않지만,
 * 관리자가 점수를 수기로 넣는 경로가 있으므로 A 를 우선으로 결정한다.
 */
export function decideWinner(score: MatchScore, a: SideRule, b: SideRule): TeamSide | null {
  if (sideWins(score.a, score.b, a)) return 'A'
  if (sideWins(score.b, score.a, b)) return 'B'
  return null
}

/**
 * 목표까지 몇 점 남았나. 스코어보드에 "매치포인트"를 띄우는 데 쓴다.
 *
 * 듀스에서는 상대 점수가 답을 바꾼다 — 20:20 이면 목표(21)에 닿아도 안 끝나서
 * 두 점이 남은 것이고, 상한이 있으면 거기서 잘린다.
 */
export function pointsToWin(score: MatchScore, side: TeamSide, rule: SideRule): number {
  const mine = side === 'A' ? score.a : score.b
  const theirs = side === 'A' ? score.b : score.a

  if (!rule.deuce) return Math.max(0, rule.target - mine)

  const byMargin = Math.max(rule.target, theirs + 2)
  const needed = rule.max === null ? byMargin : Math.min(byMargin, rule.max)
  return Math.max(0, needed - mine)
}

/** 한 점만 더 내면 이기는 상태 */
export function isMatchPoint(score: MatchScore, a: SideRule, b: SideRule): boolean {
  if (decideWinner(score, a, b)) return false
  return pointsToWin(score, 'A', a) === 1 || pointsToWin(score, 'B', b) === 1
}

/**
 * 코트를 바꾸는 점수. 끄면 null.
 *
 * 정하지 않았으면 목표 점수의 절반(올림)이다 — 21점이면 11점, 11점이면 6점.
 * 배드민턴에서 코트를 바꾸는 건 조명·바람이 한쪽에 유리한 걸 상쇄하기
 * 위해서라, 반환점이 기준이 맞다.
 */
export function courtChangeScore(rule: SideRule, config: TournamentConfig): number | null {
  if (!config.courtChange) return null
  return config.courtChangeAt ?? Math.ceil(rule.target / 2)
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
