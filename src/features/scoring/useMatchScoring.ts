import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { newClientEventId } from '@/lib/rules'
import type { MatchOverviewRow, MatchRow, TeamSide } from '@/types/database'
import { fetchMatchOverview, recordScore } from './api'
import {
  enqueue,
  loadQueue,
  markAttempted,
  retryDelayMs,
  saveQueue,
  type PendingScore,
} from './queue'

/** 아직 전송 못 한 점수가 남았는데 종료·취소를 시도했을 때 */
export class PendingScoresError extends Error {
  readonly remaining: number

  constructor(remaining: number) {
    super(`아직 전송되지 않은 점수가 ${remaining}개 있습니다. 연결을 확인해 주세요`)
    this.name = 'PendingScoresError'
    this.remaining = remaining
  }
}

/**
 * 심판 화면의 점수 상태.
 *
 * 세 가지를 동시에 만족해야 한다:
 *  1. 누르는 즉시 숫자가 오른다 (서버 왕복을 기다리면 체육관에서 멈춘 것처럼 보인다)
 *  2. 요청이 실패해도 점수가 사라지지 않는다 (큐에 쌓고 다시 보낸다)
 *  3. 서버가 최종 진실이다
 *
 * ⚠ 설계상 지켜야 하는 것 (전부 실제로 깨졌던 것들이다):
 *
 *  · 대기 큐의 진실은 ref 하나뿐이다. localStorage 는 탭이 죽었을 때를 위한
 *    거울일 뿐이고, state 는 렌더용 사본이다. 셋을 섞어 읽으면
 *    저장이 실패하는 환경(사파리 시크릿 모드 등)에서 큐가 한 개로 쪼그라든다.
 *
 *  · 낙관적 점수를 따로 세지 않는다. pending 에서 파생한다.
 *    별도 카운터를 두면 서버 응답과 실시간 구독이 경쟁할 때 점수가 두 번 더해진다.
 *
 *  · 전송 성공 시 응답으로 캐시를 직접 갱신한다. 큐에서 빼는 시점과
 *    서버 값이 반영되는 시점이 어긋나면 점수가 잠깐 내려갔다 올라간다.
 *
 *  · flush 가 이미 돌고 있으면 그 약속을 돌려준다. 즉시 resolve 하면
 *    종료·취소가 "다 보냈다" 고 착각하고 진행한다.
 */
