import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ClubPage } from './ClubPage'
import type { ClubMemberSummary, ClubTournament } from '@/features/club/api'
import type { ClubRole } from '@/types/database'

/**
 * 동아리 허브의 책임은 **무엇을 할지 고르는 것 하나**다.
 *
 * 전에는 한 장에 이름·동아리 코드·게스트 링크·산하 대회·명단·나가기·
 * 지우기가 다 있었다. 지금은 전부 하위 화면이고 여기는 문만 남는다.
 *
 * 여기서 지키는 것 둘.
 *
 * 하나 — **회원에게는 운영진 문이 아예 없다.** 진짜 벽은 RLS 지만, 눌리는
 * 링크를 두면 들어가 본 사람은 앱이 고장 났다고 읽는다. 특히 동아리
 * 코드와 게스트 링크는 새면 앞으로 열릴 모든 모임 명단에 모르는 사람이
 * 들어온다.
 *
 * 둘 — **산하 대회 목록이 비어 있는 게 정상인 경우가 있다.** 동아리는 권한
 * 축이 아니라(`tournaments_select` 는 여전히 `is_tournament_member`) 나중에
 * 운영진이 된 사람에게는 그 전에 열린 대회가 안 보인다. 빈 칸을 오류로
 * 그리면 멀쩡한 동작이 고장으로 읽힌다.
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

describe('동아리 허브', () => {
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

  test('운영진에게는 하위 화면 넷으로 가는 문이 있다', () => {
    renderClub()

    // 접근성 이름은 제목 + 설명을 합친 것이라 부분 일치가 다른 줄까지 잡는다
    // ('동아리 코드' 줄의 설명에 '명단' 이 들어 있다). 제목으로 시작을 못 박는다.
    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href')
    expect(href(/^게스트 링크/)).toBe(`/c/${CLUB_ID}/guest`)
    expect(href(/^동아리 코드/)).toBe(`/c/${CLUB_ID}/invite`)
    expect(href(/^명단/)).toBe(`/c/${CLUB_ID}/members`)
    expect(href(/^동아리 설정/)).toBe(`/c/${CLUB_ID}/settings`)
  })

  test('회원에게는 코드와 게스트 링크 문이 없다', () => {
    state.myRole = 'member'
    renderClub()

    expect(screen.queryByRole('link', { name: /^게스트 링크/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /^동아리 코드/ })).toBeNull()
    // 명단과 설정은 회원에게도 있다 (cm_select 가 is_club_member 다)
    expect(screen.getByRole('link', { name: /^명단/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^동아리 설정/ })).toBeInTheDocument()
  })

  test('허브에는 코드도 명단도 그리지 않는다 — 문만 있다', () => {
    renderClub()

    // 값이 여기 다시 새어 들어오면 하위 화면과 두 벌이 된다
    expect(screen.queryByText('ABC123')).toBeNull()
    expect(screen.queryByText(new RegExp(GUEST_CODE))).toBeNull()
    expect(screen.queryByText('둘')).toBeNull()
  })
})
