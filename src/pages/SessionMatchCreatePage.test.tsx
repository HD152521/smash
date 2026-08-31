import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

/*
 * 자동 편성은 **버튼이 아니라 기본값**이다.
 *
 * 고르는 규칙 자체는 `src/lib/autoMatch.test.ts` 가 지킨다. 여기서 지키는
 * 것은 화면 쪽 약속 셋이다 — 열면 차 있는가, 근거가 보이는가, 사람이 손대면
 * 앱이 물러나는가.
 */
describe('열면 이미 채워져 있다', () => {
  test('제안이 기본값이라 곧바로 만들 수 있다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '경기 만들기' })).toBeEnabled()
  })

  test('왜 이 사람들인지 한 줄로 말한다', () => {
    renderPage()

    expect(screen.getByText(/적게 친 사람부터 골라 뒀습니다/)).toBeInTheDocument()
  })

  /*
   * 셋으로 억지 편성하지 않는다. 다섯 중 둘이 코트에 있으면 남는 건 셋뿐이라
   * 제안할 게 없고, 그때는 빈 화면이 정직하다.
   */
  test('사람이 넷에 못 미치면 아무도 안 고른 채로 연다', () => {
    matches.data = [
      match({ status: 'live', court_name: '1번 코트', players_a: ['가나'], players_b: ['나다'] }),
    ]
    renderPage()

    expect(screen.getByRole('button', { name: '4명 더 고르기' })).toBeDisabled()
    expect(screen.queryByText(/적게 친 사람부터/)).not.toBeInTheDocument()
  })
})

describe('판수를 옆에 적는다 — 제안의 근거', () => {
  test('오늘 친 사람이 있으면 이름 옆에 판수가 붙는다', () => {
    matches.data = [match({ id: 'done', status: 'finished', players_a: ['가나'] })]
    renderPage()

    expect(personButton('가나')).toHaveTextContent('1판')
    expect(personButton('다라')).toHaveTextContent('0판')
  })

  /*
   * '명단만' 배지와 같은 규율이다. 첫 경기에는 전원이 0판이라 모두에게
   * 같은 배지가 붙는데, 모두에게 붙는 배지는 배지가 아니라 배경이 된다.
   */
  test('아무도 안 쳤으면 판수를 안 그린다', () => {
    renderPage()

    expect(personButton('가나')).not.toHaveTextContent('0판')
  })
})

describe('사람이 손대면 앱이 물러난다', () => {
  test('뺀 사람은 다시 안 들어온다 — 목록이 새로 들어와도', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPage()

    await user.click(personButton('다라'))
    expect(personButton('다라')).toHaveAttribute('aria-pressed', 'false')

    // 다른 기기가 경기를 하나 만들어 목록이 새로 들어온 상황
    matches.data = [match({ id: 'new', status: 'scheduled', players_a: ['심판이'] })]
    rerender(
      <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/new-session`]}>
        <Routes>
          <Route path="/t/:id/matches/new-session" element={<SessionMatchCreatePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(personButton('다라')).toHaveAttribute('aria-pressed', 'false')
  })

  test('손댄 뒤에는 제안 안내가 사라진다 — 사람이 짠 목록 위의 변명은 잔소리다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(personButton('다라'))

    expect(screen.queryByText(/적게 친 사람부터/)).not.toBeInTheDocument()
  })
})
