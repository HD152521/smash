import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ClubDuesPage } from './ClubDuesPage'
import type { ClubMemberSummary } from '@/features/club/api'
import type { DuesEntry } from '@/lib/dues'
import type { ClubRole } from '@/types/database'

/**
 * 회비 화면이 지키는 것은 하나다 — **회원에게 미납자 명단이 안 보인다.**
 *
 * 진짜 벽은 여기가 아니라 RLS 다(`scripts/smoke-dues.ts` 3절이 회원 세션으로
 * 붙어 0행을 증명한다). 이 파일이 지키는 것은 그 위층이다: 화면이 실수로
 * 남의 이름을 그리려 하지 않는지, 그리고 회원 화면에서는 **장부를 아예
 * 부르지 않는지**. 서버가 0행을 주더라도 화면이 "비었다" 를 "다 냈다" 로
 * 그리면 그것도 거짓말이다.
 *
 * 나머지 하나는 총무의 동작이다 — 통장을 보며 **한 번 눌러** 미납을 지워
 * 나가는 것. 그 한 번이 두 번이 되면 이 기능은 엑셀보다 느려진다.
 */

const CLUB_ID = '22222222-2222-2222-2222-222222222222'

const state = {
  myRole: 'owner' as ClubRole,
}

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

function members(): ClubMemberSummary[] {
  return [
    { id: 'cm1', userId: 'u1', displayName: '나', role: state.myRole, joinedAt: '2026-08-01' },
    { id: 'cm2', userId: 'u2', displayName: '정하늘', role: 'member', joinedAt: '2026-08-02' },
  ]
}

vi.mock('@/features/club/queries', () => ({
  useClub: () => ({
    data: { id: CLUB_ID, name: '수요 배드민턴', description: null },
    error: null,
  }),
  useClubMembers: () => ({ data: members(), isPending: false, error: null }),
}))

const ENTRIES: DuesEntry[] = [
  {
    id: 'd1',
    memberId: 'cm1',
    memberName: '나',
    amount: 30000,
    paidOn: '2026-09-01',
    note: null,
    removedAt: null,
  },
  {
    id: 'd2',
    memberId: 'cm2',
    memberName: '정하늘',
    amount: 30000,
    paidOn: null,
    note: null,
    removedAt: null,
  },
  {
    id: 'd3',
    memberId: 'cm3',
    memberName: '최유진',
    amount: 30000,
    paidOn: null,
    note: null,
    removedAt: null,
  },
  // 뺀 사람. 🔴 회원 화면에는 이 이름도 안 나와야 한다 — 「뺀 사람」 칸은
  // 운영진 화면에만 있고, 회원은 애초에 장부를 조회하지도 않는다.
  {
    id: 'd4',
    memberId: 'cm4',
    memberName: '휴회중',
    amount: 30000,
    paidOn: null,
    note: null,
    removedAt: '2026-09-03T00:00:00Z',
  },
]

const SUMMARY = {
  period_month: '2026-09-01',
  expected_total: 90000,
  collected_total: 30000,
  mine: { id: 'd1', amount: 30000, paid_on: '2026-09-01' },
}

const setPaid = vi.fn()
const duesEntriesSpy = vi.fn()

const idle = { isPending: false, error: null, mutate: vi.fn(), mutateAsync: vi.fn() }

