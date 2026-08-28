import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GuestJoinPage } from './GuestJoinPage'
import type { GuestJoinOutcome, GuestSessionsOutcome } from '@/lib/guest'
import { browserGuestMeStorage, loadGuestName, saveGuestName } from '@/lib/guestMe'

/**
 * 게스트 등록 화면에서 서버 계약 때문에 틀리기 쉬운 것들을 지킨다.
 *
 * 하나 — **후보가 하나면 모임 고르기 화면 자체가 안 뜬다.** B 안(설계 판단
 * 4)의 핵심이 "운영진 조작 0회" 인데, 화면이 후보 하나를 다시 확인시키면
 * 그 이점이 사라진다.
 *
 * 둘 — **로그인 유도가 없다.** 이 화면은 계정이 없는 사람을 위한 것이다.
 *
 * 셋 — **완료 화면은 적힌 이름을 그대로, 크게 보여준다.** 접미사가 붙었으면
 * (`unique_display_name`) 그 사실을 게스트가 알아야 코트 현황판에서 자신을
 * 찾는다. 그래서 등록 직후에는 **자동으로 넘어가지 않는다** — 재방문일
 * 때만 넘긴다.
 *
 * 넷 — **재방문 자동 이동은 후보에 있는 모임으로만, `replace` 로.** 저장값만
 * 믿으면 지난 모임 주소로 보내 놓고 "볼 수 없는 모임" 만 보여 주게 되고,
 * `push` 면 현황판에서 뒤로가기를 누를 때마다 여기로 돌아왔다가 다시 밀려
 * 무한 왕복이 된다.
 */

const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'

const state = {
  sessions: { ok: true, clubName: '수요 배드민턴', sessions: [] } as GuestSessionsOutcome,
  sessionsPending: false,
  sessionsError: null as unknown,
  joinResult: null as GuestJoinOutcome | null,
  /** mutateAsync 가 돌려줄 값. 완료 화면을 안 띄운 채 저장 동작만 볼 때 쓴다 */
  mutateResult: null as GuestJoinOutcome | null,
  joinPending: false,
  joinError: null as unknown,
}

const mutateAsync = vi.fn(async () => state.mutateResult ?? state.joinResult)

vi.mock('@/features/guest/queries', () => ({
  useGuestSessions: () => ({
    data: state.sessions,
    isPending: state.sessionsPending,
    error: state.sessionsError,
  }),
  useJoinAsGuest: () => ({
    mutateAsync,
    data: state.joinResult,
    isPending: state.joinPending,
    error: state.joinError,
  }),
}))

/**
 * 현황판 자리에는 진짜 화면 대신 표시만 둔다 — 여기서 확인하려는 것은
 * "그 주소로 갔나" 뿐이고, 현황판이 무엇을 그리는지는
 * `GuestBoardPage.test.tsx` 가 따로 지킨다.
 */
