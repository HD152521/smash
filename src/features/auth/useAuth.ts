import { use } from 'react'
import { AuthContext, type AuthState } from './AuthContext'

export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다')
  return ctx
}

export type { SocialProvider } from './AuthContext'
