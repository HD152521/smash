import { supabase } from '@/lib/supabase'
import { unwrap, unwrapVoid } from '@/lib/errors'
import { parseGrade } from '@/lib/grade'
import { parseGender } from '@/lib/gender'
import type {
  CourtRow,
  JoinTournamentResult,
  GroupRow,
  MatchOverviewRow,
  MatchRow,
  MemberRole,
  PlayerGender,
  PlayerGrade,
  RsvpStatus,
  ScoreEventRow,
  StandingRow,
  TournamentConfigPatch,
  TournamentKind,
  TournamentMemberRow,
  TournamentRow,
  TournamentStatus,
} from '@/types/database'

export interface CreateTournamentInput {
  name: string
  description?: string | null
  groupCount: number
  jokerGroupCount: number
  displayName: string
  /** 경기 규칙. 보내지 않은 키는 서버 기본값으로 채워진다 */
  config?: TournamentConfigPatch
  /**
   * 소속 동아리. 넣으면 그 시점 운영진이 관리자 멤버 행으로 함께 심어지고,
   * 소속은 그 뒤로 바뀌지 않는다 (`guard_tournament_update` 가 잠근다).
   */
  clubId?: string | null
}

/**
 * 소속 없이 만드는 경로를 '보내지 않는 것' 으로 표현한다.
 *
 * `p_club_id` 는 서버에서 `default null` 이라 null 을 보내도 결과는 같지만,
 * 인자 자체를 빼면 **기존 대회·모임이 지나던 호출과 비트 단위로 같은 요청**이
 * 된다. 동아리는 선택 계층이고 여기가 두 경로가 갈리는 유일한 지점이라,
 * 안 쓰는 쪽에는 새 인자가 아예 닿지 않게 두는 편이 회귀를 만들 여지가 없다.
 */
function clubArg(clubId: string | null | undefined): { p_club_id?: string } {
  return clubId ? { p_club_id: clubId } : {}
}

export async function createTournament(input: CreateTournamentInput): Promise<TournamentRow> {
  const res = await supabase.rpc('create_tournament', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_group_count: input.groupCount,
    p_joker_group_count: input.jokerGroupCount,
    p_display_name: input.displayName,
    p_config: input.config ?? {},
    ...clubArg(input.clubId),
  })
  return unwrap(res) as TournamentRow
}

/**
 * 대회 설정 바꾸기.
 *
 * 보낸 키만 바뀐다 — 화면이 설정 전체를 들고 있지 않아도 되게. 아직 시작하지
 * 않은 경기는 서버가 새 규칙으로 다시 굳히고, 진행 중·끝난 경기는 그대로 둔다.
 */
export async function updateTournamentConfig(
  tournamentId: string,
  patch: TournamentConfigPatch,
): Promise<TournamentRow> {
  const res = await supabase.rpc('update_tournament_config', {
    p_tournament_id: tournamentId,
    p_config: patch,
  })
  return unwrap(res) as TournamentRow
}

/**
 * 모임 열기.
 *
 * 조가 없어서 create_tournament 과 다른 함수를 쓴다. 코트를 함께 만든다 —
 * 모임은 코트가 곧 화면이라, 코트 없이 만들면 빈 화면부터 보게 된다.
 */
export interface CreateSessionInput {
  name: string
  displayName: string
  courtCount: number
  /** 소속 동아리. `CreateTournamentInput.clubId` 와 같은 규칙 */
  clubId?: string | null
  /**
   * 모임 시각(ISO). 비워 두면 즉석 모임이다 — 만들자마자 코트 현황이 보인다.
   * 서버는 검증하지 않는다(과거 시각도 받는다). '시작했나' 는 화면이 판단한다.
   */
  startsAt?: string | null
}

/**
 * 시각 없이 여는 경로를 '보내지 않는 것' 으로 표현한다 — `clubArg` 와 같은 판단.
 *
 * `p_starts_at` 은 서버에서 맨 뒤 `default null` 이라 null 을 보내도 결과는
 * 같지만, 인자를 아예 빼면 **이 마이그레이션 전에 지나던 호출과 같은 요청**이
 * 된다. 즉석 개설이 새 인자를 한 번도 안 거치게 두는 편이 회귀를 만들 여지가 없다.
 */
