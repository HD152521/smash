import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SessionRsvpPanel } from './SessionRsvpPanel'
import type { MemberSummary } from './api'
import type { RsvpStatus } from '@/types/database'

/**
 * 시작 전 모임 화면의 참가 표시.
 *
 * 여기서 지키는 것 둘.
 *
 * 하나 — **나간다고 누르면 이 화면을 떠난다.** 여기서 볼 것은 "몇 명
 * 오나" 와 "누가 오나" 뿐인데, 안 가는 사람에게는 둘 다 남의 일이다.
 * 남겨 두면 자기와 상관없는 명단을 보고 있게 된다.
 *
 * 둘 — **큰 버튼 둘이 다시 생기면 안 된다.** 여기까지 들어온 사람은 대개
 * 오므로, 오는 사람이 아무것도 안 눌러도 되는 것이 이 화면의 요점이다.
 */

const T_ID = '11111111-1111-1111-1111-111111111111'

const state = { rsvp: 'invited' as RsvpStatus }
const setRsvp = { mutate: vi.fn(), isPending: false, error: null as unknown }

vi.mock('./queries', () => ({ useSetMyRsvp: () => setRsvp }))

function member(over: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id: 'm1',
    userId: 'u1',
    displayName: '나',
    role: 'member',
    groupId: null,
    rsvp: 'going',
    isGuest: false,
    grade: null,
    gender: null,
    ...over,
  } as MemberSummary
}

function renderPanel() {
  const me = member({ id: 'me', rsvp: state.rsvp })
  return render(
    <MemoryRouter initialEntries={[`/t/${T_ID}`]}>
      <Routes>
        <Route
          path="/t/:id"
          element={
            <SessionRsvpPanel
              tournamentId={T_ID}
              startsAt="2026-09-02T20:00:00+09:00"
              members={[me, member({ id: 'm2', displayName: '둘' })]}
              me={me}
              onShowCourts={vi.fn()}
            />
          }
        />
        <Route path="/" element={<p>메인</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.rsvp = 'invited'
  setRsvp.mutate.mockReset()
  setRsvp.isPending = false
  setRsvp.error = null
})

describe('참가가 기본이다', () => {
  test('들어오면 참가로 표시했다고 말한다', () => {
    // 화면을 여는 것만으로 서버에 쓰는 자리라, 조용히 바뀌면 안 된다.
    renderPanel()
    expect(screen.getByText(/참가로 표시했습니다/)).toBeInTheDocument()
  })

  test('참가할게요 버튼이 없다 — 안 눌러도 되는 것이 요점이다', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /참가할게요/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /안 갈래요/ })).toBeNull()
  })
})

describe('나가면 화면을 떠난다', () => {
  test('모임 나가기를 누르면 불참으로 쓰고 메인으로 간다', async () => {
    setRsvp.mutate.mockImplementation((_v: RsvpStatus, opts?: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /모임 나가기/ }))

    expect(setRsvp.mutate).toHaveBeenCalledWith('declined', expect.anything())
    expect(await screen.findByText('메인')).toBeInTheDocument()
  })

  test('쓰기가 실패하면 떠나지 않는다', async () => {
    // 안 나가졌는데 화면만 바뀌면, 다음에 들어와서 자기가 참가로 남아
    // 있는 것을 보고 앱이 거짓말했다고 읽는다.
    setRsvp.mutate.mockImplementation(() => undefined)
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /모임 나가기/ }))

    expect(screen.queryByText('메인')).toBeNull()
  })

  test('다시 들어온 사람에게는 다시 참가할 길이 있다', () => {
    state.rsvp = 'declined'
    renderPanel()

    expect(screen.getByText(/안 간다고 표시했습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 참가/ })).toBeInTheDocument()
  })
})
