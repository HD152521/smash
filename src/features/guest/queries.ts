import { useMutation, useQuery } from '@tanstack/react-query'
import type { GuestBoardOutcome } from '@/lib/guest'
import type { PlayerGrade } from '@/types/database'
import { fetchGuestBoard, fetchGuestSessions, joinAsGuest } from './api'

const guestKeys = {
  sessions: (code: string) => ['guest', code, 'sessions'] as const,
  board: (code: string, sessionId: string) => ['guest', code, 'board', sessionId] as const,
}

/**
 * 게스트 코드로 지금 열린 모임 후보를 읽는다.
 *
 * 반환값은 `GuestSessionsOutcome` 그대로다 — `unwrap()` 을 거치지 않고
 * `ok:false` 도 정상 데이터로 넘긴다. `bad_code` · `no_open_session` 은
 * 네트워크 오류가 아니라 화면이 각자 다르게 그려야 할 상태이기 때문이다
 * (`api.ts` 주석 참고). `retry` 를 끄는 이유도 같다 — 서버가 이미 판단을
 * 끝낸 결과라 다시 물어도 같은 답이 온다.
 */
export function useGuestSessions(code: string | undefined) {
  return useQuery({
    queryKey: guestKeys.sessions(code ?? ''),
    queryFn: () => fetchGuestSessions(code!),
    enabled: Boolean(code),
    retry: false,
  })
}

/**
 * 게스트로 등록한다.
 *
 * 성공/실패 모두 `GuestJoinOutcome` 으로 돌아온다 — 무효화할 캐시가 없다.
 * 게스트는 로그인 상태가 아니라 이 브라우저에 그 어떤 react-query 캐시도
 * 미리 갖고 있지 않다. 등록 뒤에 가는 현황판(`useGuestBoard`)도 키가 달라
 * 그 자리에서 처음 읽는다 — 지울 낡은 값이 없다.
 */
export function useJoinAsGuest() {
  return useMutation({
    mutationFn: ({
      code,
      sessionId,
      name,
      grade,
    }: {
      code: string
      sessionId: string
      name: string
      /** 선택이다 — 안 고르면 null 이고 서버는 인자 없이 부른 것과 같이 다룬다 */
      grade: PlayerGrade | null
    }) => joinAsGuest(code, sessionId, name, grade),
  })
}

/**
 * 현황판 폴링 주기.
 *
 * 앱 전역 `staleTime` 과 같은 10초다 — 이미 앱이 "10초면 최신" 이라고
 * 판단한 값이라 게스트만 다른 감각을 갖지 않는다. 심판 화면(5초)보다 긴
 * 이유는, 그건 채점자 한 명의 화면이고 여기는 **코트 옆 사람 전원이 동시에
 * 켜 두는** 화면이기 때문이다.
 */
export const GUEST_BOARD_POLL_MS = 10_000

/** 아직 더 볼 것이 남은 모임인가 — 폴링을 계속할지의 유일한 기준 */
function isBoardAlive(data: GuestBoardOutcome | undefined): boolean {
  return data?.ok === true && data.session.status === 'live'
}

/**
 * 게스트 현황판을 10초마다 다시 읽는다.
 *
 * Realtime(`postgres_changes`)을 못 쓴다. 구독은 **구독 롤의 RLS 를 그대로
 * 타므로** anon 에게 열려면 `matches` 에 anon SELECT 정책이 필요하고, 그
 * 정책은 PostgREST 직접 조회에도 똑같이 열려 안 싣기로 한 컬럼과 명단
 * 전체가 함께 나간다. 그래서 폴링이다.
 *
 * 여기는 **레이트리밋을 못 거는 anon 경로**라, 호출을 줄이는 장치를
 * 일부러 셋 단다.
 *
 *  1. **`refetchIntervalInBackground` 를 켜지 않는다.** react-query 의
 *     기본값이 `false` 라 탭이 안 보이면 폴링이 멈춘다. 이건 우연히 맞은
 *     동작이 아니라 **의도적으로 기대는 기본값**이다 — 켜는 순간 게스트가
 *     주머니에 넣어 둔 탭 전부가 종일 서버를 때린다.
 *  2. **끝난 모임이면 멈춘다.** `finished` 는 더 바뀔 것이 없고,
 *     `ok:false`(`board_closed`·`bad_code`)도 다시 물어 봐야 같은 답이다.
 *  3. 응답 자체가 작다 — 끝난 경기는 개수만 오므로 모임이 길어져도 payload
 *     가 자라지 않는다(서버 쪽 규율).
 *
 * `retry` 를 끄는 이유는 `useGuestSessions` 와 같다 — `ok:false` 는 서버가
 * 이미 판단을 끝낸 결과라 재시도가 답을 바꾸지 않는다.
 *
 * > 링크가 유출돼 호출이 폭주하면 답은 주기 조절이 아니라
 * > `rotate_guest_code` 다.
 */
export function useGuestBoard(code: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: guestKeys.board(code ?? '', sessionId ?? ''),
    queryFn: () => fetchGuestBoard(code!, sessionId!),
    enabled: Boolean(code && sessionId),
    retry: false,
    refetchInterval: (q) => (isBoardAlive(q.state.data) ? GUEST_BOARD_POLL_MS : false),
  })
}
