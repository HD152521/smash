import type { SocialProvider } from './AuthContext'

/**
 * Supabase 가 /auth/v1/settings 로 알려주는 활성 provider 목록.
 *
 * 소셜 버튼을 코드에 하드코딩하면, 대시보드에서 provider 를 켜기 전까지
 * 눌러도 "provider is not enabled" 같은 영문 에러만 나온다.
 * 서버가 아는 걸 서버에 물어보면 그 상태가 애초에 생기지 않는다.
 * 나중에 카카오를 켜면 코드 수정 없이 버튼이 나타난다.
 */
export interface AuthSettings {
  external: Record<string, boolean>
  disable_signup: boolean
  mailer_autoconfirm: boolean
}

/** 화면에 보여줄 순서. 국내 사용자가 많으므로 카카오가 앞. */
const SOCIAL_ORDER: readonly SocialProvider[] = ['kakao', 'google']

export function enabledSocialProviders(settings: AuthSettings | undefined): SocialProvider[] {
  if (!settings) return []
  return SOCIAL_ORDER.filter((p) => settings.external[p] === true)
}

export function isEmailSignInEnabled(settings: AuthSettings | undefined): boolean {
  // 설정을 못 읽었으면 이메일은 켜져 있다고 본다.
  // 소셜까지 못 쓰는 상태에서 로그인 수단이 0개가 되는 게 최악이다.
  if (!settings) return true
  return settings.external['email'] === true
}

export async function fetchAuthSettings(
  supabaseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AuthSettings> {
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: apiKey },
    signal,
  })
  if (!res.ok) throw new Error(`인증 설정을 불러오지 못했습니다 (${res.status})`)
  return (await res.json()) as AuthSettings
}
