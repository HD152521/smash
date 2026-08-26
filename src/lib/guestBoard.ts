import type { GuestBoardCourt, GuestBoardMatch } from './guest'
import { queuePosition } from './schedule'

/**
 * 게스트 현황판의 판단을 모아 둔 곳.
 *
 * 서버(`guest_board`)는 코트 목록과 경기 목록을 **평평하게** 보내고 아무
 * 판단도 하지 않는다. "이 경기는 어느 코트 줄인가" · "내 차례까지 몇
 * 경기인가" · "점수를 보여줄까 진행 중이라고만 할까" 는 전부 화면의
 * 판단이라 여기 모은다 — `src/lib/schedule.ts`(로그인 사용자 대진표)와
 * 같은 이유다. 페이지마다 흩뿌리면 새 화면을 만들 때 하나씩 어긋난다.
 *
 * ⚠ 이 파일은 **순번을 새로 세지 않는다.** 대기 순번의 셈법은
 * `schedule.ts` 의 `queuePosition` 하나뿐이고, 그 함수는 SQL 의
 * `notify_up_next`(20260824000001)와 같은 줄을 세야 한다. 여기에 세 번째
 * 셈법을 만들면 화면에 3번인 사람에게 알림이 가는 종류의 어긋남이 생길
 * 자리가 셋이 된다.
 */

// ── 코트별로 묶기 ─────────────────────────────────────────────────────

export interface GuestCourtQueue {
  court: GuestBoardCourt
  /** 이 코트에서 지금 하는 경기 (한 코트 한 경기) */
  live: GuestBoardMatch | null
  /** 이 코트에 배정된 예정 경기. 서버가 준 순서(queue_order) 그대로다 */
  waiting: GuestBoardMatch[]
}

export interface GuestBoardView {
  courts: GuestCourtQueue[]
  /**
   * 코트를 아직 안 정한 예정 경기 — **"아직 코트 미정" 한 줄로 따로 낸다.**
   *
   * 로그인 사용자 화면(`CourtBoard`)은 이 줄을 모든 코트에 함께 띄운다.
   * 먼저 비는 코트가 집어가는 구조라 거기서는 그게 옳다. 하지만 게스트는
   * 코트를 집어갈 수 없으므로, 같은 걸 복제하면 **"대기 2번" 이 코트 넷에
   * 동시에 뜨고** 게스트는 자기 차례를 네 번 센 것으로 읽는다.
   */
  unassigned: GuestBoardMatch[]
}

/**
 * 평평한 경기 목록을 코트별 줄로 묶는다.
 *
 * 정렬을 여기서 하지 않는 것이 중요하다 — 서버가 이미
 * `order by queue_order, created_at` 으로 보냈고, `created_at` 은 응답에
 * 없어서 여기서 다시 정렬하면 동점 처리를 재현할 수 없다. `filter` 는
 * 입력 순서를 그대로 지킨다.
 *
 * 코트가 지정되지 않은 **진행 중** 경기는 어디에도 안 그린다 —
 * `buildSchedule` 과 같은 동작이다. 경기를 시작하는 유일한 경로인
 * `claim_court` 가 코트를 반드시 붙이므로 실제로는 생기지 않는다.
 */
export function buildGuestBoard(
  matches: readonly GuestBoardMatch[],
  courts: readonly GuestBoardCourt[],
): GuestBoardView {
  const scheduled = matches.filter((m) => m.status === 'scheduled')
  const live = matches.filter((m) => m.status === 'live')

  return {
    courts: courts.map((court) => ({
      court,
      live: live.find((m) => m.courtId === court.id) ?? null,
      waiting: scheduled.filter((m) => m.courtId === court.id),
    })),
    unassigned: scheduled.filter((m) => !m.courtId),
  }
}

// ── 점수를 보여줄까 ───────────────────────────────────────────────────

/**
 * 이 경기에 보여줄 점수가 있는가.
 *
 * ⚠ `matches.scored` 로 판단하면 안 된다. 그 컬럼은 `not null default true`
 * 라 **점수를 한 번도 안 넣은 진행 중 경기도 참**이고, 그렇게 판단하면
 * 코트마다 `0 : 0` 이 뜬다. 그래서 서버는 `scored` 를 아예 안 싣고
 * (`20260829000001_guest_board.sql` 의 경고), 판단은 여기서 실제 점수의
 * 합으로 한다. 0 이면 화면은 숫자 대신 "진행 중" 을 그린다.
 */
