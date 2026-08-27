import { describe, expect, test } from 'vitest'
import { attendanceThisMonth, daysUntilLabel, pickTodayFocus } from './home'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 홈이 오늘 무엇을 보여줄지 고르는 판단.
 *
 * 여기서 지키는 것은 **하나만 고른다**는 것과, **셀 근거가 없는 것을 세지
 * 않는다**는 것 둘이다. 숫자가 조용히 틀리면 화면에 있는 것이 없는 것보다
 * 나쁘다.
 */

const NOW = new Date('2026-08-27T12:00:00+09:00')

function t(over: Partial<MyTournament> = {}): MyTournament {
  return {
    id: 't1',
    name: '화요일 모임',
    description: null,
    kind: 'session',
    status: 'draft',
    inviteCode: 'ABC123',
    role: 'member',
    groupId: null,
    joinedAt: '2026-08-01T00:00:00Z',
    clubId: null,
    startsAt: null,
    ...over,
  }
}

describe('오늘 보여줄 하나 고르기', () => {
  test('아무것도 없으면 null — 빈 상태는 화면이 설계한다', () => {
    expect(pickTodayFocus([], NOW)).toBeNull()
  })

  test('진행 중이 있으면 그것 하나', () => {
    const focus = pickTodayFocus([t({ id: 'a', status: 'live' })], NOW)
    expect(focus).toEqual({ kind: 'live', tournament: expect.objectContaining({ id: 'a' }) })
  })

  test('진행 중이 다음 모임보다 먼저다 — 몸이 이미 체육관에 있다', () => {
    const focus = pickTodayFocus(
      [
        t({ id: 'soon', startsAt: '2026-08-27T20:00:00+09:00' }),
        t({ id: 'now', status: 'live' }),
      ],
      NOW,
    )
    expect(focus?.tournament.id).toBe('now')
  })

  test('진행 중이 없으면 가장 가까운 다음 모임', () => {
    const focus = pickTodayFocus(
      [
        t({ id: 'far', startsAt: '2026-09-10T20:00:00+09:00' }),
        t({ id: 'near', startsAt: '2026-08-28T20:00:00+09:00' }),
      ],
      NOW,
    )
    expect(focus).toEqual({
      kind: 'upcoming',
      tournament: expect.objectContaining({ id: 'near' }),
      startsAt: '2026-08-28T20:00:00+09:00',
    })
  })

  test('이미 지난 모임은 다음이 아니다', () => {
    expect(pickTodayFocus([t({ startsAt: '2026-08-20T20:00:00+09:00' })], NOW)).toBeNull()
  })

  test('끝난 것은 고르지 않는다', () => {
    expect(
      pickTodayFocus([t({ status: 'finished', startsAt: '2026-08-28T20:00:00+09:00' })], NOW),
    ).toBeNull()
  })

  test('즉석 모임(시각 없음)은 다음이 될 수 없다 — 만든 순간이 곧 시작이다', () => {
    expect(pickTodayFocus([t({ startsAt: null })], NOW)).toBeNull()
  })

  test('못 읽는 시각은 없는 것으로 본다', () => {
    expect(pickTodayFocus([t({ startsAt: '내일쯤' })], NOW)).toBeNull()
  })
})

describe('이번 달 참석 횟수', () => {
  test('이번 달에 지난 모임만 센다', () => {
    const n = attendanceThisMonth(
      [
        t({ id: 'a', startsAt: '2026-08-05T20:00:00+09:00' }),
        t({ id: 'b', startsAt: '2026-08-19T20:00:00+09:00' }),
        t({ id: 'c', startsAt: '2026-07-29T20:00:00+09:00' }), // 지난 달
        t({ id: 'd', startsAt: '2026-08-30T20:00:00+09:00' }), // 아직 안 옴
      ],
      NOW,
    )
    expect(n).toBe(2)
  })

  test('대회는 안 센다 — 이 숫자는 모임 참석이다', () => {
    expect(
      attendanceThisMonth([t({ kind: 'tournament', startsAt: '2026-08-05T20:00:00+09:00' })], NOW),
    ).toBe(0)
  })

  test('시각 없는 즉석 모임은 안 센다 — 셀 근거가 없다', () => {
    /*
     * joinedAt 으로 세면 안 된다. 동아리 모임은 만들어질 때 회원 전원이
     * 한꺼번에 심어지므로, 그걸 세면 "내가 나온 횟수" 가 아니라
     * "동아리가 연 횟수" 가 된다.
     */
    expect(attendanceThisMonth([t({ startsAt: null, joinedAt: '2026-08-10T00:00:00Z' })], NOW)).toBe(
      0,
    )
  })
})

describe('남은 날 문구', () => {
  test.each([
    ['2026-08-27T20:00:00+09:00', '오늘'],
    ['2026-08-28T09:00:00+09:00', '내일'],
    ['2026-08-30T20:00:00+09:00', '3일 뒤'],
  ])('%s → %s', (at, want) => {
    expect(daysUntilLabel(at, NOW)).toBe(want)
  })

  test('밤 11시에 봐도 다음날 아침은 내일이다 — 시간이 아니라 날짜로 센다', () => {
    // 12시간 뒤지만 날짜가 바뀌었다. '오늘' 이라고 하면 안 된다.
    const lateNight = new Date('2026-08-27T23:00:00+09:00')
    expect(daysUntilLabel('2026-08-28T11:00:00+09:00', lateNight)).toBe('내일')
  })

  test('지난 것은 null', () => {
    expect(daysUntilLabel('2026-08-20T20:00:00+09:00', NOW)).toBeNull()
  })
})
