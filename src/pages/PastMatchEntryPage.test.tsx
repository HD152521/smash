import { render, screen } from '@testing-library/react'
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

function renderEntry() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/matches/record`]}>
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
