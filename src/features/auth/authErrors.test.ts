import { describe, expect, test } from 'vitest'
import { toKoreanAuthError } from './AuthContext'

describe('인증 오류 한국어 변환', () => {
  test('메일 발송 한도 초과를 안내로 바꾼다', () => {
    // Supabase 내장 메일은 시간당 몇 통이라 가입을 몇 번만 시도해도 걸린다.
    // 영문 그대로 보여주면 사용자는 자기 계정이 잘못된 줄 안다.
    const msg = toKoreanAuthError('email rate limit exceeded').message
    expect(msg).toContain('발송 한도')
    expect(msg).toContain('로그인')
    expect(msg).not.toContain('rate limit')
  })

  test('스네이크 케이스 코드도 잡는다', () => {
    expect(toKoreanAuthError('over_email_send_rate_limit').message).toContain('발송 한도')
  })

  test('비밀번호 오류', () => {
    expect(toKoreanAuthError('Invalid login credentials').message).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다',
    )
  })

  test('이미 가입된 이메일은 로그인으로 유도한다', () => {
    expect(toKoreanAuthError('User already registered').message).toContain('로그인')
  })

  test('네트워크 오류', () => {
    expect(toKoreanAuthError('Failed to fetch').message).toContain('네트워크')
  })

  test('모르는 오류는 원문을 남겨 디버깅을 막지 않는다', () => {
    expect(toKoreanAuthError('Some unknown thing').message).toContain('Some unknown thing')
  })
})
