/**
 * 게스트 경로의 판단을 모아 둔 곳.
 *
 * 계정 없는 사람이 링크 하나로 그날 명단에 들어오고(등록), 들어온 뒤에는
 * 코트를 본다(현황판) — 이 앱 최초의 비로그인 쓰기·읽기 경로다.
 * 서버의 세 함수(`guest_sessions` · `join_as_guest` · `guest_board`)는
 * 예외 대신 jsonb 봉투를 돌려주므로(`src/lib/club.ts` `parseJoinResult` 와
 * 같은 이유 — definer 함수의 예외는 트랜잭션 전체를 롤백시킨다), 그 봉투를
 * 판별 유니온으로 푸는 판단을 여기 모은다. 이름 검사도 서버(`join_as_guest`)
 * 와 같은 규칙을 여기서 미리 돌려 왕복 한 번을 줄인다.
 *
 * 봉투를 **푸는** 일까지가 이 파일이다. 푼 값을 코트별로 묶고 "내 차례까지
 * 몇 경기" 를 세는 판단은 `src/lib/guestBoard.ts` 에 따로 있다.
 */

// ── 이름 검사 — 등록 RPC 와 같은 규칙 ─────────────────────────────────

export const GUEST_NAME_MAX = 20

/**
 * 제어문자(C0/C1)·제로폭 문자·방향 재정렬 문자.
 *
 * `join_as_guest` 의 `regexp_replace` 패턴과 **한 글자도 다르면 안 된다** —
 * 여기서 통과시킨 이름이 서버에서 떨어지거나, 반대로 여기서 막은 이름을
 * 서버가 받아 두 판단이 어긋나면 안 된다.
 */
