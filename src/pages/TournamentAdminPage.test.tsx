import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TournamentAdminPage } from './TournamentAdminPage'
import type { MemberSummary } from '@/features/tournament/api'

/**
 * 관리 화면이 하위 화면으로 나뉘면서 생긴 위험을 지킨다.
 *
 * 하나 — 주소가 틀리면 주말 대회장에서 관리자가 코트를 못 고친다.
 * 링크는 타입이 없다. 오타를 잡아 주는 게 아무것도 없어서 눌러 봐야 안다.
 *
 * 둘 — 관리자가 아닌 사람이 주소를 직접 치고 들어오는 걸 막는다.
 * 진짜 벽은 RLS 지만, 화면이 열리면 눌러본 뒤에야 오류를 보게 된다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

const gate = {
  loading: false,
  denied: false,
  me: { id: 'm1', userId: 'u1', displayName: '나', role: 'owner', groupId: 'g1' },
  members: [
    { id: 'm1', userId: 'u1', displayName: '나', role: 'owner', groupId: 'g1' },
    { id: 'm2', userId: 'u2', displayName: '둘', role: 'player', groupId: null },
  ] as MemberSummary[],
}

vi.mock('@/features/admin/useAdminGate', () => ({
  useAdminGate: () => gate,
}))

const idle = { isPending: false, error: null, mutate: vi.fn(), mutateAsync: vi.fn() }

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => ({
    data: { name: '목요 정기전', status: 'draft', invite_code: 'ABC123' },
  }),
  useGroups: () => ({ data: [{ id: 'g1', name: '1조', is_joker: true }] }),
  useCourts: () => ({ data: [{ id: 'c1' }, { id: 'c2' }] }),
  useRenameTournament: () => idle,
  useSetTournamentStatus: () => idle,
  useRegenerateInviteCode: () => idle,
}))

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/admin`]}>
      <Routes>
        <Route path="/t/:id/admin" element={<TournamentAdminPage />} />
        <Route path="/t/:id" element={<h1>대회 화면</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  gate.loading = false
  gate.denied = false
})

describe('관리 허브', () => {
  test('구성 메뉴가 조 · 코트 · 참가자 · 규칙 네 화면으로 간다', () => {
    renderAdmin()
    const nav = screen.getByRole('navigation', { name: '대회 구성' })
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))

    // 순서까지 본다 — 조를 짜고 코트를 놓고 사람을 배정하는 순서다.
    // 경기 규칙은 한 번 정해 두면 다시 안 여는 화면이라 맨 뒤다.
    expect(hrefs).toEqual([
      `/t/${TOURNAMENT_ID}/admin/groups`,
      `/t/${TOURNAMENT_ID}/admin/courts`,
      `/t/${TOURNAMENT_ID}/admin/members`,
      `/t/${TOURNAMENT_ID}/admin/rules`,
    ])
  })

  test('목록은 화면에 펼치지 않는다 — 메뉴로만 보낸다', () => {
    renderAdmin()
    // 참가자 이름이 여기 보이면 목록이 다시 딸려 들어온 것이다
    expect(screen.queryByText('둘')).not.toBeInTheDocument()
  })

  test('조 없는 참가자가 있으면 시작을 막고 배정 화면으로 안내한다', () => {
    renderAdmin()
    expect(screen.getByRole('button', { name: /대회 시작/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: '참가자에서 배정' })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/admin/members`,
    )
  })

  test('관리자가 아니면 대회 화면으로 돌려보낸다', () => {
    gate.denied = true
    renderAdmin()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('대회 화면')
  })

  test('판단 전에는 쫓아내지 않는다', () => {
    gate.loading = true
    renderAdmin()
    // 로딩 중에 리다이렉트하면 새로고침마다 대회 화면으로 튕긴다
    expect(screen.queryByText('대회 화면')).not.toBeInTheDocument()
  })
})
