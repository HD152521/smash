import { describe, expect, test } from 'vitest'
import {
  buildMonthGrid,
  cellLabel,
  cellMarks,
  clubHorizons,
  clubSlot,
  dayKey,
  fromMonthIndex,
  isBeyondHorizon,
  itemsOnDay,
  keyLabel,
  monthIndex,
  monthRange,
  scheduleHorizon,
  shapeForSlot,
  toCalendarItems,
  toneForSlot,
  withinNextDays,
  type CalendarItem,
} from './calendar'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 캘린더가 지켜야 하는 것 셋.
 *
 *  1. **날짜 경계** — 밤 늦은 모임과 새벽 모임이 맞는 칸에 찍힌다(한국 시간).
 *     UTC 로 자르면 새벽 모임이 하루 앞 칸으로 밀린다.
 *  2. **격자가 안 깨진다** — 1일이 무슨 요일이든, 말일이 며칠이든.
 *  3. **빈칸이 "없음" 을 주장하지 않는다** — 지평선 밖은 흐려야 한다.
 *
 * 시간대는 `vite.config.ts` 에서 Asia/Seoul 로 못 박아 뒀다. 그게 없으면
 * 아래 경계 테스트는 도는 기기에 따라 답이 달라진다.
 */

const NOW = new Date('2026-09-03T12:00:00+09:00') // 목요일

function t(over: Partial<MyTournament> = {}): MyTournament {
  return {
    id: 't1',
    name: '화요일 모임',
    description: null,
    kind: 'session',
    status: 'live',
    inviteCode: 'ABC123',
    role: 'member',
    groupId: null,
    joinedAt: '2026-08-01T00:00:00Z',
    clubId: 'club-a',
    startsAt: null,
    ...over,
  }
}

function item(over: Partial<CalendarItem> = {}): CalendarItem {
  const at = over.at ?? new Date('2026-09-08T20:00:00+09:00')
  return {
    id: 'i1',
    name: '모임',
    kind: 'session',
    clubId: 'club-a',
    at,
    key: dayKey(at),
    ...over,
  }
}

describe('날짜 경계 — 한국 시간 기준으로 칸을 나눈다', () => {
  test('밤 11시 모임은 그 날 칸이다', () => {
    expect(dayKey(new Date('2026-09-08T23:30:00+09:00'))).toBe('2026-09-08')
  })

  test('⚠ 새벽 1시 모임은 그 날 칸이다 — UTC 로 자르면 전날로 밀린다', () => {
    // 같은 순간을 UTC 로 읽으면 2026-09-07 16:00 이다. toISOString().slice(0,10)
    // 을 썼다면 여기서 '2026-09-07' 이 나온다.
    const at = new Date('2026-09-08T01:00:00+09:00')
    expect(at.toISOString().slice(0, 10)).toBe('2026-09-07')
    expect(dayKey(at)).toBe('2026-09-08')
  })

  test('자정 정각은 그 날의 첫 칸이다', () => {
    expect(dayKey(new Date('2026-09-08T00:00:00+09:00'))).toBe('2026-09-08')
  })

  test('한 자리 월·일도 두 자리로 채운다 — 문자열 비교로 앞뒤를 가리기 때문', () => {
    expect(dayKey(new Date('2026-01-05T09:00:00+09:00'))).toBe('2026-01-05')
    expect('2026-01-05' < '2026-01-12').toBe(true)
    expect('2026-09-30' < '2026-10-01').toBe(true)
  })
})

