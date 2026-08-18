import type { TeamSide } from '@/types/database'

/**
 * 전송 대기 큐.
 *
 * 체육관 와이파이는 끊긴다. 심판이 +1 을 눌렀는데 요청이 실패하면
 * 그 점수는 사라지고, 심판은 화면만 보고 있어서 사라진 줄도 모른다.
 * 그래서 실패한 득점을 저장해 두고 연결이 돌아오면 다시 보낸다.
 *
 * 재전송이 안전한 이유는 서버가 client_event_id 로 멱등 처리하기 때문이다.
 * 같은 이벤트가 열 번 도착해도 점수는 한 번만 오른다.
 *
 * localStorage 를 쓰는 이유: 폰 브라우저가 백그라운드에서 탭을 죽여도
 * 대기 중인 점수가 남아 있어야 한다.
 */

export interface PendingScore {
  clientEventId: string
  matchId: string
  side: TeamSide
  delta: number
  queuedAt: number
  /** 재시도 횟수 — 화면에 "N개 전송 대기" 를 보여주는 데 쓴다 */
  attempts: number
}

const KEY_PREFIX = 'smash:pending:'

/** 큐가 무한정 커지지 않게 한다. 한 경기에 40점 남짓이면 충분하다. */
export const MAX_QUEUE = 200

export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function keyFor(matchId: string) {
  return `${KEY_PREFIX}${matchId}`
}

export function loadQueue(matchId: string, storage: QueueStorage): PendingScore[] {
  try {
    const raw = storage.getItem(keyFor(matchId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 저장 형식이 바뀌었거나 손상된 항목은 조용히 버린다 —
    // 여기서 예외가 나면 심판 화면이 통째로 안 뜬다.
    return parsed.filter(isPendingScore)
  } catch {
    return []
  }
}

function isPendingScore(v: unknown): v is PendingScore {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o['clientEventId'] === 'string' &&
    typeof o['matchId'] === 'string' &&
    (o['side'] === 'A' || o['side'] === 'B') &&
    typeof o['delta'] === 'number' &&
    typeof o['queuedAt'] === 'number' &&
    typeof o['attempts'] === 'number'
  )
}

export function saveQueue(matchId: string, items: PendingScore[], storage: QueueStorage): void {
  try {
    if (items.length === 0) {
      storage.removeItem(keyFor(matchId))
      return
    }
    storage.setItem(keyFor(matchId), JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch {
    // 저장 공간이 없으면 큐를 못 남긴다. 화면은 계속 돌아야 하므로 삼킨다.
  }
}

export function enqueue(queue: readonly PendingScore[], item: PendingScore): PendingScore[] {
  // 같은 멱등키가 이미 있으면 중복으로 넣지 않는다
  if (queue.some((q) => q.clientEventId === item.clientEventId)) return [...queue]
  return [...queue, item].slice(-MAX_QUEUE)
}

export function dequeue(queue: readonly PendingScore[], clientEventId: string): PendingScore[] {
  return queue.filter((q) => q.clientEventId !== clientEventId)
}

export function markAttempted(
  queue: readonly PendingScore[],
  clientEventId: string,
): PendingScore[] {
  return queue.map((q) =>
    q.clientEventId === clientEventId ? { ...q, attempts: q.attempts + 1 } : q,
  )
}

/**
 * 재시도 간격. 연결이 완전히 죽었을 때 매초 때리지 않도록 점점 늘린다.
 * 다만 경기 중이라 너무 길어지면 안 되므로 30초에서 멈춘다.
 */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5))
}
