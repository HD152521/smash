import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type {
  CourtRow,
  JoinTournamentResult,
  GroupRow,
  MatchOverviewRow,
  MatchRow,
  MemberRole,
  ScoreEventRow,
  StandingRow,
  TournamentRow,
  TournamentStatus,
} from '@/types/database'

export interface CreateTournamentInput {
  name: string
  description?: string | null
  groupCount: number
  jokerGroupCount: number
  displayName: string
  normalPoints?: number
  jokerPoints?: number
}

export async function createTournament(input: CreateTournamentInput): Promise<TournamentRow> {
  const res = await supabase.rpc('create_tournament', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_group_count: input.groupCount,
    p_joker_group_count: input.jokerGroupCount,
    p_display_name: input.displayName,
    p_normal_points: input.normalPoints ?? 21,
    p_joker_points: input.jokerPoints ?? 11,
  })
  return unwrap(res) as TournamentRow
}

/**
 * 참가. 서버가 예외 대신 결과 객체를 돌려주므로 여기서 예외로 바꿔 준다.
 * (예외를 던지면 브루트포스 시도 기록이 롤백되어 차단이 무력화된다)
 */
export async function joinTournament(code: string, displayName?: string): Promise<TournamentRow> {
  const res = await supabase.rpc('join_tournament', {
    p_code: code,
    p_display_name: displayName ?? null,
  })
  const result = unwrap(res) as unknown as JoinTournamentResult
  if (!result.ok) throw new Error(result.message)
  return result.tournament
}

/** 내 대회 모음에 필요한 만큼만 */
export interface MyTournament {
  id: string
  name: string
  description: string | null
  status: TournamentStatus
  inviteCode: string
  role: MemberRole
  groupId: string | null
  joinedAt: string
}

interface MembershipRow {
  role: MemberRole
  group_id: string | null
  joined_at: string
  tournaments: {
    id: string
    name: string
    description: string | null
    status: TournamentStatus
    invite_code: string
  } | null
}

export async function fetchMyTournaments(userId: string): Promise<MyTournament[]> {
  const res = await supabase
    .from('tournament_members')
    .select('role, group_id, joined_at, tournaments(id, name, description, status, invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  const rows = unwrap(res) as unknown as MembershipRow[]

  return rows
    .filter((r): r is MembershipRow & { tournaments: NonNullable<MembershipRow['tournaments']> } =>
      Boolean(r.tournaments),
    )
    .map((r) => ({
      id: r.tournaments.id,
      name: r.tournaments.name,
      description: r.tournaments.description,
      status: r.tournaments.status,
      inviteCode: r.tournaments.invite_code,
      role: r.role,
      groupId: r.group_id,
      joinedAt: r.joined_at,
    }))
}

export async function fetchGroups(tournamentId: string): Promise<GroupRow[]> {
  const res = await supabase
    .from('groups')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  return unwrap(res) as GroupRow[]
}

export async function fetchProfileName(userId: string): Promise<string> {
  const res = await supabase.from('profiles').select('name').eq('id', userId).single()
  const row = unwrap(res) as { name: string }
  return row.name
}

export async function fetchTournament(id: string): Promise<TournamentRow> {
  const res = await supabase.from('tournaments').select('*').eq('id', id).single()
  return unwrap(res) as unknown as TournamentRow
}

export interface MemberSummary {
  id: string
  /** null 이면 아직 앱에 안 들어온 '명단만' 참가자다 */
  userId: string | null
  displayName: string
  role: MemberRole
  groupId: string | null
}

export async function fetchMembers(tournamentId: string): Promise<MemberSummary[]> {
  const res = await supabase
    .from('tournament_members')
    .select('id, user_id, display_name, role, group_id')
    .eq('tournament_id', tournamentId)
    .order('display_name')

  const rows = unwrap(res) as {
    id: string
    user_id: string
    display_name: string
    role: MemberRole
    group_id: string | null
  }[]

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    groupId: r.group_id,
  }))
}

export async function setMyGroup(tournamentId: string, groupId: string | null) {
  const res = await supabase.rpc('set_my_group', {
    p_tournament_id: tournamentId,
    p_group_id: groupId,
  })
  return unwrap(res)
}

// ── 관리자 기능 ──────────────────────────────────────────────────────

/**
 * 역할 변경. owner 는 넘기거나 뺏을 수 없다 (대회 삭제 권한이 딸려 있다).
 * RLS 의 tm_update_admin 정책이 관리자만 통과시킨다.
 */
export async function setMemberRole(memberId: string, role: Exclude<MemberRole, 'owner'>) {
  const res = await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role })
  return unwrap(res)
}

/** 관리자가 남의 조를 옮긴다 (대회 시작 후 본인은 못 바꾸므로 필요) */
export async function setMemberGroup(memberId: string, groupId: string | null) {
  const res = await supabase
    .from('tournament_members')
    .update({ group_id: groupId })
    .eq('id', memberId)
    .select()
    .single()
  return unwrap(res)
}

