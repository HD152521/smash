import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppRoutes } from './routes'

/**
 * 라우트가 실제로 렌더되는지만 본다.
 *
 * 왜 필요한가: 라우트를 코드 스플리팅으로 바꾸다가 가드 컴포넌트가
 * 자기 자신을 렌더하게 만든 적이 있다. 무한 재귀라 탭이 메모리를 다 먹고
 * 죽었는데, tsc 도 eslint 도 통과했다. 타입이 맞는 무한 재귀이기 때문이다.
 *
 * 그 버그를 잡는 가장 싼 방법이 "모든 경로를 한 번씩 렌더해 보기" 다.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => undefined }),
      subscribe: () => undefined,
    }),
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

const authState = {
  user: { id: 'u1', email: 'a@b.c', user_metadata: { name: '테스터' } },
  session: {},
  ready: true,
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithSocial: vi.fn(),
  signOut: vi.fn(),
}
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => authState,
}))

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'
const MATCH_ID = '22222222-2222-2222-2222-222222222222'

const ROUTES = [
  '/',
  '/new',
  '/join',
  '/my',
  `/t/${TOURNAMENT_ID}`,
  `/t/${TOURNAMENT_ID}/setup`,
  `/t/${TOURNAMENT_ID}/settings`,
  `/t/${TOURNAMENT_ID}/admin`,
  `/t/${TOURNAMENT_ID}/admin/groups`,
  `/t/${TOURNAMENT_ID}/admin/courts`,
  `/t/${TOURNAMENT_ID}/admin/members`,
  `/t/${TOURNAMENT_ID}/audit`,
  `/t/${TOURNAMENT_ID}/referee`,
  `/t/${TOURNAMENT_ID}/standings`,
  `/t/${TOURNAMENT_ID}/schedule`,
  `/t/${TOURNAMENT_ID}/records/00000000-0000-0000-0000-000000000001`,
  `/t/${TOURNAMENT_ID}/records`,
  `/t/${TOURNAMENT_ID}/members`,
  `/t/${TOURNAMENT_ID}/live`,
  `/t/${TOURNAMENT_ID}/matches/new`,
  `/t/${TOURNAMENT_ID}/matches/${MATCH_ID}`,
]

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('모든 경로가 렌더된다', () => {
  test.each(ROUTES)('%s', (path) => {
    // 무한 재귀면 여기서 RangeError 로 터진다
    expect(() => renderAt(path)).not.toThrow()
  })
})

describe('로그인하지 않았으면 로그인 화면으로 보낸다', () => {
  test('보호된 경로는 로그인으로 리다이렉트된다', () => {
    authState.user = null as unknown as typeof authState.user
    try {
      renderAt(`/t/${TOURNAMENT_ID}`)
      // 로그인 화면의 표제가 보이면 가드가 살아 있는 것이다
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('코트에서')
    } finally {
      authState.user = { id: 'u1', email: 'a@b.c', user_metadata: { name: '테스터' } }
    }
  })
})
