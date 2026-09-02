import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SessionMatchEditPage } from './SessionMatchEditPage'
import { COURT, MEMBERS, TOURNAMENT, TOURNAMENT_ID } from '@/test/matchFixtures'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 모임 경기 고치기 화면의 약속 넷.
 *
 *   1. **열면 그 경기의 선수가 들어 있다.** 자동 제안이 아니다 — 고치러
 *      들어왔는데 앱이 다른 넷을 들이밀면 무엇을 바꿨는지 알 수 없다.
 *   2. **그 경기의 선수는 안 잠긴다.** 잠기면 자기 자신 때문에 아무도 못
 *      빼고, 자리도 안 나서 고치기가 열리자마자 죽는다 (`exceptMatchId`).
 *   3. **다른 경기의 선수는 여전히 잠긴다.** 한 사람이 두 코트에 서는 사고를
 *      막는 규칙은 고치기에서도 그대로다.
 *   4. **예정 경기만 고친다.** 시작했거나 끝난 경기는 서버가 거절하므로
 *      화면도 그 길을 안 보인다.
 */

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const edit = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }
const create = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }
const matches = { data: [] as MatchOverviewRow[] }
const tournament = { data: { ...TOURNAMENT, kind: 'session' } as unknown }

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => tournament,
  useMembers: () => ({ data: MEMBERS }),
  useCourts: () => ({ data: [COURT] }),
  useMatches: () => matches,
  useCreateSessionMatch: () => create,
  useUpdateSessionMatch: () => edit,
}))

const EDIT_ID = 'match-edit'

/** 이 화면이 보는 칸만 채운다 */
function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'match-1',
    tournament_id: TOURNAMENT_ID,
    court_id: null,
    court_name: null,
    label: null,
    status: 'scheduled',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

/** 고칠 경기 — 가나·나다 대 다라·라마 */
function editing(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return match({
    id: EDIT_ID,
    court_id: COURT.id,
    court_name: COURT.name,
    players_a: ['가나', '나다'],
    players_b: ['다라', '라마'],
    ...over,
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/${EDIT_ID}/edit-session`]}>
      <Routes>
        <Route path="/t/:id/matches/:matchId/edit-session" element={<SessionMatchEditPage />} />
        <Route path="/t/:id" element={<p>모임 화면</p>} />
        <Route path="/t/:id/matches/:matchId/edit" element={<p>대회 경기 고치기</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 이름이 든 사람 칸 하나 — 잠긴 칸은 aria-label 이 사정까지 담는다 */
function personButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}( —|$)`) })
}

beforeEach(() => {
  edit.mutateAsync = vi.fn().mockResolvedValue({})
  edit.error = null
  edit.isPending = false
  matches.data = [editing()]
  tournament.data = { ...TOURNAMENT, kind: 'session' }
})

describe('열면 그 경기의 선수가 들어 있다', () => {
  test('자동 제안이 아니라 현재 편성이 기본값이다', () => {
    renderPage()

    for (const name of ['가나', '나다', '다라', '라마']) {
      expect(personButton(name)).toHaveAttribute('aria-pressed', 'true')
    }
    // 그 경기에 없는 사람은 안 골라져 있다
    expect(personButton('심판이')).toHaveAttribute('aria-pressed', 'false')
  })

  test('앱의 제안 안내를 띄우지 않는다 — 고치기에는 제안이 없다', () => {
    renderPage()

    expect(screen.queryByText(/적게 친 사람부터/)).not.toBeInTheDocument()
  })

  test('종목 칩을 안 둔다 — 종목은 제안의 조건인데 제안이 없다', () => {
    renderPage()

    expect(screen.queryByRole('group', { name: '종목' })).not.toBeInTheDocument()
  })

  test('코트도 그 경기 것으로 들어 있다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '1번 코트' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('네 명이 차 있으니 곧바로 저장할 수 있다', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '고치기' })).toBeEnabled()
  })
})

describe('자기 자신 때문에 잠기지 않는다', () => {
  test('고치는 그 경기의 선수는 누를 수 있다', () => {
    renderPage()

    for (const name of ['가나', '나다', '다라', '라마']) {
      expect(personButton(name)).toBeEnabled()
    }
  })

  test('한 명을 빼고 다른 사람을 넣을 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(personButton('라마'))
    expect(personButton('라마')).toHaveAttribute('aria-pressed', 'false')

    await user.click(personButton('심판이'))
    expect(personButton('심판이')).toHaveAttribute('aria-pressed', 'true')
  })

  test('그 경기의 네 명은 "다른 경기에 들어가 있다" 로 세지 않는다', () => {
    renderPage()

    expect(screen.queryByText(/다른 경기에 들어가 있어/)).not.toBeInTheDocument()
  })
})

describe('다른 경기의 선수는 여전히 잠긴다', () => {
  test('진행 중인 경기의 선수는 못 고른다', () => {
    matches.data = [
      editing({ players_b: ['다라'] }),
      match({ id: 'other', status: 'live', court_name: '2번 코트', players_a: ['라마'] }),
    ]
    renderPage()

    expect(personButton('라마')).toBeDisabled()
    expect(personButton('라마')).toHaveTextContent('2번 코트')
    // 고치는 경기의 선수는 그대로 열려 있다
    expect(personButton('가나')).toBeEnabled()
  })
})

describe('예정 경기만 고친다', () => {
  test('이미 시작한 경기는 화면을 안 연다', () => {
    matches.data = [editing({ status: 'live' })]
    renderPage()

    expect(screen.getByText('모임 화면')).toBeInTheDocument()
  })

  test('끝난 경기도 화면을 안 연다', () => {
    matches.data = [editing({ status: 'finished' })]
    renderPage()

    expect(screen.getByText('모임 화면')).toBeInTheDocument()
  })

  test('지워진 경기는 돌려보낸다', () => {
    matches.data = []
    renderPage()

    expect(screen.getByText('모임 화면')).toBeInTheDocument()
  })
})

describe('대회 경기는 조를 고르는 화면이 맞다', () => {
  test('대회면 MatchEditPage 쪽으로 보낸다', () => {
    tournament.data = { ...TOURNAMENT, kind: 'tournament' }
    renderPage()

    expect(screen.getByText('대회 경기 고치기')).toBeInTheDocument()
  })
})

describe('저장', () => {
  test('바꾼 넷과 코트를 그대로 보낸다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(personButton('라마'))
    await user.click(personButton('심판이'))
    await user.click(screen.getByRole('button', { name: '고치기' }))

    expect(edit.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: EDIT_ID,
        courtId: COURT.id,
        playersA: ['m1', 'm2'],
        playersB: ['m3', 'm5'],
      }),
    )
  })

  /*
   * 사람이 손댄 편성은 더 이상 앱이 짠 것이 아니다 — 근거는
   * `labelAfterHumanEdit` 에 있고, 여기서는 화면이 실제로 그렇게
   * 보내는지만 지킨다.
   */
  test('자동으로 걸린 경기를 고치면 "자동" 표시를 떼고 보낸다', async () => {
    matches.data = [editing({ label: '자동' })]
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText(/자동으로 걸어 둔 경기입니다/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '고치기' }))

    expect(edit.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ label: null }))
  })

  test('저장하지 못하면 그대로 말한다 — 만들기가 아니라 고치기라고', () => {
    // 서버가 뭐라 했는지 알 수 없는 실패 — 그때 화면이 스스로 말하는 문장을 본다
    edit.error = {}
    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/경기를 고치지 못했습니다/)
  })
})
