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
export function toKoreanAuthError(message: string): Error {
  const map: Record<string, string> = {
    'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다',
    'Email not confirmed': '이메일 인증이 완료되지 않았습니다',
    'User already registered': '이미 가입된 이메일입니다',
    'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다',
  }
  return new Error(map[message] ?? `로그인에 실패했습니다 (${message})`)
}
