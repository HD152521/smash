import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HomePage } from './HomePage'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 메인 화면의 책임은 **오늘을 보여주는 것 하나**다.
 *
 * 처음에는 "어디로 갈지 고르는 곳" 이었는데, 찍어 보니 흰 카드가 쌓인
 * 목록이고 정보가 0 이었다(`docs/ui-redesign.md`). 책임을 바꿨다.
 *
 * 여기서 지키는 것 넷.
 *
 * 하나 — **문 넷은 서버와 무관하게 항상 있어야 한다.** 오늘 요약이 못
 * 와도(회선 끊김·오류) 모임 열기·대회 만들기·참가하기·내 목록은 멀쩡히
 * 눌려야 한다. 요약 한 칸 때문에 첫 화면이 멈추면 체육관에서 아무것도
 * 못 한다.
 *
 * 둘 — **하나만 고른다.** 진행 중인 것이 여럿이어도 하나다. 셋을 나란히
 * 놓으면 그건 다시 목록이고, 목록은 「내 목록」이 할 일이다.
 *
 * 셋 — **여기서 점수를 그리지 않는다.** 요약은 이름·시각·참가 인원까지다.
 * 점수가 올라오기 시작하면 대회 화면이 할 일을 여기서 반쯤 하는 것이고,
 * 두 화면이 같은 것을 다르게 보여주기 시작한다.
 *
 * 넷 — **아무것도 없는 날이 기본이다.** 그때 화면이 텅 비면 안 된다.
 */

const state = {
  data: undefined as MyTournament[] | undefined,
  isPending: false,
  members: undefined as { rsvp: string; userId: string | null; displayName?: string }[] | undefined,
  matches: undefined as unknown[] | undefined,
  courts: undefined as unknown[] | undefined,
}

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: '안용식@example.com' }, signOut: vi.fn() }),
}))

vi.mock('@/features/tournament/queries', () => ({
  useMyTournaments: () => ({ data: state.data, isPending: state.isPending }),
  useMembers: () => ({ data: state.members, isPending: false, error: null }),
  // 진행 중 카드의 "내 다음 경기" 한 줄이 쓰는 것들. 기본은 안 온 상태다 —
  // 그때 줄을 안 그리는 것이 규칙이다.
  useMatches: () => ({ data: state.matches, isPending: false, error: null }),
  useCourts: () => ({ data: state.courts, isPending: false, error: null }),
}))

function tournament(over: Partial<MyTournament> = {}): MyTournament {
  return {
    id: 't1',
    name: '화요일 정기모임',
    description: null,
    kind: 'session',
    status: 'live',
    inviteCode: 'ABC123',
    role: 'member',
    groupId: null,
    joinedAt: '2026-08-24',
    clubId: null,
    startsAt: null,
    ...over,
  }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.data = []
  state.isPending = false
  state.members = undefined
  state.matches = undefined
  state.courts = undefined
  // 화면이 마운트 시각으로 "오늘/내일" 을 센다. 날짜를 고정하지 않으면
  // 이 파일이 실제 오늘 날짜에 따라 흔들린다.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-27T12:00:00+09:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('문은 언제나 열려 있다', () => {
  test('오늘 아무것도 없어도 갈 수 있는 곳 넷이 전부 있다', () => {
    renderHome()

    expect(screen.getByRole('link', { name: /모임 열기/ })).toHaveAttribute('href', '/new/session')
    expect(screen.getByRole('link', { name: /대회 만들기/ })).toHaveAttribute('href', '/new')
    expect(screen.getByRole('link', { name: /대회 참가하기/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /내 목록/ })).toHaveAttribute('href', '/my')
  })

  test('목록을 못 받아 와도(undefined) 화면이 멈추지 않는다', () => {
    state.data = undefined

    renderHome()

    // 오류 문구를 띄우지 않는다. 아래 문으로 같은 곳에 갈 수 있다.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('link', { name: /모임 열기/ })).toBeInTheDocument()
  })

  test('불러오는 동안에도 문 넷은 이미 눌린다', () => {
    state.isPending = true

    renderHome()

    expect(screen.getByRole('link', { name: /모임 열기/ })).toBeInTheDocument()
  })
})

