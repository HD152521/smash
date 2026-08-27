import { buildSchedule, myMatchRole, queuePosition } from './schedule'
import type { MyTournament } from '@/features/tournament/api'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 홈이 **오늘 무엇을 보여줄지** 고르는 판단.
 *
 * ── 홈의 책임이 바뀌었다 ────────────────────────────────────────────
 *
 * 어제까지 홈의 책임은 "어디로 갈지 고르는 곳" 이었고, 그래서 문(링크)만
 * 두고 정보를 하나도 그리지 않았다. 그런데 찍어 보니 **흰 카드 다섯 개가
 * 쌓인 목록이고 정보가 0** 이었다(`docs/ui-redesign.md`).
 *
 * 책임을 잘못 고른 것이다. 홈의 책임은 **"오늘을 보여준다"** 여야 한다.
 * 그러면 화면 하나에 책임 하나는 그대로 지켜지고 — 문은 그 아래 딸린
 * 것이 된다.
 *
 * ── 왜 하나만 고르는가 ──────────────────────────────────────────────
 *
 * 진행 중인 것 셋을 나란히 보여주면 그건 다시 목록이다. 홈에 온 사람의
 * 질문은 "내가 지금 뭘 해야 하지" 하나뿐이고, 그 답도 하나다.
 * **나머지는 「내 목록」이 할 일이다.**
 *
 * ── 시각은 인자로 받는다 ────────────────────────────────────────────
 *
 * `rsvp.ts` 의 `hasStarted(startsAt, now)` 와 같은 규율이다. 순수 함수
 * 안에서 시계를 읽으면 테스트가 오늘 날짜에 따라 흔들린다.
 */

/** 홈이 오늘 보여줄 하나 */
export type TodayFocus =
  /** 지금 돌아가는 중 — 들어가면 코트가 보인다 */
  | { kind: 'live'; tournament: MyTournament }
  /**
   * 아직 시작 안 한 다음 모임.
   *
   * `startsAt` 이 있는 것만 여기 온다. 즉석 모임(NULL)은 "다음" 이라는
   * 개념이 없다 — 만든 순간이 곧 시작이라 `live` 로만 나타난다.
   */
  | { kind: 'upcoming'; tournament: MyTournament; startsAt: string }

/**
 * 오늘 보여줄 하나를 고른다. 없으면 null — 그때는 빈 화면이 아니라
 * **빈 상태를 설계해야 한다**(`docs/ui-redesign.md`). 진행 중인 것이
 * 없는 날이 기본이다.
 *
 * 순서: 진행 중 → 가장 가까운 다음 모임.
 *
 * 진행 중이 먼저인 이유는 **몸이 이미 체육관에 있기 때문**이다. 다음 주
 * 모임 안내보다 지금 서 있는 코트가 급하다.
 */
export function pickTodayFocus(
  tournaments: readonly MyTournament[],
  now: Date,
): TodayFocus | null {
  const live = tournaments.find((t) => t.status === 'live')
  if (live) return { kind: 'live', tournament: live }

  const upcoming = tournaments
    .filter((t) => t.status !== 'finished')
    .map((t) => ({ t, at: parseAt(t.startsAt) }))
    .filter((x): x is { t: MyTournament; at: number } => x.at !== null && x.at >= now.getTime())
    .sort((a, b) => a.at - b.at)[0]

  if (!upcoming) return null
  return { kind: 'upcoming', tournament: upcoming.t, startsAt: upcoming.t.startsAt! }
}

/**
 * 이번 달에 나온 모임 수.
 *
 * 세는 기준은 **모임 시각**이다. `joinedAt`(명단에 심어진 때)이 아니다 —
 * 동아리 모임은 만들어질 때 회원 전원이 한꺼번에 심어지므로, 그걸 세면
 * "내가 나온 횟수" 가 아니라 "동아리가 연 횟수" 가 된다.
 *
 * 그래서 **시각이 없는 즉석 모임은 세지 않는다.** 셀 근거가 없는 것을
 * 억지로 세면 숫자가 조용히 틀린다 — 없는 편이 낫다.
 *
 * 아직 안 온 미래 모임도 빼야 하므로 `now` 이전만 센다.
 */
