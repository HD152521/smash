import { useQuery } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { fetchAuthSettings, type AuthSettings } from './providers'

/**
 * 어떤 로그인 수단이 켜져 있는지 서버에 물어본다.
 * 대회 중에 바뀔 값이 아니라 오래 캐시해도 된다.
 */
export function useAuthSettings() {
  return useQuery<AuthSettings>({
    queryKey: ['auth-settings'],
    queryFn: ({ signal }) =>
      fetchAuthSettings(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, signal),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })
}