describe('오늘 — 하나만 고른다', () => {
  test('진행 중인 것이 있으면 그 하나를 보여준다', () => {
    state.data = [tournament({ id: 'abc', name: '화요일 정기모임', status: 'live' })]

    renderHome()

    const card = screen.getByRole('link', { name: /화요일 정기모임/ })
    expect(card).toHaveAttribute('href', '/t/abc')
    expect(card).toHaveTextContent('진행 중')
  })

  test('진행 중이 셋이어도 카드는 하나뿐이다 — 나머지는 내 목록이 할 일이다', () => {
    state.data = ['a', 'b', 'c'].map((id) => tournament({ id, name: `${id} 모임`, status: 'live' }))

    renderHome()

    expect(screen.getByRole('link', { name: /a 모임/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /b 모임/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /c 모임/ })).toBeNull()
  })

  test('진행 중이 없으면 가장 가까운 다음 모임을 시각과 함께', () => {
    state.data = [
      tournament({
        id: 'next',
        name: '수요일 모임',
        status: 'draft',
        startsAt: '2026-08-28T20:00:00+09:00',
      }),
    ]

    renderHome()

    const card = screen.getByRole('link', { name: /수요일 모임/ })
    expect(card).toHaveTextContent('내일')
    expect(card).toHaveTextContent('20:00')
  })

  test('참가 인원이 왔으면 몇 명인지 보여준다', () => {
    state.data = [
      tournament({ id: 'next', status: 'draft', startsAt: '2026-08-28T20:00:00+09:00' }),
    ]
    state.members = [
      { rsvp: 'going', userId: 'u1' },
      { rsvp: 'going', userId: 'u2' },
      { rsvp: 'invited', userId: 'u3' },
    ]

    renderHome()

    expect(screen.getByText(/2명/)).toBeInTheDocument()
    expect(screen.getByText(/1명 미정/)).toBeInTheDocument()
  })

  test('참가 인원을 아직 모르면 그 줄을 안 그린다 — "0명" 은 사실이 아니다', () => {
    state.data = [
      tournament({ id: 'next', status: 'draft', startsAt: '2026-08-28T20:00:00+09:00' }),
    ]
    state.members = undefined

    renderHome()

    expect(screen.queryByText(/명 참가/)).toBeNull()
  })

  test('여기서 점수를 그리지 않는다', () => {
    // 요약이지 점수판이 아니다. 점수는 대회 화면의 일이다.
    state.data = [tournament({ id: 'a', name: '화요일 정기모임', status: 'live' })]

    renderHome()

    const card = screen.getByRole('link', { name: /화요일 정기모임/ })
    expect(card.textContent).not.toMatch(/\d+\s*[:：]\s*\d+/)
  })
})

describe('아무것도 없는 날 — 이게 기본 상태다', () => {
  test('텅 비지 않고 무엇을 하면 되는지 말해 준다', () => {
    state.data = []

    renderHome()

    expect(screen.getByText('오늘 예정된 모임이 없습니다')).toBeInTheDocument()
    expect(screen.getByText(/모임을 열거나 코드로 참가/)).toBeInTheDocument()
  })

  test('이번 달에 나온 적이 있으면 그 횟수를 보여준다', () => {
    // 끝난 모임만 있는 날. 갈 곳은 없지만 보여줄 것은 있다.
    state.data = [
      tournament({ id: 'a', status: 'finished', startsAt: '2026-08-05T20:00:00+09:00' }),
      tournament({ id: 'b', status: 'finished', startsAt: '2026-08-19T20:00:00+09:00' }),
    ]

    renderHome()

    expect(screen.getByText(/이번 달에 2번/)).toBeInTheDocument()
  })
})

describe('진행 중일 때 — 내 차례 한 줄', () => {
  const LIVE = [tournament({ id: 'live1', name: '오늘 모임', status: 'live' })]

  test('편성이 있으면 코트와 앞에 몇 경기인지 보여준다', () => {
    state.data = LIVE
    state.members = [{ rsvp: 'going', userId: 'u1', displayName: '나' }]
    state.courts = [{ id: 'c1', name: '3번 코트' }]
    state.matches = [
      {
        id: 'm1',
        status: 'scheduled',
        court_id: 'c1',
        queue_order: 1,
        players_a: ['남'],
        players_b: ['남2'],
      },
      {
        id: 'm2',
        status: 'scheduled',
        court_id: 'c1',
        queue_order: 2,
        players_a: ['나'],
        players_b: ['상대'],
      },
    ]

    renderHome()

    expect(screen.getByText(/3번 코트 · 앞에 1경기/)).toBeInTheDocument()
  })

  test('내 편성이 없으면 줄 자체를 안 그린다', () => {
    // 빈 줄을 남기면 "내 경기가 사라졌나" 로 읽힌다.
    state.data = LIVE
    state.members = [{ rsvp: 'going', userId: 'u1', displayName: '나' }]
    state.courts = [{ id: 'c1', name: '3번 코트' }]
    state.matches = [
      {
        id: 'm1',
        status: 'scheduled',
        court_id: 'c1',
        queue_order: 1,
        players_a: ['남'],
        players_b: ['남2'],
      },
    ]

    renderHome()

    expect(screen.queryByText(/앞에/)).toBeNull()
    expect(screen.queryByText(/코트가 정해지지/)).toBeNull()
  })

  test('경기 목록이 아직 안 왔으면 줄을 안 그린다 — 화면은 멀쩡히 뜬다', () => {
    state.data = LIVE
    state.matches = undefined

    renderHome()

    expect(screen.getByRole('link', { name: /오늘 모임/ })).toBeInTheDocument()
    expect(screen.queryByText(/앞에/)).toBeNull()
  })
})