export function attendanceThisMonth(tournaments: readonly MyTournament[], now: Date): number {
  return tournaments.filter((t) => {
    if (t.kind !== 'session') return false
    const at = parseAt(t.startsAt)
    if (at === null || at > now.getTime()) return false
    const d = new Date(at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
}

/**
 * "3일 뒤" · "내일" · "오늘" — 남은 날을 사람 말로.
 *
 * 시:분이 아니라 **날짜 경계로 센다.** 밤 11시에 보는 "12시간 뒤" 는
 * 내일 아침인데 오늘로 읽힌다.
 */
export function daysUntilLabel(startsAt: string, now: Date): string | null {
  const at = parseAt(startsAt)
  if (at === null) return null

  const start = new Date(at)
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((a - b) / 86_400_000)

  if (days < 0) return null
  if (days === 0) return '오늘'
  if (days === 1) return '내일'
  return `${days}일 뒤`
}

/** 못 읽는 값은 null. 서버가 보낸 것이라도 믿지 않는다 */
function parseAt(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

// ── 내 다음 경기 ──────────────────────────────────────────────────────

/**
 * 진행 중인 모임에서 **나에게** 무슨 일이 남았는가.
 *
 * 참가자가 홈에 오는 이유 중 가장 큰 것이다 — "내 차례 언제야". 그런데
 * 이걸 답하려면 코트 화면까지 들어가야 했다.
 *
 * ⚠ **순번을 새로 세지 않는다.** `buildSchedule` + `queuePosition` 을
 * 그대로 쓴다. 그 둘은 SQL 의 `notify_up_next` 와 같은 줄을 세야 하고,
 * 여기에 네 번째 셈법을 만들면 어긋날 자리가 하나 더 생긴다.
 */
export type MyNext =
  /** 지금 코트 안에 있다 */
  | { kind: 'playing'; courtName: string }
  /** 코트에 붙은 대기 — 앞에 몇 경기 */
  | { kind: 'waiting'; courtName: string; ahead: number }
  /**
   * 편성은 됐는데 코트가 아직 없다.
   *
   * **숫자를 내지 않는다.** 어느 코트가 먼저 빌지 모르는데 "앞에 2경기" 를
   * 내면 그건 추측이 아니라 거짓말이다.
   */
  | { kind: 'unassigned' }

export function myNextInTournament(
  matches: readonly MatchOverviewRow[],
  courts: readonly CourtRow[],
  myName: string | undefined,
): MyNext | null {
  if (!myName) return null
  const s = buildSchedule(matches, courts)

  for (const q of s.courts) {
    if (q.live && myMatchRole(q.live, myName) === 'player') {
      return { kind: 'playing', courtName: q.court.name }
    }
  }

  /*
   * 코트가 다르면 서로의 대기열만으로는 앞뒤를 알 수 없어 queue_order 로
   * 고른다. 서버가 정렬에 쓴 바로 그 값이라 여기서 새 규칙이 생기지 않는다.
   */
  const mineOnCourt = s.courts
    .map((q) => ({ q, m: q.waiting.find((x) => myMatchRole(x, myName) === 'player') }))
    .filter((c): c is { q: (typeof s.courts)[number]; m: MatchOverviewRow } => Boolean(c.m))
  const mineFree = s.unassigned.filter((m) => myMatchRole(m, myName) === 'player')

  const earliest = Math.min(
    ...mineOnCourt.map((c) => c.m.queue_order ?? Infinity),
    ...mineFree.map((m) => m.queue_order ?? Infinity),
  )
  if (!Number.isFinite(earliest)) return null

  const onCourt = mineOnCourt.find((c) => (c.m.queue_order ?? Infinity) === earliest)
  if (!onCourt) return { kind: 'unassigned' }

  const pos = queuePosition(onCourt.q.waiting, onCourt.m.id)
  if (pos === null) return { kind: 'unassigned' }
  return { kind: 'waiting', courtName: onCourt.q.court.name, ahead: pos - 1 }
}

/** 화면에 그대로 쓰는 문구 */
export function myNextLabel(next: MyNext): string {
  if (next.kind === 'playing') return `지금 ${next.courtName} 에서 뛰는 중`
  if (next.kind === 'unassigned') return '코트가 정해지지 않았습니다'
  if (next.ahead === 0) return `다음 차례 · ${next.courtName}`
  return `${next.courtName} · 앞에 ${next.ahead}경기`
}
