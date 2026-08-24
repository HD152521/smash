/**
 * 이 파일은 실제 DB 스키마에서 생성됩니다. 직접 수정하지 마세요.
 *   npm run db:types
 *
 * 스키마를 바꿨으면 db:push 후 이 명령을 다시 돌리세요.
 */

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[]

export type MatchSource = 'live' | 'manual'
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'void'
export type MemberRole = 'owner' | 'admin' | 'member'
export type TeamSide = 'A' | 'B'
export type TournamentStatus = 'draft' | 'live' | 'finished'

export type AuditLogsRow = {
  id: number
  tournament_id: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  before: Json | null
  after: Json | null
  created_at: string
}

export type CourtsRow = {
  id: string
  tournament_id: string
  name: string
  sort_order: number
  created_at: string
}

export type GroupsRow = {
  id: string
  tournament_id: string
  name: string
  sort_order: number
  is_joker: boolean
  capacity: number
  created_at: string
}

export type JoinAttemptsRow = {
  id: number
  user_id: string
  code: string
  succeeded: boolean
  attempted_at: string
}

export type MatchOverviewRow = {
  id: string | null
  tournament_id: string | null
  court_id: string | null
  court_name: string | null
  label: string | null
  status: MatchStatus | null
  source: MatchSource | null
  score_a: number | null
  score_b: number | null
  winner_side: TeamSide | null
  queue_order: number | null
  started_at: string | null
  finished_at: string | null
  edited_at: string | null
  created_at: string | null
  group_a_id: string | null
  group_a_name: string | null
  group_a_joker: boolean | null
  target_a: number | null
  deuce_a: boolean | null
  max_a: number | null
  group_b_id: string | null
  group_b_name: string | null
  group_b_joker: boolean | null
  target_b: number | null
  deuce_b: boolean | null
  max_b: number | null
  players_a: string[] | null
  players_b: string[] | null
  referees: string[] | null
}

export type MatchRefereesRow = {
  match_id: string
  member_id: string
}

export type MatchTeamPlayersRow = {
  match_team_id: string
  member_id: string
}

export type MatchTeamsRow = {
  id: string
  match_id: string
  side: TeamSide
  group_id: string
  target_score: number
  win_points: number
  is_joker: boolean
  deuce: boolean
  max_score: number | null
}

export type MatchesRow = {
  id: string
  tournament_id: string
  court_id: string | null
  label: string | null
  status: MatchStatus
  source: MatchSource
  score_a: number
  score_b: number
  winner_side: TeamSide | null
  started_at: string | null
  finished_at: string | null
  created_by: string | null
  updated_by: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
  queue_order: number
}

export type NotificationOutboxRow = {
  id: string
  match_id: string
  user_id: string
  kind: string
  created_at: string
  sent_at: string | null
}

export type ProfilesRow = {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type PushSubscriptionsRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  last_success_at: string | null
  failure_count: number
}

export type ScoreEventsRow = {
  id: number
  match_id: string
  side: TeamSide
  delta: number
  client_event_id: string
  voided: boolean
  created_by: string | null
  created_at: string
}

export type TournamentMembersRow = {
  id: string
  tournament_id: string
  user_id: string | null
  group_id: string | null
  role: MemberRole
  display_name: string
  avatar_url: string | null
  joined_at: string
  updated_at: string
}

export type TournamentsRow = {
  id: string
  name: string
  description: string | null
  invite_code: string
  owner_id: string
  status: TournamentStatus
  config: Json
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      audit_logs: { Row: AuditLogsRow; Insert: Partial<AuditLogsRow> & Pick<AuditLogsRow, 'tournament_id' | 'action' | 'target_type'>; Update: Partial<AuditLogsRow>; Relationships: [] }
      courts: { Row: CourtsRow; Insert: Partial<CourtsRow> & Pick<CourtsRow, 'tournament_id' | 'name' | 'sort_order'>; Update: Partial<CourtsRow>; Relationships: [] }
      groups: { Row: GroupsRow; Insert: Partial<GroupsRow> & Pick<GroupsRow, 'tournament_id' | 'name' | 'sort_order'>; Update: Partial<GroupsRow>; Relationships: [] }
      join_attempts: { Row: JoinAttemptsRow; Insert: Partial<JoinAttemptsRow> & Pick<JoinAttemptsRow, 'user_id' | 'code' | 'succeeded'>; Update: Partial<JoinAttemptsRow>; Relationships: [] }
      match_referees: { Row: MatchRefereesRow; Insert: MatchRefereesRow; Update: Partial<MatchRefereesRow>; Relationships: [] }
      match_team_players: { Row: MatchTeamPlayersRow; Insert: MatchTeamPlayersRow; Update: Partial<MatchTeamPlayersRow>; Relationships: [] }
      match_teams: { Row: MatchTeamsRow; Insert: Partial<MatchTeamsRow> & Pick<MatchTeamsRow, 'match_id' | 'side' | 'group_id' | 'target_score' | 'win_points'>; Update: Partial<MatchTeamsRow>; Relationships: [] }
      matches: { Row: MatchesRow; Insert: Partial<MatchesRow> & Pick<MatchesRow, 'tournament_id'>; Update: Partial<MatchesRow>; Relationships: [] }
      notification_outbox: { Row: NotificationOutboxRow; Insert: Partial<NotificationOutboxRow> & Pick<NotificationOutboxRow, 'match_id' | 'user_id' | 'kind'>; Update: Partial<NotificationOutboxRow>; Relationships: [] }
      profiles: { Row: ProfilesRow; Insert: Partial<ProfilesRow> & Pick<ProfilesRow, 'id'>; Update: Partial<ProfilesRow>; Relationships: [] }
      push_subscriptions: { Row: PushSubscriptionsRow; Insert: Partial<PushSubscriptionsRow> & Pick<PushSubscriptionsRow, 'user_id' | 'endpoint' | 'p256dh' | 'auth'>; Update: Partial<PushSubscriptionsRow>; Relationships: [] }
      score_events: { Row: ScoreEventsRow; Insert: Partial<ScoreEventsRow> & Pick<ScoreEventsRow, 'match_id' | 'side' | 'delta' | 'client_event_id'>; Update: Partial<ScoreEventsRow>; Relationships: [] }
      tournament_members: { Row: TournamentMembersRow; Insert: Partial<TournamentMembersRow> & Pick<TournamentMembersRow, 'tournament_id' | 'display_name'>; Update: Partial<TournamentMembersRow>; Relationships: [] }
      tournaments: { Row: TournamentsRow; Insert: Partial<TournamentsRow> & Pick<TournamentsRow, 'name' | 'invite_code' | 'owner_id'>; Update: Partial<TournamentsRow>; Relationships: [] }
    }
    Views: {
      match_overview: { Row: MatchOverviewRow; Relationships: [] }
    }
    Enums: {
      match_source: MatchSource
      match_status: MatchStatus
      member_role: MemberRole
      team_side: TeamSide
      tournament_status: TournamentStatus
    }
  }
}
