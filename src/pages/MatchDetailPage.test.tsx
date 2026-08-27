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
        {/* 다시 입력하기가 실제로 어디로 가는지는 PastMatchEntryPage.test.tsx 가 본다.
            여기서는 "그 자리로 갔다" 만 확인한다. */}
        <Route path="/t/:id/matches/record" element={<p>재입력 화면</p>} />
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

/**
 * `window.prompt()` 대신 앱의 모달을 쓴다 — 아이폰 사파리에서 특히
 * 브라우저 기본 다이얼로그가 어색하고, 앱의 다른 곳과 생김새가 다르다.
 */
describe('무효 처리 모달', () => {
  test('버튼을 누르면 모달이 뜬다 (prompt 를 쓰지 않는다)', async () => {
    const promptSpy = vi.spyOn(window, 'prompt')
    renderDetail()

    await userEvent.click(voidButton()!)

    expect(screen.getByRole('dialog', { name: '경기 무효 처리' })).toBeInTheDocument()
    expect(promptSpy).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })

  test('사유와 함께 그 경기를 무효 처리한다', async () => {
    renderDetail()
    await userEvent.click(voidButton()!)

    await userEvent.type(screen.getByLabelText('무효 사유'), '심판 착오')
    await userEvent.click(screen.getByRole('button', { name: '무효 처리' }))

    expect(voidMatch.mutate).toHaveBeenCalledWith(
      { matchId: MATCH_ID, reason: '심판 착오' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  test('취소를 누르면 아무 일도 없다', async () => {
    renderDetail()
    await userEvent.click(voidButton()!)

    await userEvent.type(screen.getByLabelText('무효 사유'), '심판 착오')
    await userEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(voidMatch.mutate).not.toHaveBeenCalled()
  })

  test('사유를 비우고 확인하면 사유 없이 처리한다', async () => {
    renderDetail()
    await userEvent.click(voidButton()!)

    await userEvent.click(screen.getByRole('button', { name: '무효 처리' }))

    expect(voidMatch.mutate).toHaveBeenCalledWith(
      { matchId: MATCH_ID, reason: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  test('실패하면 모달에 남아 있는다', async () => {
    voidMatch.error = new Error('권한이 없습니다')
    renderDetail()
    await userEvent.click(voidButton()!)

    expect(screen.getByRole('alert')).toHaveTextContent('권한이 없습니다')
  })
})

/**
 * 실측된 문제의 핵심 — 무효 처리 화면에서 재입력 화면으로 가는 길이
 * 코드에 없었다. 여기서 끊긴 링크를 잇는다.
 */
describe('다시 입력하기 — 끊긴 링크를 잇는다', () => {
  test('아직 무효가 아니면 다시 입력 카드가 없다', () => {
    renderDetail()
    expect(screen.queryByRole('button', { name: '다시 입력하기' })).not.toBeInTheDocument()
  })

  test('무효 처리하면 그 자리에서 바로 다시 입력할 수 있다', async () => {
    const onVoidSuccess = vi.fn()
    voidMatch.mutate.mockImplementation((_vars, opts) => {
      state.match = match({ status: 'void' })
      opts?.onSuccess?.()
      onVoidSuccess()
    })
    renderDetail()

    await userEvent.click(voidButton()!)
    await userEvent.click(screen.getByRole('button', { name: '무효 처리' }))

    expect(onVoidSuccess).toHaveBeenCalled()
    expect(screen.getByText('무효 처리했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 입력하기' })).toBeInTheDocument()
  })

  test('이미 무효인 경기를 나중에 다시 열어도 다시 입력할 수 있다', () => {
    state.match = match({ status: 'void' })
    renderDetail()

    expect(screen.getByText('무효 처리된 경기입니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 입력하기' })).toBeInTheDocument()
  })

  test('다시 입력하기를 누르면 조·선수·점수를 채워 재입력 화면으로 보낸다', async () => {
    state.match = match({ status: 'void' })
    renderDetail()

    await userEvent.click(screen.getByRole('button', { name: '다시 입력하기' }))

    expect(await screen.findByText('재입력 화면')).toBeInTheDocument()
  })

  test('강제로 넘기지 않는다 — 무효 처리 후에도 이 화면에 머무를 수 있다', async () => {
    voidMatch.mutate.mockImplementation((_vars, opts) => {
      state.match = match({ status: 'void' })
      opts?.onSuccess?.()
    })
    renderDetail()

    await userEvent.click(voidButton()!)
    await userEvent.click(screen.getByRole('button', { name: '무효 처리' }))

    // 다시 입력하기를 누르지 않으면 여전히 이 경기 상세 화면이다
    expect(screen.getByRole('button', { name: '다시 입력하기' })).toBeInTheDocument()
    expect(screen.queryByText('재입력 화면')).not.toBeInTheDocument()
  })
})

describe('점수를 안 센 모임 경기', () => {
  /*
   * 목록(MatchRecordsPage)과 같은 판단이 상세에도 있어야 한다. 한쪽만
   * 고치면 '점수 없음' 을 눌러 들어갔더니 '0 : 0' 이 뜬다.
   */
  test("'0 : 0' 대신 '점수 없음' 으로 보이고, 빈 그래프를 그리지 않는다", () => {
    state.match = match({
      group_a_name: null,
      group_b_name: null,
      score_a: 0,
      score_b: 0,
      winner_side: null,
      scored: false,
    })
    renderDetail()

    expect(screen.queryByText('0 : 0')).not.toBeInTheDocument()
    expect(screen.getByText('점수 없음')).toBeInTheDocument()
    expect(screen.queryByText('점수 진행')).not.toBeInTheDocument()
  })

  test('점수를 센 경기는 그대로다', () => {
    state.match = match({ scored: true })
    renderDetail()

    expect(screen.getByText('21 : 19')).toBeInTheDocument()
    expect(screen.getByText('점수 진행')).toBeInTheDocument()
  })
})
