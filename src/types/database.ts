/**
 * ⚠ 이 파일은 임시 수기 정의입니다.
 *
 * Supabase 프로젝트가 준비되면 실제 스키마에서 생성한 것으로 교체됩니다:
 *   npm run db:types
 *
 * 그 전까지 프론트엔드가 타입 안전하게 개발될 수 있도록,
 * supabase/migrations/*.sql 과 손으로 맞춰 둔 정의입니다.
 * 마이그레이션을 수정하면 여기도 함께 고쳐야 합니다 (생성 전까지만).
 */

export type TournamentStatus = 'draft' | 'live' | 'finished'
export type MemberRole = 'owner' | 'admin' | 'member'
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'void'
export type MatchSource = 'live' | 'manual'
export type TeamSide = 'A' | 'B'

export interface TournamentConfig {
  format: 'doubles' | 'singles'
  normalPoints: number
  jokerPoints: number
  deuce: boolean
  winPoints: number
  jokerWinPoints: number
  lossPoints: number
  jokerGroupCount: number
}

export interface TournamentRow {
  id: string
  name: string
  description: string | null
  invite_code: string
  owner_id: string
  status: TournamentStatus
  config: TournamentConfig
  created_at: string
  updated_at: string
}

export interface GroupRow {
  id: string
  tournament_id: string
  name: string
  sort_order: number
  is_joker: boolean
  capacity: number
  created_at: string
}

export interface TournamentMemberRow {
  id: string
  tournament_id: string
  user_id: string
  group_id: string | null
  role: MemberRole
  display_name: string
  avatar_url: string | null
  joined_at: string
  updated_at: string
}

export interface CourtRow {
  id: string
  tournament_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface MatchRow {
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
}

export interface MatchOverviewRow {
  id: string
  tournament_id: string
  court_id: string | null
  court_name: string | null
  label: string | null
  status: MatchStatus
  source: MatchSource
  score_a: number
  score_b: number
  winner_side: TeamSide | null
  started_at: string | null
  finished_at: string | null
  edited_at: string | null
  created_at: string
  group_a_id: string | null
  group_a_name: string | null
  group_a_joker: boolean | null
  target_a: number | null
  group_b_id: string | null
  group_b_name: string | null
  group_b_joker: boolean | null
  target_b: number | null
  players_a: string[]
  players_b: string[]
  referees: string[]
}

export interface StandingRow {
  group_id: string
  group_name: string
  is_joker: boolean
  sort_order: number
  played: number
  wins: number
  losses: number
  points: number
  scored: number
  conceded: number
  diff: number
}

export interface ProfileRow {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>
      tournaments: Table<TournamentRow>
      groups: Table<GroupRow>
      tournament_members: Table<TournamentMemberRow>
      courts: Table<CourtRow>
      matches: Table<MatchRow>
    }
    Views: {
      match_overview: { Row: MatchOverviewRow; Relationships: [] }
    }
    Functions: {
      create_tournament: {
        Args: {
          p_name: string
          p_description: string | null
          p_group_count: number
          p_joker_group_count: number
          p_display_name: string
          p_normal_points?: number
          p_joker_points?: number
        }
        Returns: TournamentRow
      }
      join_tournament: {
        Args: { p_code: string; p_display_name?: string | null }
        Returns: TournamentRow
      }
      set_my_group: {
        Args: { p_tournament_id: string; p_group_id: string | null }
        Returns: TournamentMemberRow
      }
      set_tournament_status: {
        Args: { p_tournament_id: string; p_status: TournamentStatus }
        Returns: TournamentRow
      }
      regenerate_invite_code: {
        Args: { p_tournament_id: string }
        Returns: TournamentRow
      }
      create_match: {
        Args: {
          p_tournament_id: string
          p_court_id: string | null
          p_label: string | null
          p_group_a: string
          p_players_a: string[]
          p_group_b: string
          p_players_b: string[]
          p_referees?: string[]
        }
        Returns: MatchRow
      }
      start_match: { Args: { p_match_id: string }; Returns: MatchRow }
      record_score: {
        Args: {
          p_match_id: string
          p_side: TeamSide
          p_delta: number
          p_client_event_id: string
        }
        Returns: MatchRow
      }
      undo_score: { Args: { p_match_id: string }; Returns: MatchRow }
      finish_match: {
        Args: { p_match_id: string; p_winner_side?: TeamSide | null }
        Returns: MatchRow
      }
      reopen_match: { Args: { p_match_id: string }; Returns: MatchRow }
      get_standings: { Args: { p_tournament_id: string }; Returns: StandingRow[] }
    }
    Enums: {
      tournament_status: TournamentStatus
      member_role: MemberRole
      match_status: MatchStatus
      match_source: MatchSource
      team_side: TeamSide
    }
    CompositeTypes: Record<string, never>
  }
}
