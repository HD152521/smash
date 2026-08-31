import { describe, expect, test } from 'vitest'
import { MAX_AUTO_QUEUE_FAILURES, createAutoQueueGuard } from './autoQueueGuard'

/*
 * 이 파일이 지키는 것은 하나다: **두 번째 호출이 막히나.**
 *
 * 자동 예약이 잘못되는 방식은 "안 만들어진다" 가 아니라 "너무 많이
 * 만들어진다" 쪽이다. 안 만들어지면 사람이 손으로 짜면 되지만, 한 코트에
 * 열 경기가 쌓이면 그 마흔 명이 다른 경기에 못 들어간다.
 */

describe('동시에 한 번만', () => {
  test('만드는 중이면 다른 열쇠라도 거절한다', () => {
    const guard = createAutoQueueGuard()

    expect(guard.tryBegin('a')).toBe(true)
    expect(guard.tryBegin('b')).toBe(false)
  })

  test('끝나면 다음 열쇠를 받는다', () => {
    const guard = createAutoQueueGuard()

    guard.tryBegin('a')
    guard.settle(true)

    expect(guard.tryBegin('b')).toBe(true)
  })
})

describe('같은 상태로 두 번 시도하지 않는다', () => {
  test('성공한 뒤에도 같은 열쇠는 다시 안 받는다', () => {
    const guard = createAutoQueueGuard()

    guard.tryBegin('same')
    guard.settle(true)

    expect(guard.tryBegin('same')).toBe(false)
  })

  test('실패한 뒤에도 같은 열쇠는 다시 안 받는다 — 재시도 루프를 막는다', () => {
    const guard = createAutoQueueGuard()

    guard.tryBegin('same')
    guard.settle(false)

    expect(guard.tryBegin('same')).toBe(false)
  })

  test('열쇠가 바뀌면 다시 받는다 — 경기가 끝나면 그 코트를 다시 채워야 한다', () => {
    const guard = createAutoQueueGuard()

    guard.tryBegin('world-1')
    guard.settle(true)

    expect(guard.tryBegin('world-2')).toBe(true)
  })
})

describe('지운 편성은 다시 안 건다 (decline)', () => {
  test('만들지 않고도 그 열쇠를 태워 둔다', () => {
    const guard = createAutoQueueGuard()

    guard.decline('c1|가,나,다,라|0')

    expect(guard.tryBegin('c1|가,나,다,라|0')).toBe(false)
  })

  test('태운 열쇠는 실패 횟수에 안 들어간다 — 지웠다고 자동 예약이 멈추면 안 된다', () => {
    const guard = createAutoQueueGuard(1)

    guard.decline('c1|가,나,다,라|0')

    expect(guard.tryBegin('c2|마,바,사,아|0')).toBe(true)
  })
})

describe('실패하면 멈춘다', () => {
  test(`연속 ${MAX_AUTO_QUEUE_FAILURES}번 실패하면 새 열쇠도 안 받는다`, () => {
    const guard = createAutoQueueGuard()

    for (let i = 0; i < MAX_AUTO_QUEUE_FAILURES; i += 1) {
      expect(guard.tryBegin(`fail-${i}`)).toBe(true)
      guard.settle(false)
    }

    expect(guard.tryBegin('fresh')).toBe(false)
  })

  test('중간에 한 번 성공하면 실패 횟수가 0 으로 돌아간다', () => {
    const guard = createAutoQueueGuard(2)

    guard.tryBegin('a')
    guard.settle(false)
    guard.tryBegin('b')
    guard.settle(true)
    guard.tryBegin('c')
    guard.settle(false)

    // 연속 2번이 아니라 1번씩이므로 아직 포기하지 않는다
    expect(guard.tryBegin('d')).toBe(true)
  })

  test('스위치를 껐다 켜면(reset) 포기 상태가 풀린다', () => {
    const guard = createAutoQueueGuard(1)

    guard.tryBegin('a')
    guard.settle(false)
    expect(guard.tryBegin('b')).toBe(false)

    guard.reset()

    expect(guard.tryBegin('b')).toBe(true)
  })
})
