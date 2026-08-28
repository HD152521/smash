import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MembersPage } from './MembersPage'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow, MatchOverviewRow, MemberRole, RsvpStatus } from '@/types/database'

/**
 * 참가자 화면의 책임은 **"오늘 누가 왔고 누가 어떤 상태인가"** 하나다.
 * 그리고 그 명단을 그 자리에서 고칠 수 있어야 한다.
 *
 * 여기서 지키는 것 넷:
 *  · 모임에 '조 미정' 주황 경고가 안 뜬다 (모임에는 조가 없다)
 *  · 고치는 버튼은 운영진에게만 뜬다
 *  · 조 배정·권한 변경은 안 끌어온다 (그건 관리 화면 몫이다)
 *  · 순서가 가나다순이 아니라 '다음에 넣을 사람' 순이다
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

vi.mock('@/features/tournament/TournamentNav', () => ({
  TournamentNav: () => null,
}))

const idle = { isPending: false, error: null, mutate: vi.fn(), mutateAsync: vi.fn() }

const state = {
  kind: 'session' as 'session' | 'tournament',
  groups: [] as GroupRow[],
  members: [] as MemberSummary[],
  matches: [] as MatchOverviewRow[],
  myUserId: 'u-admin' as string | undefined,
}

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: state.myUserId } }),
}))

vi.mock('@/features/tournament/queries', () => ({
  useTournament: () => ({ data: { kind: state.kind, config: undefined } }),
  useGroups: () => ({ data: state.groups, isPending: false }),
  useMembers: () => ({ data: state.members, isPending: false, error: null }),
  useMatches: () => ({ data: state.matches }),
  useRemoveMember: () => idle,
  useAddRosterMember: () => idle,
  useSetDisplayName: () => idle,
}))

function member(id: string, displayName: string, over: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id,
    userId: `u-${id}`,
    displayName,
    role: 'member' as MemberRole,
    groupId: null,
    rsvp: 'going' as RsvpStatus,
    isGuest: false,
    // 기본은 '모른다' — 전원이 null 이면 급수 배지가 아예 안 뜬다
    // (hasGradeContrast). 배지를 시험하는 절만 over 로 값을 준다
    grade: null,
    ...over,
  }
}

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'match-1',
    status: 'finished',
    started_at: '2026-08-27T19:00:00Z',
    finished_at: '2026-08-27T19:20:00Z',
    created_at: '2026-08-27T18:00:00Z',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as unknown as MatchOverviewRow
}

function renderMembers() {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}/members`]}>
      <Routes>
        <Route path="/t/:id/members" element={<MembersPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 화면에 보이는 순서대로 이름만 뽑는다 — 뒤에 붙은 판수·배지를 떼어 낸다 */
function rowNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((li) => (li.textContent ?? '').replace(/\d+판$/, ''))
    .map((t) => t.replace(/(주최|관리|게스트|미가입|미정|불참)+$/, '').trim())
}

beforeEach(() => {
  state.kind = 'session'
  state.groups = []
  state.matches = []
  state.myUserId = 'u-admin'
  state.members = [
    member('admin', '운영진', { userId: 'u-admin', role: 'owner' }),
    member('m2', '김민수'),
    member('m3', '박지훈'),
  ]
})

describe('모임에는 조가 없다', () => {
  test("'조 미정' 주황 경고가 안 뜬다 — 정상 상태에 경고색을 칠하지 않는다", () => {
    renderMembers()
    expect(screen.queryByText('조 미정')).not.toBeInTheDocument()
  })

  test('명단은 한 장으로 붙는다', () => {
    renderMembers()
    expect(screen.getByRole('region', { name: '명단' })).toBeInTheDocument()
  })

  test('대회에서 조가 있고 미배정이 남으면 그때만 뜬다', () => {
    state.kind = 'tournament'
    state.groups = [{ id: 'g1', name: '1조', capacity: 4, is_joker: false } as GroupRow]
    state.members = [member('m2', '김민수', { groupId: 'g1' }), member('m3', '박지훈')]
    renderMembers()
    expect(screen.getByText('조 미정')).toBeInTheDocument()
  })
})

