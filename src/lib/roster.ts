import type { MatchOverviewRow, PlayerGrade, RsvpStatus } from '@/types/database'

/**
 * 명단 화면의 판단 — "오늘 누가 왔고 누가 어떤 상태인가".
 *
 * 기록(records.ts)이 '지나간 경기' 를 훑는 규칙이라면 여기는 **사람**이
 * 기준이다. 명단은 대회 내내 열어 보는 화면이고, 운영진이 거기서 답을
 * 얻고 싶은 질문은 둘뿐이다 — "누가 왔나", "다음에 누굴 넣지".
 *
 * 순수 함수만 둔다. 화면에서 세면 같은 집계가 명단·경기 짜기·관리에
 * 세 벌 생기고, 한 곳만 고치면 숫자가 서로 어긋난다.
 */

export interface RosterStat {
  /** 오늘 실제로 뛴 경기 수. 예정(scheduled)·무효(void)는 안 센다 */
  played: number
  /**
   * 마지막으로 뛴 경기 시각(밀리초). 한 판도 안 뛰었으면 0.
   *
   * **지금 코트에 있으면 Infinity 다.** 진행 중인 경기는 끝난 시각이 없어서
   * 시작 시각으로 재면 "10분 전에 시작해 아직 치는 중인 사람" 이 "1분 전에
   * 끝난 사람" 보다 오래 쉰 것으로 잡힌다. 코트 위에 있는 사람은 쉰 시간이
   * 0 이므로 가장 최근으로 본다.
   */
  lastPlayedAt: number
}

export type RosterStats = ReadonlyMap<string, RosterStat>

const NO_STAT: RosterStat = { played: 0, lastPlayedAt: 0 }

/** 통계가 없는 사람은 '오늘 안 뛴 사람' 이다. undefined 를 화면까지 흘리지 않는다 */
export function rosterStat(stats: RosterStats, name: string): RosterStat {
  return stats.get(name) ?? NO_STAT
}

/**
 * 이 경기를 '언제 뛴 것' 으로 칠 것인가.
 *
 * 끝난 시각이 우선이고, 없으면 시작 시각, 그것도 없으면 만든 시각이다.
 * 진행 중인 경기는 위 `lastPlayedAt` 주석대로 Infinity 다.
 */
function playedAt(m: MatchOverviewRow): number {
  if (m.status === 'live') return Number.POSITIVE_INFINITY
  const when = m.finished_at ?? m.started_at ?? m.created_at
  if (!when) return 0
  const t = Date.parse(when)
  return Number.isNaN(t) ? 0 : t
}

/**
 * 이름별 오늘 성적 — 몇 판 뛰었고 마지막이 언제였나.
 *
 * **새로 만드는 데이터가 아니다.** `match_overview` 가 선수를 이름 배열로
 * 이미 내려 주므로 여기서 세기만 한다(대회 안에서 표시 이름은 서버가
 * 유일하게 강제한다 — MemberManager 주석 참고).
 *
 * 심판은 안 센다. "몇 판 뛰었나" 는 코트에 선 횟수지 심판을 본 횟수가
 * 아니다. 심판까지 세면 한 번도 안 뛴 사람이 '2판' 으로 보인다.
 */
export function buildRosterStats(matches: readonly MatchOverviewRow[]): RosterStats {
  const stats = new Map<string, RosterStat>()
  for (const m of matches) {
    // 예정 경기는 아직 안 뛴 것이고, 무효는 없던 일이다
    if (m.status !== 'live' && m.status !== 'finished') continue
    const at = playedAt(m)
    for (const name of [...(m.players_a ?? []), ...(m.players_b ?? [])]) {
      const prev = stats.get(name) ?? NO_STAT
      stats.set(name, {
        played: prev.played + 1,
        lastPlayedAt: Math.max(prev.lastPlayedAt, at),
      })
    }
  }
  return stats
}

/**
 * 경기에 한 번이라도 걸린 이름 — **뺄 수 있는지** 판단하는 데만 쓴다.
 *
 * 서버가 삭제를 막는다. 지우면 그 경기 기록에서도 사라지기 때문이다.
 * 그런데 눌러 보고 실패하게 두면 오류는 목록 맨 위에 뜨고, 20명짜리
 * 목록 아래쪽에서 누른 사람에게는 화면 밖이라 이유가 안 보인다.
 * 애초에 못 누르게 한다.
 *
 * `buildRosterStats` 와 기준이 다르다 — 여기는 **예정 경기와 심판까지**
 * 센다. 아직 안 뛴 예정 경기에 이름이 걸려 있어도 지우면 그 경기가
 * 깨지기 때문이다.
 */
export function namesInAnyMatch(matches: readonly MatchOverviewRow[]): Set<string> {
  const names = new Set<string>()
  for (const m of matches) {
    if (m.status === 'void') continue
    for (const n of [...(m.players_a ?? []), ...(m.players_b ?? []), ...(m.referees ?? [])]) {
      names.add(n)
    }
  }
  return names
}

/** 순서를 매기는 데 필요한 최소한의 모양 — MemberSummary 가 그대로 들어온다 */
export interface RosterMember {
  /** null 이면 계정이 없는 '명단만' 회원이다. 참가를 누를 주체가 없다 */
  userId: string | null
  displayName: string
  rsvp: RsvpStatus
}