describe('내 목록에서 캘린더 일정 뽑기', () => {
  test('시각이 없는 즉석 모임은 안 찍는다 — 앉을 칸이 없다', () => {
    expect(toCalendarItems([t({ startsAt: null })])).toEqual([])
  })

  test('못 읽는 값도 버린다', () => {
    expect(toCalendarItems([t({ startsAt: '어제쯤' })])).toEqual([])
  })

  test('시각 순으로 준다', () => {
    const items = toCalendarItems([
      t({ id: 'late', startsAt: '2026-09-10T20:00:00+09:00' }),
      t({ id: 'early', startsAt: '2026-09-08T20:00:00+09:00' }),
    ])
    expect(items.map((i) => i.id)).toEqual(['early', 'late'])
  })

  test('대회도 시각이 있으면 실린다 — 지금 서버가 안 주더라도 조용히 빠뜨리지 않는다', () => {
    const items = toCalendarItems([
      t({ kind: 'tournament', startsAt: '2026-09-19T09:00:00+09:00' }),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]!.kind).toBe('tournament')
  })
})

describe('지평선 — 빈칸을 어디까지 믿을 수 있는가', () => {
  test('동아리가 없으면 빈칸은 정말 빈칸이다', () => {
    expect(scheduleHorizon([], [item()])).toEqual({ kind: 'open' })
    expect(isBeyondHorizon('2099-01-01', { kind: 'open' })).toBe(false)
  })

  test('동아리는 있는데 날짜 있는 일정이 하나도 없으면 어떤 칸도 못 믿는다', () => {
    expect(scheduleHorizon(['club-a'], [])).toEqual({ kind: 'none' })
    expect(isBeyondHorizon('2026-09-03', { kind: 'none' })).toBe(true)
  })

  test('한 동아리라도 일정이 없으면 전체가 미확정이다', () => {
    const items = [item({ clubId: 'club-a', at: new Date('2026-09-30T20:00:00+09:00') })]
    expect(scheduleHorizon(['club-a', 'club-b'], items)).toEqual({ kind: 'none' })
  })

  test('⚠ 가장 이른 동아리에 맞춘다 — 늦게 만드는 쪽의 빈칸이 거짓말하지 않게', () => {
    const items = [
      item({ id: 'a', clubId: 'club-a', at: new Date('2026-09-30T20:00:00+09:00') }),
      item({ id: 'b', clubId: 'club-b', at: new Date('2026-09-05T20:00:00+09:00') }),
    ]
    expect(scheduleHorizon(['club-a', 'club-b'], items)).toEqual({
      kind: 'until',
      key: '2026-09-05',
    })
  })

  test('지평선 밖은 흐리고, 안은 그대로다', () => {
    const h = { kind: 'until', key: '2026-09-05' } as const
    expect(isBeyondHorizon('2026-09-05', h)).toBe(false)
    expect(isBeyondHorizon('2026-09-06', h)).toBe(true)
    expect(isBeyondHorizon('2026-08-31', h)).toBe(false)
  })

  test('소속 없는 일정은 지평선을 밀지 않는다 — 기다릴 총무가 없다', () => {
    const items = [
      item({ id: 'club', clubId: 'club-a', at: new Date('2026-09-05T20:00:00+09:00') }),
      item({ id: 'solo', clubId: null, at: new Date('2026-12-25T20:00:00+09:00') }),
    ]
    expect(scheduleHorizon(['club-a'], items)).toEqual({ kind: 'until', key: '2026-09-05' })
  })

  test('범례에 쓸 동아리별 마지막 날', () => {
    const items = [
      item({ id: 'a1', clubId: 'club-a', at: new Date('2026-09-08T20:00:00+09:00') }),
      item({ id: 'a2', clubId: 'club-a', at: new Date('2026-09-15T20:00:00+09:00') }),
    ]
    expect(clubHorizons(['club-a', 'club-b'], items)).toEqual([
      { clubId: 'club-a', lastKey: '2026-09-15' },
      { clubId: 'club-b', lastKey: null },
    ])
  })

  test('날짜 열쇠를 사람 말로', () => {
    expect(keyLabel('2026-09-05')).toBe('9월 5일')
    expect(keyLabel('2026-12-25')).toBe('12월 25일')
    expect(keyLabel('없음')).toBeNull()
  })
})