describe('보는 화면에서 바로 고친다 — 권한이 있을 때만', () => {
  test('운영진에게는 추가 칸과 빼기 버튼이 보인다', () => {
    renderMembers()
    expect(screen.getByLabelText('추가할 참가자 이름')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '김민수 제외' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '김민수 이름 바꾸기' })).toBeInTheDocument()
  })

  test('일반 참가자에게는 추가도 빼기도 이름 수정도 안 보인다', () => {
    state.myUserId = 'u-m2'
    renderMembers()
    expect(screen.queryByLabelText('추가할 참가자 이름')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /제외/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /이름 바꾸기/ })).not.toBeInTheDocument()
  })

  test('주최자와 나 자신은 뺄 수 없다 — 지우면 대회 주인이 사라진다', () => {
    renderMembers()
    expect(screen.queryByRole('button', { name: /운영진 제외/ })).not.toBeInTheDocument()
  })

  test('이미 경기에 걸린 사람은 눌러보기 전에 막는다', () => {
    state.matches = [match({ status: 'scheduled', players_a: ['김민수'] })]
    renderMembers()
    expect(screen.getByRole('button', { name: /김민수 제외 불가/ })).toBeDisabled()
  })
})

describe('큰 조작은 안 끌어온다 — 그건 관리 화면의 일이다', () => {
  test('조 배정 드롭다운과 권한 버튼이 없다', () => {
    state.kind = 'tournament'
    state.groups = [{ id: 'g1', name: '1조', capacity: 4, is_joker: false } as GroupRow]
    renderMembers()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(
      screen.queryByRole('button', { name: /관리자 임명|관리자 해제/ }),
    ).not.toBeInTheDocument()
  })
})

describe('이름 옆에 정보가 붙는다', () => {
  test('오늘 몇 판 뛰었나가 보인다', () => {
    state.matches = [
      match({ id: 'a', players_a: ['김민수'], players_b: ['박지훈'] }),
      match({ id: 'b', players_a: ['김민수'] }),
    ]
    renderMembers()
    expect(screen.getByText('2판')).toBeInTheDocument()
    expect(screen.getByText('1판')).toBeInTheDocument()
    // 명단에만 있고 안 뛴 사람도 0판으로 보인다 — 그 사람이 곧 다음 차례다
    expect(screen.getByText('0판')).toBeInTheDocument()
  })

  test('한 경기도 없으면 판수를 아예 안 띄운다 — 전원 0판은 아무도 갈라주지 못한다', () => {
    renderMembers()
    expect(screen.queryByText('0판')).not.toBeInTheDocument()
  })

  test('참가 여부가 섞여 있을 때만 배지가 붙는다', () => {
    state.members = [
      member('m2', '김민수', { rsvp: 'going' }),
      member('m3', '박지훈', { rsvp: 'declined' }),
    ]
    renderMembers()
    expect(screen.getByText('불참')).toBeInTheDocument()
  })

  test('아무도 안 눌렀으면 배지를 안 붙인다', () => {
    state.members = [
      member('m2', '김민수', { rsvp: 'invited' }),
      member('m3', '박지훈', { rsvp: 'invited' }),
    ]
    renderMembers()
    expect(screen.queryByText('미정')).not.toBeInTheDocument()
  })

  test("계정이 없는 '명단만' 회원에게는 미정을 안 붙인다 — 누를 방법이 없는 사람이다", () => {
    state.members = [
      member('m2', '김민수', { rsvp: 'going' }),
      member('m3', '박지훈', { rsvp: 'invited' }),
      member('m4', '명단만', { rsvp: 'invited', userId: null }),
    ]
    renderMembers()
    // 갈라 주는 배지는 '미가입' 쪽이다
    expect(screen.getAllByText('미정')).toHaveLength(1)
    expect(screen.getByText('미가입')).toBeInTheDocument()
  })

  test('모임 머리말에 참가·미정·불참을 센다', () => {
    state.members = [
      member('m2', '김민수', { rsvp: 'going' }),
      member('m3', '박지훈', { rsvp: 'invited' }),
    ]
    renderMembers()
    expect(screen.getByText('참가 1 · 미정 1 · 불참 0')).toBeInTheDocument()
  })
})

