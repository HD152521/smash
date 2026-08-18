import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { newClientEventId } from '@/lib/rules'
import type { MatchOverviewRow, TeamSide } from '@/types/database'
import { fetchMatchOverview, recordScore } from './api'
import {
  dequeue,
  enqueue,
  loadQueue,
  markAttempted,
  retryDelayMs,
  saveQueue,
  type PendingScore,
} from './queue'

/**
 * 심판 화면의 점수 상태.
 *
 * 세 가지를 동시에 만족해야 한다:
 *  1. 누르는 즉시 숫자가 오른다 (서버 왕복을 기다리면 체육관에서 멈춘 것처럼 보인다)
 *  2. 요청이 실패해도 점수가 사라지지 않는다 (큐에 쌓고 다시 보낸다)
 *  3. 서버가 최종 진실이다 (응답이 오면 낙관적 값을 덮어쓴다)
 */
export function useMatchScoring(matchId: string | undefined) {
  const qc = useQueryClient()
  const queryKey = ['match', matchId] as const

  const match = useQuery({
    queryKey,
    queryFn: () => fetchMatchOverview(matchId!),
    enabled: Boolean(matchId),
    // 실시간 구독이 붙기 전까지의 안전망. 구독이 살아 있으면 거의 안 쓰인다.
    refetchInterval: 5000,
  })

  // 탭이 죽었다 살아나도 대기 중인 점수를 복원한다.
  // 이펙트가 아니라 lazy 초기값으로 읽는다 — 첫 렌더에 이미 알 수 있는 값이고,
  // 이펙트에서 setState 하면 빈 큐가 한 번 깜빡인다.
  const [pending, setPending] = useState<PendingScore[]>(() =>
    matchId && typeof window !== 'undefined' ? loadQueue(matchId, window.localStorage) : [],
  )
  /** 아직 서버에 반영되지 않은 낙관적 점수 (A, B) */
  const [optimistic, setOptimistic] = useState<{ a: number; b: number }>({ a: 0, b: 0 })
  const [lastError, setLastError] = useState<string | null>(null)

  const storage = typeof window !== 'undefined' ? window.localStorage : null
  const flushing = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback(
    (next: PendingScore[]) => {
      setPending(next)
      if (matchId && storage) saveQueue(matchId, next, storage)
    },
    [matchId, storage],
  )

  /** 큐를 앞에서부터 순서대로 보낸다. 순서가 뒤바뀌면 점수 흐름이 어긋난다. */
  const flush = useCallback(async () => {
    if (!matchId || flushing.current) return
    const queue = matchId && storage ? loadQueue(matchId, storage) : []
    if (queue.length === 0) return

    flushing.current = true
    try {
      let current = queue
      for (const item of queue) {
        try {
          await recordScore(item.matchId, item.side, item.delta, item.clientEventId)
          current = dequeue(current, item.clientEventId)
          persist(current)
          setLastError(null)
        } catch (err) {
          current = markAttempted(current, item.clientEventId)
          persist(current)
          setLastError(err instanceof Error ? err.message : '전송 실패')
          // 하나가 막히면 뒤의 것도 못 보낸다 — 순서를 지키기 위해 여기서 멈춘다
          const attempts = current.find((q) => q.clientEventId === item.clientEventId)?.attempts ?? 1
          if (retryTimer.current) clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => void flush(), retryDelayMs(attempts))
          break
        }
      }
      if (current.length === 0) {
        setOptimistic({ a: 0, b: 0 })
        await qc.invalidateQueries({ queryKey })
      }
    } finally {
      flushing.current = false
    }
    // queryKey 는 matchId 로부터 파생되므로 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, storage, persist, qc])

  // 연결이 돌아오면 즉시 밀어낸다
  useEffect(() => {
    function onOnline() {
      void flush()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

  const score = useCallback(
    (side: TeamSide, delta = 1) => {
      if (!matchId) return
      const item: PendingScore = {
        clientEventId: newClientEventId(),
        matchId,
        side,
        delta,
        queuedAt: Date.now(),
        attempts: 0,
      }
      // 1. 화면부터 움직인다
      setOptimistic((o) => (side === 'A' ? { ...o, a: o.a + delta } : { ...o, b: o.b + delta }))
      // 2. 큐에 넣고
      const next = enqueue(matchId && storage ? loadQueue(matchId, storage) : pending, item)
      persist(next)
      // 3. 보낸다
      void flush()
    },
    [matchId, storage, pending, persist, flush],
  )

  const server = match.data
  const displayScore = {
    a: (server?.score_a ?? 0) + optimistic.a,
    b: (server?.score_b ?? 0) + optimistic.b,
  }

  return {
    match: server as MatchOverviewRow | undefined,
    isLoading: match.isPending,
    error: match.error,
    displayScore,
    pendingCount: pending.length,
    lastError,
    score,
    flush,
    /** 서버 응답으로 되돌린다 (Undo·종료 후) */
    resetOptimistic: () => setOptimistic({ a: 0, b: 0 }),
    refetch: () => qc.invalidateQueries({ queryKey }),
  }
}
