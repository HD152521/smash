import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MatchDetailPage } from './MatchDetailPage'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 무효 처리는 **이 화면에만** 있다.
 *
 * 목록(`MatchRecordsPage`)에서 옮겨 왔다. 목록의 책임은 찾는 것이고, 카드마다
 * 파괴적 동작을 달아 두면 스크롤하다 손끝이 스치는 자리가 곧 "순위에서
 * 빼기" 가 된다. 여기는 "이 경기를 되짚어 본다" 가 책임이라 판단 근거(점수가
 * 어떻게 흘렀는지 · 심판)가 이미 화면에 있다.
 *
 * 프론트의 조건부 렌더링은 보안이 아니다 — 진짜 벽은 `void_match` 안의
 * `is_tournament_admin` 이다. 그래도 버튼이 아무에게나 보이면 눌러본 뒤에야
 * 오류를 보게 되고, 대회장에서 그건 "앱이 고장났다" 로 읽힌다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'
const MATCH_ID = 'match-42'

const state = {
  role: 'owner' as 'owner' | 'admin' | 'member',
  match: null as MatchOverviewRow | null,
}

const voidMatch = { mutate: vi.fn(), isPending: false, error: null as unknown }

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

vi.mock('@/features/records/ScoreChart', () => ({ ScoreChart: () => null }))

vi.mock('@/features/tournament/queries', () => ({
  useMatches: () => ({ data: state.match ? [state.match] : [], isPending: false, error: null }),
  useMembers: () => ({
    data: [{ userId: 'u1', role: state.role, displayName: '나' }],
    isPending: false,
    error: null,
  }),
  useScoreEvents: () => ({ data: [], isPending: false, error: null }),
  useVoidMatch: () => voidMatch,
}))

function match(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return {
    id: MATCH_ID,
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

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/records/${MATCH_ID}`]}>
      <Routes>
        <Route path="/t/:id/records/:matchId" element={<MatchDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const voidButton = () => screen.queryByRole('button', { name: /무효/ })

beforeEach(() => {
  state.role = 'owner'
  state.match = match()
  voidMatch.mutate.mockClear()
  voidMatch.isPending = false
  voidMatch.error = null
})

describe('무효 버튼이 보이는 조건', () => {
  test('관리자에게는 보인다', () => {
    renderDetail()
    expect(voidButton()).toBeInTheDocument()
  })

  test('참가자에게는 없다', () => {
    state.role = 'member'
    renderDetail()
    expect(voidButton()).not.toBeInTheDocument()
  })

  test('이미 무효인 경기에는 없다', () => {
    // 또 띄우면 뭘 더 할 수 있는 것처럼 보인다
    state.match = match({ status: 'void' })
    renderDetail()
    expect(voidButton()).not.toBeInTheDocument()
  })

  test('누르기 전에 결과가 어떻게 되는지 화면이 말해 준다', () => {
    // 목록에서 옮겨 온 이유의 절반이 이것이다. prompt 한 줄만 띄우고 끝내면
    // 무효가 지우는 것인지 순위에서만 빼는 것인지 알 수 없다.
    renderDetail()
    expect(screen.getByText(/순위 집계에서 빠집니다/)).toBeInTheDocument()
  })
})

describe('무효 버튼을 누르면', () => {
  test('사유와 함께 그 경기를 무효 처리한다', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('심판 착오')
    renderDetail()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).toHaveBeenCalledWith({ matchId: MATCH_ID, reason: '심판 착오' })
    prompt.mockRestore()
  })

  test('취소하면 아무 일도 없다', async () => {
    // prompt 의 취소는 null 이다. '' (빈 사유로 확인) 과 반드시 갈라져야 한다.
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    renderDetail()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).not.toHaveBeenCalled()
    prompt.mockRestore()
  })

  test('사유를 비우고 확인하면 사유 없이 처리한다', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('')
    renderDetail()

    await userEvent.click(voidButton()!)

    expect(voidMatch.mutate).toHaveBeenCalledWith({ matchId: MATCH_ID, reason: undefined })
    prompt.mockRestore()
  })

  test('실패하면 화면에 남아 있는다', () => {
    // 목록에서는 실패 문구가 목록 맨 위에 떠서 어느 경기 이야기인지 알 수
    // 없었다. 여기는 경기가 하나뿐이라 그 문제가 없다.
    voidMatch.error = new Error('권한이 없습니다')
    renderDetail()

    expect(screen.getByRole('alert')).toHaveTextContent('권한이 없습니다')
  })
})
