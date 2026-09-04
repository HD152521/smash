import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { MonthCalendar } from './MonthCalendar'
import {
  clubHorizons,
  monthRange,
  scheduleHorizon,
  toCalendarItems,
} from '@/lib/calendar'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 🔴 **빈칸이 "없음" 을 주장하지 않는다** — 그 장치가 실제로 도는지 본다.
 *
 * `calendar.ts` 의 테스트는 *판단*(지평선을 어디에 긋나)을 지키고, 여기는
 * 그 판단이 **화면에 실제로 나타나는지**를 지킨다. 둘 다 필요하다 — 지평선을
 * 옳게 계산해 놓고 화면이 안 그리면 사용자에게는 아무 일도 안 일어난 것이다.
 *
 * 시간대는 `vite.config.ts` 에서 Asia/Seoul 로 못 박았다.
 */

const NOW = new Date('2026-09-03T12:00:00+09:00')

function t(over: Partial<MyTournament>): MyTournament {
  return {
    id: 't1',
    name: '모임',
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

const CLUB_NAMES = new Map([
  ['club-a', '화요모임'],
  ['club-b', '주말클럽'],
])

function setup(rows: MyTournament[], clubIds = ['club-a', 'club-b'], onSelect = vi.fn()) {
  const items = toCalendarItems(rows)
  render(
    <MonthCalendar
      year={2026}
      month={8}
      items={items}
      now={NOW}
      horizon={scheduleHorizon(clubIds, items)}
      clubIds={clubIds}
      clubNames={CLUB_NAMES}
      clubHorizonRows={clubHorizons(clubIds, items)}
      range={monthRange(NOW, items)}
      selectedKey={null}
      onSelectDay={onSelect}
      onMove={vi.fn()}
    />,
  )
  return { onSelect }
}

describe('빈칸이 "없음" 으로 읽히지 않게 하는 장치', () => {
  test('지평선 뒤의 빈칸은 "아직 안 만들어진 날" 이라고 읽어 준다', () => {
    setup([
      t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T20:00:00+09:00' }),
      t({ id: 'b', clubId: 'club-b', startsAt: '2026-09-05T10:00:00+09:00' }),
    ])
    // 지평선은 더 이른 쪽(주말클럽 9/5)이다
    expect(screen.getByText(/9월 5일까지 올라와 있습니다/)).toBeInTheDocument()
    expect(screen.getByText(/아직 안 만들어진 날/)).toBeInTheDocument()
  })

  test('지평선 밖 빈칸은 소리로도 그렇게 읽힌다 — 면을 빼는 것만으로는 안 들린다', () => {
    setup([t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-05T20:00:00+09:00' })], ['club-a'])
    expect(screen.getByText('9월 20일 · 아직 일정이 올라오지 않았습니다')).toBeInTheDocument()
    // 지평선 **안**의 빈칸은 그런 말을 하지 않는다
    expect(screen.getByText('9월 4일')).toBeInTheDocument()
  })

  test('아직 아무 일정도 없는 동아리는 범례가 이름을 대고 말한다', () => {
    setup([t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T20:00:00+09:00' })])
    const legend = screen.getByText('주말클럽').closest('li')!
    expect(within(legend).getByText('아직 일정 없음')).toBeInTheDocument()
  })

  test('동아리가 없으면 빈칸은 정말 빈칸이라 경고하지 않는다', () => {
    setup([t({ id: 'a', clubId: null, startsAt: '2026-09-08T20:00:00+09:00' })], [])
    expect(screen.queryByText(/아직 안 만들어진 날/)).not.toBeInTheDocument()
  })
})

describe('격자가 말하는 것', () => {
  test('일정이 있는 날은 동아리 이름으로 읽힌다 — 점만으로는 누구 것인지 모른다', () => {
    setup([
      t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T20:00:00+09:00' }),
      t({ id: 'b', clubId: 'club-b', startsAt: '2026-09-08T10:00:00+09:00' }),
    ])
    expect(screen.getByText('9월 8일 · 주말클럽 모임, 화요모임 모임')).toBeInTheDocument()
  })

  test('⚠ 밤 11시 모임이 다음 날 칸으로 새지 않는다', () => {
    setup([t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T23:30:00+09:00' })], ['club-a'])
    expect(screen.getByText('9월 8일 · 화요모임 모임')).toBeInTheDocument()
    // 다음 날 칸에는 아무 일정도 안 실린다 (지평선 밖이라 그 말만 남는다)
    expect(screen.queryByText(/^9월 9일 · 화요모임/)).not.toBeInTheDocument()
  })

  test('요일 머리가 월요일부터 선다', () => {
    setup([])
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })
})

describe('하루를 골라 아래에서 펼친다', () => {
  test('일정이 있는 날만 누를 수 있다 — 빈 칸이 눌리면 "안 열린다" 로 읽힌다', () => {
    setup([t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T20:00:00+09:00' })], ['club-a'])
    const buttons = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes('9월'))
      .map((b) => b.textContent)
    expect(buttons).toEqual(['8' + '9월 8일 · 화요모임 모임'])
  })

  test('누르면 그 날을 위로 올린다', async () => {
    const { onSelect } = setup(
      [t({ id: 'a', clubId: 'club-a', startsAt: '2026-09-08T20:00:00+09:00' })],
      ['club-a'],
    )
    await userEvent.click(screen.getByRole('button', { name: /9월 8일/ }))
    expect(onSelect).toHaveBeenCalledWith('2026-09-08')
  })

  test('지난 달로는 못 넘어간다 — 이 탭의 질문은 앞으로다', () => {
    setup([])
    expect(screen.getByRole('button', { name: '지난 달' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled()
  })
})
