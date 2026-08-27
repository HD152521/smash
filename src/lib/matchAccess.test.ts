import { describe, expect, test } from 'vitest'
import { canRunMatch, isMatchPlayer, isMatchReferee } from './matchAccess'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 이 파일이 지키는 것은 하나다 — **화면과 서버가 같은 답을 낸다.**
 *
 * 서버 정본은 `can_run_match(uuid)`
 * (supabase/migrations/20260825000001_session_mode.sql). 화면이 좁게
 * 판단하면 될 일이 안 되고(모임에서 뛰는 사람이 자기 경기를 못 끝낸다),
 * 넓게 판단하면 눌러 놓고 권한 오류를 본다.
 */

function match(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return {
    id: 'match-1',
    status: 'live',
    players_a: ['김민수', '이서연'],
    players_b: ['박지훈', '최유진'],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

describe('대회', () => {
  const tournament = { isSession: false }

  test('관리자는 어느 경기든 돌린다', () => {
    expect(canRunMatch(match(), { ...tournament, isAdmin: true, myName: '운영진' })).toBe(true)
  })

  test('지정 심판은 자기가 맡은 경기를 돌린다', () => {
    const m = match({ referees: ['심판이'] })
    expect(canRunMatch(m, { ...tournament, isAdmin: false, myName: '심판이' })).toBe(true)
  })

  test('뛰는 사람이라는 이유만으로는 안 된다 — 대회는 심판이 넣는다', () => {
    expect(canRunMatch(match(), { ...tournament, isAdmin: false, myName: '김민수' })).toBe(false)
  })
})

describe('모임', () => {
  const session = { isSession: true }

  test('그 경기에 뛰는 사람은 관리자가 아니어도 돌린다', () => {
    expect(canRunMatch(match(), { ...session, isAdmin: false, myName: '김민수' })).toBe(true)
    expect(canRunMatch(match(), { ...session, isAdmin: false, myName: '최유진' })).toBe(true)
  })

  test("'자기 경기' 가 핵심이다 — 남의 코트는 여전히 못 건드린다", () => {
    expect(canRunMatch(match(), { ...session, isAdmin: false, myName: '구경꾼' })).toBe(false)
  })

  test('이름이 없으면(명단에 없는 사람) 안 된다', () => {
    expect(canRunMatch(match(), { ...session, isAdmin: false, myName: undefined })).toBe(false)
  })
})

describe('무효 처리된 경기', () => {
  test('관리자에게도 돌릴 것이 없다 — 서버가 어차피 막는다', () => {
    const m = match({ status: 'void' })
    expect(canRunMatch(m, { isSession: true, isAdmin: true, myName: '운영진' })).toBe(false)
  })
})

describe('이름으로 가리는 두 판단', () => {
  test('선수 목록이 비어 있어도 죽지 않는다', () => {
    const m = match({ players_a: null, players_b: null })
    expect(isMatchPlayer(m, '김민수')).toBe(false)
  })

  test('심판 목록이 비어 있어도 죽지 않는다', () => {
    expect(isMatchReferee(match({ referees: null }), '심판이')).toBe(false)
  })
})
