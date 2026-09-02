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

describe('동아리 탭 — 언제나 목록으로', () => {
  /*
   * 한때 동아리가 하나면 그 동아리로 바로 보냈다. 탭에는 그 규칙이 안
   * 맞는다 — 늘 화면 아래에 있는 것이라 **누르기 전에 어디로 갈지 알아야**
   * 하고, 동아리 수에 따라 목적지가 달라지면 두 번째 동아리에 들어간
   * 날부터 같은 탭이 다른 곳으로 간다.
   *
   * 게다가 동아리 하나짜리 사용자는 그 바로가기 때문에 `/clubs` 에 영영
   * 못 갔다 — 거기에만 있는 '동아리 만들기 · 코드로 참가' 와 함께.
   */
  test.each([
    ['없을 때', []],
    ['하나일 때', [{ id: 'c1', name: '수요 배드민턴' }]],
    [
      '여럿일 때',
      [
        { id: 'c1', name: '수요 배드민턴' },
        { id: 'c2', name: '금요 클럽' },
      ],
    ],
  ])('%s 목록으로 간다', (_name, list) => {
    clubs.data = list
    renderAt('/')

    expect(screen.getByRole('link', { name: '동아리' })).toHaveAttribute('href', '/clubs')
  })

  test('동아리 화면에서도 탭은 목록으로 간다 — 자기 자신을 가리키지 않는다', () => {
    // 이게 깨지면 탭이 그 화면의 출구가 아니게 되고, 위쪽 이동을 다시
    // 세워야 한다(everyRouteHasAnExit 의 예외 목록이 그때 늘어난다).
    clubs.data = [{ id: 'c1', name: '수요 배드민턴' }]
    renderAt('/c/c1')

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
