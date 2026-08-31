import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { AppTabBar } from './AppTabBar'

/**
 * 전역 하단탭이 실제로 무엇을 그리는가.
 *
 * 어느 주소에서 뜨는지는 `appTabs.test.ts` 가 규칙으로 지킨다. 여기서는
 * **그려진 것**을 본다 — 문 넷이 정말 열려 있나, 지금 있는 곳이 표시되나,
 * 동아리가 하나뿐인 사람이 목록을 한 번 더 보지 않나.
 */
const auth = { user: { id: 'u1' } as { id: string } | null }
const clubs = { data: [] as { id: string; name: string }[] }

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/features/club/queries', () => ({ useMyClubs: () => clubs }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppTabBar />
    </MemoryRouter>,
  )
}

describe('문 넷은 어느 화면에서든 열려 있다', () => {
  test('홈 · 동아리 · 내 목록 · 나', () => {
    // 홈에 쌓여 있던 링크 목록이 여기로 내려왔다(HomePage 주석). 그러니
    // 여기서 하나라도 빠지면 그 화면으로 가는 길이 통째로 사라진다.
    clubs.data = []
    renderAt('/')

    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '동아리' })).toHaveAttribute('href', '/clubs')
    expect(screen.getByRole('link', { name: '내 목록' })).toHaveAttribute('href', '/my')
    expect(screen.getByRole('link', { name: '나' })).toHaveAttribute('href', '/me')
  })

  test('탭은 넷뿐이다 — 엄지 하나가 훑는 자리다', () => {
    clubs.data = []
    renderAt('/')

    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  test('아이콘만 두지 않는다 — 글자가 항상 붙는다', () => {
    // 그림만으로 뜻을 말하지 않는다(docs/design.md). 체육관 조명 아래에서
    // 제일 먼저 무너지는 것이 색과 그림이다.
    clubs.data = []
    renderAt('/me')

    for (const label of ['홈', '동아리', '내 목록', '나']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })
})

describe('지금 있는 곳을 표시한다', () => {
  test.each([
    ['/', '홈'],
    ['/clubs', '동아리'],
    ['/c/abc/members', '동아리'],
    ['/my', '내 목록'],
    ['/settings/alerts', '나'],
  ])('%s 에서는 "%s" 가 켜진다', (path, label) => {
    clubs.data = []
    renderAt(path)

    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    // 켜진 탭은 하나뿐이다
    expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1)
  })
})

describe('동아리 탭 — 하나뿐이면 목록을 건너뛴다', () => {
  test('동아리가 하나면 바로 그 동아리로', () => {
    // 홈의 큰 초록 버튼이 쓰던 규칙 그대로다 — 고를 것이 하나뿐인 목록을
    // 한 번 더 보여주는 것은 탭만 하나 늘리는 일이다.
    clubs.data = [{ id: 'c1', name: '수요 배드민턴' }]
    renderAt('/')

    expect(screen.getByRole('link', { name: '동아리' })).toHaveAttribute('href', '/c/c1')
  })

  test('여럿이면 목록으로', () => {
    clubs.data = [
      { id: 'c1', name: '수요 배드민턴' },
      { id: 'c2', name: '금요 클럽' },
    ]
    renderAt('/')

    expect(screen.getByRole('link', { name: '동아리' })).toHaveAttribute('href', '/clubs')
  })

  test('아직 안 왔으면 목록으로 — 잘못 가는 게 아니라 한 칸 덜 가는 것이다', () => {
    clubs.data = []
    renderAt('/')

    expect(screen.getByRole('link', { name: '동아리' })).toHaveAttribute('href', '/clubs')
  })
})

describe('안 뜨는 곳', () => {
  test('로그인 전에는 아무것도 안 그린다', () => {
    const saved = auth.user
    auth.user = null
    try {
      const { container } = renderAt('/')
      expect(container).toBeEmptyDOMElement()
    } finally {
      auth.user = saved
    }
  })

  test.each(['/t/t1', '/g/ABCDEFGHJKMNPQRSTUVWX2', '/new/session'])('%s', (path) => {
    const { container } = renderAt(path)
    expect(container).toBeEmptyDOMElement()
  })
})
