import { describe, expect, it } from 'vitest'
import { defaultSessionName, hasNoGroups, isSession, isUnscored, playerTitle } from './session'
import type { MatchOverviewRow } from '@/types/database'

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    status: 'scheduled',
    group_a_name: null,
    group_b_name: null,
    players_a: ['가나다', '라마바'],
    players_b: ['사아자', '차카타'],
    scored: true,
    ...over,
  } as MatchOverviewRow
}

describe('isSession', () => {
  it('모임을 골라낸다', () => {
    expect(isSession('session')).toBe(true)
    expect(isSession('tournament')).toBe(false)
  })

  /*
   * kind 컬럼이 생기기 전에 만들어진 대회가 이미 7개 있다.
   * 판단을 뒤집으면(없으면 모임) 그 대회들의 순위 탭이 사라진다.
   */
  it('값이 없으면 대회로 본다', () => {
    expect(isSession(null)).toBe(false)
    expect(isSession(undefined)).toBe(false)
  })
})

describe('defaultSessionName', () => {
  it('날짜로 이름을 만든다', () => {
    expect(defaultSessionName(new Date(2026, 9, 7))).toBe('10월 7일 모임')
  })

  it('한 자리 달도 앞에 0을 붙이지 않는다', () => {
    expect(defaultSessionName(new Date(2026, 0, 3))).toBe('1월 3일 모임')
  })
})

describe('playerTitle — 조가 없으니 사람으로 부른다', () => {
  it('양쪽 선수를 이름으로 잇는다', () => {
    expect(playerTitle(match({}))).toBe('가나다 · 라마바 vs 사아자 · 차카타')
  })

  it('단식도 그대로 읽힌다', () => {
    expect(playerTitle(match({ players_a: ['가나다'], players_b: ['사아자'] }))).toBe(
      '가나다 vs 사아자',
    )
  })

  it('선수가 아직 없으면 물음표로 둔다 — "vs" 만 남으면 뭐가 빠졌는지 모른다', () => {
    expect(playerTitle(match({ players_a: [], players_b: null }))).toBe('? vs ?')
  })
})

describe('hasNoGroups', () => {
  it('조 이름이 둘 다 없으면 모임 경기다', () => {
    expect(hasNoGroups(match({}))).toBe(true)
  })

  it('조가 있으면 대회 경기다', () => {
    expect(hasNoGroups(match({ group_a_name: '1조', group_b_name: '2조' }))).toBe(false)
  })
})

describe('isUnscored', () => {
  it('점수를 안 센 경기만 골라낸다', () => {
    expect(isUnscored(match({ scored: false }))).toBe(true)
    expect(isUnscored(match({ scored: true }))).toBe(false)
  })

  /*
   * 뷰 컬럼이라 타입이 nullable 이다. null 을 '안 셌다' 로 읽으면
   * 이 컬럼이 없던 시절의 지난 경기 140건이 전부 '점수 없음' 이 된다.
   */
  it('값이 없으면 셌다고 본다', () => {
    expect(isUnscored(match({ scored: null }))).toBe(false)
  })
})
