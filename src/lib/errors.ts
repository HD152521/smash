import type { PostgrestError } from '@supabase/supabase-js'

/**
 * 서버 오류를 사용자에게 보여줄 문장으로 바꾼다.
 *
 * RPC 는 대부분 이미 한국어 메시지를 던지므로 그대로 쓴다.
 * 문제는 RLS 가 조용히 막는 경우다 — 이때 PostgREST 는
 * "new row violates row-level security policy" 같은 영문을 준다.
 * 사용자에게 그대로 보여주면 무슨 일인지 알 수 없으므로 번역한다.
 */
const CODE_MESSAGES: Record<string, string> = {
  '42501': '권한이 없습니다',
  '23505': '이미 존재합니다',
  '23503': '연결된 데이터가 없습니다',
  PGRST301: '로그인이 만료되었습니다. 다시 로그인해 주세요',
  PGRST116: '데이터를 찾을 수 없습니다',
}

const PATTERN_MESSAGES: [RegExp, string][] = [
  [/row-level security/i, '권한이 없습니다'],
  [/JWT expired/i, '로그인이 만료되었습니다. 다시 로그인해 주세요'],
  [/Failed to fetch|NetworkError|network/i, '네트워크 연결을 확인해 주세요'],
]

function isPostgrestError(e: unknown): e is PostgrestError {
  return typeof e === 'object' && e !== null && 'message' in e && 'code' in e
}

export function toUserMessage(error: unknown, fallback = '요청을 처리하지 못했습니다'): string {
  if (!error) return fallback

  if (isPostgrestError(error)) {
    // RPC 가 raise exception 으로 던진 한국어 메시지가 여기 담긴다
    const byCode = CODE_MESSAGES[error.code]
    if (byCode) return byCode
    for (const [pattern, msg] of PATTERN_MESSAGES) {
      if (pattern.test(error.message)) return msg
    }
    return error.message || fallback
  }

  if (error instanceof Error) {
    for (const [pattern, msg] of PATTERN_MESSAGES) {
      if (pattern.test(error.message)) return msg
    }
    return error.message || fallback
  }

  return fallback
}

/** supabase-js 의 { data, error } 를 예외로 바꿔 TanStack Query 가 처리하게 한다 */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw result.error
  if (result.data === null) throw new Error('데이터를 받지 못했습니다')
  return result.data
}
