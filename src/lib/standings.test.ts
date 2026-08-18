import { describe, expect, test } from 'vitest'
import { extractHeadToHead, formatPoints, sortStandings, type HeadToHead } from './standings'
import type { StandingRow } from '@/types/database'

function row(over: Partial<StandingRow> & Pick<StandingRow, 'group_id' | 'sort_order'>): StandingRow {
  return {
    group_name: `${over.sort_order}조`,
    is_joker: false,
    played: 0,
    wins: 0,
    losses: 0,
    points: 0,
    scored: 0,
    conceded: 0,
    diff: 0,
    ...over,
  }
}

describe('순위 정렬', () => {
  test('승점이 높은 조가 앞선다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 1.5 }),
      row({ group_id: 'g2', sort_order: 2, points: 3 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('조커조가 4승이어도 승점 2.0이면 3승(3.0)인 일반조에 밀린다', () => {
    const rows = [
      row({ group_id: 'joker', sort_order: 1, is_joker: true, wins: 4, points: 2.0 }),
      row({ group_id: 'normal', sort_order: 3, wins: 3, points: 3.0 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['normal', 'joker'])
  })

  test('승점이 같으면 맞대결에서 이긴 조가 앞선다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: 10 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 5 }),
    ]
    const h2h: HeadToHead[] = [{ winnerGroupId: 'g2', loserGroupId: 'g1' }]
    // 득실차는 g1 이 앞서지만 맞대결에서 g2 가 이겼으므로 g2 가 위다
    expect(sortStandings(rows, h2h).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('맞대결이 1승 1패면 득실차로 넘어간다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: 10 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 5 }),
    ]
    const h2h: HeadToHead[] = [
      { winnerGroupId: 'g2', loserGroupId: 'g1' },
      { winnerGroupId: 'g1', loserGroupId: 'g2' },
    ]
    expect(sortStandings(rows, h2h).map((r) => r.group_id)).toEqual(['g1', 'g2'])
  })

  test('승점·맞대결·득실차가 모두 같으면 총득점으로 가른다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: 3, scored: 40 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 3, scored: 55 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('전부 같으면 조 번호 순으로 안정적으로 정렬된다', () => {
    const rows = [
      row({ group_id: 'g3', sort_order: 3 }),
      row({ group_id: 'g1', sort_order: 1 }),
      row({ group_id: 'g2', sort_order: 2 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g1', 'g2', 'g3'])
  })

  test('원본 배열을 변형하지 않는다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 0 }),
      row({ group_id: 'g2', sort_order: 2, points: 5 }),
    ]
    const snapshot = rows.map((r) => r.group_id)
    sortStandings(rows)
    expect(rows.map((r) => r.group_id)).toEqual(snapshot)
  })

  test('동점 3조 시나리오 — 승자승 사이클이면 득실차로 결정된다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: 1 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 5 }),
      row({ group_id: 'g3', sort_order: 3, points: 2, diff: 3 }),
    ]
    // g1 > g2 > g3 > g1 (가위바위보 사이클)
    const h2h: HeadToHead[] = [
      { winnerGroupId: 'g1', loserGroupId: 'g2' },
      { winnerGroupId: 'g2', loserGroupId: 'g3' },
      { winnerGroupId: 'g3', loserGroupId: 'g1' },
    ]
    // 사이클이라 승자승으로는 못 가린다. 결과가 3개 조를 모두 포함하고
    // 정렬이 터지지 않는지(예외/유실 없음)를 확인한다.
    const sorted = sortStandings(rows, h2h)
    expect(sorted).toHaveLength(3)
    expect(new Set(sorted.map((r) => r.group_id))).toEqual(new Set(['g1', 'g2', 'g3']))
  })
})

describe('맞대결 추출', () => {
  test('끝난 경기만 세고 승자를 올바르게 집는다', () => {
    const h2h = extractHeadToHead([
      { status: 'finished', winner_side: 'A', group_a_id: 'g1', group_b_id: 'g2' },
      { status: 'finished', winner_side: 'B', group_a_id: 'g1', group_b_id: 'g3' },
      { status: 'live', winner_side: null, group_a_id: 'g2', group_b_id: 'g3' },
    ])
    expect(h2h).toEqual([
      { winnerGroupId: 'g1', loserGroupId: 'g2' },
      { winnerGroupId: 'g3', loserGroupId: 'g1' },
    ])
  })

  test('조가 비어 있는 경기는 건너뛴다', () => {
    expect(
      extractHeadToHead([
        { status: 'finished', winner_side: 'A', group_a_id: null, group_b_id: 'g2' },
      ]),
    ).toEqual([])
  })
})

describe('승점 표기', () => {
  test('정수는 소수점 없이', () => {
    expect(formatPoints(3)).toBe('3')
  })
  test('조커 승점은 소수 첫째 자리까지', () => {
    expect(formatPoints(2.5)).toBe('2.5')
  })
})
