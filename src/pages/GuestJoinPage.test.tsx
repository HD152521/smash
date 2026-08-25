import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GuestJoinPage } from './GuestJoinPage'
import type { GuestJoinOutcome, GuestSessionsOutcome } from '@/lib/guest'

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
 * 찾는다.
 */

const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'

const state = {
  sessions: { ok: true, clubName: '수요 배드민턴', sessions: [] } as GuestSessionsOutcome,
  sessionsPending: false,
  sessionsError: null as unknown,
  joinResult: null as GuestJoinOutcome | null,
  joinPending: false,
  joinError: null as unknown,
}

const mutateAsync = vi.fn(async () => state.joinResult)

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

function renderAt(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/g/${code}`]}>
      <Routes>
        <Route path="/g/:guestCode" element={<GuestJoinPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.sessions = { ok: true, clubName: '수요 배드민턴', sessions: [] }
  state.sessionsPending = false
  state.sessionsError = null
  state.joinResult = null
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

  test('이름을 적고 제출하면 등록 RPC 를 호출한다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    renderAt(GUEST_CODE)

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    fireEvent.click(screen.getByRole('button', { name: '명단에 들어가기' }))

    expect(mutateAsync).toHaveBeenCalledWith({ code: GUEST_CODE, sessionId: 's1', name: '홍길동' })
  })

  test('등록 성공하면 적힌 이름을 크게 보여주고 되돌아갈 곳이 없다', () => {
    state.sessions = {
      ok: true,
      clubName: '수요 배드민턴',
      sessions: [{ id: 's1', name: '8/25 정기모임', startsAt: null }],
    }
    state.joinResult = { ok: true, displayName: '홍길동(2)', sessionName: '8/25 정기모임' }
    renderAt(GUEST_CODE)

    expect(screen.getByRole('heading', { name: '홍길동(2)' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
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
