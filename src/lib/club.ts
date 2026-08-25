import type { ClubRole, ClubRow } from '@/types/database'

/**
 * 동아리 계층의 판단을 모아 둔 곳.
 *
 * 동아리는 권한 축이 아니라 명단의 원천이지만, 화면 쪽에서는 "이 사람이
 * 운영진인가" 와 "코드가 안 먹었을 때 뭐라고 말할 것인가" 두 가지를 계속
 * 묻는다. 그 판단을 페이지마다 흩뿌리면 새 화면을 만들 때마다 하나씩
 * 어긋난다 — `src/lib/session.ts` 가 대회/모임 분기를 한곳에 모은 것과
 * 같은 이유다.
 */

/** clubs.name 의 DB 제약(`length(btrim(name)) between 1 and 60`)과 같은 값 */
export const CLUB_NAME_MAX = 60

/*
 * 대회 쪽 호칭(주최자·관리자·참가자)과 일부러 다른 말을 쓴다.
 * 초대 코드가 두 종류가 되는 것과 같은 문제라, 같은 화면 흐름에서 같은
 * 단어가 두 뜻으로 쓰이면 사용자가 지금 어느 계층에 있는지 잃어버린다.
 */
const ROLE_LABEL: Record<ClubRole, string> = {
  owner: '동아리장',
  admin: '운영진',
  member: '회원',
}

/**
 * 역할을 화면에 쓰는 말로.
 *
 * 값이 없으면 가장 권한이 낮은 쪽으로 읽는다. 반대로 두면(모르면 운영진)
 * 캐시에 남은 옛 행 하나로 관리 버튼이 열린 것처럼 보인다 — 실제 동작은
 * RLS 가 막지만, 눌러도 안 되는 버튼은 고장으로 읽힌다.
 */
export function clubRoleLabel(role: ClubRole | null | undefined): string {
  return role ? ROLE_LABEL[role] : ROLE_LABEL.member
}

/**
 * 운영진인가 = 동아리를 관리할 수 있는 사람인가.
 *
 * DB 의 `is_club_admin` 이 `role in ('owner','admin')` 으로 판정하는 것과
 * 짝을 이룬다. 화면에서 `role === 'admin'` 만 보면 동아리장 본인에게
 * 관리 버튼이 안 보인다 — 만든 사람은 `owner` 로 들어가기 때문이다.
 */
export function isClubStaff(role: ClubRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * 동아리 이름 검사. 통과하면 null, 아니면 보여 줄 문구.
 *
 * 서버도 같은 검사를 하지만(`create_club` 의 `22023`), 왕복 한 번을 돌고
 * 나서야 "이름을 입력해 주세요" 를 보는 것과 누르기 전에 보는 것은 다르다.
 * 기준은 SQL 제약과 똑같이 **btrim 뒤 길이**다 — 공백으로 60자를 채우면
 * 화면만 통과하고 서버에서 떨어진다.
 */
export function validateClubName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '동아리 이름을 입력해 주세요'
  if (trimmed.length > CLUB_NAME_MAX) return `동아리 이름은 ${CLUB_NAME_MAX}자까지 쓸 수 있습니다`
  return null
}

// ── 동아리 코드로 들어오기 ──────────────────────────────────────────

export type JoinClubErrorCode =
  | 'unauthenticated'
  | 'rate_limited'
  | 'bad_format'
  | 'not_found'
  /** 봉투가 망가졌거나 서버가 우리가 모르는 코드를 준 경우 */
  | 'unknown'

export type JoinClubOutcome =
  { ok: true; club: ClubRow } | { ok: false; error: JoinClubErrorCode; message: string }

/*
 * 오류 종류별 문구를 여기 한 곳에만 둔다.
 *
 * 서버도 message 를 같이 실어 보내지만 그대로 쓰지 않는다. 서버 문구는
 * "초대 코드는 6자리입니다" 처럼 대회 코드와 구별되지 않는데, 초대 코드가
 * 동아리·대회 두 종류가 된 뒤로는 어느 코드를 잘못 넣었는지가 안내의
 * 절반이다. 그래서 아는 코드는 우리 문구로 덮어쓴다.
 */
const JOIN_ERROR_MESSAGE: Record<JoinClubErrorCode, string> = {
  unauthenticated: '로그인이 필요합니다',
  rate_limited: '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요',
  bad_format: '동아리 코드는 6자리입니다',
  not_found: '그 동아리 코드를 찾을 수 없습니다. 대회 코드와 헷갈리지 않았는지 확인해 주세요',
  unknown: '동아리에 들어가지 못했습니다. 잠시 뒤에 다시 시도해 주세요',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 동아리로 넘어가려면 최소한 id 는 있어야 한다 */
function looksLikeClub(value: unknown): value is ClubRow {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
}

function isKnownErrorCode(code: unknown): code is Exclude<JoinClubErrorCode, 'unknown'> {
  return (
    code === 'unauthenticated' ||
    code === 'rate_limited' ||
    code === 'bad_format' ||
    code === 'not_found'
  )
}

/**
 * `join_club` 이 돌려준 jsonb 봉투를 화면이 쓸 결과로 푼다.
 *
 * 이 RPC 는 예외를 던지지 않는다. 던지면 트랜잭션이 롤백되면서 방금 남긴
 * 브루트포스 시도 기록까지 함께 사라져 차단 카운터가 영원히 0 이 되기
 * 때문이다(이 저장소가 `join_tournament` 로 이미 한 번 밟은 함정).
 * 그 대가로 성공/실패 판단이 클라이언트로 넘어왔고, 그 판단은 여기 하나뿐이다.
 *
 * 인자를 `unknown` 으로 받는 건 방어가 아니라 사실의 반영이다 — 봉투는
 * jsonb 라 타입은 약속일 뿐이고, 서버가 새 오류 코드를 늘리면 그 순간
 * 약속이 깨진다. 모르는 모양은 전부 'unknown' 으로 떨어뜨려, 최소한
 * **빈 안내 문구가 뜨는 일은 없게** 한다.
 */
export function parseJoinResult(raw: unknown): JoinClubOutcome {
  if (!isRecord(raw)) return { ok: false, error: 'unknown', message: JOIN_ERROR_MESSAGE.unknown }

  if (raw.ok === true) {
    /*
     * ok 인데 club 이 없으면 성공으로 치면 안 된다. 그대로 넘기면 화면이
     * /c/undefined 로 이동해 "동아리를 찾을 수 없습니다" 를 만나고, 코드가
     * 틀린 건지 앱이 깨진 건지 구별할 수 없는 자리에 사용자가 남는다.
     */
    if (!looksLikeClub(raw.club)) {
      return { ok: false, error: 'unknown', message: JOIN_ERROR_MESSAGE.unknown }
    }
    return { ok: true, club: raw.club }
  }

  if (isKnownErrorCode(raw.error)) {
    return { ok: false, error: raw.error, message: JOIN_ERROR_MESSAGE[raw.error] }
  }

  /*
   * 모르는 코드일 때만 서버 문구를 쓴다. 서버가 오류를 하나 늘렸는데
   * 화면에는 "잠시 뒤에 다시 시도해 주세요" 만 뜨면, 정작 사용자가 고칠 수
   * 있는 문제였을 때 고칠 방법을 못 듣는다.
   */
  const serverMessage = typeof raw.message === 'string' ? raw.message.trim() : ''
  return {
    ok: false,
    error: 'unknown',
    message: serverMessage || JOIN_ERROR_MESSAGE.unknown,
  }
}