describe('달 격자 — 1일이 무슨 요일이든 안 깨진다', () => {
  const OPEN = { kind: 'open' } as const

  test('주는 늘 7칸이고, 첫 칸은 월요일이다', () => {
    for (const [y, m] of [
      [2026, 8],
      [2026, 1],
      [2024, 1],
      [2026, 10],
      [2027, 7],
    ] as const) {
      const weeks = buildMonthGrid(y, m, [], NOW, OPEN)
      for (const w of weeks) expect(w).toHaveLength(7)
      // 첫 칸이 월요일 — Date 로 되짚어 확인한다
      const first = weeks[0]![0]!
      const d = new Date(Number(first.key.slice(0, 4)), Number(first.key.slice(5, 7)) - 1, first.date)
      expect(d.getDay()).toBe(1)
    }
  })

  test('말일이 며칠이든 그 달의 날이 하나도 안 빠진다', () => {
    for (const [y, m] of [
      [2026, 8], // 9월 30일, 화요일 시작
      [2026, 1], // 2월 28일, 일요일 시작
      [2024, 1], // 2월 29일 — 윤년
      [2026, 2], // 3월 31일, 일요일 시작 → 6주
    ] as const) {
      const weeks = buildMonthGrid(y, m, [], NOW, OPEN)
      const dates = weeks
        .flat()
        .filter((c) => c.inMonth)
        .map((c) => c.date)
      const lastDate = new Date(y, m + 1, 0).getDate()
      expect(dates).toEqual(Array.from({ length: lastDate }, (_, i) => i + 1))
    }
  })

  test('앞뒤 채움 칸은 이 달의 날이 아니다 — 격자를 네모로 두려고만 있다', () => {
    // 2026년 9월 1일은 화요일이라 앞에 한 칸(8월 31일)이 붙는다
    const weeks = buildMonthGrid(2026, 8, [], NOW, OPEN)
    expect(weeks[0]![0]).toMatchObject({ key: '2026-08-31', date: 31, inMonth: false })
    expect(weeks[0]![1]).toMatchObject({ key: '2026-09-01', date: 1, inMonth: true })
  })

  test('연·월 산술이 넘쳐도 받는다 — 부르는 쪽이 month + 1 을 넘긴다', () => {
    const weeks = buildMonthGrid(2026, 12, [], NOW, OPEN)
    const inMonth = weeks.flat().filter((c) => c.inMonth)
    expect(inMonth[0]!.key).toBe('2027-01-01')
  })

  test('오늘 칸에 표가 선다', () => {
    const weeks = buildMonthGrid(2026, 8, [], NOW, OPEN)
    const today = weeks.flat().filter((c) => c.isToday)
    expect(today).toHaveLength(1)
    expect(today[0]!.key).toBe('2026-09-03')
  })

  test('일정이 하나도 없어도 격자는 그대로 선다', () => {
    const weeks = buildMonthGrid(2026, 8, [], NOW, OPEN)
    expect(weeks.flat().every((c) => c.items.length === 0)).toBe(true)
    expect(weeks.length).toBeGreaterThan(0)
  })

  test('하루에 여럿이면 한 칸에 다 들어간다', () => {
    const at = new Date('2026-09-08T20:00:00+09:00')
    const items = [
      item({ id: 'a', clubId: 'club-a', at }),
      item({ id: 'b', clubId: 'club-b', at: new Date('2026-09-08T21:00:00+09:00') }),
    ]
    const weeks = buildMonthGrid(2026, 8, items, NOW, OPEN)
    const cell = weeks.flat().find((c) => c.key === '2026-09-08')!
    expect(cell.items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  test('⚠ 밤 늦은 모임이 다음 날 칸으로 새지 않는다', () => {
    const items = [item({ at: new Date('2026-09-08T23:30:00+09:00') })]
    const weeks = buildMonthGrid(2026, 8, items, NOW, OPEN)
    expect(weeks.flat().find((c) => c.key === '2026-09-08')!.items).toHaveLength(1)
    expect(weeks.flat().find((c) => c.key === '2026-09-09')!.items).toHaveLength(0)
  })

  test('지평선 밖 칸만 흐려진다. 점은 그래도 찍힌다', () => {
    const items = [item({ at: new Date('2026-09-20T20:00:00+09:00') })]
    const weeks = buildMonthGrid(2026, 8, items, NOW, { kind: 'until', key: '2026-09-10' })
    const cells = weeks.flat()
    expect(cells.find((c) => c.key === '2026-09-09')!.beyond).toBe(false)
    expect(cells.find((c) => c.key === '2026-09-11')!.beyond).toBe(true)
    // 지평선 밖이어도 있는 것은 보여 준다 — 없다는 주장만 거둔다
    const far = cells.find((c) => c.key === '2026-09-20')!
    expect(far.beyond).toBe(true)
    expect(far.items).toHaveLength(1)
  })

  test('이 달 밖의 채움 칸은 아무 주장도 하지 않는다', () => {
    const weeks = buildMonthGrid(2026, 8, [], NOW, { kind: 'none' })
    expect(weeks[0]![0]).toMatchObject({ inMonth: false, beyond: false })
    expect(weeks[0]![1]!.beyond).toBe(true)
  })
})

describe('칸에 그릴 표시', () => {
  test('셋까지는 그대로 그린다', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]
    expect(cellMarks(items)).toEqual({ shown: items, more: false })
  })

  test('넷부터는 셋만 그리고 더 있다고 말한다 — 개수를 속이지 않는다', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' }), item({ id: 'd' })]
    const marks = cellMarks(items)
    expect(marks.shown.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(marks.more).toBe(true)
  })

  test('빈 칸은 아무것도 안 그린다', () => {
    expect(cellMarks([])).toEqual({ shown: [], more: false })
  })
})

describe('동아리를 색 말고 무엇으로 가르는가', () => {
  const clubs = ['a', 'b', 'c', 'd']

  test('자리는 내 동아리 순서로 늘 같다 — 자리 자체가 단서다', () => {
    expect(clubSlot('a', clubs)).toBe(0)
    expect(clubSlot('c', clubs)).toBe(2)
  })

  test('소속 없는 일정은 동아리들 뒤에 온다', () => {
    expect(clubSlot(null, clubs)).toBe(4)
    // 내 동아리 목록에 없는 것(탈퇴 뒤 남은 모임 등)도 같은 자리다
    expect(clubSlot('사라진동아리', clubs)).toBe(4)
  })

  test('넷까지는 모양도 색도 전부 다르다', () => {
    const shapes = [0, 1, 2, 3].map(shapeForSlot)
    const tones = [0, 1, 2, 3].map(toneForSlot)
    expect(new Set(shapes).size).toBe(4)
    expect(new Set(tones).size).toBe(4)
  })

  test('열여섯까지 (모양, 색) 짝이 안 겹친다', () => {
    const pairs = Array.from({ length: 16 }, (_, i) => `${shapeForSlot(i)}/${toneForSlot(i)}`)
    expect(new Set(pairs).size).toBe(16)
  })
})

describe('칸을 읽어 주는 글', () => {
  const names = new Map([
    ['club-a', '화요모임'],
    ['club-b', '주말클럽'],
  ])

  test('빈 칸은 날짜만 말한다', () => {
    const cell = { key: '2026-09-09', date: 9, inMonth: true, isToday: false, beyond: false, items: [] }
    expect(cellLabel(cell, names)).toBe('9월 9일')
  })

  test('⚠ 지평선 밖 빈 칸은 "아직 안 올라왔다" 고 말한다 — 흐린 배경은 소리로 안 전해진다', () => {
    const cell = { key: '2026-09-20', date: 20, inMonth: true, isToday: false, beyond: true, items: [] }
    expect(cellLabel(cell, names)).toBe('9월 20일 · 아직 일정이 올라오지 않았습니다')
  })

  test('일정이 있으면 동아리 이름으로 말한다', () => {
    const cell = {
      key: '2026-09-08',
      date: 8,
      inMonth: true,
      isToday: false,
      beyond: false,
      items: [item({ clubId: 'club-a' }), item({ id: 'x', clubId: 'club-b' })],
    }
    expect(cellLabel(cell, names)).toBe('9월 8일 · 화요모임 모임, 주말클럽 모임')
  })

  test('소속이 없으면 일정 이름으로 말한다', () => {
    const cell = {
      key: '2026-09-08',
      date: 8,
      inMonth: true,
      isToday: false,
      beyond: false,
      items: [item({ clubId: null, name: '번개 모임' })],
    }
    expect(cellLabel(cell, names)).toBe('9월 8일 · 번개 모임 모임')
  })
})

describe('1주일 안 — 상세를 보여줄 것 고르기', () => {
  const items = toCalendarItems([
    t({ id: 'past', startsAt: '2026-09-02T20:00:00+09:00' }),
    t({ id: 'today-done', startsAt: '2026-09-03T07:00:00+09:00' }),
    t({ id: 'today-late', startsAt: '2026-09-03T23:00:00+09:00' }),
    t({ id: 'd6', startsAt: '2026-09-09T20:00:00+09:00' }),
    // 7일째 마지막 순간과 8일째 첫 순간 — 자르는 자리가 여기다
    t({ id: 'edge-in', startsAt: '2026-09-09T23:59:00+09:00' }),
    t({ id: 'edge-out', startsAt: '2026-09-10T00:00:00+09:00' }),
  ])

  test('오늘 00:00 부터 7일 뒤 00:00 직전까지', () => {
    expect(withinNextDays(items, NOW, 7).map((i) => i.id)).toEqual([
      'today-done',
      'today-late',
      'd6',
      'edge-in',
    ])
  })

  test('오늘 이미 시작한 것도 넣는다 — 밤 9시에 "오늘 없음" 은 이상하다', () => {
    const late = new Date('2026-09-03T21:00:00+09:00')
    expect(withinNextDays(items, late, 7).map((i) => i.id)).toContain('today-done')
  })

  test('하나도 없으면 빈 배열', () => {
    expect(withinNextDays([], NOW, 7)).toEqual([])
  })

  test('캘린더에서 하루를 고르면 그 칸의 것만 — 7일 밖에 있어도 닿는다', () => {
    const far = toCalendarItems([
      t({ id: 'far', startsAt: '2026-09-29T20:00:00+09:00' }),
      t({ id: 'other', startsAt: '2026-09-30T20:00:00+09:00' }),
    ])
    expect(itemsOnDay(far, '2026-09-29').map((i) => i.id)).toEqual(['far'])
    expect(itemsOnDay(far, '2026-09-28')).toEqual([])
  })
})

describe('달 넘기기 범위', () => {
  test('과거로는 안 간다 — 이번 달이 처음이다', () => {
    const { first } = monthRange(NOW, [])
    expect(first).toBe(monthIndex(2026, 8))
  })

  test('일정이 없어도 다음 달까지는 넘긴다 — 말일에 서면 이번 달에 앞이 안 남는다', () => {
    const { first, last } = monthRange(NOW, [])
    expect(last).toBe(first + 1)
  })

  test('일정이 있는 달까지 열린다', () => {
    const items = toCalendarItems([t({ startsAt: '2026-12-25T20:00:00+09:00' })])
    expect(monthRange(NOW, items).last).toBe(monthIndex(2026, 11))
  })

  test('지난 일정은 범위를 뒤로 늘리지 않는다', () => {
    const items = toCalendarItems([t({ startsAt: '2026-01-05T20:00:00+09:00' })])
    const { first, last } = monthRange(NOW, items)
    expect(last).toBe(first + 1)
  })

  test('달 번호는 연·월로 되돌아온다', () => {
    expect(fromMonthIndex(monthIndex(2026, 11))).toEqual({ year: 2026, month: 11 })
    expect(fromMonthIndex(monthIndex(2026, 12))).toEqual({ year: 2027, month: 0 })
  })
})
