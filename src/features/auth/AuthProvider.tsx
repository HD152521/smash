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

      async signUpWithPassword(email, password, name, grade) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          /*
           * handle_new_user 트리거가 이 값을 읽어 profiles.name · profiles.grade
           * 를 채운다. 급수를 안 골랐으면 키 자체를 안 싣는다 — 트리거의
           * parse_player_grade 가 없는 키도 빈 문자열도 똑같이 null 로
           * 떨어뜨리므로 결과는 같고, 안 실어 보내는 쪽이 정직하다.
           */
          options: { data: grade ? { name, grade } : { name } },
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
