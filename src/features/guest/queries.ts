import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchGuestSessions, joinAsGuest } from './api'

const guestKeys = {
  sessions: (code: string) => ['guest', code, 'sessions'] as const,
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
 * 미리 갖고 있지 않고, 등록 뒤에도 게스트가 다시 읽을 화면(마일스톤 4
 * 전까지)이 없다.
 */
export function useJoinAsGuest() {
  return useMutation({
    mutationFn: ({ code, sessionId, name }: { code: string; sessionId: string; name: string }) =>
      joinAsGuest(code, sessionId, name),
  })
}