export function hasVisibleScore(match: GuestBoardMatch): boolean {
  return match.scoreA + match.scoreB > 0
}

// ── 내 다음 경기 ──────────────────────────────────────────────────────

/**
 * 게스트가 자기 이름으로 찾는 자리.
 *
 * 이름은 **강조 전용**이다. 없어도 현황판은 똑같이 전부 보이고, 서버로도
 * 보내지 않는다(`src/lib/guestMe.ts` 참고).
 */
export type GuestMyNext =
  /** 지금 뛰는 중 — "지금 3번 코트" */
  | { kind: 'playing'; courtName: string }
  /** 코트에 붙은 대기 — "3번 코트 · 앞에 2경기" */
  | { kind: 'waiting'; courtName: string; ahead: number }
  /**
   * 편성은 됐는데 코트가 아직 없다 — "코트가 정해지지 않았습니다".
   *
   * **숫자를 내지 않는다.** 어느 코트가 먼저 빌지 모르는데 "앞에 2경기" 를
   * 내면 그건 추측이 아니라 거짓말이다.
   */
  | { kind: 'unassigned' }

/**
 * 내가 뛰는 경기인가.
 *
 * 지금은 문자열 포함 검사 한 줄이라 화면에 복사해 둬도 당장은 어긋나지
 * 않는다. 그런데 이 판단은 앞으로 자랄 자리가 분명하다 — 접미사 붙은 이름
 * (`join_as_guest` 가 동명이인에게 붙인다) · 공백 정리 · 대소문자. 그때
 * 한쪽만 고치면 **"내 차례까지 2경기" 카드는 뜨는데 정작 그 줄은 강조가
 * 안 되는** 상태가 된다. 같은 질문에 두 곳이 다르게 답하는 것이다.
 *
 * `myName` 이 null 이면 false — 이름을 저장하지 못한 브라우저(시크릿창 등)
 * 에서도 현황판 자체는 완전히 그려져야 한다.
 */
export function isMyMatch(match: GuestBoardMatch, myName: string | null): boolean {
  if (!myName) return false
  return match.playersA.includes(myName) || match.playersB.includes(myName)
}

/**
 * 내 다음 경기. 그릴 것이 없으면 null — 화면은 **카드 자체를 안 그린다.**
 *
 * 이름이 없거나(저장이 막힌 브라우저·시크릿창), 오늘 편성이 아직 없거나,
 * 이름은 맞는데 남은 경기가 없는 경우가 전부 여기로 떨어진다. 빈 카드를
 * 남겨 두면 게스트는 "내 경기가 사라졌나" 로 읽는다.
 *
 * 뛰는 중을 먼저 본다 — 그때 몸이 있어야 할 곳은 코트 안이고, 다음 경기가
 * 또 있어도 지금 물어보는 것은 그게 아니다.
 */
export function myNextMatch(board: GuestBoardView, myName: string | undefined): GuestMyNext | null {
  if (!myName) return null

  for (const queue of board.courts) {
    if (queue.live && isMyMatch(queue.live, myName)) {
      return { kind: 'playing', courtName: queue.court.name }
    }
  }

  const mineOnCourt = board.courts
    .map((queue) => ({ queue, match: queue.waiting.find((m) => isMyMatch(m, myName)) }))
    .filter((c): c is { queue: GuestCourtQueue; match: GuestBoardMatch } => Boolean(c.match))
  const mineUnassigned = board.unassigned.filter((m) => isMyMatch(m, myName))

  /*
   * 코트가 다르면 서로의 대기열만으로는 앞뒤를 알 수 없어 queue_order 로
   * 고른다. 서버가 정렬에 쓴 바로 그 값이고 `nextval` 이라 행마다 유일해서,
   * 여기서 새 규칙이 생기지 않는다.
   */
  const earliestOrder = Math.min(
    ...mineOnCourt.map((c) => c.match.queueOrder),
    ...mineUnassigned.map((m) => m.queueOrder),
  )
  if (!Number.isFinite(earliestOrder)) return null

  const onCourt = mineOnCourt.find((c) => c.match.queueOrder === earliestOrder)
  if (!onCourt) return { kind: 'unassigned' }

  const position = queuePosition(onCourt.queue.waiting, onCourt.match.id)
  if (position === null) return { kind: 'unassigned' }

  return { kind: 'waiting', courtName: onCourt.queue.court.name, ahead: position - 1 }
}
