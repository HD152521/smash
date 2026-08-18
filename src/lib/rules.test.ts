import { describe, expect, test } from 'vitest'
import {
  decideWinner,
  isMatchPoint,
  newClientEventId,
  pointsToWin,
  projectScore,
  targetScoreFor,
  winPointsFor,
  type ScoreEvent,
} from './rules'
import type { TournamentConfig } from '@/types/database'

const config: TournamentConfig = {
  format: 'doubles',
  normalPoints: 21,
  jokerPoints: 11,
  deuce: false,
  winPoints: 1,
  jokerWinPoints: 0.5,
  lossPoints: 0,
  jokerGroupCount: 2,
}

describe('목표 점수와 승점', () => {
  test('일반조는 21점을 목표로 하고 이기면 승점 1점을 받는다', () => {
    expect(targetScoreFor(false, config)).toBe(21)
    expect(winPointsFor(false, config)).toBe(1)
  })

  test('조커조는 11점을 목표로 하고 이기면 승점 0.5점을 받는다', () => {
    expect(targetScoreFor(true, config)).toBe(11)
    expect(winPointsFor(true, config)).toBe(0.5)
  })
})

describe('원장에서 점수 투영', () => {
  test('무효 처리된 이벤트는 점수에 반영되지 않는다', () => {
    const events: ScoreEvent[] = [
      { side: 'A', delta: 1 },
      { side: 'A', delta: 1 },
      { side: 'B', delta: 1 },
      { side: 'A', delta: 1, voided: true },
    ]
    expect(projectScore(events)).toEqual({ a: 2, b: 1 })
  })

  test('이벤트가 없으면 0대 0이다', () => {
    expect(projectScore([])).toEqual({ a: 0, b: 0 })
  })

  test('-1 이벤트는 점수를 되돌린다', () => {
    const events: ScoreEvent[] = [
      { side: 'A', delta: 1 },
      { side: 'A', delta: -1 },
    ]
    expect(projectScore(events)).toEqual({ a: 0, b: 0 })
  })
})

describe('승자 판정 — 팀마다 목표 점수가 다르다', () => {
  test('조커조(11점)는 10점에서는 아직 안 끝난다', () => {
    expect(decideWinner({ a: 10, b: 5 }, 11, 21)).toBeNull()
  })

  test('조커조가 11점에 닿으면 즉시 이긴다', () => {
    expect(decideWinner({ a: 11, b: 5 }, 11, 21)).toBe('A')
  })

  test('일반조는 11점을 내도 끝나지 않는다', () => {
    expect(decideWinner({ a: 5, b: 11 }, 11, 21)).toBeNull()
  })

  test('일반조는 21점에 닿아야 이긴다', () => {
    expect(decideWinner({ a: 5, b: 21 }, 11, 21)).toBe('B')
  })

  test('듀스가 없으므로 20대 20에서 21점을 낸 쪽이 바로 이긴다', () => {
    expect(decideWinner({ a: 20, b: 20 }, 21, 21)).toBeNull()
    expect(decideWinner({ a: 21, b: 20 }, 21, 21)).toBe('A')
  })

  test('조커조끼리 붙으면 양쪽 다 11점이 목표다', () => {
    expect(decideWinner({ a: 10, b: 10 }, 11, 11)).toBeNull()
    expect(decideWinner({ a: 10, b: 11 }, 11, 11)).toBe('B')
  })
})

describe('남은 점수와 매치포인트', () => {
  test('조커조는 8점일 때 3점 남았다', () => {
    expect(pointsToWin({ a: 8, b: 0 }, 'A', 11)).toBe(3)
  })

  test('목표를 넘어서면 0으로 고정된다', () => {
    expect(pointsToWin({ a: 12, b: 0 }, 'A', 11)).toBe(0)
  })

  test('조커조 10점은 매치포인트다', () => {
    expect(isMatchPoint({ a: 10, b: 3 }, 11, 21)).toBe(true)
  })

  test('일반조 10점은 매치포인트가 아니다', () => {
    expect(isMatchPoint({ a: 3, b: 10 }, 11, 21)).toBe(false)
  })

  test('이미 끝난 경기는 매치포인트가 아니다', () => {
    expect(isMatchPoint({ a: 11, b: 3 }, 11, 21)).toBe(false)
  })
})

describe('멱등키', () => {
  test('호출할 때마다 다른 값이 나온다', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientEventId()))
    expect(ids.size).toBe(500)
  })

  test('DB 제약(8~64자)을 만족한다', () => {
    const id = newClientEventId()
    expect(id.length).toBeGreaterThanOrEqual(8)
    expect(id.length).toBeLessThanOrEqual(64)
  })
})
