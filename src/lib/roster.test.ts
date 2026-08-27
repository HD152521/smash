import { describe, expect, it } from 'vitest'
import {
  buildRosterStats,
  hasGradeContrast,
  hasRsvpContrast,
  namesInAnyMatch,
  orderRoster,
  presenceTier,
  rosterStat,
} from './roster'
import type { MatchOverviewRow, PlayerGrade, RsvpStatus } from '@/types/database'

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    status: 'finished',
    started_at: '2026-08-27T19:00:00Z',
    finished_at: '2026-08-27T19:20:00Z',
    created_at: '2026-08-27T18:00:00Z',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as unknown as MatchOverviewRow
}

function member(displayName: string, rsvp: RsvpStatus = 'going', userId: string | null = 'u1') {
  return { userId, displayName, rsvp }
}

function names(members: readonly { displayName: string }[]): string[] {
  return members.map((m) => m.displayName)
}

describe('buildRosterStats — 오늘 몇 판 뛰었나', () => {
  it('끝난 경기와 진행 중인 경기를 센다', () => {
    const stats = buildRosterStats([
      match({ players_a: ['가나'], players_b: ['나다'] }),
      match({ status: 'live', finished_at: null, players_a: ['가나'], players_b: ['다라'] }),
    ])
    expect(rosterStat(stats, '가나').played).toBe(2)
    expect(rosterStat(stats, '나다').played).toBe(1)
  })

  it('예정 경기는 아직 안 뛴 것이라 안 센다', () => {
    const stats = buildRosterStats([
      match({ status: 'scheduled', finished_at: null, started_at: null, players_a: ['가나'] }),
    ])
    expect(rosterStat(stats, '가나').played).toBe(0)
  })

  it('무효 경기는 없던 일이라 안 센다', () => {
    const stats = buildRosterStats([match({ status: 'void', players_a: ['가나'] })])
    expect(rosterStat(stats, '가나').played).toBe(0)
  })

  it('심판은 안 센다 — 코트에 선 횟수만 판수다', () => {
    const stats = buildRosterStats([match({ players_a: ['가나'], referees: ['심판이'] })])
    expect(rosterStat(stats, '심판이').played).toBe(0)
  })

  it('명단에만 있고 경기가 없는 사람은 0판이다', () => {
    expect(rosterStat(buildRosterStats([]), '없는사람')).toEqual({ played: 0, lastPlayedAt: 0 })
  })

  it('진행 중인 경기는 가장 최근으로 본다 — 코트 위에 있으면 쉰 시간이 0이다', () => {
    const stats = buildRosterStats([
      match({ status: 'live', finished_at: null, players_a: ['치는중'] }),
      match({ finished_at: '2026-08-27T20:00:00Z', players_a: ['방금끝'] }),
    ])
    expect(rosterStat(stats, '치는중').lastPlayedAt).toBe(Number.POSITIVE_INFINITY)
    expect(rosterStat(stats, '방금끝').lastPlayedAt).toBe(Date.parse('2026-08-27T20:00:00Z'))
  })

  it('끝난 시각이 없으면 시작 시각으로 대신한다', () => {
    const stats = buildRosterStats([match({ finished_at: null, players_a: ['가나'] })])
    expect(rosterStat(stats, '가나').lastPlayedAt).toBe(Date.parse('2026-08-27T19:00:00Z'))
  })
})

describe('namesInAnyMatch — 뺄 수 없는 사람', () => {
  it('예정 경기와 심판까지 센다 — 지우면 그 경기가 깨진다', () => {
    const locked = namesInAnyMatch([
      match({ status: 'scheduled', players_a: ['예정이'] }),
      match({ referees: ['심판이'] }),
    ])
    expect(locked.has('예정이')).toBe(true)
    expect(locked.has('심판이')).toBe(true)
  })

  it('무효 경기만 있는 사람은 뺄 수 있다', () => {
    const locked = namesInAnyMatch([match({ status: 'void', players_a: ['무효만'] })])
    expect(locked.has('무효만')).toBe(false)
  })
})

describe('presenceTier — 왔나 · 모르나 · 안 왔나', () => {
  it('참가를 누른 사람은 왔다', () => {
    expect(presenceTier(member('가나', 'going'), { played: 0, lastPlayedAt: 0 })).toBe(0)
  })

  it('안 눌렀어도 한 판 뛰었으면 왔다 — 코트에 선 사실이 버튼보다 강하다', () => {
    expect(presenceTier(member('가나', 'invited'), { played: 1, lastPlayedAt: 1 })).toBe(0)
    expect(presenceTier(member('나다', 'declined'), { played: 1, lastPlayedAt: 1 })).toBe(0)
  })

  it('계정이 없으면 침묵해도 왔다로 본다 — 문 앞에서 손으로 적어 넣은 사람이다', () => {
    expect(presenceTier(member('명단만', 'invited', null), { played: 0, lastPlayedAt: 0 })).toBe(0)
  })

  it('아직 안 누른 사람과 불참을 누른 사람이 갈린다', () => {
    expect(presenceTier(member('가나', 'invited'), { played: 0, lastPlayedAt: 0 })).toBe(1)
    expect(presenceTier(member('나다', 'declined'), { played: 0, lastPlayedAt: 0 })).toBe(2)
  })
})

