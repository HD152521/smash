import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ClubGuestLinkPage } from './ClubGuestLinkPage'
import { ClubInvitePage } from './ClubInvitePage'
import type { ClubMemberSummary } from '@/features/club/api'
import type { ClubRole } from '@/types/database'

/**
 * 코드 두 종류가 회원에게 새지 않는지를 지킨다. 동아리 화면을 쪼개면서
 * 이 계약이 허브에서 여기로 옮겨 왔다.
 *
 * 진짜 벽은 RLS 와 RPC 안의 검사다. 그래도 화면이 열리면 눌러 본 사람은
 * 앱이 고장 났다고 읽고, 무엇보다 **코드가 화면에 그려진 순간 이미 샌
 * 것**이다 — 어깨너머로 보이고 캡처 한 장이면 끝난다.
 *
 * 동아리 코드가 새면 앞으로 열릴 모든 모임 명단에 모르는 사람이 남고,
 * 게스트 링크가 새면 오늘 모임에 아무나 이름을 적는다.
 */

const CLUB_ID = '22222222-2222-2222-2222-222222222222'
const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'
const INVITE_CODE = 'ABC123'

const state = { myRole: 'owner' as ClubRole }

vi.mock('@/features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

function members(): ClubMemberSummary[] {
  return [
    { id: 'cm1', userId: 'u1', displayName: '나', role: state.myRole, joinedAt: '2026-08-01' },
  ]
}

const rotate = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null }

vi.mock('@/features/club/queries', () => ({
  useClub: () => ({
    data: {
      id: CLUB_ID,
      name: '수요 배드민턴',
      description: null,
      invite_code: INVITE_CODE,
      guest_code: GUEST_CODE,
    },
    error: null,
  }),
  useClubMembers: () => ({ data: members(), isPending: false, error: null }),
  useRotateGuestCode: () => rotate,
}))

function renderPage(which: 'guest' | 'invite') {
  const path = which === 'guest' ? 'guest' : 'invite'
  return render(
    <MemoryRouter initialEntries={[`/c/${CLUB_ID}/${path}`]}>
      <Routes>
        <Route path="/c/:clubId/guest" element={<ClubGuestLinkPage />} />
        <Route path="/c/:clubId/invite" element={<ClubInvitePage />} />
        <Route path="/c/:clubId" element={<p>허브</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.myRole = 'owner'
})

describe('게스트 링크 화면', () => {
  test('운영진에게는 링크와 복사·재발급이 있다', () => {
    renderPage('guest')

    expect(screen.getByText(new RegExp(`/g/${GUEST_CODE}$`))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /링크 복사/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 만들기/ })).toBeInTheDocument()
  })

  test('회원이 주소로 바로 들어오면 링크를 못 보고 허브로 돌아간다', () => {
    state.myRole = 'member'
    renderPage('guest')

    expect(screen.queryByText(new RegExp(GUEST_CODE))).toBeNull()
    expect(screen.getByText('허브')).toBeInTheDocument()
  })

  test('여기에 동아리 코드를 함께 두지 않는다', () => {
    // 둘은 들어오는 문이 다르다 — 나란히 두면 급할 때 엉뚱한 것을 뿌린다
    renderPage('guest')

    expect(screen.queryByText(INVITE_CODE)).toBeNull()
  })
})

describe('동아리 코드 화면', () => {
  test('운영진에게는 코드가 보인다', () => {
    renderPage('invite')

    expect(screen.getByText(INVITE_CODE)).toBeInTheDocument()
  })

  test('회원이 주소로 바로 들어오면 코드를 못 보고 허브로 돌아간다', () => {
    state.myRole = 'member'
    renderPage('invite')

    expect(screen.queryByText(INVITE_CODE)).toBeNull()
    expect(screen.getByText('허브')).toBeInTheDocument()
  })

  test('여기에 게스트 링크를 함께 두지 않는다', () => {
    renderPage('invite')

    expect(screen.queryByText(new RegExp(GUEST_CODE))).toBeNull()
  })

  test('재발급 버튼이 없다 — 바꾸면 아직 안 들어온 회원의 코드가 한꺼번에 죽는다', () => {
    renderPage('invite')

    expect(screen.queryByRole('button', { name: /다시 만들기/ })).toBeNull()
  })
})
