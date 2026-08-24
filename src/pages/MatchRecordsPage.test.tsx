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

  test('시각이 같으면 원래 순서가 유지된다', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '1조' }),
      match({ id: 'b', group_a_name: '2조' }),
      match({ id: 'c', group_a_name: '3조' }),
    ]
    renderRecords()
    // 안정 정렬이 아니면 여기서 순서가 뒤섞인다
    expect(orderOnScreen()).toEqual(['1조', '2조', '3조'])
  })

  test('무효끼리도 자기들끼리 줄을 선다', () => {
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
 * 이 화면을 여는 시점은 대개 방금 경기가 끝난 직후다.
 * 편성 순서대로 쌓이면 방금 그 경기를 찾으려고 매번 끝까지 내려가야 한다.
 */
describe('타임스탬프 순서', () => {
  // 시각을 넣으면 카드에 숫자(09:00)가 같이 찍힌다. 조 이름은 숫자를 안 쓴다.
  function orderOnScreen() {
    return screen.getAllByRole('listitem').map((li) => li.textContent?.match(/[가나다]조/)?.[0])
  }

  test('최근에 끝난 경기가 위로 온다 — 편성 순서와 반대여도', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '가조', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: 'b', group_a_name: '나조', finished_at: '2026-08-24T20:00:00Z' }),
      match({ id: 'c', group_a_name: '다조', finished_at: '2026-08-24T12:00:00Z' }),
    ]
    renderRecords()
    expect(orderOnScreen()).toEqual(['나조', '다조', '가조'])
  })

  test('날짜가 바뀌는 자리에 머리말이 붙는다', () => {
    matches.data = [
      match({ id: 'a', group_a_name: '가조', finished_at: '2026-08-24T09:00:00Z' }),
      match({ id: 'b', group_a_name: '나조', finished_at: '2026-08-23T09:00:00Z' }),
    ]
    renderRecords()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  })

  test('같은 날 경기는 머리말이 하나뿐이다', () => {
    // 날짜는 보는 사람의 시간대로 끊긴다. 어느 시간대에서 돌려도 같은 날이도록
    // 정오 근처로 두 시간만 벌려 둔다.
    matches.data = [
      match({ id: 'a', group_a_name: '가조', finished_at: '2026-08-24T11:00:00Z' }),
      match({ id: 'b', group_a_name: '나조', finished_at: '2026-08-24T13:00:00Z' }),
    ]
    renderRecords()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })
})

/**
 * 심판은 검색에서 뺀다.
 *
 * 기록을 뒤지는 이유는 "내가 그 경기 몇 점 냈지" 지 "내가 어느 경기 심판이었지"
 * 가 아니다. 심판까지 걸리면 이름 하나로 관여한 모든 경기가 쏟아진다.
 */
describe('이름으로 찾기', () => {
  async function search(name: string) {
    await userEvent.type(screen.getByPlaceholderText('선수 이름'), name)
  }

  test('뛴 사람 이름으로 찾는다', async () => {
    matches.data = [
      match({ id: 'a', group_a_name: '찾는조', group_b_name: '맞선조', players_a: ['가나다'] }),
      match({ id: 'b', group_a_name: '딴조', group_b_name: '남의조', players_a: ['라마바'] }),
    ]
    renderRecords()
    await search('가나다')
    expect(screen.getByText('찾는조')).toBeInTheDocument()
    expect(screen.queryByText('딴조')).not.toBeInTheDocument()
  })

  test('심판 이름으로는 걸리지 않는다', async () => {
    matches.data = [
      match({ id: 'a', group_a_name: '찾는조', group_b_name: '맞선조', referees: ['호루라기'] }),
    ]
    renderRecords()
    await search('호루라기')
    expect(screen.queryByText('찾는조')).not.toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 경기가 없습니다.')).toBeInTheDocument()
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