describe('orderRoster — 다음에 누굴 넣지', () => {
  it('오늘 안 뛴 사람이 맨 위로 온다', () => {
    const stats = buildRosterStats([match({ players_a: ['두판이', '두판이2'] })])
    const ordered = orderRoster([member('두판이'), member('안뛴이')], stats)
    expect(names(ordered)).toEqual(['안뛴이', '두판이'])
  })

  it('적게 뛴 사람이 위다', () => {
    const stats = buildRosterStats([
      match({ players_a: ['셋'], players_b: ['둘'] }),
      match({ players_a: ['셋'], players_b: ['둘'] }),
      match({ players_a: ['셋'] }),
    ])
    expect(names(orderRoster([member('셋'), member('둘'), member('영')], stats))).toEqual([
      '영',
      '둘',
      '셋',
    ])
  })

  it('같은 판수면 오래 쉰 사람이 위다', () => {
    const stats = buildRosterStats([
      match({ players_a: ['아까'], finished_at: '2026-08-27T19:00:00Z' }),
      match({ players_a: ['방금'], finished_at: '2026-08-27T20:00:00Z' }),
    ])
    expect(names(orderRoster([member('방금'), member('아까')], stats))).toEqual(['아까', '방금'])
  })

  it('지금 치고 있는 사람은 같은 판수 안에서 맨 뒤다', () => {
    const stats = buildRosterStats([
      match({ players_a: ['방금끝'], finished_at: '2026-08-27T20:00:00Z' }),
      match({ status: 'live', finished_at: null, players_a: ['치는중'] }),
    ])
    expect(names(orderRoster([member('치는중'), member('방금끝')], stats))).toEqual([
      '방금끝',
      '치는중',
    ])
  })

  it('안 온 사람이 안 뛰었다고 맨 위로 오지 않는다', () => {
    const stats = buildRosterStats([match({ players_a: ['왔고뛴이'] })])
    const ordered = orderRoster(
      [member('불참이', 'declined'), member('미정이', 'invited'), member('왔고뛴이', 'invited')],
      stats,
    )
    expect(names(ordered)).toEqual(['왔고뛴이', '미정이', '불참이'])
  })

  it('조건이 같으면 가나다순으로 못을 박는다 — 목록이 스스로 움직이면 안 된다', () => {
    const ordered = orderRoster(
      [member('하나'), member('가나'), member('나나')],
      buildRosterStats([]),
    )
    expect(names(ordered)).toEqual(['가나', '나나', '하나'])
  })

  it('원본을 건드리지 않는다', () => {
    const input = [member('하나'), member('가나')]
    orderRoster(input, buildRosterStats([]))
    expect(names(input)).toEqual(['하나', '가나'])
  })
})

describe('hasRsvpContrast — 모두에게 붙는 배지는 배지가 아니다', () => {
  it('아무도 안 눌렀으면 배지를 띄우지 않는다', () => {
    expect(hasRsvpContrast([member('가나', 'invited'), member('나다', 'invited')])).toBe(false)
  })

  it('전원이 참가면 띄우지 않는다 — 대회 명단이 늘 이 모양이다', () => {
    expect(hasRsvpContrast([member('가나', 'going'), member('나다', 'going')])).toBe(false)
  })

  it('섞여 있을 때만 띄운다', () => {
    expect(hasRsvpContrast([member('가나', 'going'), member('나다', 'invited')])).toBe(true)
  })

  it('계정 없는 사람의 미응답은 안 센다 — 누를 방법이 없는 사람이다', () => {
    expect(hasRsvpContrast([member('가나', 'going'), member('명단만', 'invited', null)])).toBe(
      false,
    )
  })
})

describe('hasGradeContrast — 급수 배지도 같은 규율이다', () => {
  const g = (grade: PlayerGrade | null) => ({ grade })

  it('아무도 급수를 안 골랐으면 띄우지 않는다', () => {
    expect(hasGradeContrast([g(null), g(null), g(null)])).toBe(false)
  })

  /*
   * '값이 있는가' 가 아니라 '값이 두 가지 이상인가' 로 판단하는 이유가
   * 여기 있다. B 만 모인 동아리 모임에서 20줄 전부에 'B' 가 붙으면 아무도
   * 갈라 주지 못하면서 이름만 읽기 어려워진다.
   */
  it('전원이 같은 급수면 띄우지 않는다 — 아무도 갈라 주지 못한다', () => {
    expect(hasGradeContrast([g('B'), g('B'), g('B')])).toBe(false)
  })

  it('급수가 섞여 있으면 띄운다', () => {
    expect(hasGradeContrast([g('S'), g('B')])).toBe(true)
  })

  it("일부만 급수가 있으면 그것이 곧 대비다 — null 도 한 가지 값으로 센다", () => {
    expect(hasGradeContrast([g('B'), g(null)])).toBe(true)
  })

  it('빈 명단은 띄울 것이 없다', () => {
    expect(hasGradeContrast([])).toBe(false)
  })
})