function startsAtArg(startsAt: string | null | undefined): { p_starts_at?: string } {
  return startsAt ? { p_starts_at: startsAt } : {}
}

export async function createSession(input: CreateSessionInput): Promise<TournamentRow> {
  const res = await supabase.rpc('create_session', {
    p_name: input.name,
    p_display_name: input.displayName,
    p_court_count: input.courtCount,
    ...clubArg(input.clubId),
    ...startsAtArg(input.startsAt),
  })
  return unwrap(res) as TournamentRow
}

/**
 * 참가/불참 누르기.
 *
 * 갱신된 **내 행 하나**가 그대로 돌아온다 — 화면이 낙관적 갱신을 확정할 때
 * 그 값을 쓴다. 같은 값을 다시 보내도 200 이라(멱등) 더블탭·재전송에
 * 따로 방어를 두지 않는다.
 *
 * 오류는 둘뿐이다. 42501 은 '권한 없음' 이 아니라 **이 모임 명단에 내 행이
 * 없다** 는 뜻이고(명단은 생성 시점 스냅샷이다), 22023 은 대회이거나 값이
 * 빠진 경우다. 문구는 `src/lib/rsvp.ts` 의 `rsvpErrorMessage` 한 곳에 있다.
 */
export async function setMyRsvp(
  tournamentId: string,
  rsvp: RsvpStatus,
): Promise<TournamentMemberRow> {
  const res = await supabase.rpc('set_my_rsvp', {
    p_tournament_id: tournamentId,
    p_rsvp: rsvp,
  })
  return unwrap(res) as TournamentMemberRow
}

/** 모임 경기 편성 — 조 대신 사람을 직접 고른다 */
export async function createSessionMatch(input: {
  tournamentId: string
  courtId: string | null
  playersA: string[]
  playersB: string[]
  /**
   * 경기에 붙는 자유 입력 이름. 자동 예약이 '자동' 을 적어 화면이 배지를
   * 그릴 근거로 쓴다 (`src/lib/autoQueue.ts`). 서버가 공백을 NULL 로 정리한다.
   */
  label?: string | null
}): Promise<MatchRow> {
  const res = await supabase.rpc('create_session_match', {
    p_tournament_id: input.tournamentId,
    p_court_id: input.courtId,
    p_players_a: input.playersA,
    p_players_b: input.playersB,
    p_label: input.label ?? null,
  })
  return unwrap(res) as MatchRow
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
  kind: TournamentKind
  status: TournamentStatus
  inviteCode: string
  role: MemberRole
  groupId: string | null
  joinedAt: string
  /** 소속 동아리. 동아리 없이 만든 대회·모임은 null 이다 (대부분이 여기다) */
  clubId: string | null
  /**
   * 모임 시각. 대회에는 없고, 즉석 모임(시각 없이 연 것)도 null 이다.
   *
   * 홈이 "다음 모임이 언제인가" 에 답하려면 이 값이 목록에 실려야 한다.
   * 컬럼 하나라 조회 비용은 거의 안 늘지만, 이게 없으면 홈이 모임마다
   * 상세를 한 번씩 더 부르게 된다 — 목록 화면이 N+1 이 되는 자리다.
   */
  startsAt: string | null
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
    // kind 가 없던 시절 행이 섞여 있을 수 있다
    kind: TournamentKind | null
    invite_code: string
    club_id: string | null
    starts_at: string | null
  } | null
}

