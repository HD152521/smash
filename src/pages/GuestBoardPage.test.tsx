import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GuestBoardPage } from './GuestBoardPage'
import type { GuestBoardCourt, GuestBoardMatch, GuestBoardOutcome } from '@/lib/guest'
import { browserGuestMeStorage, saveGuestName } from '@/lib/guestMe'

/**
 * 게스트 현황판에서 계약 때문에 틀리기 쉬운 것들을 지킨다.
 *
 * 하나 — **이름이 없으면 '내 다음 경기' 카드를 아예 안 그린다.** 빈 카드를
 * 남기면 게스트는 "내 경기가 사라졌나" 로 읽는다. 그래도 현황판 자체는
 * 똑같이 전부 보인다 — 이름은 강조 전용이지 권한이 아니다.
 *
 * 둘 — **공용 대기(코트 미정)를 코트마다 복제하지 않는다.** 복제하면 "대기
 * 2번" 이 코트 넷에 동시에 떠서 게스트가 자기 차례를 네 번 센 것으로 읽는다.
 *
 * 셋 — **끝난 모임에는 등록 입구로 가는 줄을 두지 않는다.** 눌러 본 뒤에야
 * 못 한다는 걸 아는 건 안내가 아니라 함정이다. 반대로 `board_closed` 에는
 * 반드시 둔다 — 링크는 살아 있고 모임만 지났을 때 갈 수 있는 유일한 곳이다.
 */

const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'
const SESSION_ID = 'sess-1'

const state = {
  board: null as GuestBoardOutcome | null,
  pending: false,
  error: null as unknown,
}

vi.mock('@/features/guest/queries', () => ({
  useGuestBoard: () => ({ data: state.board, isPending: state.pending, error: state.error }),
}))

const COURTS: GuestBoardCourt[] = [
  { id: 'c1', name: '1번 코트', sortOrder: 1 },
  { id: 'c2', name: '2번 코트', sortOrder: 2 },
]

function makeMatch(over: Partial<GuestBoardMatch> & { id: string }): GuestBoardMatch {
  return {
    courtId: null,
    status: 'scheduled',
    queueOrder: 1,
    startedAt: null,
    scoreA: 0,
    scoreB: 0,
    playersA: [],
    playersB: [],
    ...over,
  }
}

