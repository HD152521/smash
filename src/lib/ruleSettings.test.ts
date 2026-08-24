import { describe, expect, test } from 'vitest'
import { DEFAULT_RULES, ruleSummary, toRuleSettings } from './ruleSettings'
import type { TournamentConfig } from '@/types/database'

describe('ruleSummary', () => {
  test('기본값은 복식 21점 듀스 없음', () => {
    expect(ruleSummary(DEFAULT_RULES)).toBe('복식 · 21점 · 듀스 없음')
  })

  test('듀스 상한을 켜면 몇 점까지인지 보인다', () => {
    expect(ruleSummary({ ...DEFAULT_RULES, deuce: true, deuceCap: 30 })).toContain('듀스 최대 30점')
  })

  test('상한 없는 듀스는 그냥 듀스다', () => {
    expect(ruleSummary({ ...DEFAULT_RULES, deuce: true, deuceCap: null })).toContain('듀스')
  })

  test('코트 체인지를 켜면 요약에 뜬다', () => {
    expect(ruleSummary({ ...DEFAULT_RULES, courtChange: true })).toContain('코트 체인지')
  })

  test('단식도 구분한다', () => {
    expect(ruleSummary({ ...DEFAULT_RULES, format: 'singles' })).toContain('단식')
  })

  /*
   * 관리 화면은 대회가 도착하기 전에도 한 번 그려진다.
   * 요약 한 줄 때문에 화면 전체가 죽으면 안 된다.
   */
  test('설정이 아직 없어도 죽지 않는다', () => {
    expect(ruleSummary(undefined)).toBe('')
    expect(ruleSummary(null)).toBe('')
    expect(ruleSummary({})).toBe('복식 · 듀스 없음')
  })
})

describe('toRuleSettings — 예전 대회에도 새 키를 채운다', () => {
  /** 새 설정이 붙기 전에 만들어진 대회의 config */
  const legacy = {
    format: 'doubles',
    normalPoints: 15,
    jokerPoints: 9,
    deuce: false,
    winPoints: 1,
    jokerWinPoints: 0.5,
    lossPoints: 0,
    jokerGroupCount: 2,
  } as TournamentConfig

  test('없던 키는 기본값으로 채운다', () => {
    const r = toRuleSettings(legacy)
    expect(r.courtChange).toBe(false)
    expect(r.readyQueuePosition).toBe(2)
  })

  test('있던 값은 그대로 둔다', () => {
    const r = toRuleSettings(legacy)
    expect(r.normalPoints).toBe(15)
    expect(r.jokerPoints).toBe(9)
  })

  test('null 이 뜻을 갖는 항목은 기본값으로 되돌리지 않는다', () => {
    // 상한 없음 · 자동 계산은 '값이 없음' 이 아니라 고른 결과다
    const r = toRuleSettings({ ...legacy, deuce: true, deuceCap: null, courtChangeAt: null })
    expect(r.deuceCap).toBeNull()
    expect(r.courtChangeAt).toBeNull()
  })

  test('설정이 통째로 없으면 기본값을 준다', () => {
    expect(toRuleSettings(null)).toEqual(DEFAULT_RULES)
  })
})