/**
 * 왔나 · 모르나 · 안 왔나 (0 · 1 · 2). 작을수록 위다.
 *
 * 모임은 동아리 회원 **전원**을 명단에 심어 놓고 시작한다(create_session).
 * 그래서 참가를 안 누른 사람이 명단의 절반일 수 있고, 그 사람들은 오늘
 * 0판이라 '경기 수' 로만 줄 세우면 **안 온 사람이 맨 위에 온다.** 다음
 * 경기에 넣을 사람을 찾으려고 연 화면인데 정반대가 되는 것이다.
 *
 * **한 판이라도 뛰었으면 무조건 '왔다' 다.** rsvp 를 안 눌렀거나 불참을
 * 눌러 놓고 나온 사람이 실제로 있고, 코트에 선 사실이 버튼보다 강한
 * 증거다. 대회(kind='tournament')는 서버가 rsvp 를 전부 'going' 으로
 * 맞추므로 이 단계가 통째로 무효가 된다 — 대회 명단은 원래 다 온 사람이다.
 *
 * **계정이 없는 사람도 '왔다' 로 본다.** 누를 버튼이 없어서 값이 영원히
 * 'invited' 에 머무는데, 그 침묵을 '안 왔다' 로 읽으면 문 앞에서 손으로
 * 적어 넣은 사람이 목록 맨 아래로 가라앉는다. 방금 넣은 사람이 곧
 * 다음 경기에 넣을 사람인데 정반대가 된다 — 찍어 보고 잡은 문제다.
 */
export function presenceTier(member: RosterMember, stat: RosterStat): number {
  if (stat.played > 0 || member.rsvp === 'going') return 0
  if (member.userId === null) return 0
  return member.rsvp === 'declined' ? 2 : 1
}

/**
 * 명단 순서.
 *
 * 가나다순은 "저 사람 몇 조지" 에만 답한다. 명단을 여는 진짜 이유는
 * **"다음에 누굴 넣지"** 이고, 거기에 필요한 건 이 순서다:
 *
 *   1) 온 사람 → 아직 모르는 사람 → 안 온다는 사람 (`presenceTier`)
 *   2) 그 안에서 **오늘 적게 뛴 사람이 위** — 안 뛴 사람이 맨 위다
 *   3) 같은 판수면 **오래 쉰 사람이 위** (진행 중인 경기는 맨 뒤로 간다)
 *   4) 그래도 같으면 가나다순 — 순서가 매번 흔들리지 않게 못을 박는다
 *
 * 4번이 없으면 같은 조건인 사람들의 순서가 새로고침마다 바뀐다. 목록이
 * 스스로 움직이는 화면은 손가락이 누를 곳을 못 찾는다.
 *
 * 원본을 건드리지 않도록 복사본을 정렬한다.
 */
export function orderRoster<T extends RosterMember>(
  members: readonly T[],
  stats: RosterStats,
): T[] {
  return [...members].sort((a, b) => {
    const sa = rosterStat(stats, a.displayName)
    const sb = rosterStat(stats, b.displayName)

    const tier = presenceTier(a, sa) - presenceTier(b, sb)
    if (tier !== 0) return tier
    if (sa.played !== sb.played) return sa.played - sb.played
    // Infinity 끼리 빼면 NaN 이라 같은지 먼저 본다
    if (sa.lastPlayedAt !== sb.lastPlayedAt) return sa.lastPlayedAt - sb.lastPlayedAt
    return a.displayName.localeCompare(b.displayName, 'ko')
  })
}

/**
 * 참가 여부 배지를 이 목록에서 띄울 값어치가 있는가.
 *
 * `hasAccountContrast`(rsvp.ts)와 같은 판단이다 — **모두에게 붙는 배지는
 * 배지가 아니라 잡음이다.** 아무도 아직 안 눌렀으면 전원이 '미정' 이라
 * 배지가 누구도 갈라 주지 못한다. 그때 인원 구성은 머리말의
 * "참가 0 · 미정 9" 한 줄이 이미 말해 준다.
 */
export function hasRsvpContrast(members: readonly RosterMember[]): boolean {
  /*
   * 계정이 있는 사람만 센다. 계정이 없으면 누를 방법이 없어서 값이 영원히
   * 'invited' 에 머무는데, 그걸 '미정' 으로 읽으면 매주 오는 회원이 유령
   * 미응답자가 된다 — rsvp.ts 의 `RsvpCounts.noAccount` 가 같은 이유로
   * 그 사람들을 미정에서 빼낸다. 그 사람들은 '미가입' 배지가 따로 말한다.
   */
  const answerable = members.filter((m) => m.userId !== null)
  return answerable.some((m) => m.rsvp === 'going') && answerable.some((m) => m.rsvp !== 'going')
}

/**
 * 급수 배지를 이 목록에서 띄울 값어치가 있는가.
 *
 * `hasRsvpContrast` · `hasAccountContrast` 와 **같은 판단**이다 — 모두에게
 * 붙는 배지는 배지가 아니라 잡음이다. 여기서 그 규율이 특히 중요한 이유가
 * 둘 있다:
 *
 *  - 아직 아무도 급수를 안 골랐으면(전원 null) 그릴 것이 없다. 그런데
 *    "전원이 같은 급수" 도 똑같이 아무도 갈라 주지 못한다 — B 급수만 모인
 *    동아리 모임에서 20줄 전부에 'B' 가 붙으면 이름만 읽기 어려워진다.
 *  - 반대로 일부만 급수가 있으면 **그것이 곧 대비**다. 그때는 값이 있는
 *    줄에만 배지가 붙어 정확히 갈라 준다.
 *
 * 그래서 기준은 "값이 있는가" 가 아니라 **"값이 두 가지 이상인가"** 다.
 * null(모른다)도 한 가지 값으로 센다.
 */
export function hasGradeContrast(members: readonly { grade: PlayerGrade | null }[]): boolean {
  const kinds = new Set(members.map((m) => m.grade))
  // 전원 null 이면 size 가 1 이라 자연히 걸러진다 — 따로 분기하지 않는다
  return kinds.size >= 2
}
