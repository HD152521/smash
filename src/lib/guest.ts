/**
 * 게스트 등록의 판단을 모아 둔 곳.
 *
 * 계정 없는 사람이 링크 하나로 그날 명단에 들어온다 — 이 앱 최초의
 * 비로그인 쓰기 경로다. 서버(`guest_sessions` · `join_as_guest`)는 예외
 * 대신 jsonb 봉투를 돌려주므로(`src/lib/club.ts` `parseJoinResult` 와 같은
 * 이유 — definer 함수의 예외는 트랜잭션 전체를 롤백시킨다), 그 봉투를
 * 판별 유니온으로 푸는 판단을 여기 모은다. 이름 검사도 서버(`join_as_guest`)
 * 와 같은 규칙을 여기서 미리 돌려 왕복 한 번을 줄인다.
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

// ── 오류 문구 — 두 RPC 가 함께 쓰는 표 ──────────────────────────────────

/**
 * `guest_sessions` · `join_as_guest` 가 돌려줄 수 있는 모든 오류 코드를
 * 한곳에 모은다. 두 함수의 오류 종류는 겹치지 않는 부분이 더 많지만
 * (`no_open_session` 은 조회만, `session_closed`·`bad_name`·`guest_limit` 은
 * 등록만), 안내 문구는 같은 규율로 관리하는 편이 새 코드가 늘 때 안내가
 * 빠지는 것을 막는다.
 */
export type GuestErrorCode =
  | 'bad_code'
  | 'no_open_session'
  | 'session_closed'
  | 'bad_name'
  | 'guest_limit'
  /** 봉투가 망가졌거나 서버가 우리가 모르는 코드를 준 경우 */
  | 'unknown'

const GUEST_ERROR_MESSAGE: Record<GuestErrorCode, string> = {
  bad_code: '링크가 올바르지 않습니다',
  no_open_session: '지금 열린 모임이 없습니다. 모임장에게 확인해 주세요',
  session_closed: '지금은 등록할 수 없는 모임입니다',
  bad_name: `이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`,
  guest_limit: '오늘은 더 받을 수 없습니다. 모임장에게 말씀해 주세요',
  unknown: '게스트 등록을 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요',
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