const CONTROL_AND_INVISIBLE_CHARS =
  // eslint-disable-next-line no-control-regex -- 제어문자를 걸러내는 게 이 정규식의 목적 자체다
  /[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g

/**
 * 게스트 이름 검사. 통과하면 null, 아니면 보여 줄 문구.
 *
 * 순서가 중요하다 — 제어문자·제로폭·방향재정렬 문자를 지운 뒤에 길이를
 * 잰다. 길이부터 재면 정리 후 빈 문자열이거나 20자를 넘는 원문이 화면을
 * 통과해 버린다(`join_as_guest` 의 SQL 주석과 같은 이유).
 */
export function validateGuestName(name: string): string | null {
  const cleaned = name.replace(CONTROL_AND_INVISIBLE_CHARS, '').trim()
  if (cleaned.length < 1 || cleaned.length > GUEST_NAME_MAX) {
    return `이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`
  }
  return null
}

// ── 게스트 링크 ───────────────────────────────────────────────────────

/** `/g/:guestCode` 절대 링크. `origin` 은 `location.origin` 등 호출부가 넘긴다 */
export function guestLinkUrl(origin: string, guestCode: string): string {
  return `${origin.replace(/\/+$/, '')}/g/${guestCode}`
}

/**
 * `/g/:guestCode/:sessionId` 절대 링크 — 현황판.
 *
 * 뿌리는 링크는 여전히 `guestLinkUrl` 하나다. 이 주소는 등록을 마친
 * 사람이 **자기 브라우저 안에서** 옮겨 가거나 새로고침으로 돌아오는 데
 * 쓴다. 주소의 두 조각이 `guest_board(p_code, p_session_id)` 의 인자와
 * 1:1 로 맞아, "지금 무엇을 보고 있는가" 가 주소 하나로 완전히 복원된다.
 */
export function guestBoardUrl(origin: string, guestCode: string, sessionId: string): string {
  return `${guestLinkUrl(origin, guestCode)}/${sessionId}`
}

// ── 오류 문구 — 두 RPC 가 함께 쓰는 표 ──────────────────────────────────

/**
 * `guest_sessions` · `join_as_guest` · `guest_board` 가 돌려줄 수 있는 모든
 * 오류 코드를 한곳에 모은다. 세 함수의 오류 종류는 겹치지 않는 부분이 더
 * 많지만 (`no_open_session` 은 조회만, `session_closed`·`bad_name`·
 * `guest_limit` 은 등록만, `board_closed` 는 현황판만), 안내 문구는 같은
 * 규율로 관리하는 편이 새 코드가 늘 때 안내가 빠지는 것을 막는다.
 */
export type GuestErrorCode =
  | 'bad_code'
  | 'no_open_session'
  | 'session_closed'
  | 'bad_name'
  | 'guest_limit'
  /**
   * 현황판을 지금 볼 수 없다. 서버가 **다른 동아리 · 대회 · 시각 창 밖 ·
   * 없는 id · 코드-세션 불일치를 전부 이 코드 하나로 합쳐** 돌려준다 —
   * 구별해서 돌려주면 임의의 UUID 로 "이 동아리에 이 모임이 있나" 를
   * 알아내는 탐색기가 되기 때문이다. 화면도 그 합침을 그대로 지켜야
   * 하므로 문구 하나만 둔다.
   */
  | 'board_closed'
  /** 봉투가 망가졌거나 서버가 우리가 모르는 코드를 준 경우 */
  | 'unknown'

const GUEST_ERROR_MESSAGE: Record<GuestErrorCode, string> = {
  bad_code: '링크가 올바르지 않습니다',
  no_open_session: '지금 열린 모임이 없습니다. 모임장에게 확인해 주세요',
  session_closed: '지금은 등록할 수 없는 모임입니다',
  bad_name: `이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`,
  guest_limit: '오늘은 더 받을 수 없습니다. 모임장에게 말씀해 주세요',
  board_closed: '지금은 볼 수 없는 모임입니다',
  // 이 표를 등록(`guest_sessions`·`join_as_guest`)과 현황판(`guest_board`)이
  // 함께 쓴다. "등록을 처리하지 못했습니다" 라고 쓰면 현황판만 보러 온
  // 사람에게 하지도 않은 동작이 실패했다고 말하게 된다 — 봉투가 망가진
  // 드문 경우에 보이는 문구라서 어느 화면에서 떴는지 알 수가 없다.
  unknown: '요청을 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요',
}

/** 오류 코드를 화면에 보여줄 한국어 문구로. 아는 코드는 서버 문구를 덮어쓴다 */
export function guestErrorMessage(code: GuestErrorCode): string {
  return GUEST_ERROR_MESSAGE[code]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * 모르는 모양일 때만 서버 message 를 쓴다 (`parseJoinResult` 와 같은 규율).
 * 서버가 오류를 하나 늘렸는데 화면에 fallback 문구만 뜨면, 정작 사용자가
 * 고칠 수 있는 문제였을 때 고칠 방법을 못 듣는다.
 */
function unknownMessage(raw: Record<string, unknown>): string {
  const serverMessage = typeof raw.message === 'string' ? raw.message.trim() : ''
  return serverMessage || guestErrorMessage('unknown')
}

// ── guest_sessions 봉투 ─────────────────────────────────────────────

export interface GuestSessionCandidate {
  id: string
  name: string
  /** null 이면 즉석 모임 */
  startsAt: string | null
}

export type GuestSessionsOutcome =
  | { ok: true; clubName: string; sessions: GuestSessionCandidate[] }
  | { ok: false; error: GuestErrorCode; message: string }

function isKnownSessionsErrorCode(code: unknown): code is 'bad_code' | 'no_open_session' {
  return code === 'bad_code' || code === 'no_open_session'
}

function looksLikeCandidate(value: unknown): value is {
  id: string
  name: string
  starts_at: string | null
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    (value.starts_at === null || typeof value.starts_at === 'string')
  )
}

/**
 * `guest_sessions` 가 돌려준 jsonb 봉투를 화면이 쓸 결과로 푼다.
 *
 * 인자를 `unknown` 으로 받는 건 jsonb 가 타입은 약속일 뿐이라는 사실의
 * 반영이다(`parseJoinResult` 와 같은 이유). 모르는 모양은 전부 'unknown'
 * 으로 떨어뜨려 **빈 안내 문구가 뜨는 일은 없게** 한다.
 */
export function parseGuestSessions(raw: unknown): GuestSessionsOutcome {
  if (!isRecord(raw)) {
    return { ok: false, error: 'unknown', message: guestErrorMessage('unknown') }
  }

  if (raw.ok === true) {
    const sessions = raw.sessions
    if (
      !isNonEmptyString(raw.club_name) ||
      !Array.isArray(sessions) ||
      !sessions.every(looksLikeCandidate)
    ) {
      return { ok: false, error: 'unknown', message: unknownMessage(raw) }
    }
    return {
      ok: true,
      clubName: raw.club_name,
      sessions: sessions.map((s) => ({ id: s.id, name: s.name, startsAt: s.starts_at })),
    }
  }

  if (isKnownSessionsErrorCode(raw.error)) {
    return { ok: false, error: raw.error, message: guestErrorMessage(raw.error) }
  }

  return { ok: false, error: 'unknown', message: unknownMessage(raw) }
}

// ── join_as_guest 봉투 ──────────────────────────────────────────────

export type GuestJoinOutcome =
  | { ok: true; displayName: string; sessionName: string }
  | { ok: false; error: GuestErrorCode; message: string }

function isKnownJoinErrorCode(
  code: unknown,
): code is 'bad_code' | 'session_closed' | 'bad_name' | 'guest_limit' {
  return (
    code === 'bad_code' ||
    code === 'session_closed' ||
    code === 'bad_name' ||
    code === 'guest_limit'
  )
}

/**
 * `join_as_guest` 가 돌려준 jsonb 봉투를 화면이 쓸 결과로 푼다.
 *
 * 성공하면 **적힌 이름을 그대로** 돌려준다 — 접미사가 붙었으면 게스트가
 * 그 사실을 알아야 코트 현황판에서 자기를 찾는다(요청한 이름이 아니라
 * 서버가 실제로 저장한 이름이다).
 */
export function parseGuestJoinResult(raw: unknown): GuestJoinOutcome {
  if (!isRecord(raw)) {
    return { ok: false, error: 'unknown', message: guestErrorMessage('unknown') }
  }

  if (raw.ok === true) {
    if (!isNonEmptyString(raw.display_name) || !isNonEmptyString(raw.session_name)) {
      return { ok: false, error: 'unknown', message: unknownMessage(raw) }
    }
    return { ok: true, displayName: raw.display_name, sessionName: raw.session_name }
  }

  if (isKnownJoinErrorCode(raw.error)) {
    return { ok: false, error: raw.error, message: guestErrorMessage(raw.error) }
  }

  return { ok: false, error: 'unknown', message: unknownMessage(raw) }
}

// ── guest_board 봉투 ───────────────────────────────────────────────

/**
 * 현황판이 그리는 코트 하나. `tournament_id` 는 주소가 이미 담고 있어
 * 서버가 싣지 않는다 — 여기에도 없다.
 */
export interface GuestBoardCourt {
  id: string
  name: string
  sortOrder: number
}

/**
 * 현황판이 그리는 경기 하나.
 *
 * ⚠ 이 인터페이스에 필드를 늘리는 것이 곧 **비로그인 노출 표면을 넓히는
 * 것**이다. 늘리려면 `20260829000001_guest_board.sql` 머리의 "안 싣는 것"
 * 표를 먼저 고치고 smoke 73·74번을 다시 통과시켜라. 특히 `member_id` ·
 * `user_id` 는 절대 오지 않는다 — 게스트에게 사람은 문자열 이름이다.
 *
 * `scored` 도 오지 않는다. `not null default true` 라 진행 중 경기까지
 * 참이라 판단 근거가 못 되고, 점수를 보여줄지는 화면이
 * `src/lib/guestBoard.ts` 에서 `scoreA + scoreB > 0` 으로 정한다.
 */
export interface GuestBoardMatch {
  id: string
  /** null 이면 아직 코트가 안 정해진 경기다 */
  courtId: string | null
  status: 'live' | 'scheduled'
  /** 대기 순번의 근거. 순번 자체는 서버가 세지 않는다(설계 판단 8) */
  queueOrder: number
  /** 대기자의 진짜 질문이 "내 앞 경기가 언제 끝나나" 라 싣는다 */
  startedAt: string | null
  scoreA: number
  scoreB: number
  playersA: string[]
  playersB: string[]
}

export interface GuestBoardSession {
  id: string
  name: string
  /** null 이면 즉석 모임 */
  startsAt: string | null
  /** 등록 필터에서 status 하나만 넓힌 상위집합이라 이 둘뿐이다 */
  status: 'live' | 'finished'
}

export type GuestBoardOutcome =
  | {
      ok: true
      clubName: string
      session: GuestBoardSession
      courts: GuestBoardCourt[]
      matches: GuestBoardMatch[]
      /** 끝난 경기는 목록이 아니라 숫자다 — 모임이 길어져도 응답이 안 자란다 */
      finishedCount: number
    }
  | { ok: false; error: GuestErrorCode; message: string }

function isKnownBoardErrorCode(code: unknown): code is 'bad_code' | 'board_closed' {
  return code === 'bad_code' || code === 'board_closed'
}

function looksLikeCourt(value: unknown): value is {
  id: string
  name: string
  sort_order: number
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    typeof value.sort_order === 'number'
  )
}

