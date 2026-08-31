import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MatchEditPage } from './MatchEditPage'
import { COURT, GROUPS, MEMBERS, TOURNAMENT_ID, TOURNAMENT } from '@/test/matchFixtures'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 이 화면의 책임은 **이미 편성한 한 경기를 바로잡는 것 하나**다.
 *
 * 전에는 편성 화면이 `?edit=` 쿼리를 달고 이 일을 겸했다. 폼의 초기값을
 * 데이터가 온 뒤에 채우려고 key 로 통째로 재마운트하는 우회까지 붙어 있었다.
 * 화면을 떼면서 그 우회는 사라졌고, 대신 아래 첫 절이 그 자리를 지킨다 —
 * **기존 값이 폼에 들어와 있어야 한다.**
 */

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const update = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }
const matches = { data: undefined as MatchOverviewRow[] | undefined }
const tournament = { data: TOURNAMENT as unknown }

const SCHEDULED = {
  id: 'match-1',
  court_id: 'court-1',
  group_a_id: 'group-a',
  group_b_id: 'group-b',
  players_a: ['가나', '나다'],
  players_b: ['다라', '라마'],
  referees: ['심판이'],
  status: 'scheduled',
} as MatchOverviewRow

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => tournament,
  useGroups: () => ({ data: GROUPS }),
  useMembers: () => ({ data: MEMBERS }),
  useCourts: () => ({ data: [COURT] }),
  useMatches: () => matches,
  useUpdateMatch: () => update,
}))

function renderEdit(matchId = 'match-1') {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/${matchId}/edit`]}>
      <Routes>
        <Route path="/t/:id/matches/:matchId/edit" element={<MatchEditPage />} />
        <Route path="/t/:id/schedule" element={<p>대진표 화면</p>} />
        <Route
          path="/t/:id/matches/:matchId/edit-session"
          element={<p>모임 경기 고치기 화면</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  update.mutateAsync = vi.fn().mockResolvedValue({})
  update.error = null
  matches.data = [SCHEDULED]
  tournament.data = TOURNAMENT
})

describe('기존 편성을 채워 온다', () => {
  test('코트 · 조 · 선수 · 심판이 이미 눌려 있다', () => {
    renderEdit()

    expect(screen.getByRole('button', { name: /1번 코트/ })).toHaveAttribute('aria-pressed', 'true')

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    expect(teamA.getByRole('button', { name: /1조/ })).toHaveAttribute('aria-pressed', 'true')
    expect(teamA.getByRole('button', { name: '가나' })).toHaveAttribute('aria-pressed', 'true')
    expect(teamA.getByRole('button', { name: '나다' })).toHaveAttribute('aria-pressed', 'true')

    const teamB = within(screen.getByRole('region', { name: 'B팀' }))
    expect(teamB.getByRole('button', { name: '다라' })).toHaveAttribute('aria-pressed', 'true')

    expect(screen.getByRole('button', { name: '심판이' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('채워져 있으니 손대지 않고도 바로 저장할 수 있다', () => {
    renderEdit()
    expect(screen.getByRole('button', { name: '고치기' })).toBeInTheDocument()
  })

  test('여기서 새 경기를 만들지 않는다', () => {
    renderEdit()
    expect(screen.queryByRole('button', { name: '경기 만들기' })).not.toBeInTheDocument()
  })
})

describe('저장한 뒤', () => {
  test('고친 값을 그 경기에 보내고 대진표로 돌아간다', async () => {
    renderEdit()

    // 코트를 떼고(대진표에서 다시 배정한다) 심판을 뺀다
    await userEvent.click(screen.getByRole('button', { name: /1번 코트/ }))
    await userEvent.click(screen.getByRole('button', { name: '심판이' }))
    await userEvent.click(screen.getByRole('button', { name: '고치기' }))

    expect(update.mutateAsync).toHaveBeenCalledWith({
      matchId: 'match-1',
      courtId: null,
      groupA: 'group-a',
      playersA: ['m1', 'm2'],
      groupB: 'group-b',
      playersB: ['m3', 'm4'],
      referees: [],
    })
    // 한 건짜리 일이다. 고치고 나면 목록으로 돌려보낸다.
    expect(await screen.findByText('대진표 화면')).toBeInTheDocument()
  })
})

describe('없는 경기', () => {
  test('지워진 경기를 열면 대진표로 보낸다', async () => {
    matches.data = []
    renderEdit('사라진경기')
    expect(await screen.findByText('대진표 화면')).toBeInTheDocument()
  })
})

/*
 * 경기 짜기 화면은 "다른 경기에 묶인 사람" 을 잠근다(`src/lib/busy.ts`).
 * 그 규칙이 이 화면까지 번지면 **아무도 아무것도 못 고친다** — 고치려는
 * 경기의 선수는 바로 그 경기 때문에 묶여 있기 때문이다. 그래서 못을 박아 둔다.
 */
describe('고치는 그 경기의 선수', () => {
  test('자기 자신 때문에 잠기지 않는다 — 그대로 눌러서 뺄 수 있다', async () => {
    renderEdit()

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    const 가나 = teamA.getByRole('button', { name: '가나' })
    expect(가나).toBeEnabled()

    await userEvent.click(가나)
    expect(가나).toHaveAttribute('aria-pressed', 'false')
  })

  test('다른 경기가 진행 중이어도 이 경기의 선수는 그대로 보인다', () => {
    matches.data = [
      SCHEDULED,
      { id: 'match-2', status: 'live', players_a: ['가나'], players_b: ['다라'] } as MatchOverviewRow,
    ]
    renderEdit()

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    expect(teamA.getByRole('button', { name: '가나' })).toHaveAttribute('aria-pressed', 'true')
  })
})

/*
 * 모임 경기가 여기로 들어오면 **아무것도 못 한다.** 조가 한 개도 없어서
 * A팀·B팀 칸이 통째로 비고, 저장 조건("양 팀의 조와 선수")은 영영 만족되지
 * 않는다. 대진표의 연필은 이미 갈라 보내지만 주소를 직접 치는 길이 남는다.
 */
describe('모임 경기는 여기서 못 고친다', () => {
  test('사람을 고르는 화면으로 보낸다', () => {
    tournament.data = { ...TOURNAMENT, kind: 'session' }
    renderEdit()

    expect(screen.getByText('모임 경기 고치기 화면')).toBeInTheDocument()
  })

  test('대회 경기는 지금처럼 이 화면이 받는다', () => {
    renderEdit()

    expect(screen.getByRole('region', { name: 'A팀' })).toBeInTheDocument()
  })
})
