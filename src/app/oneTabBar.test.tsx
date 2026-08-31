import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { AppRoutes } from './routes'

/**
 * **하단탭은 한 화면에 하나다.**
 *
 * 탭바가 둘이다 — 대회·모임 안의 `TournamentTabBar` 와 그 밖의
 * `AppTabBar`. 둘 다 `fixed inset-x-0 bottom-0 z-40` 이라 같이 뜨면
 * 그대로 겹쳐서, 밑에 깔린 쪽은 보이지도 눌리지도 않는다. 그런데 겹치는
 * 순간은 **코드로는 안 보인다** — 각자 자기 화면에서는 멀쩡하고, 라우트가
 * 어느 쪽에 속하는지가 두 파일에 나뉘어 있기 때문이다.
 *
 * 여기서 진짜 라우트 표를 렌더해서 그 경계를 확인한다. `appTabs.test.ts`
 * 는 규칙을 보고, 여기는 **조립된 결과**를 본다.
 *
 * 대회 화면들은 코드 스플리팅이라 이 시점에는 스피너뿐이다. 그래서
 * "TournamentTabBar 가 떴나" 가 아니라 **"AppTabBar 가 안 떴나"** 를
 * 본다 — 겹침은 전역탭이 남의 자리에 들어갈 때만 생긴다.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
    removeChannel: () => undefined,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', user_metadata: { name: '테스터' } },
    session: {},
    ready: true,
    signOut: vi.fn(),
  }),
}))

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'
const CLUB_ID = '33333333-3333-3333-3333-333333333333'
const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'

function renderAt(path: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** 전역 하단탭. 대회 탭바('대회 메뉴'·'모임 메뉴')와 이름으로 갈린다 */
function appTabBar() {
  return screen.queryByRole('navigation', { name: '주요 메뉴' })
}

describe('전역 하단탭이 뜬다', () => {
  test.each([
    '/',
    '/clubs',
    '/my',
    '/me',
    '/settings/alerts',
    `/c/${CLUB_ID}`,
    `/c/${CLUB_ID}/members`,
  ])('%s', (path) => {
    renderAt(path)
    expect(appTabBar()).toBeInTheDocument()
  })
})

describe('대회·모임 안에서는 전역 하단탭이 없다 — 탭바가 둘이면 겹친다', () => {
  test.each([
    `/t/${TOURNAMENT_ID}`,
    `/t/${TOURNAMENT_ID}/schedule`,
    `/t/${TOURNAMENT_ID}/members`,
    `/t/${TOURNAMENT_ID}/records`,
    `/t/${TOURNAMENT_ID}/matches/new-session`,
  ])('%s', (path) => {
    renderAt(path)
    expect(appTabBar()).toBeNull()
  })
})

describe('게스트 화면에는 없다', () => {
  /*
   * `/g/...` 는 로그인 가드 밖의 두 화면이다. 계정이 없는 사람에게 `/` 는
   * 메인이 아니라 로그인 화면이라, 탭 넷이 전부 출구처럼 생긴 막다른 길이
   * 된다 — `guestScreensHaveNoHome.test.tsx` 가 홈 버튼에 대해 지키는 것과
   * 같은 규칙이다.
   */
  test.each([`/g/${GUEST_CODE}`, `/g/${GUEST_CODE}/44444444-4444-4444-4444-444444444444`])(
    '%s',
    (path) => {
      renderAt(path)
      expect(appTabBar()).toBeNull()
    },
  )
})

describe('작업 화면에는 없다 — 탭으로 새면 입력한 것이 사라진다', () => {
  test.each(['/new', '/new/session', '/join', '/clubs/new', '/clubs/join'])('%s', (path) => {
    renderAt(path)
    expect(appTabBar()).toBeNull()
  })
})