export async function setTournamentStatus(tournamentId: string, status: TournamentStatus) {
  const res = await supabase.rpc('set_tournament_status', {
    p_tournament_id: tournamentId,
    p_status: status,
  })
  return unwrap(res)
}

export async function regenerateInviteCode(tournamentId: string) {
  const res = await supabase.rpc('regenerate_invite_code', { p_tournament_id: tournamentId })
  return unwrap(res)
}

// ── 코트 ─────────────────────────────────────────────────────────────

export async function fetchCourts(tournamentId: string): Promise<CourtRow[]> {
  const res = await supabase
    .from('courts')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  return unwrap(res) as CourtRow[]
}

export async function createCourt(tournamentId: string, name: string, sortOrder: number) {
  const res = await supabase
    .from('courts')
    .insert({ tournament_id: tournamentId, name, sort_order: sortOrder })
    .select()
    .single()
  return unwrap(res)
}

export async function deleteCourt(courtId: string) {
  const { error } = await supabase.from('courts').delete().eq('id', courtId)
  if (error) throw error
}

// ── 경기 ─────────────────────────────────────────────────────────────

export interface CreateMatchInput {
  tournamentId: string
  courtId: string | null
  label?: string | null
  groupA: string
  playersA: string[]
  groupB: string
  playersB: string[]
  referees?: string[]
}

/**
 * 경기 편성. 목표 점수와 승점은 클라이언트가 보내지 않는다 —
 * 서버가 조의 is_joker 와 대회 config 에서 계산해 스냅샷으로 굳힌다.
 */
export async function createMatch(input: CreateMatchInput): Promise<MatchRow> {
  const res = await supabase.rpc('create_match', {
    p_tournament_id: input.tournamentId,
    p_court_id: input.courtId,
    p_label: input.label ?? null,
    p_group_a: input.groupA,
    p_players_a: input.playersA,
    p_group_b: input.groupB,
    p_players_b: input.playersB,
    p_referees: input.referees ?? [],
  })
  return unwrap(res) as MatchRow
}

export async function fetchMatches(tournamentId: string): Promise<MatchOverviewRow[]> {
  const res = await supabase
    .from('match_overview')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
  return unwrap(res) as unknown as MatchOverviewRow[]
}

/**
 * 경기 무효 처리.
 *
 * 삭제하지 않는다 — score_events 가 cascade 로 함께 사라져
 * "누가 몇 대 몇으로 이겼는지" 를 되짚을 수 없게 되기 때문이다.
 * 무효 상태로 남기면 순위 집계에서는 빠지고 기록은 보존된다.
 */
export async function voidMatch(matchId: string, reason?: string): Promise<MatchRow> {
  const res = await supabase.rpc('void_match', {
    p_match_id: matchId,
    p_reason: reason ?? null,
  })
  return unwrap(res) as MatchRow
}

export async function fetchStandings(tournamentId: string): Promise<StandingRow[]> {
  const res = await supabase.rpc('get_standings', { p_tournament_id: tournamentId })
  return unwrap(res) as unknown as StandingRow[]
}

export interface ManualMatchInput {
  tournamentId: string
  groupA: string
  playersA: string[]
  scoreA: number
  groupB: string
  playersB: string[]
  scoreB: number
  label?: string | null
}

/**
 * 누락된 경기 결과를 소급 입력한다.
 * 원장(score_events)은 만들지 않는다 — 한 점씩 들어온 게 아니라 결과만 아는
 * 것이므로, 원장을 지어내면 감사 추적이 거짓말이 된다. source='manual' 로 남는다.
 */
export async function recordManualMatch(input: ManualMatchInput): Promise<MatchRow> {
  const res = await supabase.rpc('record_manual_match', {
    p_tournament_id: input.tournamentId,
    p_group_a: input.groupA,
    p_players_a: input.playersA,
    p_score_a: input.scoreA,
    p_group_b: input.groupB,
    p_players_b: input.playersB,
    p_score_b: input.scoreB,
    p_label: input.label ?? null,
  })
  return unwrap(res) as MatchRow
}

export interface AuditEntry {
  id: number
  action: string
  target_type: string
  target_id: string | null
  before: unknown
  after: unknown
  created_at: string
  actor_id: string | null
}

export async function fetchAuditLog(tournamentId: string, limit = 100): Promise<AuditEntry[]> {
  const res = await supabase
    .from('audit_logs')
    .select('id, action, target_type, target_id, before, after, created_at, actor_id')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return unwrap(res) as unknown as AuditEntry[]
}

/** 코트 순서를 한 칸 위(-1) 또는 아래(1)로 옮긴다 */
export async function moveCourt(courtId: string, direction: -1 | 1): Promise<CourtRow[]> {
  const res = await supabase.rpc('move_court', { p_court_id: courtId, p_direction: direction })
  return unwrap(res) as unknown as CourtRow[]
}

