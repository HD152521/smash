import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type SocialProvider = 'google' | 'kakao'

export interface AuthState {
  session: Session | null
  user: User | null
  /** 최초 세션 복원이 끝났는지. 이게 false 인 동안은 로그인 여부를 판단하면 안 된다. */
  ready: boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string, name: string) => Promise<void>
  signInWithSocial: (provider: SocialProvider) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

/** Supabase 의 영문 오류를 사용자가 읽을 수 있는 문장으로 바꾼다. */
const EXACT_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다',
  'Email not confirmed': '이메일 인증이 아직 안 됐습니다. 메일함의 링크를 눌러주세요',
  'User already registered': '이미 가입된 이메일입니다. 로그인해 주세요',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다',
  'Signups not allowed for this instance': '지금은 가입을 받지 않습니다',
}

const PATTERN_MESSAGES: [RegExp, string][] = [
  // Supabase 내장 메일은 시간당 몇 통으로 제한된다 (테스트 전용 서비스).
  // 가입을 여러 번 시도하면 바로 걸리는데, 영문 그대로 보여주면
  // 사용자는 자기 계정에 문제가 생긴 줄 안다.
  [
    /email rate limit|over_email_send_rate_limit/i,
    '확인 메일 발송 한도를 넘었습니다. 이미 가입하셨다면 로그인해 주세요. 잠시 뒤 다시 시도할 수 있습니다',
  ],
  [/rate limit|too many requests/i, '요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요'],
  [/Failed to fetch|NetworkError/i, '네트워크 연결을 확인해 주세요'],
]

export function toKoreanAuthError(message: string): Error {
  const exact = EXACT_MESSAGES[message]
  if (exact) return new Error(exact)
  for (const [pattern, msg] of PATTERN_MESSAGES) {
    if (pattern.test(message)) return new Error(msg)
  }
  return new Error(`처리하지 못했습니다 (${message})`)
}
