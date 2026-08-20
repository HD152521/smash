import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MatchRecordsPage } from './MatchRecordsPage'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 기록에서 무효 처리(X) 는 관리자만 볼 수 있어야 한다.
 *
 * 프론트의 조건부 렌더링은 보안이 아니다 — 진짜 벽은 void_match 안의
 * is_tournament_admin 이다. 그래도 X 가 아무에게나 보이면 눌러본 뒤에야
 * 오류를 보게 되고, 대회장에서 그건 "앱이 고장났다" 로 읽힌다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

const gate = { loading: false, denied: false, me: undefined, members: [] }
vi.mock('@/features/admin/useAdminGate', () => ({ useAdminGate: () => gate }))

vi.mock('@/features/tournament/TournamentNav', () => ({
  TournamentNav: () => null,
}))

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'match-1',
    status: 'finished',
    group_a_name: '1조',
    group_b_name: '2조',
    score_a: 21,
    score_b: 19,
    winner_side: 'A',
    players_a: ['가', '나'],
    players_b: ['다', '라'],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

const matches = { data: [] as MatchOverviewRow[], isPending: false, error: null }
const voidMatch = { mutate: vi.fn(), isPending: false, error: null, variables: undefined }

vi.mock('@/features/tournament/queries', () => ({
  useMatches: () => matches,
  useGroups: () => ({ data: [] }),
  useVoidMatch: () => voidMatch,
}))

function renderRecords() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/records`]}>
      <Routes>
        <Route path="/t/:id/records" element={<MatchRecordsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  gate.loading = false
  gate.denied = false
  matches.data = [match({})]
  voidMatch.mutate.mockClear()
})

const voidButton = () => screen.queryByRole('button', { name: /무효 처리/ })

describe('기록에서 무효 처리', () => {
  test('관리자에게는 X 가 보인다', () => {
    renderRecords()
    expect(voidButton()).toBeInTheDocument()
  })

  test('관리자가 아니면 X 가 없다', () => {
    gate.denied = true
    renderRecords()
    expect(voidButton()).not.toBeInTheDocument()
  })

  test('판단이 끝나기 전에는 X 를 그리지 않는다', () => {
    gate.loading = true
    renderRecords()
    // 깜빡 보였다 사라지면 눌린 뒤에 사라질 수도 있다
    expect(voidButton()).not.toBeInTheDocument()
  })

  test('이미 무효인 경기에는 X 가 없다', () => {
    matches.data = [match({ status: 'void' })]
    renderRecords()
    expect(screen.getByText('무효')).toBeInTheDocument()
    expect(voidButton()).not.toBeInTheDocument()
  })
})

describe('무효 경기의 자리', () => {
  /** 카드에 찍힌 조 이름으로 화면에 그려진 순서를 읽는다 */
  function orderOnScreen() {
    return screen.getAllByRole('listitem').map((li) => li.textContent?.match(/\d+조/)?.[0])
  }

  test('무효는 맨 아래로 내려간다', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '1조' }),
      match({ id: 'b', group_a_name: '2조', status: 'void' }),
      match({ id: 'c', group_a_name: '3조' }),
    ]
    renderRecords()
    expect(orderOnScreen()).toEqual(['1조', '3조', '2조'])
  })

  test('무효가 아닌 것끼리는 원래 순서가 유지된다', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '1조' }),
      match({ id: 'b', group_a_name: '2조' }),
      match({ id: 'c', group_a_name: '3조' }),
    ]
    renderRecords()
    // 안정 정렬이 아니면 여기서 순서가 뒤섞인다
    expect(orderOnScreen()).toEqual(['1조', '2조', '3조'])
  })

  test('무효끼리도 원래 순서가 유지된다', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '1조', status: 'void' }),
      match({ id: 'b', group_a_name: '2조' }),
      match({ id: 'c', group_a_name: '3조', status: 'void' }),
    ]
    renderRecords()
    expect(orderOnScreen()).toEqual(['2조', '1조', '3조'])
  })
})

/**
 * 여기서부터가 진짜다. X 가 보이는 것과 눌렀을 때 실제로 무효가 되는 것은
 * 다른 이야기다 — 지난번에도 '집히기는 하는데 놓아도 아무 일이 없는' 드래그를
 * 그렇게 놓쳤다.
 */
describe('X 를 누르면', () => {
  test('사유와 함께 그 경기를 무효 처리한다', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('심판 착오')
    matches.data = [match({ id: 'match-42' })]
    renderRecords()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).toHaveBeenCalledWith({ matchId: 'match-42', reason: '심판 착오' })
    prompt.mockRestore()
  })

  test('취소하면 아무 일도 없다', async () => {
    // prompt 의 취소는 null 이다. '' (빈 사유로 확인) 과 반드시 갈라져야 한다.
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    renderRecords()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).not.toHaveBeenCalled()
    prompt.mockRestore()
  })

  test('사유를 비우고 확인하면 사유 없이 처리한다', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('')
    renderRecords()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).toHaveBeenCalledWith({ matchId: 'match-1', reason: undefined })
    prompt.mockRestore()
  })

  test('처리 중에는 두 번 눌리지 않는다', () => {
    voidMatch.isPending = true
    voidMatch.variables = { matchId: 'match-1' } as never
    try {
      renderRecords()
      expect(voidButton()).toBeDisabled()
    } finally {
      voidMatch.isPending = false
      voidMatch.variables = undefined
    }
  })
})
