import { supabase } from '@/lib/supabase'
import { unwrap, unwrapVoid } from '@/lib/errors'
import { parseJoinResult } from '@/lib/club'
import type {
  ClubMemberRow,
  ClubRole,
  ClubRow,
  TournamentKind,
  TournamentStatus,
} from '@/types/database'

/**
 * 동아리 데이터 접근.
 *
 * `src/features/tournament/api.ts` 와 같은 모양이다 — supabase 호출을
 * `unwrap()` 으로 감싸 예외로 바꾸고, 화면이 쓰는 모양으로만 좁혀서 돌려준다.
 * react-query 는 여기 있는 함수를 `queries.ts` 에서 감싼다.
 */

// ── 만들기 · 들어오기 ────────────────────────────────────────────────

export interface CreateClubInput {
  name: string
  /** 동아리 안에서 쓸 내 이름. 비우면 서버가 프로필 이름으로 채운다 */
  displayName: string
  description?: string | null
}

export async function createClub(input: CreateClubInput): Promise<ClubRow> {
  const res = await supabase.rpc('create_club', {
    p_name: input.name,
    p_display_name: input.displayName,
    p_description: input.description ?? null,
  })
  return unwrap(res) as ClubRow
}

/**
 * 동아리 코드로 들어오기.
 *
 * 서버가 예외 대신 결과 봉투를 돌려주므로 여기서 예외로 바꿔 준다
 * (예외를 던지면 브루트포스 시도 기록이 롤백되어 차단이 무력화된다).
 * `joinTournament` 과 같은 처리인데, 봉투를 푸는 판단만 `lib/club.ts` 에
 * 있다 — 오류 종류별 안내 문구가 화면마다 흩어지지 않게 하려는 것이다.
 */
export async function joinClub(code: string, displayName?: string): Promise<ClubRow> {
  const res = await supabase.rpc('join_club', {
    p_code: code,
    p_display_name: displayName ?? null,
  })
  const outcome = parseJoinResult(unwrap(res))
  if (!outcome.ok) throw new Error(outcome.message)
  return outcome.club
}

// ── 읽기 ─────────────────────────────────────────────────────────────

/** 내 동아리 목록에 필요한 만큼만 */
export interface MyClub {
  id: string
  name: string
  description: string | null
  inviteCode: string
  role: ClubRole
  /** 이 동아리에서 쓰는 내 이름 (프로필 이름과 다를 수 있다) */
  displayName: string
  joinedAt: string
}

interface MembershipRow {
  role: ClubRole
  display_name: string
  joined_at: string
  clubs: {
    id: string
    name: string
    description: string | null
    invite_code: string
  } | null
}

export async function fetchMyClubs(userId: string): Promise<MyClub[]> {
  const res = await supabase
    .from('club_members')
    .select('role, display_name, joined_at, clubs(id, name, description, invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  const rows = unwrap(res) as unknown as MembershipRow[]

  /*
   * clubs 가 null 인 행은 버린다. RLS 는 행 단위라 멤버십은 보이는데 동아리
   * 쪽이 안 보이는 순간(막 지워진 동아리, 조인 실패)이 있을 수 있고, 그때
   * 이름 없는 빈 칸이 목록에 남으면 눌러도 아무 데도 못 간다.
   */
  return rows
    .filter((r): r is MembershipRow & { clubs: NonNullable<MembershipRow['clubs']> } =>
      Boolean(r.clubs),
    )
    .map((r) => ({
      id: r.clubs.id,
      name: r.clubs.name,
      description: r.clubs.description,
      inviteCode: r.clubs.invite_code,
      role: r.role,
      displayName: r.display_name,
      joinedAt: r.joined_at,
    }))
}

export async function fetchClub(clubId: string): Promise<ClubRow> {
  const res = await supabase.from('clubs').select('*').eq('id', clubId).single()
  return unwrap(res) as ClubRow
}

export interface ClubMemberSummary {
  id: string
  /** null 이면 아직 계정이 없는 회원이다 (마일스톤 2 에서 들어온다) */
  userId: string | null
  displayName: string
  role: ClubRole
  joinedAt: string
}

export async function fetchClubMembers(clubId: string): Promise<ClubMemberSummary[]> {
  const res = await supabase
    .from('club_members')
    .select('id, user_id, display_name, role, joined_at')
    .eq('club_id', clubId)
    .order('display_name')

  const rows = unwrap(res) as Pick<
    ClubMemberRow,
    'id' | 'user_id' | 'display_name' | 'role' | 'joined_at'
  >[]

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    joinedAt: r.joined_at,
  }))
}

