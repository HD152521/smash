/**
 * 앱에서 쓰는 DB 타입.
 *
 * 테이블·뷰·enum 은 `database.gen.ts` 에서 실제 스키마를 읽어 생성됩니다.
 * 이 파일은 생성기가 만들 수 없는 것만 얹습니다:
 *   1. jsonb 컬럼의 실제 모양 (config → TournamentConfig)
 *   2. RPC(Functions) 시그니처 — supabase.rpc() 의 타입 안전을 위해
 *   3. 짧은 별칭 (TournamentsRow → TournamentRow)
 *
 * 스키마를 바꿨으면: npm run db:push && npm run db:types
 */
import type {
  CourtsRow,
  Database as GeneratedDatabase,
  GroupsRow,
  MatchOverviewRow,
  MatchTeamsRow,
  MatchesRow,
  ProfilesRow,
  ScoreEventsRow,
  TournamentMembersRow,
  TournamentsRow,
} from './database.gen'

export type {
  AuditLogsRow,
  Json,
  MatchRefereesRow,
  MatchSource,
  MatchStatus,
  MatchTeamPlayersRow,
  MemberRole,
  TeamSide,
  TournamentKind,
  TournamentStatus,
} from './database.gen'

import type { MatchOverviewRow as _MO, TeamSide } from './database.gen'

// ── 1. jsonb 컬럼의 실제 모양 ────────────────────────────────────────
export type TournamentConfig = {
  format: 'doubles' | 'singles'
  /** 일반조 목표 점수 */
  normalPoints: number
  /** 조커조 목표 점수 */
  jokerPoints: number
  /** 목표 점수에 닿아도 2점 차가 나야 끝난다 */
  deuce: boolean
  /** 일반조 듀스 상한 — 여기 닿으면 2점 차 없이 끝. null 이면 상한 없음 */
  deuceCap: number | null
  /** 조커조 듀스 상한 */
  jokerDeuceCap: number | null
  /** 일반조 승리 시 승점 */
  winPoints: number
  /** 조커조 승리 시 승점 — 적은 점수로 이기는 대신 절반만 받는다 */
  jokerWinPoints: number
  /** 순위 계산이 쓰지 않는다. 호환용으로만 남아 있다. */
  lossPoints: number
  /** 1조부터 몇 개 조가 조커조인지 — groups.is_joker 의 사본이라 직접 못 바꾼다 */
  jokerGroupCount: number
  /** 코트 체인지 안내를 심판 화면에 띄운다 */
  courtChange: boolean
  /** 몇 점에 바꾸나. null 이면 목표 점수의 절반(올림) */
  courtChangeAt: number | null
  /** 코트 대기 몇 번째부터 '곧 차례' 알림을 보낼지 */
  readyQueuePosition: number
}

/** update_tournament_config 에 보내는 값 — 보낸 키만 바뀐다 */
export type TournamentConfigPatch = Partial<Omit<TournamentConfig, 'jokerGroupCount'>>

// ── 2. 짧은 별칭 ─────────────────────────────────────────────────────
export type TournamentRow = Omit<TournamentsRow, 'config'> & { config: TournamentConfig }
export type GroupRow = GroupsRow
export type TournamentMemberRow = TournamentMembersRow
export type CourtRow = CourtsRow
export type MatchRow = MatchesRow
export type MatchTeamRow = MatchTeamsRow
export type ScoreEventRow = ScoreEventsRow
export type ProfileRow = ProfilesRow
export type { MatchOverviewRow }

// ── 3. RPC 반환 타입 (테이블이 아니라 함수 결과) ─────────────────────
export type StandingRow = {
  group_id: string
  group_name: string
  is_joker: boolean
  sort_order: number
  played: number
  wins: number
  losses: number
  /** 일반 승리 1.0 / 조커 승리 0.5 의 합 */
  points: number
  scored: number
  conceded: number
  diff: number
}

/**
 * join_tournament 는 예외 대신 결과를 돌려준다.
 * 예외를 던지면 트랜잭션이 롤백되면서 브루트포스 시도 기록까지 지워져,
 * 차단 카운터가 영원히 0 이 되기 때문이다.
 */
export type JoinTournamentResult =
  | { ok: true; tournament: TournamentRow }
  | {
      ok: false
      error: 'unauthenticated' | 'rate_limited' | 'bad_format' | 'not_found' | 'finished'
      message: string
    }

