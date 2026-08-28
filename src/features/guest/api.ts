import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { unwrap } from '@/lib/errors'
import {
  parseGuestBoard,
  parseGuestJoinResult,
  parseGuestSessions,
  type GuestBoardOutcome,
  type GuestJoinOutcome,
  type GuestSessionsOutcome,
} from '@/lib/guest'
import type { Database, PlayerGrade } from '@/types/database'

/**
 * 게스트 데이터 접근 — 이 파일의 세 함수는 **로그인 세션 없이** 동작해야
 * 한다.
 *
 * `guest_sessions` · `join_as_guest` · `guest_board` 는 마이그레이션 권한 절에서
 * `anon` 에게만 grant 됐고 `authenticated` 에게는 없다
 * (`20260828000001_guest_registration.sql` 끝의 권한 절 참고). 앱 전역
 * `src/lib/supabase.ts` 의 `supabase` 클라이언트는 `persistSession: true`
 * 라 로그인한 사람이 **같은 브라우저**로 게스트 링크를 열면(운영진이
 * 자기 링크를 테스트하는 경우 등) 저장된 세션의 JWT 를 Authorization
 * 헤더에 그대로 실어 보낸다. 그러면 Postgres 의 `current_user` 가
 * `'authenticated'` 가 되는데, 이 세 RPC 는 `authenticated` 에게 EXECUTE
 * grant 가 없으므로 42501(permission denied)로 떨어진다 — 로그인
 * 여부와 무관하게 항상 `anon` 으로 불러야 하는 이유다.
 *
 * 그래서 세션을 절대 읽지도 저장하지도 않는 별도 클라이언트를 여기서만
 * 만든다. `persistSession: false` · `autoRefreshToken: false` ·
 * `detectSessionInUrl: false` 세 옵션 모두 로그인 상태를 이 클라이언트로
 * 절대 끌어오지 않기 위한 것이다 — 하나라도 켜면 위 함정이 되살아난다.
 */
const guestSupabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
)

/**
 * 게스트 코드로 지금 열린 모임 후보를 가져온다.
 *
 * 서버가 예외 대신 봉투를 돌려주고, 그 봉투에는 성공/실패 말고도 화면이
 * 갈라 그려야 할 상태가 여러 개 섞여 있다(코드가 틀림 · 열린 모임 없음).
 * `joinClub` 처럼 실패를 예외로 바꿔 던지지 않는 이유가 여기 있다 —
 * 던지면 화면이 "코드가 틀렸다" 와 "지금은 열린 모임이 없다" 를 같은
 * catch 블록에서 구별해야 한다. `parseGuestSessions` 가 이미 판별
 * 유니온으로 풀어 뒀으므로 그 결과를 그대로 넘긴다.
 */
export async function fetchGuestSessions(code: string): Promise<GuestSessionsOutcome> {
  const res = await guestSupabase.rpc('guest_sessions', { p_code: code })
  return parseGuestSessions(unwrap(res))
}

/**
 * 게스트로 등록한다.
 *
 * `fetchGuestSessions` 와 같은 이유로 실패를 예외로 바꾸지 않는다 —
 * `bad_name`·`guest_limit` 등은 사용자가 고칠 수 있는 입력 오류라
 * 화면이 그 자리에서 안내를 보여줘야지, 예외 토스트로 흘려보내면 안 된다.
 */
export async function joinAsGuest(
  code: string,
  sessionId: string,
  name: string,
  grade: PlayerGrade | null,
): Promise<GuestJoinOutcome> {
  const res = await guestSupabase.rpc('join_as_guest', {
    p_code: code,
    p_session_id: sessionId,
    p_name: name,
    /*
     * 급수를 안 골랐으면 키 자체를 안 보낸다. p_grade 는 서버에서
     * `default null` 이라 안 보내면 그대로 null 이 들어간다 — 그리고
     * **그 경로가 곧 옛 3인자 호출이 안 깨진다는 증거**다. PostgREST 는
     * 함수를 인자 이름 집합으로 찾으므로 이 분기가 실제로 두 시그니처를
     * 다 시험한다.
     */
    ...(grade ? { p_grade: grade } : {}),
  })
  return parseGuestJoinResult(unwrap(res))
}

/**
 * 게스트 현황판을 읽는다.
 *
 * **위의 `guestSupabase` 를 그대로 쓴다** — 이 경로 전용 클라이언트를 또
 * 만들면 위 주석의 함정(로그인 세션이 딸려 들어와 42501)이 새 파일에서
 * 되살아난다. 로그인한 운영진이 자기 링크를 확인하는 일은 실제로 자주
 * 일어난다.
 *
 * 실패를 예외로 바꾸지 않는 이유도 앞의 두 함수와 같다 — `board_closed`
 * 는 네트워크 오류가 아니라 "지난 모임이거나 링크가 바뀌었다" 는, 화면이
 * 등록 입구로 안내해야 할 상태다.
 */
export async function fetchGuestBoard(code: string, sessionId: string): Promise<GuestBoardOutcome> {
  const res = await guestSupabase.rpc('guest_board', {
    p_code: code,
    p_session_id: sessionId,
  })
  return parseGuestBoard(unwrap(res))
}
