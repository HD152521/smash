import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MatchRecordsPage } from './MatchRecordsPage'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 이 화면의 책임은 **찾는 것 하나**다. 여기서 기록을 고치지 않는다.
 *
 * 전에는 카드마다 무효 처리 X 가 붙어 있었다. 폰에서 목록을 훑다 손끝이
 * 스치는 자리가 곧 "순위에서 빼기" 였고, 그 버튼 하나 때문에 카드 여백까지
 * 비틀어 놨었다. 무효는 상세 화면으로 옮겼다 — 그쪽은 판단에 필요한 근거가
 * 이미 다 있고, 누르기 전에 결과를 설명한다.
 *
 * 아래 첫 절이 그 경계를 지킨다. 목록에 파괴적 동작을 다시 들이려는 변경은
 * 여기서 걸린다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

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

vi.mock('@/features/tournament/queries', () => ({
  useMatches: () => matches,
  useGroups: () => ({ data: [] }),
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
  matches.data = [match({})]
})

describe('목록은 찾기만 한다', () => {
  test('카드에 누를 수 있는 것은 상세로 가는 길뿐이다', () => {
    matches.data = [match({ id: 'match-42' })]
    renderRecords()

    // 버튼이 하나도 없어야 한다. 목록에서 누를 수 있는 것이 곧 실수할 수
    // 있는 것이고, 여기 카드는 스크롤 중에 손끝이 스치는 자리다.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('link', { name: /1조/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/records/match-42`,
    )
  })

  test('무효인 경기도 표시만 하고 되돌리는 조작을 걸지 않는다', () => {
    matches.data = [match({ status: 'void' })]
    renderRecords()

    expect(screen.getByText('무효')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
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
