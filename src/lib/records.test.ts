import { describe, expect, it } from 'vitest'
import { matchHasPlayer, orderRecords, recordTime } from './records'
import type { MatchOverviewRow } from '@/types/database'

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    status: 'finished',
    finished_at: '2026-08-24T10:00:00Z',
    created_at: '2026-08-24T09:00:00Z',
    players_a: ['가나다'],
    players_b: ['라마바'],
    referees: ['사아자'],
    ...over,
  } as MatchOverviewRow
}

describe('recordTime', () => {
  it('끝난 시각을 쓴다', () => {
    expect(recordTime(match({ finished_at: '2026-08-24T10:00:00Z' }))).toBe(
      Date.parse('2026-08-24T10:00:00Z'),
    )
  })

  it('끝난 시각이 없으면 만든 시각으로 대신한다', () => {
    expect(recordTime(match({ finished_at: null }))).toBe(Date.parse('2026-08-24T09:00:00Z'))
  })

  it('둘 다 없으면 맨 아래로 간다', () => {
    expect(recordTime(match({ finished_at: null, created_at: null }))).toBe(0)
  })
})

describe('orderRecords', () => {
  it('최근에 끝난 경기가 위로 온다', () => {
    const ordered = orderRecords([
      match({ id: '아침', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: '저녁', finished_at: '2026-08-24T20:00:00Z' }),
      match({ id: '점심', finished_at: '2026-08-24T12:00:00Z' }),
    ])
    expect(ordered.map((m) => m.id)).toEqual(['저녁', '점심', '아침'])
  })

  it('무효는 아무리 최근이어도 맨 아래다', () => {
    const ordered = orderRecords([
      match({ id: '옛날', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: '방금무효', status: 'void', finished_at: '2026-08-24T23:00:00Z' }),
    ])
    expect(ordered.map((m) => m.id)).toEqual(['옛날', '방금무효'])
  })

  it('무효끼리도 최근이 위다', () => {
    const ordered = orderRecords([
      match({ id: '무효1', status: 'void', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: '무효2', status: 'void', finished_at: '2026-08-24T20:00:00Z' }),
    ])
    expect(ordered.map((m) => m.id)).toEqual(['무효2', '무효1'])
  })

  it('원본 배열을 건드리지 않는다', () => {
    const input = [
      match({ id: 'a', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: 'b', finished_at: '2026-08-24T20:00:00Z' }),
    ]
    orderRecords(input)
    expect(input.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('matchHasPlayer — 심판은 찾지 않는다', () => {
  it('뛴 사람 이름으로 찾는다', () => {
    expect(matchHasPlayer(match({}), '가나다')).toBe(true)
    expect(matchHasPlayer(match({}), '라마바')).toBe(true)
  })

  it('심판 이름으로는 안 걸린다', () => {
    expect(matchHasPlayer(match({}), '사아자')).toBe(false)
  })

  it('일부만 써도 걸린다', () => {
    expect(matchHasPlayer(match({}), '나다')).toBe(true)
  })

  it('빈 검색어는 전부 통과시킨다', () => {
    expect(matchHasPlayer(match({}), '   ')).toBe(true)
  })

  it('선수가 없는 경기는 안 걸린다', () => {
    expect(matchHasPlayer(match({ players_a: null, players_b: null }), '가나다')).toBe(false)
  })
})