/** 이름 배열은 문자열만 받는다 — 여기 객체가 섞여 들어오면 화면이 [object Object] 를 그린다 */
function isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function looksLikeMatch(value: unknown): value is {
  id: string
  court_id: string | null
  status: 'live' | 'scheduled'
  queue_order: number
  started_at: string | null
  score_a: number
  score_b: number
  players_a: string[]
  players_b: string[]
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.court_id === null || isNonEmptyString(value.court_id)) &&
    (value.status === 'live' || value.status === 'scheduled') &&
    typeof value.queue_order === 'number' &&
    (value.started_at === null || typeof value.started_at === 'string') &&
    typeof value.score_a === 'number' &&
    typeof value.score_b === 'number' &&
    isNameList(value.players_a) &&
    isNameList(value.players_b)
  )
}

function looksLikeSession(value: unknown): value is {
  id: string
  name: string
  starts_at: string | null
  status: 'live' | 'finished'
} {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    (value.starts_at === null || typeof value.starts_at === 'string') &&
    (value.status === 'live' || value.status === 'finished')
  )
}

/**
 * `guest_board` 가 돌려준 jsonb 봉투를 화면이 쓸 결과로 푼다.
 *
 * `parseGuestSessions` 와 같은 규율이다 — 인자를 `unknown` 으로 받고
 * (jsonb 의 타입은 약속일 뿐이다), 모르는 모양은 전부 'unknown' 으로
 * 떨어뜨려 **빈 안내 문구가 뜨는 일은 없게** 한다. 게스트는 로그인도 안 한
 * 사람이라 이 경로가 깨졌을 때 콘솔을 열어 보라고 할 수도 없다.
 *
 * 한 조각이라도 모양이 어긋나면 전체를 실패로 본다. 코트만 그려 놓고
 * 경기를 못 그리면 게스트는 "오늘은 경기가 없구나" 로 읽는데, 그건 화면이
 * 깨진 것보다 나쁜 거짓말이다.
 */
