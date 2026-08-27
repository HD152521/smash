import type { RsvpStatus } from '@/types/database'
import { toUserMessage } from './errors'

/**
 * 모임 참가 신청(rsvp)의 판단을 모아 둔 곳.
 *
 * 서버는 rsvp 를 **저장만** 한다. "시작했나", "몇 명이 온다는 건가",
 * "누를 수 없는 사람은 누구인가" 는 전부 화면의 판단이라 여기 모은다 —
 * `src/lib/session.ts`(대회/모임 분기) · `src/lib/club.ts`(동아리 판단)와
 * 같은 이유다. 페이지마다 흩뿌리면 새 화면을 만들 때 하나씩 어긋난다.
 */

/** 참가 신청 집계에 필요한 최소한의 모양 — MemberSummary 가 그대로 들어온다 */
export interface RsvpMember {
  /** null 이면 계정이 없는 '명단만' 회원이다. 참가를 누를 주체가 없다 */
  userId: string | null
  rsvp: RsvpStatus
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * `timestamptz` 문자열을 Date 로. 못 읽으면 null.
 *
 * `new Date(iso)` 는 사용자 시간대로 알아서 옮겨 준다 — 서버 시계를 흉내
 * 내려고 오프셋을 손으로 더하면 그 순간 여름시간·기기 설정과 어긋난다.
 */
function parseStartsAt(startsAt: string | null | undefined): Date | null {
  if (!startsAt) return null
  const at = new Date(startsAt)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * 이 모임이 시작했는가 — 화면을 '참가 신청' 과 '코트 현황' 으로 가르는 판단.
 *
 * **서버는 이걸 판단하지 않는다.** 크론도 배치도 없고, `starts_at` 은 그냥
 * 저장돼 있을 뿐이다. 시간에 기대는 상태 전환을 서버에 두면 서버 시계와
 * 사용자 시계가 어긋나는 순간 디버깅이 불가능해진다. 그래서 판단은 여기,
 * 사용자 시간대에서 한 번만 한다.
 *
 * 두 경우를 '시작했다' 로 본다:
 *   - `starts_at` 이 NULL — 즉석 모임("지금 모여서 치는 날")이다. 곧바로
 *     코트 현황으로 간다
 *   - 값이 있는데 못 읽는다 — 안 그러면 아무도 빠져나올 수 없는 대기
 *     화면에 갇힌다. 코트 현황은 최소한 늘 쓸 수 있어야 한다
 *
 * 경계는 **시작 시각을 포함한다** (`now >= startsAt`). 20:00 정각은 이미
 * 시작한 것이다 — 정각에 화면이 아직 안 바뀌면 "시계는 20시인데 왜"가 된다.
 */
export function hasStarted(startsAt: string | null | undefined, now: Date): boolean {
  const at = parseStartsAt(startsAt)
  if (!at) return true
  return now.getTime() >= at.getTime()
}

/**
 * 모임 시각을 사용자 시간대로 읽는 문구 — "10월 7일 (화) 20:00".
 *
 * 즉석 모임(NULL)·못 읽는 값은 null 이다. 부르는 쪽이 "지금 바로" 처럼
 * 자기 화면에 맞는 말을 고르게 둔다.
 *
 * 요일을 같이 적는 이유: 모임은 요일로 기억된다("화요일 저녁 그거").
 * 날짜만 있으면 매주 여는 사람은 이번 주 것인지 다음 주 것인지 모른다.
 */
export function startsAtLabel(startsAt: string | null | undefined): string | null {
  const at = parseStartsAt(startsAt)
  if (!at) return null
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')
  return `${at.getMonth() + 1}월 ${at.getDate()}일 (${WEEKDAY[at.getDay()]}) ${hh}:${mm}`
}

/**
 * `<input type="datetime-local">` 값을 서버로 보낼 ISO 문자열로.
 *
 * 빈 칸은 null 이다 — **비워 두면 즉석 개설**이 이 화면의 규칙이다.
 * 입력값에는 시간대가 없어서 `new Date()` 가 사용자 시간대로 읽는데,
 * 그게 맞다. 사용자가 적은 20:00 은 자기 시계의 20:00 이다.
 */
export function startsAtFromInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const at = new Date(trimmed)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

export interface RsvpCounts {
  /** 온다고 누른 사람 */
  going: number
  /** 계정이 있는데 아직 안 누른 사람 */
  undecided: number
  /** 안 온다고 누른 사람 */
  declined: number
  /**
   * 계정이 없어 누를 수 없는 '명단만' 회원.
   *
   * **이 사람들을 '미정' 으로 세지 않는다.** 누를 주체가 없으니 매주 그대로
   * 남아 유령 미응답자가 되고, "미정 5" 를 본 모임장은 오지도 않을 답을
   * 기다리게 된다. 따로 세어 "명단만 5명" 이라고 말하는 편이 정직하다.
   */
  noAccount: number
}

/** 명단을 네 칸으로 가른 것. 원래 순서를 지킨다 */
export interface RsvpGroups<T> {
  going: T[]
  undecided: T[]
  declined: T[]
  noAccount: T[]
}

/**
 * 명단을 참가/미정/불참/명단만으로 가른다.
 *
 * going·declined 는 계정 유무를 안 가린다 — 값이 'going' 이면 온다는 뜻이다.
 * (모임장이 "전화로 온다고 한 사람" 을 대신 체크하는 길이 열려 있고, 그건
 * 정상 경로다.) 계정이 갈리는 건 **아직 아무 답이 없는 행** 뿐이다.
 *
 * 숫자와 목록이 이 함수 하나에서 나온다. 세는 곳과 그리는 곳이 각자
 * 판단하면 "미정 3" 아래에 4명이 뜨는 날이 온다.
 */
export function groupRsvp<T extends RsvpMember>(members: readonly T[]): RsvpGroups<T> {
  const groups: RsvpGroups<T> = { going: [], undecided: [], declined: [], noAccount: [] }
  for (const m of members) {
    if (m.rsvp === 'going') groups.going.push(m)
    else if (m.rsvp === 'declined') groups.declined.push(m)
    else if (m.userId === null) groups.noAccount.push(m)
    else groups.undecided.push(m)
  }
  return groups
}

/**
 * 참가/미정/불참을 센다.
 *
 * 네 숫자의 합은 언제나 명단 전체다. 어느 하나에도 안 들어가는 사람이
 * 생기면 "참가 12 · 미정 3 · 불참 1" 을 다 더해도 명단 수가 안 나온다.
 */
export function countRsvp(members: readonly RsvpMember[]): RsvpCounts {
  const groups = groupRsvp(members)
  return {
    going: groups.going.length,
    undecided: groups.undecided.length,
    declined: groups.declined.length,
    noAccount: groups.noAccount.length,
  }
}

/** 머리말에 한 줄로 — "참가 12 · 미정 3 · 불참 1" */
export function rsvpCountsText(counts: RsvpCounts): string {
  return `참가 ${counts.going} · 미정 ${counts.undecided} · 불참 ${counts.declined}`
}

const RSVP_LABEL: Record<RsvpStatus, string> = {
  going: '참가',
  invited: '미정',
  declined: '불참',
}

/**
 * 참가 여부를 화면에 쓰는 말로.
 *
 * 'invited' 를 '초대됨' 이 아니라 **'미정'** 이라고 부른다. 사용자가 받은
 * 초대장 같은 건 없다 — 모임이 열리는 순간 명단에 심어졌을 뿐이고, 본인이
 * 아는 사실은 "아직 안 눌렀다" 하나다.
 *
 * 값이 없으면 '미정' 이다. 캐시에 rsvp 가 없던 시절 행이 남아 있어도
 * 화면이 빈칸을 그리면 안 된다.
 */
export function rsvpLabel(rsvp: RsvpStatus | null | undefined): string {
  return rsvp ? RSVP_LABEL[rsvp] : RSVP_LABEL.invited
}

/**
 * 참가한 사람을 앞으로.
 *
 * 경기 짜기에서 쓴다. 참가는 **게이트가 아니라 순서**다 — 안 누르고 온
 * 사람도 골라야 하므로 뒤에 접어 둘 뿐 빼지 않는다. 누르지 않으면 못 치게
 * 하는 앱은 동아리에서 미움받는다.
 */
export function partitionGoing<T extends RsvpMember>(
  members: readonly T[],
): { going: T[]; others: T[] } {
  return {
    going: members.filter((m) => m.rsvp === 'going'),
    others: members.filter((m) => m.rsvp !== 'going'),
  }
}

/**
 * '명단만' 배지를 이 목록에서 보여줄 가치가 있는가.
 *
 * 계정이 없는 사람은 실제로 다르다 — 알림을 못 받고 참가 버튼도 못 누른다.
 * 그래서 **예외일 때** 표시할 값어치가 있다.
 *
 * ⚠ 처음에는 "전원이 계정 없으면 숨긴다" 였는데 기준선이 어긋나 있었다.
 * 찍어 보니 9명 중 8명에게 배지가 붙어 있었고, 그러면 배지가 정보가
 * 아니라 배경이 된다 — 눈이 그냥 건너뛴다. 원칙("모두에게 붙는 배지는
 * 배지가 아니다")은 맞았고 임계값만 틀렸다.
 *
 * 그래서 **소수일 때만** 붙인다(절반 이하). 다수가 계정이 없는 것은
 * 개인의 예외가 아니라 그 명단 전체의 성격이라, 화면 위쪽 요약줄
 * ("· 명단만 8")이 이미 말해 준다. 반대로 9명 중 1명만 계정이 없으면
 * 그 한 명이 운영진이 기억해야 할 예외다.
 *
 * (참가자 화면 · 경기 짜기 화면에서 쓴다.)
 */
export function hasAccountContrast(members: readonly { userId: string | null }[]): boolean {
  const withoutAccount = members.filter((m) => m.userId === null).length
  if (withoutAccount === 0 || withoutAccount === members.length) return false
  return withoutAccount * 2 <= members.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * `set_my_rsvp` 가 던진 오류를 사람 말로.
 *
 * **42501 은 여기서 '권한이 없습니다' 가 아니다.** 이 RPC 가 42501 을 던지는
 * 경우는 하나뿐이다 — *이 모임 명단에 당신 행이 없다*. 그리고 그게 실제로
 * 일어나는 경로가 있다: 명단은 **생성 시점 스냅샷**이라, 모임이 열린 뒤에
 * 동아리에 들어온 사람은 그 모임에 없다(의도된 동작).
 *
 * `toUserMessage` 의 기본 번역('권한이 없습니다')을 그대로 쓰면 사용자는
 * 자기가 뭘 잘못했는지, 기다리면 되는지, 모임장에게 말해야 하는지를 알 수
 * 없는 자리에 남는다. 그래서 이 한 코드만 우리 문구로 덮는다.
 */
export function rsvpErrorMessage(error: unknown): string {
  if (isRecord(error) && error.code === '42501') {
    return '이 모임 명단에 없어서 참가를 누를 수 없습니다. 모임이 열린 뒤에 동아리에 들어왔다면 다음 모임부터 보입니다'
  }
  return toUserMessage(error, '참가 여부를 저장하지 못했습니다')
}
