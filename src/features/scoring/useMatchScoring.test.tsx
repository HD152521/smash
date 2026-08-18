import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useMatchScoring } from './useMatchScoring'
import type { MatchOverviewRow, MatchRow, TeamSide } from '@/types/database'

/**
 * 심판 화면 상태 기계의 회귀 테스트.
 *
 * 여기 있는 시나리오는 전부 실제로 깨졌던 것들이다:
 *  · 빠른 연타 시 두 번째 점수가 조용히 사라짐
 *  · 서버 응답과 실시간 갱신이 경쟁하면 점수가 한 점 더 보임
 *  · flush() 가 이미 돌고 있으면 즉시 resolve 해서 "다 보냈다" 고 거짓말
 *  · 실패했는데 flush() 가 성공처럼 끝나서 미전송 점수를 둔 채 경기 종료
 *  · 탭이 죽었다 살아나면 복원한 큐를 영영 안 보냄
 *
 * 전부 조용한 실패라 화면만 봐서는 알 수 없다.
 */

const MATCH_ID = 'match-1'

let serverScoreA = 0
let serverScoreB = 0
const recordScoreMock = vi.fn()

vi.mock('./api', () => ({
  fetchMatchOverview: () =>
    Promise.resolve({
      id: MATCH_ID,
      status: 'live',
      score_a: serverScoreA,
      score_b: serverScoreB,
      target_a: 21,
      target_b: 21,
      winner_side: null,
      finished_at: null,
    } as unknown as MatchOverviewRow),
  recordScore: (...args: [string, TeamSide, number, string]) => recordScoreMock(...args),
}))

// 렌더마다 새 QueryClient 를 만들면 캐시가 계속 초기화된다
let qc: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function serverReply(): MatchRow {
  return {
    score_a: serverScoreA,
    score_b: serverScoreB,
    status: 'live',
    winner_side: null,
    finished_at: null,
  } as unknown as MatchRow
}

/** 응답을 우리가 원하는 시점에 풀 수 있는 지연 프라미스 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  serverScoreA = 0
  serverScoreB = 0
  recordScoreMock.mockReset()
  window.localStorage.clear()
})

describe('빠른 연타', () => {
  test('전송 중에 한 번 더 눌러도 점수가 사라지지 않는다', async () => {
    // 예전 버그: flush 가 시작 시점의 큐 스냅샷을 되돌려 써서,
    // 전송 중에 들어온 점수가 통째로 덮어써졌다. 오류도 배지도 없이 사라졌다.
    const first = deferred<MatchRow>()
    recordScoreMock
      .mockImplementationOnce(() => {
        serverScoreA += 1
        return first.promise
      })
      .mockImplementation(() => {
        serverScoreA += 1
        return Promise.resolve(serverReply())
      })

    const { result } = renderHook(() => useMatchScoring(MATCH_ID), { wrapper })
    await waitFor(() => expect(result.current.match).toBeTruthy())

    act(() => result.current.score('A'))
    act(() => result.current.score('A')) // 전송 중 두 번째 탭

    await act(async () => {
      first.resolve(serverReply())
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    expect(recordScoreMock).toHaveBeenCalledTimes(2)
    expect(result.current.displayScore.a).toBe(2)
  })
})

describe('점수 이중 계산', () => {
  test('서버 값이 반영돼도 낙관적 점수가 겹쳐 보이지 않는다', async () => {
    // 예전 버그: 낙관적 점수를 별도 카운터로 들고 있다가 큐가 완전히 빌 때만
    // 리셋해서, 실시간 갱신이 먼저 도착하면 한 점 더 보였다.
    recordScoreMock.mockImplementation(() => {
      serverScoreA += 1
      return Promise.resolve(serverReply())
    })

    const { result } = renderHook(() => useMatchScoring(MATCH_ID), { wrapper })
    await waitFor(() => expect(result.current.match).toBeTruthy())

    await act(async () => {
      result.current.score('A')
      await result.current.flush()
    })

    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    expect(result.current.displayScore.a).toBe(1)

    // 서버에서 한 번 더 읽어와도 값이 부풀지 않는다
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.displayScore.a).toBe(1)
  })
})

describe('flush 의 정직성', () => {
  test('이미 전송 중이면 그 전송을 기다린다 (즉시 성공이라 하지 않는다)', async () => {
    // 예전 버그: 재진입 가드가 곧바로 resolve 해서, 종료·취소가
    // "다 보냈다" 고 믿고 진행했다.
    const gate = deferred<MatchRow>()
    recordScoreMock.mockImplementationOnce(() => {
      serverScoreA += 1
      return gate.promise
    })

    const { result } = renderHook(() => useMatchScoring(MATCH_ID), { wrapper })
    await waitFor(() => expect(result.current.match).toBeTruthy())

    act(() => result.current.score('A'))

    let settled = false
    const waiting = result.current.flush().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false) // 아직 안 끝났다고 정직하게 말해야 한다

    await act(async () => {
      gate.resolve(serverReply())
      await waiting
    })
    expect(settled).toBe(true)
  })

  test('전송에 실패하면 flush 가 실패로 끝난다', async () => {
    // 예전 버그: 오류를 삼켜서, 미전송 점수를 둔 채 경기가 종료됐다.
    // 21-20 에서 결승점이 큐에 남은 채 끝나면 순위가 통째로 틀어진다.
    recordScoreMock.mockRejectedValue(new Error('네트워크 오류'))

    const { result } = renderHook(() => useMatchScoring(MATCH_ID), { wrapper })
    await waitFor(() => expect(result.current.match).toBeTruthy())

    act(() => result.current.score('A'))

    await expect(result.current.flush()).rejects.toThrow(/전송되지 않은 점수/)
    expect(result.current.pendingCount).toBe(1)
  })
})

describe('탭이 죽었다 살아난 경우', () => {
  test('저장된 대기 큐를 마운트 시 실제로 전송한다', async () => {
    // 예전 버그: 복원은 하는데 보내질 않아서 "1개 전송 대기" 배지만 영영 떠 있었다.
    window.localStorage.setItem(
      `smash:pending:${MATCH_ID}`,
      JSON.stringify([
        {
          clientEventId: 'restored-event-1',
          matchId: MATCH_ID,
          side: 'A',
          delta: 1,
          queuedAt: Date.now(),
          attempts: 0,
        },
      ]),
    )
    recordScoreMock.mockImplementation(() => {
      serverScoreA += 1
      return Promise.resolve(serverReply())
    })

    const { result } = renderHook(() => useMatchScoring(MATCH_ID), { wrapper })

    await waitFor(() => expect(recordScoreMock).toHaveBeenCalledTimes(1))
    expect(recordScoreMock).toHaveBeenCalledWith(MATCH_ID, 'A', 1, 'restored-event-1')
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })
})
