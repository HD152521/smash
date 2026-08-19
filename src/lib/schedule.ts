import type { MatchOverviewRow } from '@/types/database'

/**
 * 대진표 계산.
 *
 * 조 대항전이라 "어느 조가 어느 조와 붙었나" 가 판의 전부다.
 * 격자로 보면 끝난 조합·진행 중인 조합·아직 안 붙은 조합이 한눈에 들어온다.
 *
 * 같은 조합이 여러 번 붙을 수 있으므로 셀 하나에 경기가 여러 개 들어간다.
 */

/** 조 두 개를 순서와 무관한 하나의 키로 만든다 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export interface MatchupIndex {
  /** pairKey → 그 조합의 경기들 (무효 제외) */
  byPair: Map<string, MatchOverviewRow[]>
}

export function buildMatchupIndex(matches: readonly MatchOverviewRow[]): MatchupIndex {
  const byPair = new Map<string, MatchOverviewRow[]>()
  for (const m of matches) {
    // 무효 경기는 판에서 빼야 한다 — 남은 대진을 셀 때 없던 일로 쳐야 하기 때문이다
    if (m.status === 'void') continue
    if (!m.group_a_id || !m.group_b_id) continue
    const key = pairKey(m.group_a_id, m.group_b_id)
    const list = byPair.get(key)
    if (list) list.push(m)
    else byPair.set(key, [m])
  }
  return { byPair }
}

export function matchesFor(index: MatchupIndex, a: string, b: string): MatchOverviewRow[] {
  return index.byPair.get(pairKey(a, b)) ?? []
}

export interface Pairing {
  a: { id: string; name: string; isJoker: boolean }
  b: { id: string; name: string; isJoker: boolean }
}

export interface GroupLite {
  id: string
  name: string
  is_joker: boolean
  sort_order: number
}

/** 아직 한 번도 안 붙은 조합. 관리자가 다음에 뭘 편성해야 할지 알려준다. */
export function remainingPairings(groups: readonly GroupLite[], index: MatchupIndex): Pairing[] {
  const sorted = [...groups].sort((x, y) => x.sort_order - y.sort_order)
  const out: Pairing[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!
      const b = sorted[j]!
      if (matchesFor(index, a.id, b.id).length > 0) continue
      out.push({
        a: { id: a.id, name: a.name, isJoker: a.is_joker },
        b: { id: b.id, name: b.name, isJoker: b.is_joker },
      })
    }
  }
  return out
}

export interface ScheduleProgress {
  totalPairings: number
  playedPairings: number
  liveMatches: number
  finishedMatches: number
}

export function scheduleProgress(
  groups: readonly GroupLite[],
  index: MatchupIndex,
): ScheduleProgress {
  const n = groups.length
  const totalPairings = (n * (n - 1)) / 2
  let played = 0
  let live = 0
  let finished = 0
  for (const list of index.byPair.values()) {
    if (list.length > 0) played++
    for (const m of list) {
      if (m.status === 'live') live++
      if (m.status === 'finished') finished++
    }
  }
  return {
    totalPairings,
    playedPairings: played,
    liveMatches: live,
    finishedMatches: finished,
  }
}

/**
 * 한 셀의 요약. 격자 칸에 무엇을 그릴지 정한다.
 *
 * 여러 경기가 있으면 진행 중인 것을 우선 보여준다 — 지금 벌어지는 일이
 * 지난 결과보다 급하다.
 */
export type CellState =
  | { kind: 'self' }
  | { kind: 'empty' }
  | { kind: 'live'; match: MatchOverviewRow; extra: number }
  | { kind: 'done'; match: MatchOverviewRow; extra: number; aWon: boolean }
  | { kind: 'scheduled'; match: MatchOverviewRow; extra: number }

export function cellState(index: MatchupIndex, rowGroupId: string, colGroupId: string): CellState {
  if (rowGroupId === colGroupId) return { kind: 'self' }
  const list = matchesFor(index, rowGroupId, colGroupId)
  if (list.length === 0) return { kind: 'empty' }

  const extra = list.length - 1
  const live = list.find((m) => m.status === 'live')
  if (live) return { kind: 'live', match: live, extra }

  const finished = list.filter((m) => m.status === 'finished')
  if (finished.length > 0) {
    // 가장 최근 결과를 대표로 보여준다
    const m = finished[finished.length - 1]!
    const aWon = m.group_a_id === rowGroupId ? m.winner_side === 'A' : m.winner_side === 'B'
    return { kind: 'done', match: m, extra: list.length - 1, aWon }
  }

  return { kind: 'scheduled', match: list[0]!, extra }
}

/** 격자 칸에 보여줄 점수를 행 기준으로 정렬한다 (행 조 점수 : 열 조 점수) */
export function scoreForRow(
  m: MatchOverviewRow,
  rowGroupId: string,
): { mine: number; theirs: number } {
  const aIsRow = m.group_a_id === rowGroupId
  return {
    mine: (aIsRow ? m.score_a : m.score_b) ?? 0,
    theirs: (aIsRow ? m.score_b : m.score_a) ?? 0,
  }
}
