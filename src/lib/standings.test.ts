import { describe, expect, test } from 'vitest'
import { formatPoints, sortStandings } from './standings'
import type { StandingRow } from '@/types/database'

function row(
  over: Partial<StandingRow> & Pick<StandingRow, 'group_id' | 'sort_order'>,
): StandingRow {
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

describe('순위 정렬 — 승점 → 조커 → 득실차 → 총득점 → 조 번호', () => {
  test('승점이 높은 조가 앞선다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 1.5 }),
      row({ group_id: 'g2', sort_order: 2, points: 3 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('조커조가 4승이어도 승점 2.0이면 3승(3.0)인 일반조에 밀린다', () => {
    // 조커 우선은 '승점이 같을 때' 만이다. 승점 자체를 뒤집지 않는다.
    const rows = [
      row({ group_id: 'joker', sort_order: 1, is_joker: true, wins: 4, points: 2.0 }),
      row({ group_id: 'normal', sort_order: 3, wins: 3, points: 3.0 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['normal', 'joker'])
  })

  test('승점이 같으면 조커조가 앞선다 — 득실이 나빠도', () => {
    /*
     * 이게 이 정렬의 핵심이다.
     * 조커조는 이겨도 0.5 점이라 같은 승점을 쌓으려면 두 배를 이겨야 한다.
     * 그렇게 따라붙은 조를 득실 몇 점 차이로 아래에 두면
     * 조커 규칙이 이득이 아니라 벌칙이 된다.
     */
    const rows = [
      row({ group_id: 'normal', sort_order: 1, points: 3, diff: 30 }),
      row({ group_id: 'joker', sort_order: 2, is_joker: true, points: 3, diff: 5 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['joker', 'normal'])
  })

  test('조커끼리는 득실차로 가린다', () => {
    const rows = [
      row({ group_id: 'j1', sort_order: 1, is_joker: true, points: 2, diff: 3 }),
      row({ group_id: 'j2', sort_order: 2, is_joker: true, points: 2, diff: 9 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['j2', 'j1'])
  })

  test('일반조끼리도 득실차로 가린다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: -2 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 4 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('득실차까지 같으면 총득점이 많은 조가 앞선다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 2, diff: 0, scored: 40 }),
      row({ group_id: 'g2', sort_order: 2, points: 2, diff: 0, scored: 63 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g2', 'g1'])
  })

  test('전부 같으면 조 번호 순 — 순서가 매번 달라지면 안 된다', () => {
    const rows = [
      row({ group_id: 'g3', sort_order: 3 }),
      row({ group_id: 'g1', sort_order: 1 }),
      row({ group_id: 'g2', sort_order: 2 }),
    ]
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g1', 'g2', 'g3'])
  })

  test('원본 배열을 건드리지 않는다', () => {
    const rows = [
      row({ group_id: 'g1', sort_order: 1, points: 0 }),
      row({ group_id: 'g2', sort_order: 2, points: 5 }),
    ]
    const before = rows.map((r) => r.group_id)
    sortStandings(rows)
    expect(rows.map((r) => r.group_id)).toEqual(before)
  })

  test('아직 아무도 안 치른 대회도 순서가 정해진다', () => {
    const rows = [
      row({ group_id: 'g2', sort_order: 2, is_joker: false }),
      row({ group_id: 'g1', sort_order: 1, is_joker: true }),
    ]
    // 승점이 0 으로 같으니 조커가 위
    expect(sortStandings(rows).map((r) => r.group_id)).toEqual(['g1', 'g2'])
  })
})

describe('승점 표기', () => {
  test('정수는 소수점 없이', () => {
    expect(formatPoints(2)).toBe('2')
    expect(formatPoints(0)).toBe('0')
  })

  test('조커 승점은 0.5 단위로 보인다', () => {
    expect(formatPoints(2.5)).toBe('2.5')
    expect(formatPoints(0.5)).toBe('0.5')
  })
})
