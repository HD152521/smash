import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext, toKoreanAuthError, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })

    // 토큰 갱신·로그아웃·다른 탭에서의 로그인까지 모두 여기로 들어온다
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      ready,

      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw toKoreanAuthError(error.message)
      },

      async signUpWithPassword(email, password, name) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          // handle_new_user 트리거가 이 값을 읽어 profiles.name 을 채운다
          options: { data: { name } },
        })
        if (error) throw toKoreanAuthError(error.message)
      },

      async signInWithSocial(provider) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw toKoreanAuthError(error.message)
      },

      async signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw toKoreanAuthError(error.message)
      },
    }),
    [session, ready],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