function liveBoard(matches: GuestBoardMatch[], courts: GuestBoardCourt[] = COURTS) {
  state.board = {
    ok: true,
    clubName: '수요 배드민턴',
    session: { id: SESSION_ID, name: '8/25 정기모임', startsAt: null, status: 'live' },
    courts,
    matches,
    finishedCount: 3,
  }
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={[`/g/${GUEST_CODE}/${SESSION_ID}`]}>
      <Routes>
        <Route path="/g/:guestCode/:sessionId" element={<GuestBoardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 이 폰에 이름을 남긴다 — `guestMe.ts` 를 통해서만. 저장 형식을 테스트가 흉내내지 않는다 */
function rememberMe(name: string) {
  saveGuestName(SESSION_ID, name, browserGuestMeStorage(), Date.now())
}

beforeEach(() => {
  state.board = null
  state.pending = false
  state.error = null
  window.localStorage.clear()
})

describe('게스트 현황판', () => {
  test('코트별 현재 경기와 대기열을 보여준다', () => {
    liveBoard([
      makeMatch({
        id: 'm1',
        courtId: 'c1',
        status: 'live',
        queueOrder: 1,
        scoreA: 11,
        scoreB: 7,
        playersA: ['김철수', '이영희'],
        playersB: ['박민수', '최지우'],
      }),
      makeMatch({ id: 'm2', courtId: 'c1', queueOrder: 2, playersA: ['정한나'] }),
    ])
    renderBoard()

    expect(screen.getByRole('heading', { name: '수요 배드민턴' })).toBeInTheDocument()
    expect(screen.getByText('8/25 정기모임')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1번 코트' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2번 코트' })).toBeInTheDocument()

    // 편성된 사람 이름만 나온다 — 명단 전체는 애초에 응답에 없다
    expect(screen.getByText('김철수')).toBeInTheDocument()
    expect(screen.getByText('11 : 7')).toBeInTheDocument()
    // 대기 경기는 아직 점수가 아니라 'vs' 다
    expect(screen.getByText('정한나')).toBeInTheDocument()
    // 경기가 없는 코트
    expect(screen.getByText('비어 있음')).toBeInTheDocument()
  })

  test('점수가 아직 0:0 인 진행 중 경기는 숫자 대신 진행 중이라고 한다', () => {
    liveBoard([
      makeMatch({
        id: 'm1',
        courtId: 'c1',
        status: 'live',
        playersA: ['김철수'],
        playersB: ['박민수'],
      }),
    ])
    renderBoard()

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.queryByText('0 : 0')).toBeNull()
  })

  test('이름이 없으면 내 다음 경기 카드를 안 그리고 이름 칸만 둔다', () => {
    liveBoard([
      makeMatch({
        id: 'm1',
        courtId: 'c1',
        status: 'live',
        playersA: ['김철수'],
        playersB: ['박민수'],
      }),
    ])
    renderBoard()

    expect(screen.queryByText('내 다음 경기')).toBeNull()
    expect(screen.getByLabelText('이름을 적으면 내 경기를 강조합니다')).toBeInTheDocument()
    // 이름이 없어도 현황판은 똑같이 전부 보인다
    expect(screen.getByText('김철수')).toBeInTheDocument()
  })

  test('이름이 있으면 내 차례까지 몇 경기인지 보여준다', () => {
    rememberMe('정한나')
    liveBoard([
      makeMatch({
        id: 'm1',
        courtId: 'c1',
        status: 'live',
        queueOrder: 1,
        playersA: ['김철수'],
        playersB: ['박민수'],
      }),
      makeMatch({ id: 'm2', courtId: 'c1', queueOrder: 2, playersA: ['이영희'] }),
      makeMatch({ id: 'm3', courtId: 'c1', queueOrder: 3, playersA: ['정한나'] }),
    ])
    renderBoard()

    expect(screen.getByText('내 다음 경기')).toBeInTheDocument()
    expect(screen.getByText('1번 코트 · 앞에 1경기')).toBeInTheDocument()
    expect(screen.queryByLabelText('이름을 적으면 내 경기를 강조합니다')).toBeNull()
  })

  test('코트 미정 경기는 코트마다 복제하지 않고 한 번만 그린다', () => {
    liveBoard([
      makeMatch({ id: 'm1', courtId: 'c1', queueOrder: 1, playersA: ['김철수'] }),
      makeMatch({ id: 'm2', queueOrder: 2, playersA: ['정한나'], playersB: ['최지우'] }),
    ])
    renderBoard()

    expect(screen.getByText('아직 코트 미정')).toBeInTheDocument()
    // 코트가 둘인데도 이 사람은 화면에 딱 한 번 나온다
    expect(screen.getAllByText('정한나')).toHaveLength(1)
    expect(screen.getAllByText('최지우')).toHaveLength(1)
  })

  test('끝난 모임은 끝났다고만 하고 등록 입구를 두지 않는다', () => {
    state.board = {
      ok: true,
      clubName: '수요 배드민턴',
      session: { id: SESSION_ID, name: '8/25 정기모임', startsAt: null, status: 'finished' },
      courts: COURTS,
      matches: [],
      finishedCount: 12,
    }
    renderBoard()

    expect(screen.getByText('오늘 모임이 끝났습니다')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('볼 수 없는 모임이면 안내와 등록 입구를 함께 준다', () => {
    state.board = {
      ok: false,
      error: 'board_closed',
      message: '지금은 볼 수 없는 모임입니다',
    }
    renderBoard()

    expect(screen.getByRole('alert')).toHaveTextContent('지금은 볼 수 없는 모임입니다')
    expect(screen.getByRole('link', { name: '등록 화면으로' })).toHaveAttribute(
      'href',
      `/g/${GUEST_CODE}`,
    )
  })

  test('아무것도 누를 수 없다 — 경기로 들어가는 링크가 없다', () => {
    rememberMe('김철수')
    liveBoard([
      makeMatch({
        id: 'm1',
        courtId: 'c1',
        status: 'live',
        playersA: ['김철수'],
        playersB: ['박민수'],
      }),
      makeMatch({ id: 'm2', queueOrder: 2, playersA: ['정한나'] }),
    ])
    renderBoard()

    expect(screen.queryByRole('link')).toBeNull()
  })
})