export interface ClubTournament {
  id: string
  name: string
  kind: TournamentKind
  status: TournamentStatus
  inviteCode: string
  createdAt: string
}

/**
 * 이 동아리 밑에 열린 대회·모임.
 *
 * 동아리 소속이라고 다 보이는 게 아니다 — `tournaments_select` 정책은
 * 여전히 `is_tournament_member(id)` 뿐이라, 그 대회에 심어진 멤버 행이 있는
 * 사람에게만 보인다(동아리를 권한 축으로 만들지 않기로 한 결정 그대로).
 * 그래서 이 목록은 "동아리의 모든 대회" 가 아니라 "내가 볼 수 있는 것" 이고,
 * 나중에 들어온 운영진에게는 그 전에 열린 대회가 안 보인다.
 */
export async function fetchClubTournaments(clubId: string): Promise<ClubTournament[]> {
  const res = await supabase
    .from('tournaments')
    .select('id, name, kind, status, invite_code, created_at')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })

  const rows = unwrap(res) as unknown as {
    id: string
    name: string
    kind: TournamentKind | null
    status: TournamentStatus
    invite_code: string
    created_at: string
  }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    // kind 가 없던 시절 행은 대회다 (isSession 과 같은 판단)
    kind: r.kind ?? 'tournament',
    status: r.status,
    inviteCode: r.invite_code,
    createdAt: r.created_at,
  }))
}

// ── 운영진 기능 ──────────────────────────────────────────────────────

/**
 * 동아리 이름 바꾸기.
 *
 * `guard_club_update` 가 주인·초대 코드만 잠그므로 이름·설명은 정책
 * (`clubs_update_admin`)만 통과하면 직접 고칠 수 있다. RLS 가 막으면
 * PostgREST 는 0행 갱신을 성공으로 주므로 `single()` 로 받아 오류로 잡는다.
 */
export async function renameClub(clubId: string, name: string): Promise<void> {
  const res = await supabase.from('clubs').update({ name }).eq('id', clubId).select('id').single()
  unwrap(res)
}

/**
 * 운영진 지정·해제.
 *
 * owner 는 넘길 수 없어서 인자에 없다. 해제하면 아직 안 끝난 산하 대회의
 * 관리자 권한도 서버가 함께 내린다 — 내렸는데 이번 주 모임을 계속 관리할
 * 수 있으면 내린 게 아니다.
 */
export async function setClubMemberRole(
  memberId: string,
  role: Exclude<ClubRole, 'owner'>,
): Promise<ClubMemberRow> {
  const res = await supabase.rpc('set_club_member_role', {
    p_member_id: memberId,
    p_role: role,
  })
  return unwrap(res) as ClubMemberRow
}

/** 동아리에서 빼기 / 스스로 나가기. 산하 대회의 멤버 행은 건드리지 않는다 */
export async function removeClubMember(memberId: string): Promise<void> {
  unwrapVoid(await supabase.rpc('remove_club_member', { p_member_id: memberId }))
}

/**
 * 동아리 지우기 (주인만).
 *
 * 산하 대회·경기·점수 원장은 남는다 — `tournaments.club_id` 가
 * `on delete set null` 이라 소속만 풀린다. 지워지는 것은 동아리와 그 명단뿐이다.
 * 0행이 지워져도 PostgREST 는 성공을 주므로 지운 행을 세어 오류로 잡는다.
 */
export async function deleteClub(clubId: string): Promise<void> {
  const res = await supabase.from('clubs').delete().eq('id', clubId).select('id')
  const rows = unwrap(res) as { id: string }[]
  if (rows.length === 0) throw new Error('동아리를 지우지 못했습니다')
}