describe('순서 — 가나다순이 아니라 다음에 넣을 사람 순', () => {
  test('오늘 안 뛴 사람이 위로 온다', () => {
    state.members = [member('m2', '김민수'), member('m3', '박지훈'), member('m4', '최유진')]
    state.myUserId = undefined
    state.matches = [match({ players_a: ['김민수', '박지훈'] })]
    renderMembers()
    expect(rowNames()[0]).toBe('최유진')
  })

  test('안 온다고 누른 사람은 안 뛰었어도 맨 아래다', () => {
    state.members = [
      member('m2', '김민수', { rsvp: 'declined' }),
      member('m3', '박지훈', { rsvp: 'going' }),
    ]
    state.myUserId = undefined
    renderMembers()
    expect(rowNames()).toEqual(['박지훈', '김민수'])
  })
})

describe('빈 명단', () => {
  test('운영진에게는 어디에 적으면 되는지 말해 준다', () => {
    state.members = []
    renderMembers()
    const region = screen.getByRole('region', { name: '명단' })
    expect(within(region).getByText(/아직 아무도 없습니다/)).toBeInTheDocument()
  })
})


/**
 * 급수 배지의 글자만 모은다.
 *
 * `getByText('급수 S')` 로는 안 잡힌다 — 배지 안에서 sr-only 접두('급수 ')와
 * 값('S')이 서로 다른 노드이고, testing-library 의 기본 매처는 그 요소의
 * **직접 텍스트 노드**만 본다. 쪼개져 있는 것 자체가 의도라(눈에는 'S',
 * 소리에는 '급수 S') textContent 로 정확히 맞춘다.
 */
function gradeBadgeTexts(): string[] {
  return screen
    .getAllByRole('listitem')
    .flatMap((li) => Array.from(li.querySelectorAll('span')))
    // 접두를 품은 바깥쪽(배지)만 고른다 — sr-only 안쪽 자체는 '급수 ' 뿐이다
    .filter((el) => el.querySelector('.sr-only') !== null)
    .map((el) => el.textContent ?? '')
}

describe('급수 배지 — 이름 옆에, 대비가 있을 때만', () => {
  test('급수가 섞여 있으면 각자 자기 급수가 이름 옆에 뜬다', () => {
    state.members = [
      member('m2', '김민수', { grade: 'S' }),
      member('m3', '박지훈', { grade: 'beginner' }),
    ]
    renderMembers()
    // 소리로도 무엇의 S 인지 알 수 있어야 한다 (sr-only '급수' 접두)
    expect(gradeBadgeTexts().sort()).toEqual(['급수 S', '급수 초심'])
  })

  test("'초심' 으로 그린다 — DB 값 beginner 가 화면에 새지 않는다", () => {
    state.members = [member('m2', '김민수', { grade: 'beginner' }), member('m3', '박지훈')]
    renderMembers()
    expect(gradeBadgeTexts()).toEqual(['급수 초심'])
    expect(screen.queryByText(/beginner/)).toBeNull()
  })

  /*
   * 모두에게 붙는 배지는 배지가 아니라 잡음이다 — hasRsvpContrast ·
   * hasAccountContrast 와 같은 판단(roster.ts).
   */
  test('전원이 같은 급수면 아예 안 그린다', () => {
    state.members = [
      member('m2', '김민수', { grade: 'B' }),
      member('m3', '박지훈', { grade: 'B' }),
    ]
    renderMembers()
    expect(gradeBadgeTexts()).toEqual([])
  })

  test('아무도 급수를 안 골랐으면 빈 배지가 뜨지 않는다', () => {
    state.members = [member('m2', '김민수'), member('m3', '박지훈')]
    renderMembers()
    expect(gradeBadgeTexts()).toEqual([])
  })

  test('일부만 급수가 있으면 그 사람에게만 붙는다', () => {
    state.members = [member('m2', '김민수', { grade: 'A' }), member('m3', '박지훈')]
    renderMembers()
    expect(gradeBadgeTexts()).toEqual(['급수 A'])
  })
})
