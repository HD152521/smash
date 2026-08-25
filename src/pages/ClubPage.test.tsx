import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ClubPage } from './ClubPage'
import type { ClubMemberSummary, ClubTournament } from '@/features/club/api'
import type { ClubRole } from '@/types/database'

/**
 * 동아리 화면에서 서버 동작 때문에 틀리기 쉬운 두 가지를 지킨다.
 *
 * 하나 — **산하 대회 목록이 비어 있는 게 정상인 경우가 있다.** 동아리는 권한
 * 축이 아니라(`tournaments_select` 는 여전히 `is_tournament_member`) 나중에
 * 운영진이 된 사람에게는 그 전에 열린 대회가 안 보인다. 그 사람 화면에는
 * 텅 빈 목록만 남으므로, 빈 칸을 오류로 그리면 멀쩡한 동작이 고장으로 읽힌다.
 *
 * 둘 — 회원에게는 동아리 코드와 운영진 조작이 보이면 안 된다. 진짜 벽은
 * RLS 지만, 눌리는 버튼을 두면 눌러 본 사람은 앱이 고장 났다고 읽는다.
 * 특히 동아리 코드는 새면 앞으로 열릴 모든 대회 명단에 모르는 사람이 들어온다.
 */

const CLUB_ID = '22222222-2222-2222-2222-222222222222'

const state = {
  myRole: 'owner' as ClubRole,
  tournaments: [] as ClubTournament[],
}

function members(): ClubMemberSummary[] {
  return [
    { id: 'cm1', userId: 'u1', displayName: '나', role: state.myRole, joinedAt: '2026-08-01' },
    { id: 'cm2', userId: 'u2', displayName: '둘', role: 'member', joinedAt: '2026-08-02' },
  ]
}

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

const idle = { isPending: false, error: null, mutate: vi.fn(), mutateAsync: vi.fn() }

const GUEST_CODE = 'ABCDEFGHJKMNPQRSTUVWX2'

vi.mock('@/features/club/queries', () => ({
  useClub: () => ({
    data: {
      id: CLUB_ID,
      name: '수요 배드민턴',
      description: null,
      invite_code: 'ABC123',
      guest_code: GUEST_CODE,
    },
    error: null,
  }),
  useClubMembers: () => ({ data: members(), isPending: false, error: null }),
  useClubTournaments: () => ({ data: state.tournaments, isPending: false, error: null }),
  useRenameClub: () => idle,
  useRemoveClubMember: () => idle,
  useSetClubMemberRole: () => idle,
  useDeleteClub: () => idle,
  useRotateGuestCode: () => idle,
}))

function renderClub() {
  return render(
    <MemoryRouter initialEntries={[`/c/${CLUB_ID}`]}>
      <Routes>
        <Route path="/c/:clubId" element={<ClubPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.myRole = 'owner'
  state.tournaments = []
})

describe('동아리 화면', () => {
  test('산하 대회가 하나도 없어도 오류가 아니라 안내를 보여준다', () => {
    renderClub()

    expect(screen.getByText(/아직 동아리 밑에 연 대회가 없습니다/)).toBeInTheDocument()
    // 운영진이 되기 전에 열린 대회가 안 보인다는 사실을 말해 줘야 한다.
    // 안 그러면 그 사람에게는 대회가 사라진 것으로 보인다.
    expect(
      screen.getByText(/운영진이 되기 전에 열린 대회는 여기 보이지 않습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('운영진에게는 동아리 코드와 운영진 지정이 보인다', () => {
    renderClub()

    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '둘 운영진 지정' })).toBeInTheDocument()
  })

  test('회원에게는 동아리 코드도 운영진 조작도 보이지 않는다', () => {
    state.myRole = 'member'
    renderClub()

    expect(screen.queryByText('ABC123')).toBeNull()
    expect(screen.queryByRole('button', { name: '둘 운영진 지정' })).toBeNull()
    expect(screen.queryByRole('button', { name: '둘 내보내기' })).toBeNull()
    // 명단 자체는 회원에게도 보인다 (cm_select 가 is_club_member 다)
    expect(screen.getByText('둘')).toBeInTheDocument()
  })

  test('운영진에게는 게스트 링크와 재발급 버튼이 보인다', () => {
    renderClub()

    expect(screen.getByText(new RegExp(`/g/${GUEST_CODE}$`))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /링크 복사/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 만들기/ })).toBeInTheDocument()
  })

  test('회원에게는 게스트 링크가 보이지 않는다', () => {
    state.myRole = 'member'
    renderClub()

    expect(screen.queryByText(new RegExp(`/g/${GUEST_CODE}$`))).toBeNull()
    expect(screen.queryByRole('button', { name: /다시 만들기/ })).toBeNull()
  })
})