export async function fetchMyTournaments(userId: string): Promise<MyTournament[]> {
  const res = await supabase
    .from('tournament_members')
    .select(
      'role, group_id, joined_at, tournaments(id, name, description, status, kind, invite_code, club_id, starts_at)',
    )
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
      // kind 가 없던 시절 행은 대회다 (isSession 과 같은 판단)
      kind: r.tournaments.kind ?? 'tournament',
      status: r.tournaments.status,
      inviteCode: r.tournaments.invite_code,
      role: r.role,
      groupId: r.group_id,
      joinedAt: r.joined_at,
      clubId: r.tournaments.club_id,
      startsAt: r.tournaments.starts_at,
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
  /**
   * 참가 여부. **모임에서만 뜻이 있다** — 대회 행은 트리거가 전부 'going' 으로
   * 맞추므로 대회 화면에서 이 값을 읽어도 아무것도 갈리지 않는다.
   */
  rsvp: RsvpStatus
  /**
   * 게스트 등록으로 들어왔는가. **화면 배지에만 쓴다, 권한 판단에는 쓰지 않는다.**
   *
   * `userId === null` 로 대신 판별하면 안 된다 — 운영진이 `add_roster_member`
   * 로 손수 올린 미가입 회원도 `userId` 가 null 이라, 그 기준으로는 매주 오는
   * 회원 전원에게 '게스트' 딱지가 붙는다(`is_guest` 컬럼 주석 참고).
   */
  isGuest: boolean
  /**
   * **이 명단에서의 급수 스냅샷**이지 지금 프로필의 급수가 아니다.
   * 명단에 들어올 때 복사되고 그 뒤로는 안 따라온다 — `displayName` 과
   * 같은 규율이다(20260901000001_player_grade.sql).
   *
   * null 은 '모른다' 이지 초심이 아니다. 계정 없이 손으로 올린 사람
   * (`add_roster_member`)과 급수를 안 고르고 가입한 사람이 여기 있다.
   */
  grade: PlayerGrade | null
  /**
   * **이 명단에서의 성별 스냅샷.** `grade` 와 글자 그대로 같은 규율이다
   * (20260902000001_player_gender.sql).
   *
   * null 은 '모른다' 이고, 그 사람은 **종목(남복·여복·혼복) 편성에서
   * 빠진다** — 종목은 선수 넷의 성별에서 나오기 때문이다(`matchKindOf`).
   * 그래서 이 값이 비어 있는 것은 급수가 비어 있는 것보다 무겁고,
   * 명단 화면이 미입력 인원을 세어 보여 준다.
   */
  gender: PlayerGender | null
}

