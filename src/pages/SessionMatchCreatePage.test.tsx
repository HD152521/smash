import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SessionMatchCreatePage } from './SessionMatchCreatePage'
import { COURT, MEMBERS, TOURNAMENT, TOURNAMENT_ID } from '@/test/matchFixtures'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 모임 경기 짜기 화면의 한 가지 약속:
 *
 *   **다른 경기에 묶인 사람은 고를 수 없다. 그런데 사라지지도 않는다.**
 *
 * 코트에서 나는 사고가 이거였다 — 방금 1번 코트에 넣은 사람이 다음 경기
 * 후보에 그대로 남아 있어 또 넣게 되고, 그 사람은 두 코트에서 동시에 불려
 * 간다. 반대로 명단에서 통째로 지워 버리면 "쟤 어디 갔지" 가 되므로,
 * 잠그되 어디에 있는지를 화면이 말해야 한다.
 */

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const create = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }
const matches = { data: [] as MatchOverviewRow[] }

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => ({ data: { ...TOURNAMENT, kind: 'session' } }),
  useMembers: () => ({ data: MEMBERS }),
  useCourts: () => ({ data: [COURT] }),
  useMatches: () => matches,
  useCreateSessionMatch: () => create,
}))

/** 이 화면이 보는 칸만 채운다 */
function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'match-1',
    tournament_id: TOURNAMENT_ID,
    court_id: null,
    court_name: null,
    status: 'scheduled',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/new-session`]}>
      <Routes>
        <Route path="/t/:id/matches/new-session" element={<SessionMatchCreatePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 이름이 든 사람 칸 하나 — 잠긴 칸은 aria-label 이 사정까지 담는다 */
function personButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}( —|$)`) })
}

beforeEach(() => {
  create.mutateAsync = vi.fn().mockResolvedValue({})
  create.error = null
  matches.data = []
})

describe('다른 경기에 묶인 사람', () => {
  test('진행 중인 경기의 선수는 고를 수 없다', () => {
    matches.data = [
      match({ status: 'live', court_name: '1번 코트', players_a: ['가나'], players_b: ['나다'] }),
    ]
    renderPage()

    expect(personButton('가나')).toBeDisabled()
    expect(personButton('나다')).toBeDisabled()
    // 안 묶인 사람은 그대로 고를 수 있다
    expect(personButton('다라')).toBeEnabled()
  })

  test('대기 중인 경기의 선수도 고를 수 없다', () => {
    matches.data = [match({ status: 'scheduled', court_name: '2번 코트', players_a: ['다라'] })]
    renderPage()

    expect(personButton('다라')).toBeDisabled()
    // 뛰는 중과 구분해 적는다 — 대기는 그 경기를 지우면 풀린다
    expect(personButton('다라')).toHaveTextContent('2번 코트 대기')
  })

  test('끝난 경기 · 무효 경기의 선수는 다시 고를 수 있다', () => {
    matches.data = [
      match({ id: 'm1', status: 'finished', court_name: '1번 코트', players_a: ['가나'] }),
      match({ id: 'm2', status: 'void', court_name: '2번 코트', players_a: ['나다'] }),
    ]
    renderPage()

    expect(personButton('가나')).toBeEnabled()
    expect(personButton('나다')).toBeEnabled()
  })
})

describe('사라지지 않고 잠긴다', () => {
  test('묶인 사람도 명단에 그대로 남는다', () => {
    matches.data = [match({ status: 'live', court_name: '1번 코트', players_a: ['가나'] })]
    renderPage()

    expect(personButton('가나')).toBeInTheDocument()
  })

  test('어느 코트에 있는지를 옆에 적는다 — "쟤 어디 갔지" 에 화면이 답한다', () => {
    matches.data = [match({ status: 'live', court_name: '1번 코트', players_a: ['가나'] })]
    renderPage()

    expect(personButton('가나')).toHaveTextContent('1번 코트')
    expect(personButton('가나')).toHaveAccessibleName(/1번 코트에서 경기 중이라 고를 수 없습니다/)
  })

  test('코트를 아직 안 정한 대기 경기는 상태만 말한다', () => {
    matches.data = [match({ status: 'scheduled', court_name: null, players_a: ['가나'] })]
    renderPage()

    expect(personButton('가나')).toHaveTextContent('대기 중')
  })

  test('몇 명이 못 고르는 상태인지 한 줄로 미리 말해 준다', () => {
    matches.data = [
      match({ status: 'live', court_name: '1번 코트', players_a: ['가나'], players_b: ['나다'] }),
    ]
    renderPage()

    expect(screen.getByText(/2명은 다른 경기에 들어가 있어 고를 수 없습니다/)).toBeInTheDocument()
  })

  test('아무도 안 묶여 있으면 그 안내를 띄우지 않는다', () => {
    renderPage()

    expect(screen.queryByText(/다른 경기에 들어가 있어/)).not.toBeInTheDocument()
  })
})
