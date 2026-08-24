import { describe, expect, test } from 'vitest'
import {
  courtChangeScore,
  decideWinner,
  isMatchPoint,
  newClientEventId,
  pointsToWin,
  projectScore,
  sideRuleFrom,
  targetScoreFor,
  winPointsFor,
  type ScoreEvent,
  type SideRule,
} from './rules'
import type { TournamentConfig } from '@/types/database'

const config: TournamentConfig = {
  format: 'doubles',
  normalPoints: 21,
  jokerPoints: 11,
  deuce: false,
  deuceCap: null,
  jokerDeuceCap: null,
  winPoints: 1,
  jokerWinPoints: 0.5,
  lossPoints: 0,
  jokerGroupCount: 2,
  courtChange: false,
  courtChangeAt: null,
  readyQueuePosition: 2,
}

/** 듀스 없는 팀 규칙 — 지금까지의 기본값 */
const plain = (target: number): SideRule => ({ target, deuce: false, max: null })
/** 듀스 켠 팀 규칙 */
const deuce = (target: number, max: number | null = null): SideRule => ({
  target,
  deuce: true,
  max,
})

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

describe('뷰 컬럼에서 규칙 만들기', () => {
  test('목표 점수가 비어 있으면 21점으로 본다', () => {
    expect(sideRuleFrom(null, null, null)).toEqual({ target: 21, deuce: false, max: null })
  })

  test('스냅샷 값을 그대로 싣는다', () => {
    expect(sideRuleFrom(11, true, 15)).toEqual({ target: 11, deuce: true, max: 15 })
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
    expect(decideWinner({ a: 10, b: 5 }, plain(11), plain(21))).toBeNull()
  })

  test('조커조가 11점에 닿으면 즉시 이긴다', () => {
    expect(decideWinner({ a: 11, b: 5 }, plain(11), plain(21))).toBe('A')
  })

  test('일반조는 11점을 내도 끝나지 않는다', () => {
    expect(decideWinner({ a: 5, b: 11 }, plain(11), plain(21))).toBeNull()
  })

  test('일반조는 21점에 닿아야 이긴다', () => {
    expect(decideWinner({ a: 5, b: 21 }, plain(11), plain(21))).toBe('B')
  })

  test('듀스를 끄면 20대 20에서 21점을 낸 쪽이 바로 이긴다', () => {
    expect(decideWinner({ a: 20, b: 20 }, plain(21), plain(21))).toBeNull()
    expect(decideWinner({ a: 21, b: 20 }, plain(21), plain(21))).toBe('A')
  })

  test('조커조끼리 붙으면 양쪽 다 11점이 목표다', () => {
    expect(decideWinner({ a: 10, b: 10 }, plain(11), plain(11))).toBeNull()
    expect(decideWinner({ a: 10, b: 11 }, plain(11), plain(11))).toBe('B')
  })
})

describe('듀스 — 2점 차가 나야 끝난다', () => {
  const rule = deuce(21, 30)

  test('두 점 차로 목표에 닿으면 이긴다', () => {
    expect(decideWinner({ a: 21, b: 19 }, rule, rule)).toBe('A')
  })

  test('한 점 차로 목표에 닿아도 안 끝난다', () => {
    expect(decideWinner({ a: 21, b: 20 }, rule, rule)).toBeNull()
  })

  test('목표를 넘겨도 두 점 차가 나야 끝난다', () => {
    expect(decideWinner({ a: 25, b: 24 }, rule, rule)).toBeNull()
    expect(decideWinner({ a: 26, b: 24 }, rule, rule)).toBe('A')
  })

  test('상한에 닿으면 한 점 차라도 끝난다', () => {
    expect(decideWinner({ a: 30, b: 29 }, rule, rule)).toBe('A')
  })

  test('상한이 없으면 두 점 차가 날 때까지 이어진다', () => {
    const endless = deuce(21, null)
    expect(decideWinner({ a: 40, b: 39 }, endless, endless)).toBeNull()
    expect(decideWinner({ a: 41, b: 39 }, endless, endless)).toBe('A')
  })

  test('한쪽만 듀스일 수는 없지만, 목표가 다르면 판정도 비대칭이다', () => {
    // 조커조 11점 vs 일반조 21점, 둘 다 듀스
    const joker = deuce(11, 15)
    const normal = deuce(21, 30)
    expect(decideWinner({ a: 11, b: 9 }, joker, normal)).toBe('A')
    expect(decideWinner({ a: 11, b: 10 }, joker, normal)).toBeNull()
  })
})

describe('남은 점수와 매치포인트', () => {
  test('조커조는 8점일 때 3점 남았다', () => {
    expect(pointsToWin({ a: 8, b: 0 }, 'A', plain(11))).toBe(3)
  })

  test('목표를 넘어서면 0으로 고정된다', () => {
    expect(pointsToWin({ a: 12, b: 0 }, 'A', plain(11))).toBe(0)
  })

  test('듀스에서는 상대 점수가 남은 점수를 늘린다', () => {
    // 20:20 → 22점을 내야 두 점 차가 난다
    expect(pointsToWin({ a: 20, b: 20 }, 'A', deuce(21, 30))).toBe(2)
  })

  test('듀스라도 상한을 넘겨 요구하지 않는다', () => {
    // 29:29 → 30점이 상한이므로 한 점이면 끝난다
    expect(pointsToWin({ a: 29, b: 29 }, 'A', deuce(21, 30))).toBe(1)
  })

  test('조커조 10점은 매치포인트다', () => {
    expect(isMatchPoint({ a: 10, b: 3 }, plain(11), plain(21))).toBe(true)
  })

  test('일반조 10점은 매치포인트가 아니다', () => {
    expect(isMatchPoint({ a: 3, b: 10 }, plain(11), plain(21))).toBe(false)
  })

  test('이미 끝난 경기는 매치포인트가 아니다', () => {
    expect(isMatchPoint({ a: 11, b: 3 }, plain(11), plain(21))).toBe(false)
  })

  test('듀스 20대 20은 매치포인트가 아니다', () => {
    const rule = deuce(21, 30)
    expect(isMatchPoint({ a: 20, b: 20 }, rule, rule)).toBe(false)
    expect(isMatchPoint({ a: 21, b: 20 }, rule, rule)).toBe(true)
  })
})

describe('코트 체인지 점수', () => {
  test('끄면 없다', () => {
    expect(courtChangeScore(plain(21), config)).toBeNull()
  })

  test('정하지 않으면 목표의 절반(올림)이다', () => {
    const on = { ...config, courtChange: true }
    expect(courtChangeScore(plain(21), on)).toBe(11)
    expect(courtChangeScore(plain(11), on)).toBe(6)
  })

  test('정해 두면 목표와 무관하게 그 점수다', () => {
    const on = { ...config, courtChange: true, courtChangeAt: 8 }
    expect(courtChangeScore(plain(21), on)).toBe(8)
    expect(courtChangeScore(plain(11), on)).toBe(8)
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
