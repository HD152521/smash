import { describe, expect, test } from 'vitest'
import { enabledSocialProviders, isEmailSignInEnabled, type AuthSettings } from './providers'

function settings(external: Record<string, boolean>): AuthSettings {
  return { external, disable_signup: false, mailer_autoconfirm: false }
}

describe('활성 소셜 provider 추리기', () => {
  test('대시보드에서 켜지 않은 provider 는 버튼이 나오지 않는다', () => {
    expect(enabledSocialProviders(settings({ email: true, google: false, kakao: false }))).toEqual(
      [],
    )
  })

  test('카카오만 켜면 카카오만 나온다', () => {
    expect(enabledSocialProviders(settings({ email: true, kakao: true, google: false }))).toEqual([
      'kakao',
    ])
  })

  test('둘 다 켜면 카카오가 먼저 나온다 (국내 사용자 우선)', () => {
    expect(enabledSocialProviders(settings({ kakao: true, google: true }))).toEqual([
      'kakao',
      'google',
    ])
  })

  test('우리가 지원하지 않는 provider 가 켜져 있어도 무시한다', () => {
    expect(enabledSocialProviders(settings({ github: true, apple: true, kakao: true }))).toEqual([
      'kakao',
    ])
  })

  test('설정을 못 읽었으면 소셜 버튼을 아예 안 띄운다', () => {
    expect(enabledSocialProviders(undefined)).toEqual([])
  })
})

describe('이메일 로그인 가용 여부', () => {
  test('켜져 있으면 true', () => {
    expect(isEmailSignInEnabled(settings({ email: true }))).toBe(true)
  })

  test('꺼져 있으면 false', () => {
    expect(isEmailSignInEnabled(settings({ email: false }))).toBe(false)
  })

  test('설정을 못 읽었으면 true 로 본다 — 로그인 수단이 0개가 되는 게 최악이다', () => {
    expect(isEmailSignInEnabled(undefined)).toBe(true)
  })
})