export function parseGuestBoard(raw: unknown): GuestBoardOutcome {
  if (!isRecord(raw)) {
    return { ok: false, error: 'unknown', message: guestErrorMessage('unknown') }
  }

  if (raw.ok === true) {
    const courts = raw.courts
    const matches = raw.matches
    if (
      !isNonEmptyString(raw.club_name) ||
      !looksLikeSession(raw.session) ||
      !Array.isArray(courts) ||
      !courts.every(looksLikeCourt) ||
      !Array.isArray(matches) ||
      !matches.every(looksLikeMatch) ||
      typeof raw.finished_count !== 'number'
    ) {
      return { ok: false, error: 'unknown', message: unknownMessage(raw) }
    }
    return {
      ok: true,
      clubName: raw.club_name,
      session: {
        id: raw.session.id,
        name: raw.session.name,
        startsAt: raw.session.starts_at,
        status: raw.session.status,
      },
      courts: courts.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order })),
      /*
       * 서버가 보낸 순서(queue_order, created_at)를 그대로 지킨다.
       * 여기서 다시 정렬하면 notify_up_next · queuePosition 과 다른 줄을
       * 세는 세 번째 셈법이 생긴다(설계 판단 8). created_at 은 응답에
       * 없어서 동점 처리도 재현할 수 없다.
       */
      matches: matches.map((m) => ({
        id: m.id,
        courtId: m.court_id,
        status: m.status,
        queueOrder: m.queue_order,
        startedAt: m.started_at,
        scoreA: m.score_a,
        scoreB: m.score_b,
        playersA: m.players_a,
        playersB: m.players_b,
      })),
      finishedCount: raw.finished_count,
    }
  }

  if (isKnownBoardErrorCode(raw.error)) {
    return { ok: false, error: raw.error, message: guestErrorMessage(raw.error) }
  }

  return { ok: false, error: 'unknown', message: unknownMessage(raw) }
}
