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
  ClubMembersRow,
  ClubsRow,
  CourtsRow,
  Database as GeneratedDatabase,
  GroupsRow,
  Json,
  MatchOverviewRow,
  MatchTeamsRow,
  MatchesRow,
  PlayerGender,
  PlayerGrade,
  ProfilesRow,
  RsvpStatus,
  ScoreEventsRow,
  TournamentMembersRow,
  TournamentsRow,
} from './database.gen'

export type {
  AuditLogsRow,
  ClubRole,
  Json,
  MatchRefereesRow,
  MatchSource,
  MatchStatus,
  MatchTeamPlayersRow,
  MemberRole,
  PlayerGender,
  PlayerGrade,
  RsvpStatus,
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
/** 동아리는 대회 위에 얹힌 선택 계층이다 — 명단의 원천이지 권한 축이 아니다 */
export type ClubRow = ClubsRow
export type ClubMemberRow = ClubMembersRow
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

/**
 * join_club 도 같은 이유로 예외를 안 던진다 — 실패 기록 뒤에 예외를 던지면
 * 같은 트랜잭션의 브루트포스 시도 기록까지 롤백되어 차단이 무력화된다.
 * 봉투를 푸는 곳은 `src/lib/club.ts` 의 parseJoinResult 하나다.
 */
export type JoinClubResult =
  | { ok: true; club: ClubRow }
  | {
      ok: false
      error: 'unauthenticated' | 'rate_limited' | 'bad_format' | 'not_found'
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
          /**
           * 소속 동아리. 없으면 지금까지와 똑같은 경로로 만들어진다.
           * 넣으면 그 시점 운영진이 관리자 멤버 행으로 함께 심어진다.
           * 소속은 생성 후 불변이다 (guard_tournament_update 가 잠근다).
           */
          p_club_id?: string | null
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
        Args: {
          p_name: string
          p_display_name: string
          p_court_count?: number
          /** 소속 동아리. create_tournament 의 p_club_id 와 같은 규칙 */
          p_club_id?: string | null
          /**
           * 모임 시각(ISO). 안 보내거나 null 이면 즉석 모임 — 화면이 곧바로
           * 코트 현황을 그린다. 서버는 이 값을 검증하지 않는다(과거 시각도
           * 그대로 받는다) — '시작했나' 판단은 화면이 사용자 시간대로 한다.
           */
          p_starts_at?: string | null
        }
        Returns: TournamentRow
      }
      /**
       * 참가/불참 누르기.
       *
       * **본인 행만** 바꾼다 — 남의 참가 여부를 정하는 인자가 아예 없다.
       * 모임에서만 허용하고(대회는 22023), 시작한 뒤에도 허용한다.
       * 같은 값을 다시 보내면 바뀐 것 없이 그 행을 그대로 돌려준다(멱등).
       *
       * 갱신된 행 하나를 돌려주므로 화면이 낙관적 갱신에 그대로 쓴다.
       */
      set_my_rsvp: {
        Args: { p_tournament_id: string; p_rsvp: RsvpStatus }
        Returns: TournamentMemberRow
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
      /** 동아리 만들기. 만든 사람이 owner 멤버 행으로 같은 트랜잭션에 들어간다 */
      create_club: {
        Args: { p_name: string; p_display_name: string; p_description?: string | null }
        Returns: ClubRow
      }
      /** 동아리 코드로 들어오기. 예외 대신 봉투를 돌려준다 (JoinClubResult 주석 참고) */
      join_club: {
        Args: { p_code: string; p_display_name?: string | null }
        Returns: JoinClubResult
      }
      /**
       * 동아리 역할 바꾸기.
       *
       * owner 는 인자로 못 준다 — 동아리 주인 권한은 넘기지도 뺏지도 못한다
       * (set_member_role 이 대회에서 막은 것과 같은 이유).
       * 강등하면 아직 안 끝난 산하 대회의 관리자 권한도 함께 내려간다.
       */
      set_club_member_role: {
        Args: { p_member_id: string; p_role: 'admin' | 'member' }
        Returns: ClubMemberRow
      }
      /** 동아리에서 빼기 / 스스로 나가기. owner 행은 어느 쪽도 못 뺀다 */
      remove_club_member: {
        Args: { p_member_id: string }
        Returns: void
      }
      /**
       * 게스트 등록 후보 조립. **anon** 이 로그인 없이 부른다.
       *
       * 예외를 던지지 않는다 — join_club 과 같은 이유(definer 함수의
       * 예외는 트랜잭션 전체를 롤백시킨다). 반환 jsonb 봉투는
       * `src/lib/guest.ts` 의 parseGuestSessions 가 판별 유니온으로 푼다.
       * 반환 필드는 club_name · sessions[].id · sessions[].name ·
       * sessions[].starts_at 넷뿐이다 — 늘리면 마일스톤 4(비로그인 읽기
       * 화면)를 앞당겨 여는 것이다.
       */
      guest_sessions: {
        Args: { p_code: string }
        Returns: Json
      }
      /**
       * 게스트 등록. **anon** 이 로그인 없이 부른다 — 이 앱 최초의
       * 비로그인 쓰기 경로다.
       *
       * 예외를 던지지 않는다 — 같은 트랜잭션에 남기는 log_audit 기록까지
       * 롤백되는 것을 막기 위해서다(join_club 과 같은 이유). 반환 jsonb
       * 봉투는 `src/lib/guest.ts` 의 parseGuestJoinResult 가 판별
       * 유니온으로 푼다.
       */
      join_as_guest: {
        Args: {
          p_code: string
          p_session_id: string
          p_name: string
          /**
           * 급수(선택). 맨 뒤 `default null` 이라 **안 보내도 된다** — 옛
           * 3인자 호출이 그대로 이 함수를 찾는다. player_grade 가 아니라
           * text 로 받는 것은 의도다: enum 으로 받으면 이상한 값이 함수
           * 안으로 들어오기도 전에 PostgREST 경계에서 22P02 로 터져,
           * "게스트 경로는 예외 대신 봉투를 돌려준다" 는 규율이 함수 밖에서
           * 깨진다. 서버의 parse_player_grade 가 모르는 값을 null 로 푼다.
           *
           * 🚫 반환 봉투에는 급수가 실려 오지 않는다 — 게스트 현황판의
           * 노출 표면은 필드 단위로 못 박혀 있다(20260829000001).
           */
          p_grade?: PlayerGrade | null
          /**
           * 성별(선택). `p_grade` 와 **글자 그대로 같은 규칙**이다 — 맨 뒤
           * `default null` 이라 안 보내도 되고(옛 3인자·4인자 호출이 그대로
           * 이 함수를 찾는다), 서버는 text 로 받아 parse_player_gender 로
           * 푼다(20260902000001).
           *
           * 🚫 반환 봉투에도 게스트 현황판에도 성별은 실리지 않는다.
           */
          p_gender?: PlayerGender | null
        }
        Returns: Json
      }
      /**
       * 게스트 현황판. **anon** 이 로그인 없이 부른다 — 이 앱 최초의
       * 비로그인 읽기 경로다.
       *
       * 예외를 던지지 않는다 — 세 게스트 함수의 실패 모양을 하나로 맞춘다.
       * 반환 jsonb 봉투는 `src/lib/guest.ts` 의 parseGuestBoard 가 판별
       * 유니온으로 푼다.
       *
       * ⚠ 반환 키는 여섯뿐이다 — ok · club_name · session · courts ·
       * matches · finished_count. **필드를 하나 늘리는 것이 곧 비로그인
       * 노출 표면을 넓히는 것**이라 `20260829000001_guest_board.sql` 머리의
       * "안 싣는 것" 표가 정본이고, smoke 73번이 키 전수 검사로 지킨다.
       * 명단 전체 · member_id · user_id · guest_code 는 어디에도 없다.
       */
      guest_board: {
        Args: { p_code: string; p_session_id: string }
        Returns: Json
      }
      /**
       * 게스트 링크 회수 (authenticated 전용, anon 은 grant 없음).
       *
       * `is_club_admin` 검사 후 새 코드로 교체한다. 옛 링크는 즉시 죽고,
       * 이미 등록된 게스트 행(tournament_members)은 건드리지 않아 그대로
       * 남는다. 42501(운영진 아님)은 `toUserMessage` 의 기본 번역이 그대로
       * 맞아 따로 덮지 않는다.
       */
      rotate_guest_code: {
        Args: { p_club_id: string }
        Returns: ClubRow
      }
      set_member_role: {
        Args: { p_member_id: string; p_role: 'admin' | 'member' }
        Returns: TournamentMemberRow
      }
      /**
       * 명단 행의 급수 바꾸기 — **본인 또는 대회 운영진**(set_display_name 과
       * 같은 규칙). 남의 값을 바꾸면 감사로그가 남는다.
       *
       * `null` 은 "안 바꾼다" 가 아니라 **"모른다로 되돌린다"** 다. 잘못
       * 누른 것을 되돌리는 유일한 경로라 그 뜻이어야 한다 — 그래서 급수와
       * 성별이 한 함수가 아니라 둘로 나뉘어 있다(20260902000001 6/6 주석).
       *
       * 갱신된 행 하나가 돌아오므로 화면이 그대로 낙관적 갱신에 쓴다.
       * profiles 는 건드리지 않는다 — 명단의 급수는 그 명단에서의 값이다.
       */
      set_member_grade: {
        Args: { p_member_id: string; p_grade: PlayerGrade | null }
        Returns: TournamentMemberRow
      }
      /**
       * 명단 행의 성별 바꾸기 — `set_member_grade` 와 같은 규칙.
       *
       * 이 값이 비어 있으면 그 사람은 종목(남복·여복·혼복) 편성에서 빠진다.
       * 총무가 명단에서 바로 채우라고 있는 함수다.
       */
      set_member_gender: {
        Args: { p_member_id: string; p_gender: PlayerGender | null }
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
      /**
       * 모임 경기 고치기 — **제자리에서, 한 트랜잭션 안에서.**
       *
       * `update_match` 는 조를 필수로 받아 모임에 못 쓴다(조가 0개다).
       * 경기 id 와 `queue_order` 가 유지되므로 대기 줄 자리가 안 밀린다.
       * 예정(`scheduled`) 모임 경기만 대상이고 권한은 `can_run_match` 다
       * (관리자 ∨ 그 경기 선수).
       */
      update_session_match: {
        Args: {
          p_match_id: string
          p_court_id: string | null
          p_players_a: string[]
          p_players_b: string[]
          /** ⚠ 안 보내면 이름이 지워진다 — 편성을 통째로 다시 쓰는 함수다 */
          p_label?: string | null
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
