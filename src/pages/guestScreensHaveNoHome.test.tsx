import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { GuestBoardPage } from './GuestBoardPage'
import { GuestJoinPage } from './GuestJoinPage'
import type { GuestBoardOutcome, GuestSessionsOutcome } from '@/lib/guest'

/**
 * **게스트 화면에는 홈이 없어야 한다.**
 *
 * `/g/...` 는 로그인 가드 밖에 있는 두 화면이다(`src/app/routes.tsx`).
 * 여기 온 사람은 계정이 없다 — 링크 하나 받고 코트 옆에서 연 사람이다.
 * 그 사람에게 `/` 는 메인이 아니라 **로그인 화면**이다. 홈 버튼을 두면
 * 출구처럼 생긴 막다른 길을 하나 만드는 셈이고, 돌아올 길도 없다
 * (게스트 코드는 주소창에만 있고 화면에 안 그린다 — GuestBoardPage 주석).
 *
 * 지금은 두 화면 다 `BackBar` 를 쓰지 않아서 저절로 지켜진다. 저절로
 * 지켜지는 것은 조용히 깨진다 — `BackBar` 는 홈을 **기본으로** 켜므로
 * 누가 "여기도 머리말 붙이자" 하는 날 홈이 딸려 들어온다. 그 날을 여기서
 * 잡는다.
 */

const sessionsState = {
  ok: true,
  clubName: '수요 배드민턴',
  sessions: [],
} as GuestSessionsOutcome

const boardState: GuestBoardOutcome = {
  ok: true,
  clubName: '수요 배드민턴',
  session: { id: 'sess-1', name: '8/25 정기모임', startsAt: null, status: 'live' },
  courts: [],
  matches: [],
  finishedCount: 0,
}

vi.mock('@/features/guest/queries', () => ({
  useGuestSessions: () => ({ data: sessionsState, isPending: false, error: null }),
  useJoinAsGuest: () => ({ mutateAsync: vi.fn(), data: null, isPending: false, error: null }),
  useGuestBoard: () => ({ data: boardState, isPending: false, error: null }),
}))

describe('게스트 화면 — 홈이 없다', () => {
  test('등록 화면(/g/:guestCode)에 홈 버튼이 없다', () => {
    render(
      <MemoryRouter initialEntries={['/g/ABCDEFGHJKMNPQRSTUVWX2']}>
        <Routes>
          <Route path="/g/:guestCode" element={<GuestJoinPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: '홈으로 가기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^홈/ })).not.toBeInTheDocument()
  })

  test('현황판(/g/:guestCode/:sessionId)에 홈 버튼이 없다', () => {
    render(
      <MemoryRouter initialEntries={['/g/ABCDEFGHJKMNPQRSTUVWX2/sess-1']}>
        <Routes>
          <Route path="/g/:guestCode/:sessionId" element={<GuestBoardPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: '홈으로 가기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^홈/ })).not.toBeInTheDocument()
  })
})
