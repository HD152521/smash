import { describe, expect, test } from 'vitest'
import {
  dequeue,
  enqueue,
  loadQueue,
  markAttempted,
  MAX_QUEUE,
  retryDelayMs,
  saveQueue,
  type PendingScore,
  type QueueStorage,
} from './queue'

function memoryStorage(initial: Record<string, string> = {}): QueueStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

function score(over: Partial<PendingScore> = {}): PendingScore {
  return {
    clientEventId: 'evt-1',
    matchId: 'm1',
    side: 'A',
    delta: 1,
    queuedAt: 1000,
    attempts: 0,
    ...over,
  }
}

describe('큐 넣고 빼기', () => {
  test('같은 멱등키를 두 번 넣어도 하나만 남는다', () => {
    const q = enqueue(enqueue([], score()), score())
    expect(q).toHaveLength(1)
  })

  test('다른 멱등키는 순서대로 쌓인다', () => {
    const q = enqueue(enqueue([], score({ clientEventId: 'a' })), score({ clientEventId: 'b' }))
    expect(q.map((x) => x.clientEventId)).toEqual(['a', 'b'])
  })

  test('전송에 성공하면 그 항목만 빠진다', () => {
    const q = [score({ clientEventId: 'a' }), score({ clientEventId: 'b' })]
    expect(dequeue(q, 'a').map((x) => x.clientEventId)).toEqual(['b'])
  })

  test('없는 키를 빼도 큐가 망가지지 않는다', () => {
    const q = [score({ clientEventId: 'a' })]
    expect(dequeue(q, 'nope')).toHaveLength(1)
  })

  test('재시도 횟수는 해당 항목만 올라간다', () => {
    const q = [score({ clientEventId: 'a' }), score({ clientEventId: 'b' })]
    const next = markAttempted(q, 'a')
    expect(next[0]!.attempts).toBe(1)
    expect(next[1]!.attempts).toBe(0)
  })

  test('큐가 무한정 커지지 않는다', () => {
    let q: PendingScore[] = []
    for (let i = 0; i < MAX_QUEUE + 50; i++) {
      q = enqueue(q, score({ clientEventId: `e${i}` }))
    }
    expect(q).toHaveLength(MAX_QUEUE)
    // 오래된 것부터 버린다 — 최근 점수가 더 중요하다
    expect(q[q.length - 1]!.clientEventId).toBe(`e${MAX_QUEUE + 49}`)
  })

  test('원본 배열을 변형하지 않는다', () => {
    const q = [score({ clientEventId: 'a' })]
    enqueue(q, score({ clientEventId: 'b' }))
    dequeue(q, 'a')
    markAttempted(q, 'a')
    expect(q).toHaveLength(1)
    expect(q[0]!.attempts).toBe(0)
  })
})

describe('저장과 복원', () => {
  test('저장한 큐를 그대로 읽어온다', () => {
    const s = memoryStorage()
    const q = [score({ clientEventId: 'a' }), score({ clientEventId: 'b' })]
    saveQueue('m1', q, s)
    expect(loadQueue('m1', s)).toEqual(q)
  })

  test('경기마다 큐가 분리된다', () => {
    const s = memoryStorage()
    saveQueue('m1', [score({ matchId: 'm1' })], s)
    saveQueue('m2', [score({ matchId: 'm2', clientEventId: 'x' })], s)
    expect(loadQueue('m1', s)).toHaveLength(1)
    expect(loadQueue('m2', s)[0]!.clientEventId).toBe('x')
  })

  test('큐가 비면 저장소에서 지운다', () => {
    const s = memoryStorage()
    saveQueue('m1', [score()], s)
    saveQueue('m1', [], s)
    expect(loadQueue('m1', s)).toEqual([])
    expect(Object.keys(s.data)).toHaveLength(0)
  })

  test('저장 내용이 깨져 있어도 화면이 죽지 않는다', () => {
    // 여기서 예외가 나면 심판 화면이 통째로 안 뜬다
    expect(loadQueue('m1', memoryStorage({ 'smash:pending:m1': '{{{깨진 JSON' }))).toEqual([])
    expect(loadQueue('m1', memoryStorage({ 'smash:pending:m1': '"문자열"' }))).toEqual([])
    expect(loadQueue('m1', memoryStorage({ 'smash:pending:m1': 'null' }))).toEqual([])
  })

  test('형식이 안 맞는 항목은 버리고 나머지는 살린다', () => {
    const good = score({ clientEventId: 'good' })
    const raw = JSON.stringify([good, { clientEventId: 'bad' }, null, 42, { side: 'C' }])
    expect(loadQueue('m1', memoryStorage({ 'smash:pending:m1': raw }))).toEqual([good])
  })

  test('저장이 실패해도(용량 초과 등) 예외가 새어나가지 않는다', () => {
    const failing: QueueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(() => saveQueue('m1', [score()], failing)).not.toThrow()
  })
})

describe('재시도 간격', () => {
  test('처음에는 빠르게 다시 시도한다', () => {
    expect(retryDelayMs(0)).toBe(1000)
    expect(retryDelayMs(1)).toBe(2000)
  })

  test('연결이 죽어 있어도 30초를 넘기지 않는다', () => {
    // 경기 중이라 너무 길어지면 점수가 늦게 반영된다
    expect(retryDelayMs(10)).toBe(30_000)
    expect(retryDelayMs(100)).toBe(30_000)
  })
})
