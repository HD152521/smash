import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'

/**
 * 소셜 로그인 후 provider 가 되돌려보내는 착지점.
 *
 * supabase-js 가 detectSessionInUrl 로 URL 의 토큰을 알아서 세션으로 바꾼다.
 * 여기서는 그게 끝나기를 기다렸다가 홈으로 보내는 일만 한다.
 */
export function AuthCallbackPage() {
  const { user, ready } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!ready) return
    navigate(user ? '/' : '/login', { replace: true })
  }, [ready, user, navigate])

  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <span
          role="status"
          aria-label="로그인 처리 중"
          className="mx-auto block size-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent"
        />
        <p className="mt-4 text-sm text-ink-2">로그인 처리 중입니다…</p>
      </div>
    </div>
  )
}