function renderAt(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/g/${code}`]}>
      <Routes>
        <Route path="/g/:guestCode" element={<GuestJoinPage />} />
        <Route path="/g/:guestCode/:sessionId" element={<p>현황판 자리</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  state.sessions = { ok: true, clubName: '수요 배드민턴', sessions: [] }
  state.sessionsPending = false
  state.sessionsError = null
  state.joinResult = null
  state.mutateResult = null
  state.joinPending = false
  state.joinError = null
  mutateAsync.mockClear()
})

describe('게스트 등록 화면', () => {
  test('코드가 틀리면 안내만 보여준다', () => {
    state.sessions = { ok: false, error: 'bad_code', message: '링크가 올바르지 않습니다' }
    renderAt(GUEST_CODE)

    expect(screen.getByRole('alert')).toHaveTextContent('링크가 올바르지 않습니다')
    // 로그인 유도가 없다 — 계정을 만들 이유가 없는 사람이다
    expect(screen.queryByText(/로그인/)).toBeNull()
  })

  test('열린 모임이 없으면 안내만 보여준다', () => {
    state.sessions = { ok: false, error: 'no_open_session', message: '지금 열린 모임이 없습니다' }
    renderAt(GUEST_CODE)

    expect(screen.getByRole('alert')).toHaveTextContent('지금 열린 모임이 없습니다')
  })

  test('후보가 하나면 모임 고르기 없이 바로 이름 입력이 뜬다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    expect(screen.getByText('수요 배드민턴')).toBeInTheDocument()
    expect(screen.queryByText('어느 모임에 오셨나요')).toBeNull()
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })

  test('후보가 둘이면 골라야 이름 입력이 뜬다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [
        { id: 's1', name: '8/25 정기모임', startsAt: null },
        { id: 's2', name: '8/26 번개모임', startsAt: null },
      ],
    }
    renderAt(GUEST_CODE)

    expect(screen.getByText('어느 모임에 오셨나요')).toBeInTheDocument()
    expect(screen.queryByLabelText('이름')).toBeNull()

    fireEvent.click(screen.getByText('8/26 번개모임'))
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })

  /*
   * 급수를 안 고르고 제출하는 경로다. `grade: null` 이면 api.ts 가 p_grade
   * 를 아예 안 실어 보내고, 서버는 옛 3인자 호출과 똑같이 다룬다 —
   * **급수는 등록을 막지 않는다** 는 것이 여기서 지켜진다.
   */
  test('이름만 적고 제출해도 등록 RPC 를 호출한다 (급수는 선택이라 null)', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    fireEvent.click(screen.getByRole('button', { name: '명단에 들어가기' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      code: GUEST_CODE,
      sessionId: 's1',
      name: '홍길동',
      grade: null,
    })
  })

  test('급수를 고르면 이름과 함께 실려 간다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    // 화면에는 '초심' 이지만 실려 가는 값은 'beginner' 다 — DB 값에 한글을
    // 넣지 않는다는 규율(src/lib/grade.ts)이 여기서 눈에 보인다
    fireEvent.click(screen.getByRole('radio', { name: '초심' }))
    fireEvent.click(screen.getByRole('button', { name: '명단에 들어가기' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      code: GUEST_CODE,
      sessionId: 's1',
      name: '홍길동',
      grade: 'beginner',
    })
  })

  /*
   * 잘못 누른 급수를 되돌릴 방법이 있어야 한다. '모름' 이 목록의 첫 칸에
   * 실제 선택지로 그려져 있는 것이 그 방법이다 — 없으면 한 번 누른 사람은
   * 새로고침 말고는 취소할 길이 없다.
   */
  test("잘못 고른 급수는 '모름' 을 눌러 되돌릴 수 있다", () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    fireEvent.click(screen.getByRole('radio', { name: 'S' }))
    fireEvent.click(screen.getByRole('radio', { name: '모름' }))
    fireEvent.click(screen.getByRole('button', { name: '명단에 들어가기' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      code: GUEST_CODE,
      sessionId: 's1',
      name: '홍길동',
      grade: null,
    })
  })

  test('등록 성공하면 적힌 이름을 크게 보여주고 현황판으로 가는 줄을 준다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    state.joinResult = { ok: true, displayName: '홍길동(2)', sessionName: '8/25 정기모임' }
    renderAt(GUEST_CODE)

    // 접미사가 붙은 최종 이름을 읽을 시간을 준다 — 자동으로 넘어가지 않는다
    expect(screen.getByRole('heading', { name: '홍길동(2)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '코트 현황 보기' })).toHaveAttribute(
      'href',
      `/g/${GUEST_CODE}/s1`,
    )
    // 로그인 유도는 여전히 없다
    expect(screen.queryByText(/로그인/)).toBeNull()
  })

  test('등록에 성공하면 서버가 돌려준 최종 이름을 이 폰에 남긴다', async () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    state.mutateResult = { ok: true, displayName: '홍길동(2)', sessionName: '8/25 정기모임' }
    renderAt(GUEST_CODE)

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    fireEvent.click(screen.getByRole('button', { name: '명단에 들어가기' }))
    await waitFor(() =>
      expect(loadGuestName('s1', browserGuestMeStorage(), Date.now())).toBe('홍길동(2)'),
    )
  })

  test('이미 등록한 모임이 후보에 남아 있으면 현황판으로 보낸다', () => {
    saveGuestName('s1', '홍길동', browserGuestMeStorage(), Date.now())
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    expect(screen.getByText('현황판 자리')).toBeInTheDocument()
    expect(screen.queryByLabelText('이름')).toBeNull()
  })

  test('저장된 이름이 후보에 없는 모임이면 등록 화면 그대로 둔다', () => {
    // 지난주 모임에 적어 둔 이름. 그 주소로 보내면 "볼 수 없는 모임" 만 보게 된다
    saveGuestName('s-지난주', '홍길동', browserGuestMeStorage(), Date.now())
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    expect(screen.queryByText('현황판 자리')).toBeNull()
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })

  test('이름 오류가 오면 그 자리에서 안내하고 다시 시도할 수 있다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    state.joinResult = { ok: false, error: 'guest_limit', message: '오늘은 더 받을 수 없습니다' }
    renderAt(GUEST_CODE)

    expect(screen.getByRole('alert')).toHaveTextContent('오늘은 더 받을 수 없습니다')
    // 그대로 다시 시도할 수 있다 — 화면이 갇히지 않는다
    expect(screen.getByRole('button', { name: '명단에 들어가기' })).toBeInTheDocument()
  })
})
