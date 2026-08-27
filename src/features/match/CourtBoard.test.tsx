import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { CourtBoard } from './CourtBoard'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 코트 화면의 **기본 동작**이 대회와 모임에서 갈린다는 것을 붙잡아 둔다.
 *
 * 모임에는 점수판이 필요 없다 — 코트에 들어가고 나오는 것만 있으면 된다.
 * 그래서 진행 중인 카드를 누르면 그 자리에서 경기가 끝난다. 대회는
 * 그대로 심판용 점수판으로 간다. 둘을 한 화면에 겹치지 않는 것이 이
 * 저장소가 MatchCreatePage 에서 이미 한 번 비싸게 배운 것이다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'
const MATCH_ID = 'match-42'

const claim = { mutateAsync: vi.fn(), isPending: false }
const start = { mutateAsync: vi.fn(), isPending: false }
const finish = { mutate: vi.fn(), isPending: false, error: null as unknown }

vi.mock('@/features/tournament/queries', () => ({
  useClaimCourt: () => claim,
  useStartMatch: () => start,
  useFinishMatch: () => finish,
}))

const COURT = { id: 'court-1', name: '1번 코트', sort_order: 1 } as CourtRow

/** 모임 경기 — 조가 없고 사람으로 부른다 */
function liveSessionMatch(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return {
    id: MATCH_ID,
    status: 'live',
    court_id: COURT.id,
    group_a_name: null,
    group_b_name: null,
    score_a: 0,
    score_b: 0,
    winner_side: null,
    scored: true,
    players_a: ['김민수', '이서연'],
    players_b: ['박지훈', '최유진'],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

interface Options {
  isSession?: boolean
  isAdmin?: boolean
  myDisplayName?: string
  matches?: MatchOverviewRow[]
}

function renderBoard(o: Options = {}) {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}`]}>
      <Routes>
        <Route
          path="/t/:id"
          element={
            <CourtBoard
              tournamentId={TOURNAMENT_ID}
              courts={[COURT]}
              matches={o.matches ?? [liveSessionMatch()]}
              myDisplayName={o.myDisplayName ?? '운영진'}
              isAdmin={o.isAdmin ?? true}
              isSession={o.isSession ?? true}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const liveCard = () => screen.queryByRole('button', { name: /눌러서 경기 끝내기/ })
const scoreLink = () => screen.queryByRole('link', { name: '점수 기록' })

beforeEach(() => {
  finish.mutate.mockClear()
  finish.error = null
})

describe('모임 — 코트 화면에서 바로 끝낸다', () => {
  test('진행 중인 카드를 누르고 확인하면 경기가 끝난다', async () => {
    const { container } = renderBoard()

    // 확인 한 단계는 남긴다 — 카드 전체가 버튼이라 손끝이 스치는 자리다
    expect(container.querySelector('dialog')).not.toHaveAttribute('open')

    await userEvent.click(liveCard()!)
    expect(container.querySelector('dialog')).toHaveAttribute('open')
    // 무엇을 끝내는지 먼저 보여준다 — 잘못 누르면 남의 경기가 끝난다
    expect(screen.getByText('김민수 · 이서연 vs 박지훈 · 최유진')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '끝내기' }))
    expect(finish.mutate).toHaveBeenCalledTimes(1)
    expect(finish.mutate.mock.calls[0]?.[0]).toBe(MATCH_ID)
  })

  test('확인을 취소하면 아무 일도 일어나지 않는다', async () => {
    renderBoard()
    await userEvent.click(liveCard()!)
    await userEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(finish.mutate).not.toHaveBeenCalled()
  })

  test('모임에는 점수판으로 가는 길이 아예 없다', () => {
    /*
     * 처음에는 '필요한 사람만 기록' 이라는 옛 원칙을 따라 보조 링크로
     * 남겨 뒀는데, 사용자가 그것도 빼라고 했다 — "정기모임은 그냥 시작
     * 종료만 한다".
     *
     * 링크만 지우면 주소로 들어올 수 있어서 라우트(`TournamentOnly`)에서도
     * 막는다. 여기서는 문이 없다는 것만 지킨다.
     */
    renderBoard()

    expect(scoreLink()).toBeNull()
  })

  test('점수를 안 센 진행 중 경기를 0 : 0 으로 그리지 않는다', () => {
    renderBoard()
    expect(screen.queryByText('0 : 0')).not.toBeInTheDocument()
  })

  test('점수를 세고 있으면 그 점수는 그대로 보여준다', () => {
    renderBoard({ matches: [liveSessionMatch({ score_a: 12, score_b: 9 })] })
    expect(screen.getByText('12 : 9')).toBeInTheDocument()
  })
})

describe('모임 — 누가 끝낼 수 있나 (서버 can_run_match 와 같아야 한다)', () => {
  test('관리자가 아니어도 그 경기에 뛰는 사람이면 끝낼 수 있다', async () => {
    renderBoard({ isAdmin: false, myDisplayName: '김민수' })

    await userEvent.click(liveCard()!)
    await userEvent.click(screen.getByRole('button', { name: '끝내기' }))
    expect(finish.mutate).toHaveBeenCalledTimes(1)
  })

  test('B팀에서 뛰는 사람도 마찬가지다', () => {
    renderBoard({ isAdmin: false, myDisplayName: '최유진' })
    expect(liveCard()).toBeInTheDocument()
  })

  test('구경하는 사람에게는 끝내는 길이 없다 — 서버가 막는 것을 화면도 막는다', () => {
    renderBoard({ isAdmin: false, myDisplayName: '구경꾼' })

    expect(liveCard()).toBeNull()
    expect(scoreLink()).toBeNull()
    // 그래도 코트에 누가 있는지는 읽힌다
    expect(screen.getByText('김민수 · 이서연')).toBeInTheDocument()
  })
})

describe('대회 — 한 줄도 바뀌지 않는다 (회귀)', () => {
  const tournamentMatch = (over: Partial<MatchOverviewRow> = {}) =>
    liveSessionMatch({
      group_a_name: '1조',
      group_b_name: '2조',
      score_a: 12,
      score_b: 9,
      ...over,
    })

  test('진행 중인 카드는 그대로 점수판으로 가는 링크다', () => {
    renderBoard({ isSession: false, matches: [tournamentMatch()] })

    expect(screen.getByRole('link', { name: /1번 코트 진행 중/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/matches/${MATCH_ID}`,
    )
  })

  test('대회에는 코트에서 바로 끝내는 길이 없다', () => {
    renderBoard({ isSession: false, matches: [tournamentMatch()] })

    expect(liveCard()).toBeNull()
    expect(screen.queryByRole('button', { name: '끝내기' })).toBeNull()
    // 점수는 여전히 카드에서 가장 큰 자리다
    expect(screen.getByText('12 : 9')).toBeInTheDocument()
  })

  test('대회에서 심판도 관리자도 아니면 카드가 링크가 아니다', () => {
    renderBoard({ isSession: false, isAdmin: false, matches: [tournamentMatch()] })
    expect(screen.queryByRole('link', { name: /1번 코트 진행 중/ })).toBeNull()
  })

  test('대회에서 지정 심판이면 점수판으로 갈 수 있다', () => {
    renderBoard({
      isSession: false,
      isAdmin: false,
      myDisplayName: '심판이',
      matches: [tournamentMatch({ referees: ['심판이'] })],
    })
    expect(screen.getByRole('link', { name: /1번 코트 진행 중/ })).toBeInTheDocument()
  })
})
