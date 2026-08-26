import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MatchCreatePage } from './MatchCreatePage'
import {
  COURT,
  GROUPS,
  MEMBERS,
  TOURNAMENT_ID,
  TOURNAMENT,
  pickBothTeams,
} from '@/test/matchFixtures'

/**
 * 이 화면의 책임은 **앞으로 할 경기를 코트에 올리는 것 하나**다.
 *
 * 전에는 한 화면이 토글 하나로 편성·지난 결과 입력·수정 셋을 다 했다.
 * 코트와 심판 칸은 CSS 로 숨겼다 — 즉 화면에 남아 있었다. 아래 절들은
 * 그 경계를 지킨다: 여기 있어야 할 칸이 있고, 없어야 할 칸은 **아예 없다**.
 */

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const create = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => ({ data: TOURNAMENT }),
  useGroups: () => ({ data: GROUPS }),
  useMembers: () => ({ data: MEMBERS }),
  useCourts: () => ({ data: [COURT] }),
  useCreateMatch: () => create,
}))

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/new`]}>
      <Routes>
        <Route path="/t/:id/matches/new" element={<MatchCreatePage />} />
        <Route path="/t/:id/admin" element={<p>관리 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  create.mutateAsync = vi.fn().mockResolvedValue({})
  create.error = null
})

describe('편성만 한다', () => {
  test('코트와 심판 칸이 있다', () => {
    renderCreate()
    expect(screen.getByRole('region', { name: '코트' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '심판' })).toBeInTheDocument()
  })

  test('점수 칸은 없다 — 아직 치르지 않은 경기다', async () => {
    renderCreate()
    await pickBothTeams()
    // 편성이 다 끝난 뒤에도 없어야 한다. 숨긴 게 아니라 없는 것이다.
    expect(screen.queryByLabelText(/점수$/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '경기 만들기' })).toBeInTheDocument()
  })

  test('모드를 고르는 토글이 없다 — 들어온 순간 무엇을 하는 화면인지 정해져 있다', () => {
    renderCreate()
    expect(screen.queryByRole('group', { name: '편성 방식' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이미 끝난 경기' })).not.toBeInTheDocument()
  })
})

describe('저장한 뒤', () => {
  test('고른 것을 그대로 서버에 보낸다', async () => {
    renderCreate()
    await pickBothTeams()
    await userEvent.click(screen.getByRole('button', { name: /1번 코트/ }))
    await userEvent.click(screen.getByRole('button', { name: '심판이' }))
    await userEvent.click(screen.getByRole('button', { name: '경기 만들기' }))

    expect(create.mutateAsync).toHaveBeenCalledWith({
      courtId: 'court-1',
      groupA: 'group-a',
      playersA: ['m1', 'm2'],
      groupB: 'group-b',
      playersB: ['m3', 'm4'],
      referees: ['m5'],
    })
  })

  test('화면에 머무르고 다음 편성을 위해 비운다', async () => {
    renderCreate()
    await pickBothTeams()
    await userEvent.click(screen.getByRole('button', { name: '경기 만들기' }))

    // 편성은 한 판으로 끝나지 않는다. 저장할 때마다 튕겨 나가면 매번 다시 들어와야 한다.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('경기 편성')
    expect(await screen.findByRole('status')).toHaveTextContent('저장했습니다')

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    expect(teamA.getByRole('button', { name: /1조/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('코트는 남긴다 — 같은 코트에 여러 경기를 줄 세운다', async () => {
    renderCreate()
    await userEvent.click(screen.getByRole('button', { name: /1번 코트/ }))
    await pickBothTeams()
    await userEvent.click(screen.getByRole('button', { name: '경기 만들기' }))

    expect(screen.getByRole('button', { name: /1번 코트/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
