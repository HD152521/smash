import { describe, expect, it } from 'vitest'
import { removePick, splitTeams, togglePick } from './matchPicker'

describe('togglePick — 사람을 고르거나 뺀다', () => {
  it('안 고른 사람을 누르면 뒤에 붙는다', () => {
    expect(togglePick(['a'], 'b', 4)).toEqual(['a', 'b'])
  })

  it('이미 고른 사람을 다시 누르면 빠진다', () => {
    expect(togglePick(['a', 'b'], 'a', 4)).toEqual(['b'])
  })

  it('빈 목록에서 첫 사람을 고르면 한 명짜리 목록이 된다', () => {
    expect(togglePick([], 'a', 4)).toEqual(['a'])
  })

  it('다 찼으면 새 사람을 눌러도 그대로다 — 조용히 앞사람을 밀어내지 않는다', () => {
    expect(togglePick(['a', 'b', 'c', 'd'], 'e', 4)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('다 찼어도 이미 고른 사람은 뺄 수 있다', () => {
    expect(togglePick(['a', 'b', 'c', 'd'], 'b', 4)).toEqual(['a', 'c', 'd'])
  })

  it('반환값은 새 배열이다 — 원본을 바꾸지 않는다', () => {
    const original = ['a']
    const next = togglePick(original, 'b', 4)
    expect(original).toEqual(['a'])
    expect(next).not.toBe(original)
  })
})

describe('removePick — 골랐던 사람을 뺀다', () => {
  it('목록에 있으면 뺀다', () => {
    expect(removePick(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('목록에 없으면 그대로다', () => {
    expect(removePick(['a', 'b'], 'z')).toEqual(['a', 'b'])
  })

  it('빈 목록이면 빈 목록이다', () => {
    expect(removePick([], 'a')).toEqual([])
  })
})

describe('splitTeams — 앞 절반이 A팀, 뒤 절반이 B팀', () => {
  it('복식(squad 2): 아무도 안 골랐으면 두 팀 다 비어 있고 준비되지 않았다', () => {
    expect(splitTeams([], 2)).toEqual({ teamA: [], teamB: [], ready: false })
  })

  it('복식: 2명만 골랐으면 A팀만 찬다', () => {
    expect(splitTeams(['a', 'b'], 2)).toEqual({ teamA: ['a', 'b'], teamB: [], ready: false })
  })

  it('복식: 4명을 골라야 준비된다', () => {
    expect(splitTeams(['a', 'b', 'c', 'd'], 2)).toEqual({
      teamA: ['a', 'b'],
      teamB: ['c', 'd'],
      ready: true,
    })
  })

  it('단식(squad 1): 2명이면 준비된다', () => {
    expect(splitTeams(['a', 'b'], 1)).toEqual({ teamA: ['a'], teamB: ['b'], ready: true })
  })

  it('단식: 1명뿐이면 준비되지 않았다', () => {
    expect(splitTeams(['a'], 1)).toEqual({ teamA: ['a'], teamB: [], ready: false })
  })

  it('필요한 인원을 넘겨 고른 적은 없지만, 넘는 자리는 팀에 안 들어간다', () => {
    // togglePick 이 need 를 넘겨 받지 않게 막지만, 방어적으로도 잘라낸다
    expect(splitTeams(['a', 'b', 'c', 'd', 'e'], 2)).toEqual({
      teamA: ['a', 'b'],
      teamB: ['c', 'd'],
      ready: true,
    })
  })
})