/** 공용 대기 경기를 특정 코트가 가져간다 (심판·관리자) */
/**
 * 관리자가 예정 경기를 코트 대기열에 넣거나 뺀다.
 *
 * claim_court 와 다르다. 그쪽은 "빈 코트를 집어가 지금 시작" 이라 코트에
 * 진행 중인 경기가 있으면 막는다. 이건 "저 코트 줄에 세워두기" 라서
 * 코트가 지금 바쁘더라도 넣을 수 있어야 한다.
 * 한 코트 한 경기 규칙은 시작 시점(start_match)에서 지켜진다.
 *
 * 점수·상태·승자는 가드 트리거가 직접 수정을 막으므로 코트만 바뀐다.
 */
/**
 * 한 경기의 득점 원장.
 *
 * 참가자면 누구나 읽을 수 있다(RLS). 취소된 득점(voided)까지 가져와서
 * 화면에서 거른다 — 서버에서 걸러 버리면 '몇 개가 취소됐는지' 를 알 수 없다.
 */
export async function fetchScoreEvents(matchId: string): Promise<ScoreEventRow[]> {
  const res = await supabase
    .from('score_events')
    .select('id, side, delta, voided, created_at')
    .eq('match_id', matchId)
    .order('id')
  return unwrap(res) as ScoreEventRow[]
}

/**
 * 표시 이름 바꾸기 (본인 또는 관리자).
 *
 * RLS 를 넓히지 않고 RPC 로 여는 이유는 마이그레이션 주석에 적어 뒀다 —
 * 본인 행을 열면 group_id 까지 함께 열려 조 변경 규칙이 뚫린다.
 */
export async function setDisplayName(memberId: string, name: string): Promise<void> {
  const res = await supabase.rpc('set_display_name', {
    p_member_id: memberId,
    p_name: name,
  })
  unwrap(res)
}

/** 관리자가 명단에 사람을 미리 넣는다 (계정 없이) */
export async function addRosterMember(tournamentId: string, name: string): Promise<void> {
  unwrap(await supabase.rpc('add_roster_member', {
    p_tournament_id: tournamentId,
    p_name: name,
  }))
}

/**
 * 명단에서 뺀다.
 *
 * 경기에 나간 사람은 서버가 막는다 — match_team_players 가 cascade 라
 * 지우면 지난 경기에서도 조용히 사라지기 때문이다.
 */
export async function removeMember(memberId: string): Promise<void> {
  unwrap(await supabase.rpc('remove_member', { p_member_id: memberId }))
}

/**
 * 코트 이름 바꾸기.
 *
 * RLS 가 이미 관리자에게 courts 전체 쓰기를 열어 두고 있어서 RPC 가 필요 없다.
 * 0행이 바뀌어도 PostgREST 는 성공을 주므로 single() 로 받아 오류로 잡는다.
 */
export async function renameCourt(courtId: string, name: string): Promise<CourtRow> {
  const res = await supabase
    .from('courts')
    .update({ name })
    .eq('id', courtId)
    .select()
    .single()
  return unwrap(res) as unknown as CourtRow
}

export interface UpdateMatchInput {
  matchId: string
  courtId: string | null
  groupA: string
  playersA: string[]
  groupB: string
  playersB: string[]
  referees: string[]
}

/**
 * 아직 시작하지 않은 경기 고치기.
 *
 * 세 테이블(match_teams / players / referees)을 직접 손대지 않는다.
 * 조를 바꾸면 목표 점수 스냅샷까지 다시 계산해야 하고, 선수 소속·정원·
 * 심판 규칙도 편성과 똑같이 지켜야 한다. 그 규칙은 전부 서버에 있다.
 */
export async function updateMatch(input: UpdateMatchInput): Promise<MatchRow> {
  const res = await supabase.rpc('update_match', {
    p_match_id: input.matchId,
    p_court_id: input.courtId,
    p_group_a: input.groupA,
    p_players_a: input.playersA,
    p_group_b: input.groupB,
    p_players_b: input.playersB,
    p_referees: input.referees,
  })
  return unwrap(res) as unknown as MatchRow
}

export async function assignCourt(matchId: string, courtId: string | null): Promise<MatchRow> {
  const res = await supabase
    .from('matches')
    .update({ court_id: courtId })
    .eq('id', matchId)
    // single() 이 있어야 RLS 에 걸려 0행이 바뀐 경우를 오류로 잡는다.
    // PostgREST 는 아무것도 못 바꿔도 성공으로 응답한다.
    .select()
    .single()
  return unwrap(res) as unknown as MatchRow
}

export async function claimCourt(matchId: string, courtId: string): Promise<MatchRow> {
  const res = await supabase.rpc('claim_court', { p_match_id: matchId, p_court_id: courtId })
  return unwrap(res) as MatchRow
}
