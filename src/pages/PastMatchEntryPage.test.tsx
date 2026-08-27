import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { PastMatchEntryPage } from './PastMatchEntryPage'
import { GROUPS, MEMBERS, TOURNAMENT_ID, TOURNAMENT, pickBothTeams } from '@/test/matchFixtures'

/**
 * 이 화면의 책임은 **이미 치른 경기의 결과를 옮겨 적는 것 하나**다.
 *
 * 대회가 끝난 뒤 정산할 때 여는 화면이라, 편성 화면과 있어야 할 칸이 다르다.
 * 코트와 심판은 여기 없어야 한다 — 이미 끝난 경기에 물어볼 것이 아니다.
 */

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const manual = { mutateAsync: vi.fn(), isPending: false, error: null as unknown }

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => ({ data: TOURNAMENT }),
  useGroups: () => ({ data: GROUPS }),
  useMembers: () => ({ data: MEMBERS }),
  useRecordManualMatch: () => manual,
}))

function renderEntry(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: `/t/${TOURNAMENT_ID}/matches/record`, state }]}>
      <Routes>
        <Route path="/t/:id/matches/record" element={<PastMatchEntryPage />} />
        <Route path="/t/:id/records" element={<p>기록 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillScores(a: string, b: string) {
  await userEvent.type(screen.getByLabelText('1조 점수'), a)
  await userEvent.type(screen.getByLabelText('2조 점수'), b)
}

beforeEach(() => {
  manual.mutateAsync = vi.fn().mockResolvedValue({})
  manual.error = null
})

describe('결과만 받는다', () => {
  test('코트와 심판 칸이 없다 — 숨긴 게 아니라 없다', async () => {
    renderEntry()
    await pickBothTeams()
    expect(screen.queryByRole('region', { name: '코트' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '심판' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '심판이' })).not.toBeInTheDocument()
  })

  test('양 팀이 정해지면 점수 칸이 나온다', async () => {
    renderEntry()
    // 누구의 점수인지 이름으로 말해야 하므로 팀보다 먼저 물을 수 없다
    expect(screen.queryByLabelText(/점수$/)).not.toBeInTheDocument()
    await pickBothTeams()
    expect(screen.getByLabelText('1조 점수')).toBeInTheDocument()
    expect(screen.getByLabelText('2조 점수')).toBeInTheDocument()
  })

  test('동점은 저장할 수 없다', async () => {
    renderEntry()
    await pickBothTeams()
    await fillScores('11', '11')
    expect(screen.getByText('동점으로는 기록할 수 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '결과 저장' })).not.toBeInTheDocument()
  })
})

describe('저장한 뒤', () => {
  test('점수와 함께 보내고 기록 화면으로 간다', async () => {
    renderEntry()
    await pickBothTeams()
    await fillScores('21', '15')
    await userEvent.click(screen.getByRole('button', { name: '결과 저장' }))

    expect(manual.mutateAsync).toHaveBeenCalledWith({
      groupA: 'group-a',
      playersA: ['m1', 'm2'],
      scoreA: 21,
      groupB: 'group-b',
      playersB: ['m3', 'm4'],
      scoreB: 15,
    })
    // 옮겨 적은 것이 제대로 들어갔는지 눈으로 확인할 곳이 기록이다
    expect(await screen.findByText('기록 화면')).toBeInTheDocument()
  })
})

/**
 * 무효 처리 화면에서 넘어온 값을 채운다 — 끊긴 링크를 잇는 쪽의 절반이다.
 * 방금 본 조·선수·점수를 사람이 다시 고르게 하지 않는다.
 */
describe('무효 처리한 경기에서 넘어오면', () => {
  const REMATCH_STATE = {
    groupA: 'group-a',
    groupB: 'group-b',
    playersANames: ['가나', '나다'],
    playersBNames: ['다라', '라마'],
    scoreA: 19,
    scoreB: 21,
  }

  test('조·선수·점수가 이미 채워져 있다', async () => {
    renderEntry(REMATCH_STATE)

    // 명단이 도착한 뒤 채워지므로 findBy 로 기다린다
    expect(await screen.findByLabelText('1조 점수')).toHaveValue(19)
    expect(screen.getByLabelText('2조 점수')).toHaveValue(21)

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    expect(teamA.getByRole('button', { name: '가나' })).toHaveAttribute('aria-pressed', 'true')
    expect(teamA.getByRole('button', { name: '나다' })).toHaveAttribute('aria-pressed', 'true')
    const teamB = within(screen.getByRole('region', { name: 'B팀' }))
    expect(teamB.getByRole('button', { name: '다라' })).toHaveAttribute('aria-pressed', 'true')
    expect(teamB.getByRole('button', { name: '라마' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('채워진 점수를 바꿀 수 있다 — 운영진이 고치려는 것은 대개 점수 하나다', async () => {
    renderEntry(REMATCH_STATE)
    const scoreInput = await screen.findByLabelText('1조 점수')

    await userEvent.clear(scoreInput)
    await userEvent.type(scoreInput, '21')
    expect(scoreInput).toHaveValue(21)
  })

  test('채워진 선수도 바꿀 수 있다 — 사람이 바뀐 경우도 있다', async () => {
    renderEntry(REMATCH_STATE)
    await screen.findByLabelText('1조 점수')

    const teamA = within(screen.getByRole('region', { name: 'A팀' }))
    expect(teamA.getByRole('button', { name: '나다' })).toHaveAttribute('aria-pressed', 'true')
    // 채워진 선수를 눌러 뺄 수 있다 — 강제로 고정돼 있지 않다
    await userEvent.click(teamA.getByRole('button', { name: '나다' }))
    expect(teamA.getByRole('button', { name: '나다' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('저장하면 다시 고르지 않은 값 그대로 보낸다', async () => {
    renderEntry(REMATCH_STATE)
    await screen.findByLabelText('1조 점수')

    await userEvent.click(screen.getByRole('button', { name: '결과 저장' }))

    expect(manual.mutateAsync).toHaveBeenCalledWith({
      groupA: 'group-a',
      playersA: ['m1', 'm2'],
      scoreA: 19,
      groupB: 'group-b',
      playersB: ['m3', 'm4'],
      scoreB: 21,
    })
  })

  test('화면 문구가 새 경기로 다시 기록됨을 말해 준다 (record_manual_match 는 새 행을 만든다)', async () => {
    renderEntry(REMATCH_STATE)
    expect(await screen.findByText(/다시 기록합니다/)).toBeInTheDocument()
  })

  test('일반적으로 들어오면(무효 처리를 거치지 않으면) 이 문구가 없다', () => {
    renderEntry()
    expect(screen.queryByText(/다시 기록합니다/)).not.toBeInTheDocument()
  })

  test('모양이 다른 state 는 조용히 무시하고 빈 폼으로 남는다', () => {
    renderEntry({ garbage: true })
    expect(screen.queryByLabelText(/점수$/)).not.toBeInTheDocument()
  })
})
