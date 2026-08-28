import type { MatchOverviewRow } from '@/types/database'

/**
 * "이 사람은 지금 다른 경기에 묶여 있다" 는 판단 한 곳.
 *
 * 경기 짜기 화면이 방금 편성한 사람을 다음 경기 후보로 그대로 다시 내놓으면,
 * 한 사람이 두 경기에 들어간다. 코트에서는 그 사람이 두 코트에 동시에 불려
 * 간다 — 앱이 낸 실수를 사람이 코트 위에서 수습하게 된다.
 *
 * 판단을 화면 밖에 두는 이유는 `records.ts` · `schedule.ts` 와 같다. 화면마다
 * "뛰는 중" 의 기준을 각자 쓰면, 새 화면을 만드는 날 하나가 조용히 어긋난다.
 *
 * ── 이름으로 맞춘다 ────────────────────────────────────────────────
 * `match_overview` 가 내려주는 선수 정보는 `display_name` 뿐이다. 이 앱의
 * 다른 판단(`myMatchRole` · 머리말 심판 배지)도 이미 같은 기준을 쓴다.
 * 동명이인이 있으면 둘 다 묶인 것으로 보인다 — 모임 명단에서 동명이인은
 * '김철수(A)' 처럼 구분해 넣는 것이 맞고, 이 화면은 안전한 쪽으로 틀린다.
 *
 * ── 심판은 세지 않는다 ─────────────────────────────────────────────
 * 두 가지 이유다.
 *
 *   1. **서버가 심판을 안 본다.** `start_match` 의 '두 코트 동시' 검사는
 *      `match_team_players` 만 훑는다(20260825000002). 여기서 심판까지 묶으면
 *      화면이 서버보다 좁아져, 서버가 허락하는 편성을 화면이 막게 된다.
 *   2. **이 함수를 쓰는 곳에는 심판이 없다.** 모임 경기(`create_session_match`)
 *      는 심판을 편성하지 않는다 — `referees` 는 늘 비어 있다. 없는 데이터를
 *      위해 규칙을 넓히는 건 추측이다.
 *
 * 대회 편성이 나중에 이 함수를 쓰게 된다면 그때는 심판도 세야 한다(심판은
 * 실제로 코트에 서 있다). 그건 서버의 검사도 함께 넓히는 일이라 여기서
 * 혼자 앞서 가지 않는다.
 */

/** 왜 묶여 있는가 */
export type BusyKind =
  /** 지금 코트에서 뛰는 중 (`live`) */
  | 'playing'
  /** 다른 경기에 이미 편성돼 차례를 기다리는 중 (`scheduled`) */
  | 'waiting'

export interface BusyInfo {
  kind: BusyKind
  /** 그 경기의 코트 이름. 아직 코트를 안 정했으면 null */
  courtName: string | null
}

export interface BusyOptions {
  /**
   * 이 경기 하나는 세지 않는다.
   *
   * 편성을 **고치는** 화면이 쓴다. 안 그러면 그 경기에 이미 들어 있는 선수가
   * 자기 자신 때문에 잠겨, 아무도 그 경기를 고칠 수 없다.
   */
  exceptMatchId?: string | null
}

/**
 * 아직 안 끝난 경기에 선수로 들어 있는 사람 → 그 사정.
 *
 * 끝난 경기(`finished`)·무효(`void`)는 세지 않는다 — 코트에서 이미 내려온
 * 사람이다. 다시 고를 수 있어야 한다.
 *
 * 한 사람이 여러 경기에 걸쳐 있으면(이미 잘못 편성된 상태) **뛰는 쪽이
 * 이긴다**. 그때 그 사람의 몸이 있는 곳은 코트 안이고, 화면은 가장 급한
 * 사실을 말해야 한다.
 */
export function buildBusyMap(
  matches: readonly MatchOverviewRow[],
  options: BusyOptions = {},
): Map<string, BusyInfo> {
  const busy = new Map<string, BusyInfo>()

  for (const m of matches) {
    if (m.status !== 'live' && m.status !== 'scheduled') continue
    if (options.exceptMatchId && m.id === options.exceptMatchId) continue

    const kind: BusyKind = m.status === 'live' ? 'playing' : 'waiting'
    for (const name of [...(m.players_a ?? []), ...(m.players_b ?? [])]) {
      // 뛰는 쪽이 이긴다 — 이미 'playing' 으로 잡힌 사람을 '대기 중' 으로 덮지 않는다
      if (busy.get(name)?.kind === 'playing') continue
      busy.set(name, { kind, courtName: m.court_name })
    }
  }

  return busy
}

/**
 * 왜 못 고르는지 화면에 쓸 짧은 말 — "1번 코트" · "1번 코트 대기" · "대기 중".
 *
 * 코트 이름이 있으면 코트를 부른다. 코트 이름은 그 사람을 **어디서** 찾을지
 * 알려주므로 상태보다 쓸모가 있다("쟤 어디 갔지" 에 바로 답한다).
 * 코트를 아직 안 정한 경기는 부를 자리가 없어 상태만 말한다.
 *
 * ⚠ 뛰는 중과 대기 중을 구분해 적는다. 찍어 보니 둘 다 "2번 코트" 로 똑같이
 * 나와서, 지금 코트 안에 있는 사람과 아직 시작도 안 한 경기에 이름만 올라간
 * 사람이 한 덩어리로 보였다. 둘은 운영이 다르다 — 대기 중인 사람은 그 경기를
 * 지우면 바로 풀리고, 뛰는 사람은 끝날 때까지 기다리는 수밖에 없다.
 */
export function busyLabel(info: BusyInfo): string {
  if (info.kind === 'playing') return info.courtName ?? '경기 중'
  return info.courtName ? `${info.courtName} 대기` : '대기 중'
}

/** 화면 읽어 주기용 — "김민수 · 1번 코트에서 경기 중이라 고를 수 없습니다" */
export function busyReason(info: BusyInfo): string {
  const where = info.courtName ? `${info.courtName}에서 ` : ''
  const what = info.kind === 'playing' ? '경기 중' : '대기 중'
  return `${where}${what}이라 고를 수 없습니다`
}
