import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { HomePage } from './HomePage'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 메인 화면의 책임은 **어디로 갈지 고르는 것 하나**다. 그 하나가 깨지는
 * 자리를 지킨다.
 *
 * 하나 — **문 넷은 서버와 무관하게 항상 있어야 한다.** 진행 중 목록은
 * 지름길일 뿐이고, 그게 못 와도(회선 끊김·오류) 참가·모임 열기·대회
 * 만들기·내 목록은 멀쩡히 눌려야 한다. 지름길 하나 때문에 첫 화면이
 * 통째로 멈추면 체육관에서 아무것도 못 한다.
 *
 * 둘 — **여기서 점수를 그리지 않는다.** 진행 중 칸은 이름과 "들어가기"
 * 뿐이다. 점수가 올라오기 시작하면 대회 화면이 할 일을 여기서 반쯤 하는
 * 것이고, 두 화면이 같은 것을 다르게 보여주기 시작한다.
 */

const state = {
  data: undefined as MyTournament[] | undefined,
  isPending: false,
}

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: '안용식@example.com' }, signOut: vi.fn() }),
}))

vi.mock('@/features/tournament/queries', () => ({
  useMyTournaments: () => state,
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
})

describe('메인 — 문은 언제나 열려 있다', () => {
  test('진행 중인 것이 없어도 갈 수 있는 곳 넷이 전부 있다', () => {
    renderHome()

    expect(screen.getByRole('link', { name: /대회 참가하기/ })).toHaveAttribute('href', '/join')
    expect(screen.getByRole('link', { name: /모임 열기/ })).toHaveAttribute('href', '/new/session')
    expect(screen.getByRole('link', { name: /대회 만들기/ })).toHaveAttribute('href', '/new')
    expect(screen.getByRole('link', { name: /내 목록/ })).toHaveAttribute('href', '/my')
  })

  test('목록을 못 받아 와도(undefined) 화면이 멈추지 않는다', () => {
    // 지름길이 막힌 것뿐이다. 아래 문 넷으로 같은 곳에 갈 수 있어야 한다.
    state.data = undefined

    renderHome()

    expect(screen.getByRole('link', { name: /대회 참가하기/ })).toBeInTheDocument()
    expect(screen.queryByText('진행 중')).toBeNull()
  })

  test('불러오는 동안에도 문 넷은 이미 눌린다', () => {
    state.isPending = true

    renderHome()

    expect(screen.getByRole('link', { name: /모임 열기/ })).toBeInTheDocument()
  })
})

describe('메인 — 진행 중 지름길', () => {
  test('진행 중인 모임이 있으면 그 대회 주소로 바로 가는 줄이 생긴다', () => {
    state.data = [tournament({ id: 'abc', name: '화요일 정기모임' })]

    renderHome()

    const row = screen.getByRole('link', { name: /화요일 정기모임/ })
    expect(row).toHaveAttribute('href', '/t/abc')
    expect(row).toHaveTextContent('모임')
  })

  test('끝났거나 준비중인 것은 지름길에 올라오지 않는다', () => {
    // 지름길의 뜻은 "지금 가면 되는 곳" 이다. 준비중인 대회를 여기 올리면
    // 눌러 들어간 사람이 빈 화면을 보고 고장으로 읽는다.
    state.data = [
      tournament({ id: 'a', name: '지난 정기전', status: 'finished' }),
      tournament({ id: 'b', name: '준비중 대회', status: 'draft' }),
    ]

    renderHome()

    expect(screen.queryByText('진행 중')).toBeNull()
    expect(screen.queryByRole('link', { name: /지난 정기전/ })).toBeNull()
  })

  test('진행 중이 넷이어도 셋까지만 — 나머지는 목록 화면이 할 일이다', () => {
    state.data = ['a', 'b', 'c', 'd'].map((id) =>
      tournament({ id, name: `${id} 모임`, status: 'live' }),
    )

    renderHome()

    expect(screen.getByRole('link', { name: /a 모임/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /d 모임/ })).toBeNull()
  })

  test('대회와 모임을 글자로 구별한다 — 색만으로 가르지 않는다', () => {
    state.data = [tournament({ id: 'a', name: '봄 정기전', kind: 'tournament' })]

    renderHome()

    expect(screen.getByRole('link', { name: /봄 정기전/ })).toHaveTextContent('대회')
  })

  test('진행 중 칸에 점수를 그리지 않는다', () => {
    // 여기는 문이지 현황판이 아니다. 점수는 대회 화면의 일이다.
    state.data = [tournament({ id: 'a', name: '화요일 정기모임' })]

    renderHome()

    const row = screen.getByRole('link', { name: /화요일 정기모임/ })
    expect(row.textContent).not.toMatch(/\d+\s*[:：]\s*\d+/)
  })
})