vi.mock('@/features/dues/queries', () => ({
  useDuesSummary: () => ({ data: SUMMARY, error: null, isPending: false }),
  useDuesEntries: (_clubId: string | undefined, _month: string, enabled = true) => {
    duesEntriesSpy(enabled)
    // 회원 화면에서는 애초에 안 부른다. 부르면 RLS 가 걸러 0행이 오는데,
    // 그 0행은 "장부가 없다" 와 구별되지 않는다.
    return enabled
      ? { data: ENTRIES, error: null, isPending: false }
      : { data: undefined, error: null, isPending: false }
  },
  usePreviousMonthDues: () => ({ data: undefined, error: null, isPending: false }),
  useOpenDuesMonth: () => idle,
  useSetDuesPaid: () => ({ ...idle, mutateAsync: setPaid }),
  useSetDuesAmount: () => idle,
  useSetDuesNote: () => idle,
  useRemoveDuesEntry: () => idle,
  useRestoreDuesEntry: () => idle,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/c/${CLUB_ID}/dues`]}>
      <Routes>
        <Route path="/c/:clubId/dues" element={<ClubDuesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.myRole = 'owner'
  setPaid.mockReset()
  duesEntriesSpy.mockReset()
})

describe('회원 화면 — 자기 것 한 줄과 합계뿐이다', () => {
  beforeEach(() => {
    state.myRole = 'member'
  })

  /*
   * 이 검사가 이 파일의 이유다. 동아리에서 "누가 회비 안 냈다" 가
   * 공개되면 실제로 사람이 나간다.
   */
  test('🔴 남의 이름이 한 줄도 안 보인다', () => {
    renderPage()
    expect(screen.queryByText('정하늘')).toBeNull()
    expect(screen.queryByText('최유진')).toBeNull()
    // 뺀 사람도 마찬가지다. "이 달 회비에서 빠진 사람" 이 누구인지도
    // 회원에게는 알 필요가 없고, 알게 두면 그 자체가 명단이 된다.
    expect(screen.queryByText('휴회중')).toBeNull()
  })

  test('🔴 「안 낸 사람」 목록 자체가 없다', () => {
    renderPage()
    expect(screen.queryByText(/안 낸 사람/)).toBeNull()
    expect(screen.queryByText(/낸 사람/)).toBeNull()
  })

  /*
   * 서버가 0행을 주더라도 화면이 그걸 "장부가 비었다" 로 그리면 회원은
   * "아직 아무도 안 냈네" 로 읽는다. 아예 안 묻는 것이 맞다.
   */
  test('🔴 장부를 아예 조회하지 않는다', () => {
    renderPage()
    expect(duesEntriesSpy).toHaveBeenCalled()
    expect(duesEntriesSpy.mock.calls.every((c) => c[0] === false)).toBe(true)
  })

  test('합계는 본다 — 얼마 걷혔는지는 알아도 된다', () => {
    renderPage()
    // 막대의 이름표가 합계를 그대로 읽어 준다 (숫자는 화면 여러 곳에 나온다)
    expect(screen.getByRole('img', { name: '90,000원 중 30,000원 걷힘' })).toBeTruthy()
  })

  /*
   * 합계는 보여도 되지만 **인원 수는 안 된다.** 회원 수를 아는 사람에게
   * "미납 3명" 은 곧 명단을 좁히는 단서다.
   */
  test('🔴 납부·미납 인원 수는 안 보인다', () => {
    renderPage()
    expect(screen.queryByText(/미납\s*\d/)).toBeNull()
    expect(screen.queryByText(/납부\s*\d+명/)).toBeNull()
  })

  test('자기 납부 상태를 본다', () => {
    renderPage()
    expect(screen.getByText('내 회비')).toBeTruthy()
    expect(screen.getByText(/납부 완료/)).toBeTruthy()
  })
})

describe('운영진 화면 — 통장을 보며 미납을 지워 나간다', () => {
  test('안 낸 사람이 이름과 함께 보인다', () => {
    renderPage()
    expect(screen.getByText('정하늘')).toBeTruthy()
    expect(screen.getByText('최유진')).toBeTruthy()
  })

  test('안 낸 사람과 낸 사람이 갈려 있고 수가 적혀 있다', () => {
    renderPage()
    const unpaid = screen.getByRole('heading', { name: /안 낸 사람/ })
    expect(unpaid.textContent).toContain('2')
  })

  /*
   * 통장을 훑어 내려가는 동작이라 한 번 눌러 끝나야 한다. 확인 창이나
   * 시트를 거치게 하면 16명을 체크하는 데 32번을 누른다.
   */
  test('미납자를 한 번 누르면 바로 납부로 표시된다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('정하늘'))
    expect(setPaid).toHaveBeenCalledWith({ duesId: 'd2', paid: true })
  })

  /*
   * 되돌리기는 한 번 누르기로 두지 않는다 — 빠르게 훑다가 이미 체크한
   * 사람을 스쳐 되돌리면 장부가 통장과 어긋난다.
   */
  test('이미 낸 사람을 눌러도 되돌려지지 않는다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('나'))
    expect(setPaid).not.toHaveBeenCalled()
  })

  test('고치는 길은 따로 있다 — 사람마다 «⋯» 가 붙는다', () => {
    renderPage()
    expect(screen.getByRole('button', { name: '정하늘 회비 고치기' })).toBeTruthy()
  })
})