// ── 4. Functions 를 얹은 최종 Database 타입 ──────────────────────────
type GenTables = GeneratedDatabase['public']['Tables']

/**
 * supabase-js 는 public 스키마를 Tables/Views/Functions/Enums/CompositeTypes 로
 * 정확히 가진 객체 타입으로 기대한다.
 * 생성물에 `& { Functions: ... }` 를 교집합하면 .rpc() 가 인자를 never 로 추론한다.
 * 그래서 키를 하나씩 명시적으로 조립한다.
 */
export type Database = {
  public: {
    Tables: Omit<GenTables, 'tournaments'> & {
      // config 는 생성기가 Json 으로 뽑지만 실제 모양이 정해져 있다
      tournaments: {
        Row: TournamentRow
        Insert: GenTables['tournaments']['Insert']
        Update: GenTables['tournaments']['Update']
        Relationships: []
      }
    }
    Views: GeneratedDatabase['public']['Views']
    Enums: GeneratedDatabase['public']['Enums']
    Functions: {
      create_tournament: {
        Args: {
          p_name: string
          p_description: string | null
          p_group_count: number
          p_joker_group_count: number
          p_display_name: string
          /** 경기 규칙. 보내지 않은 키는 서버 기본값으로 채워진다 */
          p_config?: TournamentConfigPatch
        }
        Returns: TournamentRow
      }
      update_tournament_config: {
        Args: { p_tournament_id: string; p_config: TournamentConfigPatch }
        Returns: TournamentRow
      }
      /**
       * 모임 열기. 조가 없으므로 create_tournament 과 다른 함수다.
       * 코트를 함께 만든다 — 모임은 코트가 곧 화면이다.
       */
      create_session: {
        Args: { p_name: string; p_display_name: string; p_court_count?: number }
        Returns: TournamentRow
      }
      /** 모임 경기 편성. 조 대신 사람을 직접 고른다. */
      create_session_match: {
        Args: {
          p_tournament_id: string
          p_court_id: string | null
          p_players_a: string[]
          p_players_b: string[]
          p_label?: string | null
        }
        Returns: MatchRow
      }
      join_tournament: {
        Args: { p_code: string; p_display_name?: string | null }
        Returns: JoinTournamentResult
      }
      set_member_role: {
        Args: { p_member_id: string; p_role: 'admin' | 'member' }
        Returns: TournamentMemberRow
      }
      record_manual_match: {
        Args: {
          p_tournament_id: string
          p_group_a: string
          p_players_a: string[]
          p_score_a: number
          p_group_b: string
          p_players_b: string[]
          p_score_b: number
          p_label?: string | null
        }
        Returns: MatchRow
      }
      move_court: {
        Args: { p_court_id: string; p_direction: number }
        Returns: CourtRow[]
      }
      claim_court: {
        Args: { p_match_id: string; p_court_id: string }
        Returns: MatchRow
      }
      void_match: {
        Args: { p_match_id: string; p_reason?: string | null }
        Returns: MatchRow
      }
      set_my_group: {
        Args: { p_tournament_id: string; p_group_id: string | null }
        Returns: TournamentMemberRow
      }
      link_member_account: {
        Args: { p_roster_member_id: string; p_account_member_id: string }
        Returns: TournamentMemberRow
      }
      set_court_queue: {
        Args: { p_tournament_id: string; p_court_id: string | null; p_match_ids: string[] }
        Returns: void
      }
      update_match: {
        Args: {
          p_match_id: string
          p_court_id: string | null
          p_group_a: string
          p_players_a: string[]
          p_group_b: string
          p_players_b: string[]
          p_referees?: string[]
        }
        Returns: MatchRow
      }
      set_display_name: {
        Args: { p_member_id: string; p_name: string }
        Returns: TournamentMemberRow
      }
      add_roster_member: {
        Args: { p_tournament_id: string; p_name: string }
        Returns: TournamentMemberRow
      }
      remove_member: {
        Args: { p_member_id: string }
        Returns: void
      }
      set_tournament_status: {
        Args: { p_tournament_id: string; p_status: TournamentRow['status'] }
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
    CompositeTypes: Record<string, never>
  }
}

/** match_overview 는 대진표·기록 화면이 그대로 쓰는 평탄화된 행이다 */
export type MatchOverview = _MO
