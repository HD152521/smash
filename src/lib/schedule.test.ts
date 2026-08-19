import { describe, expect, it } from 'vitest'
import type { MatchOverviewRow } from '@/types/database'
import {
  buildMatchupIndex,
  cellState,
  pairKey,
  remainingPairings,
  scheduleProgress,
  scoreForRow,
  type GroupLite,
} from './schedule'

const groups: GroupLite[] = [
  { id: 'g1', name: '1조', is_joker: true, sort_order: 1 },
  { id: 'g2', name: '2조', is_joker: false, sort_order: 2 },
  { id: 'g3', name: '3조', is_joker: false, sort_order: 3 },
]

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    label: null,
    status: 'scheduled',
    source: 'live',
    score_a: 0,
    score_b: 0,
    winner_side: null,
    started_at: null,
    finished_at: null,
    edited_at: null,
    created_at: null,
    group_a_id: 'g1',
    group_a_name: '1조',
    group_a_joker: true,
    target_a: 11,
    group_b_id: 'g2',
    group_b_name: '2조',
    group_b_joker: false,
    target_b: 21,
    players_a: null,
    players_b: null,
    referees: null,
    ...over,
  }
}

describe('pairKey', () => {
  it('조의 순서가 바뀌어도 같은 키를 만든다', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'))
  })
})

describe('buildMatchupIndex', () => {
  it('같은 조합의 경기를 한 칸에 모은다', () => {
    const index = buildMatchupIndex([
      match({ id: 'm1' }),
      match({ id: 'm2', group_a_id: 'g2', group_b_id: 'g1' }),
    ])
    expect(index.byPair.get(pairKey('g1', 'g2'))).toHaveLength(2)
  })

  it('무효 경기는 판에서 뺀다', () => {
    // 무효 경기가 남아 있으면 "이미 붙은 조합" 으로 잘못 세어
    // 남은 대진에서 사라진다 — 그러면 그 조합은 영영 안 잡힌다
    const index = buildMatchupIndex([match({ status: 'void' })])
    expect(index.byPair.size).toBe(0)
    expect(remainingPairings(groups, index)).toHaveLength(3)
  })
})

describe('remainingPairings', () => {
  it('아직 안 붙은 조합만 조 순서대로 돌려준다', () => {
    const index = buildMatchupIndex([match({ group_a_id: 'g1', group_b_id: 'g2' })])
    const rest = remainingPairings(groups, index)
    expect(rest.map((p) => `${p.a.name}-${p.b.name}`)).toEqual(['1조-3조', '2조-3조'])
  })

  it('전부 붙었으면 빈 배열', () => {
    const index = buildMatchupIndex([
      match({ group_a_id: 'g1', group_b_id: 'g2' }),
      match({ group_a_id: 'g1', group_b_id: 'g3' }),
      match({ group_a_id: 'g2', group_b_id: 'g3' }),
    ])
    expect(remainingPairings(groups, index)).toEqual([])
  })
})

describe('cellState', () => {
  it('자기 자신은 self', () => {
    expect(cellState(buildMatchupIndex([]), 'g1', 'g1')).toEqual({ kind: 'self' })
  })

  it('경기가 없으면 empty', () => {
    expect(cellState(buildMatchupIndex([]), 'g1', 'g2')).toEqual({ kind: 'empty' })
  })

  it('진행 중인 경기를 끝난 경기보다 먼저 보여준다', () => {
    // 지금 벌어지는 일이 지난 결과보다 급하다
    const index = buildMatchupIndex([
      match({ id: 'old', status: 'finished', winner_side: 'A' }),
      match({ id: 'now', status: 'live' }),
    ])
    const cell = cellState(index, 'g1', 'g2')
    expect(cell.kind).toBe('live')
    expect(cell.kind === 'live' && cell.match.id).toBe('now')
  })

  it('행 조가 이겼는지 A/B 가 아니라 행 기준으로 판단한다', () => {
    // A 팀이 g1 이고 A 가 이겼다 → g1 행에서는 이김, g2 행에서는 짐
    const index = buildMatchupIndex([
      match({ status: 'finished', winner_side: 'A', group_a_id: 'g1', group_b_id: 'g2' }),
    ])
    const fromG1 = cellState(index, 'g1', 'g2')
    const fromG2 = cellState(index, 'g2', 'g1')
    expect(fromG1.kind === 'done' && fromG1.aWon).toBe(true)
    expect(fromG2.kind === 'done' && fromG2.aWon).toBe(false)
  })

  it('여러 번 붙었으면 나머지 개수를 알려준다', () => {
    const index = buildMatchupIndex([
      match({ id: 'm1', status: 'finished', winner_side: 'A' }),
      match({ id: 'm2', status: 'finished', winner_side: 'B' }),
    ])
    const cell = cellState(index, 'g1', 'g2')
    expect(cell.kind === 'done' && cell.extra).toBe(1)
  })
})

describe('scoreForRow', () => {
  it('행 조의 점수를 앞에 놓는다', () => {
    const m = match({ score_a: 21, score_b: 15, group_a_id: 'g1', group_b_id: 'g2' })
    expect(scoreForRow(m, 'g1')).toEqual({ mine: 21, theirs: 15 })
    expect(scoreForRow(m, 'g2')).toEqual({ mine: 15, theirs: 21 })
  })
})

describe('scheduleProgress', () => {
  it('전체 조합 수와 진행 상황을 센다', () => {
    const index = buildMatchupIndex([
      match({ group_a_id: 'g1', group_b_id: 'g2', status: 'finished' }),
      match({ group_a_id: 'g1', group_b_id: 'g3', status: 'live' }),
    ])
    expect(scheduleProgress(groups, index)).toEqual({
      totalPairings: 3,
      playedPairings: 2,
      liveMatches: 1,
      finishedMatches: 1,
    })
  })
})