export async function fetchMembers(tournamentId: string): Promise<MemberSummary[]> {
  const res = await supabase
    .from('tournament_members')
    .select('id, user_id, display_name, role, group_id, rsvp, is_guest, grade, gender')
    .eq('tournament_id', tournamentId)
    .order('display_name')

  const rows = unwrap(res) as {
    id: string
    user_id: string
    display_name: string
    role: MemberRole
    group_id: string | null
    rsvp: RsvpStatus
    is_guest: boolean
    grade: unknown
    gender: unknown
  }[]

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    groupId: r.group_id,
    rsvp: r.rsvp,
    isGuest: r.is_guest,
    /*
     * 여기만 `parseGrade` 를 통과시킨다. DB 에 급수가 하나 늘어난 뒤
     * 클라이언트가 아직 안 배포된 몇 분 동안 우리가 모르는 문자열이
     * 실제로 온다 — 그대로 흘리면 명단에 'undefined' 배지가 뜬다.
     * 모르면 배지를 안 그리는 쪽이 맞다.
     */
    grade: parseGrade(r.grade),
    // 급수와 같은 이유로 여기서도 판별한다 — 배포 시차 동안 모르는 문자열이 온다
    gender: parseGender(r.gender),
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
    // 먼저 만든 경기가 위, 나중이 아래. 끌어서 순서를 바꾸면 queue_order 가 바뀐다.
    .order('queue_order', { ascending: true })
    .order('created_at', { ascending: true })
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

/**
 * 명단 행의 급수 바꾸기 (본인 또는 운영진).
 *
 * RLS 로도 관리자는 이 행을 PATCH 할 수 있지만 RPC 를 쓴다 — 이유 둘은
 * 마이그레이션 주석에 있다(20260902000001 6/6): **감사 기록**과 **본인
 * 경로**. 마이페이지에서 프로필을 고쳐도 이미 들어간 명단은 스냅샷이라
 * 안 바뀌므로, 본인이 오늘 명단의 자기 값을 고칠 길이 따로 있어야 한다.
 *
 * `null` 은 "안 바꾼다" 가 아니라 **"모른다로 되돌린다"** 다 — 잘못 누른
 * 것을 되돌리는 경로가 이것뿐이다.
 */
export async function setMemberGrade(
  memberId: string,
  grade: PlayerGrade | null,
): Promise<TournamentMemberRow> {
  const res = await supabase.rpc('set_member_grade', {
    p_member_id: memberId,
    p_grade: grade,
  })
  return unwrap(res) as TournamentMemberRow
}

/**
 * 명단 행의 성별 바꾸기 — `setMemberGrade` 와 같은 규칙.
 *
 * 함수가 둘인 이유: 하나로 합치면 "안 바꾼다" 와 "비운다" 를 한 인자로
 * 구별할 수 없다. 나눠 두면 각 null 이 언제나 '모른다' 하나만 뜻한다.
 */
export async function setMemberGender(
  memberId: string,
  gender: PlayerGender | null,
): Promise<TournamentMemberRow> {
  const res = await supabase.rpc('set_member_gender', {
    p_member_id: memberId,
    p_gender: gender,
  })
  return unwrap(res) as TournamentMemberRow
}

/** 관리자가 명단에 사람을 미리 넣는다 (계정 없이) */
export async function addRosterMember(tournamentId: string, name: string): Promise<void> {
  unwrap(
    await supabase.rpc('add_roster_member', {
      p_tournament_id: tournamentId,
      p_name: name,
    }),
  )
}

/**
 * 명단에서 뺀다.
 *
 * 경기에 나간 사람은 서버가 막는다 — match_team_players 가 cascade 라
 * 지우면 지난 경기에서도 조용히 사라지기 때문이다.
 */
export async function removeMember(memberId: string): Promise<void> {
  unwrapVoid(await supabase.rpc('remove_member', { p_member_id: memberId }))
}

/**
 * 코트 이름 바꾸기.
 *
 * RLS 가 이미 관리자에게 courts 전체 쓰기를 열어 두고 있어서 RPC 가 필요 없다.
 * 0행이 바뀌어도 PostgREST 는 성공을 주므로 single() 로 받아 오류로 잡는다.
 */
export async function renameCourt(courtId: string, name: string): Promise<CourtRow> {
  const res = await supabase.from('courts').update({ name }).eq('id', courtId).select().single()
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

/**
 * 명단에 적어둔 사람과, 나중에 코드로 들어온 계정을 잇는다.
 *
 * 행 단위로 합치지 않는다. 경기 기록과 이름은 명단 쪽, 계정은 계정 쪽,
 * 조는 명단 쪽이 없으면 계정 쪽 — 칸마다 남길 쪽이 다르다.
 * 그 규칙은 서버에 있다 (link_member_account).
 */
export async function linkMemberAccount(
  rosterMemberId: string,
  accountMemberId: string,
): Promise<void> {
  unwrap(
    await supabase.rpc('link_member_account', {
      p_roster_member_id: rosterMemberId,
      p_account_member_id: accountMemberId,
    }),
  )
}

/**
 * 아직 시작 안 한 경기 지우기.
 *
 * 끝난 경기는 서버가 막는다 — 그건 무효 처리가 맞다.
 * PostgREST 는 RLS 로 0행이 걸러져도 성공을 주므로 지워진 행을 세어 확인한다.
 */
export async function deleteMatch(matchId: string): Promise<void> {
  const res = await supabase.from('matches').delete().eq('id', matchId).select('id')
  const rows = unwrap(res) as { id: string }[]
  if (rows.length === 0) throw new Error('경기를 지우지 못했습니다')
}

/** 대회 이름 (가드가 owner_id·초대코드·상태·설정만 막으므로 이름은 직접 고친다) */
export async function renameTournament(tournamentId: string, name: string): Promise<void> {
  const res = await supabase
    .from('tournaments')
    .update({ name })
    .eq('id', tournamentId)
    .select('id')
    .single()
  unwrap(res)
}

/** 조 이름 ('1조' 를 '초급A' 처럼). 조커 지정은 건드리지 않는다 —
 *  이미 치른 경기의 목표 점수 스냅샷과 어긋난다. */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const res = await supabase.from('groups').update({ name }).eq('id', groupId).select('id').single()
  unwrap(res)
}

/**
 * 코트 하나의 대기열을 통째로 다시 쓴다.
 *
 * 옮기기와 순서 바꾸기가 같은 일이라(다른 코트에서 끌어와 3번째에 놓기)
 * 한 번에 보낸다. courtId 가 null 이면 '코트 미배정' 줄이다.
 */
export async function setCourtQueue(
  tournamentId: string,
  courtId: string | null,
  matchIds: string[],
): Promise<void> {
  unwrapVoid(
    await supabase.rpc('set_court_queue', {
      p_tournament_id: tournamentId,
      p_court_id: courtId,
      p_match_ids: matchIds,
    }),
  )
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