export function useMatchScoring(matchId: string | undefined) {
  const qc = useQueryClient()

  const match = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => fetchMatchOverview(matchId!),
    enabled: Boolean(matchId),
    // 실시간 구독이 끊겼을 때의 안전망. 끝난 경기는 더 볼 게 없다.
    refetchInterval: (q) => (q.state.data?.status === 'live' ? 5000 : false),
  })

  const storage = typeof window !== 'undefined' ? window.localStorage : null

  // ── 큐: ref 가 진실, state 는 렌더용, localStorage 는 거울 ──────────
  // 초기값은 같은 함수로 한 번씩 읽는다. ref.current 를 렌더 중에 읽으면
  // 린트가 막고, 실제로도 렌더 순서에 따라 어긋날 수 있다.
  const initialQueue = () =>
    matchId && typeof window !== 'undefined' ? loadQueue(matchId, window.localStorage) : []
  const queueRef = useRef<PendingScore[]>(initialQueue())
  const [pending, setPending] = useState<PendingScore[]>(initialQueue)
  const [lastError, setLastError] = useState<string | null>(null)

  const flightRef = useRef<Promise<void> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

  const setQueue = useCallback(
    (next: PendingScore[]) => {
      queueRef.current = next
      if (alive.current) setPending(next)
      if (matchId && storage) saveQueue(matchId, next, storage)
    },
    [matchId, storage],
  )

  /** 전송 성공 응답으로 캐시를 즉시 갱신한다 (큐 제거와 같은 순간에) */
  const applyServerScore = useCallback(
    (m: MatchRow) => {
      qc.setQueryData<MatchOverviewRow>(['match', matchId], (old) =>
        old
          ? {
              ...old,
              score_a: m.score_a,
              score_b: m.score_b,
              status: m.status,
              winner_side: m.winner_side,
              finished_at: m.finished_at,
            }
          : old,
      )
    },
    [qc, matchId],
  )

  const flush = useCallback((): Promise<void> => {
    if (!matchId) return Promise.resolve()
    // 이미 돌고 있으면 그 약속을 돌려준다 — 즉시 resolve 하면 거짓 신호가 된다
    if (flightRef.current) return flightRef.current
    if (queueRef.current.length === 0) return Promise.resolve()

    const run = (async () => {
      // 첫 await 를 강제한다. 큐가 비어 함수 본문이 동기적으로 끝나면
      // finally 가 flightRef 할당보다 먼저 돌아, 이미 완료된 프라미스가
      // flightRef 에 영구히 남는다. 그 뒤로는 모든 flush 가 그걸 돌려주며
      // 아무 일도 하지 않는다 (회귀 테스트로 잡았다).
      await Promise.resolve()
      try {
        // while 로 도는 이유: 전송 중에 새로 들어온 점수까지 이어서 보낸다
        while (queueRef.current.length > 0) {
          const item = queueRef.current[0]!
          try {
            const updated = await recordScore(
              item.matchId,
              item.side,
              item.delta,
              item.clientEventId,
            )
            // 큐에서 빼는 것과 서버 점수 반영을 같은 순간에 한다
            setQueue(queueRef.current.filter((q) => q.clientEventId !== item.clientEventId))
            applyServerScore(updated)
            if (alive.current) setLastError(null)
          } catch (err) {
            setQueue(markAttempted(queueRef.current, item.clientEventId))
            const attempts =
              queueRef.current.find((q) => q.clientEventId === item.clientEventId)?.attempts ?? 1
            if (alive.current) {
              setLastError(err instanceof Error ? err.message : '전송 실패')
              if (retryTimer.current) clearTimeout(retryTimer.current)
              retryTimer.current = setTimeout(() => {
                void flush().catch(() => undefined)
              }, retryDelayMs(attempts))
            }
            // 순서를 지켜야 하므로 여기서 멈춘다. 호출자가 알 수 있게 던진다.
            throw new PendingScoresError(queueRef.current.length)
          }
        }
      } finally {
        flightRef.current = null
      }
    })()

    flightRef.current = run
    return run
  }, [matchId, setQueue, applyServerScore])

  // 탭이 죽었다 살아난 경우, 복원한 큐를 실제로 보낸다.
  // 이게 없으면 "N개 전송 대기" 배지만 뜨고 영영 안 나간다.
  useEffect(() => {
    void flush().catch(() => undefined)
  }, [flush])

  useEffect(() => {
    function onOnline() {
      void flush().catch(() => undefined)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

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
      setQueue(enqueue(queueRef.current, item))
      void flush().catch(() => undefined)
    },
    [matchId, setQueue, flush],
  )

  // 낙관적 점수는 따로 세지 않고 대기 큐에서 파생한다.
  // 서버가 확인하는 순간 큐에서 빠지므로 이중 계산이 원천적으로 불가능하다.
  const optimisticA = pending.reduce((n, p) => (p.side === 'A' ? n + p.delta : n), 0)
  const optimisticB = pending.reduce((n, p) => (p.side === 'B' ? n + p.delta : n), 0)

  const server = match.data
  const displayScore = {
    a: (server?.score_a ?? 0) + optimisticA,
    b: (server?.score_b ?? 0) + optimisticB,
  }

  return {
    match: server,
    isLoading: match.isPending,
    error: match.error,
    displayScore,
    pendingCount: pending.length,
    lastError,
    score,
    flush,
    refetch: () => qc.invalidateQueries({ queryKey: ['match', matchId] }),
  }
}
