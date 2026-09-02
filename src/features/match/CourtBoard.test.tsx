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
/** 자동 예약으로 걸린 경기를 카드에서 바로 지우는 길 (AutoQueueRow) */
const remove = { mutate: vi.fn(), isPending: false }

vi.mock('@/features/tournament/queries', () => ({
  useClaimCourt: () => claim,
  useStartMatch: () => start,
  useFinishMatch: () => finish,
  useDeleteMatch: () => remove,
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
  autoQueue?: {
    enabled: boolean
    onChange: (v: boolean) => void
    onDeleted: (m: MatchOverviewRow) => void
  } | null
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
              autoQueue={o.autoQueue ?? null}
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
  remove.mutate.mockClear()
  finish.error = null
})

/**
 * 자동으로 걸린 대기 경기 — `matches.label` 이 '자동' 이다(`lib/autoQueue.ts`).
 * 이 코트에 배정돼 있고 아직 시작 전(scheduled)이다.
 */
function autoQueuedMatch(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return {
    id: 'auto-1',
    status: 'scheduled',
    court_id: COURT.id,
    label: '자동',
    group_a_name: null,
    group_b_name: null,
    players_a: ['정하늘', '강도윤'],
    players_b: ['윤채원', '임태호'],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

describe('자동 예약 — 보이고, 한 번에 지운다', () => {
  /*
   * 자동 예약은 사람 넷을 묶는다(busy.ts). 그 편성이 접힌 목록 안에 숨어
   * 있으면 총무는 왜 넷이 후보에서 사라졌는지 모른 채 명단만 본다.
   * 그래서 '펼치기' 를 누르지 않아도 보여야 하고, 지우는 길이 한 번이어야 한다.
   */
  test("'자동' 배지와 누구인지가 펼치지 않아도 보인다", () => {
    renderBoard({ matches: [autoQueuedMatch()] })

    expect(screen.getByText('자동')).toBeInTheDocument()
    expect(screen.getByText('정하늘 · 강도윤 vs 윤채원 · 임태호')).toBeInTheDocument()
  })

  /*
   * 넷 중 하나만 마음에 안 들 때 통째로 지우고 처음부터 짜게 하면, 지우는
   * 순간 나머지 셋도 풀려 명단에서 다시 찾아 눌러야 한다. 자동 편성은
   * 대개 셋은 맞히므로 그건 거의 매번 하는 일이 된다.
   */
  test('연필로 그 경기를 고치러 간다 — 지우고 처음부터 짜지 않아도 되게', () => {
    renderBoard({ matches: [autoQueuedMatch()] })

    const edit = screen.getByRole('link', { name: /자동으로 걸린 .* 고치기/ })
    expect(edit).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/matches/auto-1/edit-session`,
    )
  })

  test('고칠 권한이 없으면 연필도 안 그린다 — 고치기는 지웠다 다시 만드는 일이다', () => {
    renderBoard({ matches: [autoQueuedMatch()], isAdmin: false, myDisplayName: '정하늘' })

    expect(screen.queryByRole('link', { name: /고치기/ })).not.toBeInTheDocument()
  })

  test('× 한 번으로 지운다 — 확인 창을 거치지 않는다', async () => {
    renderBoard({ matches: [autoQueuedMatch()] })

    await userEvent.click(screen.getByRole('button', { name: /자동으로 걸린 .* 지우기/ }))

    expect(remove.mutate).toHaveBeenCalledTimes(1)
    expect(remove.mutate.mock.calls[0]?.[0]).toBe('auto-1')
  })

  test('지우기 전에 자동 예약에게 먼저 알린다 — 같은 편성이 되살아나지 않게', async () => {
    const onDeleted = vi.fn()
    renderBoard({
      matches: [autoQueuedMatch()],
      autoQueue: { enabled: true, onChange: vi.fn(), onDeleted },
    })

    await userEvent.click(screen.getByRole('button', { name: /자동으로 걸린 .* 지우기/ }))

    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect((onDeleted.mock.calls[0]?.[0] as { id: string }).id).toBe('auto-1')
    // 순서가 핵심이다 — 지운 뒤에 알리면 그 사이 목록이 갱신되며 다시 걸린다
    expect(onDeleted.mock.invocationCallOrder[0]!).toBeLessThan(
      remove.mutate.mock.invocationCallOrder[0]!,
    )
  })

  test('지울 권한이 없으면 × 를 안 그린다 (서버 RLS 는 관리자만 지우게 한다)', () => {
    renderBoard({ matches: [autoQueuedMatch()], isAdmin: false, myDisplayName: '정하늘' })

    expect(screen.getByText('자동')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /지우기/ })).not.toBeInTheDocument()
  })

  test('자동 경기는 접히는 대기 줄에서 빠진다 — 한 경기가 두 번 보이지 않는다', () => {
    renderBoard({ matches: [autoQueuedMatch()] })

    expect(screen.queryByRole('button', { name: /이 코트 대기 .* 펼치기/ })).not.toBeInTheDocument()
  })

  test('스위치는 내려온 화면에서만 보이고, 누르면 반대 값을 알린다', async () => {
    const onChange = vi.fn()
    renderBoard({
      matches: [autoQueuedMatch()],
      autoQueue: { enabled: true, onChange, onDeleted: vi.fn() },
    })

    const toggle = screen.getByRole('switch', { name: /자동 예약/ })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  test('스위치가 안 내려오면 아예 안 그린다 (모임장이 아닌 사람)', () => {
    renderBoard({ matches: [autoQueuedMatch()], autoQueue: null })

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
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

describe('코트 카드 배경 — 코트 마킹 (docs/design.md 위에서 본 코트)', () => {
  test('장식용 SVG 라 접근성 트리에 안 잡힌다', () => {
    const { container } = renderBoard()
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(svgs.length).toBeGreaterThan(0)
  })

  /**
   * 전폭 배경(CourtLines)은 v7 이후 네트 두 줄만 남기고 상태 신호를 안
   * 낸다 — 그 역할은 코트 번호 옆 작은 정비율 도형(CourtBadge)이 진하기로
   * 대신한다. CourtBadge 는 40×18 고정 크기(h-[18px] w-10)라 전폭
   * 배경(inset-0)과 클래스로 구분할 수 있다.
   */
  test('진행 중인 코트는 코트 도형이 옅고, 빈 코트는 또렷하다', () => {
    const { container: busyContainer } = renderBoard() // 기본값: 진행 중 경기 1개
    const busyBadge = busyContainer.querySelector('svg.w-10[aria-hidden="true"]')
    expect(busyBadge?.getAttribute('class')).toContain('opacity-[0.35]')

    const { container: idleContainer } = renderBoard({ matches: [] })
    const idleBadge = idleContainer.querySelector('svg.w-10[aria-hidden="true"]')
    expect(idleBadge?.getAttribute('class')).toContain('opacity-[0.9]')
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
