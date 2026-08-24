import type { MatchOverviewRow } from '@/types/database'

/**
 * 경기 기록 — 끝난 경기를 훑어보는 규칙.
 *
 * 대진표(schedule.ts)는 '앞으로 할 것' 이라 줄 선 순서가 기준이고,
 * 기록은 '지나간 것' 이라 시각이 기준이다. 같은 목록을 두 화면이 정반대
 * 기준으로 보므로 정렬을 각자 갖는다.
 */

/**
 * 이 경기가 언제 끝났나. 밀리초.
 *
 * 끝난 시각이 없는 경우가 있다 — 무효 처리된 예정 경기, 그리고 아주 옛날에
 * 들어온 행. 그때는 만든 시각으로 대신한다. 둘 다 없으면 맨 아래로 보낸다.
 */
export function recordTime(m: MatchOverviewRow): number {
  const when = m.finished_at ?? m.created_at
  if (!when) return 0
  const t = Date.parse(when)
  return Number.isNaN(t) ? 0 : t
}

/**
 * 기록 목록 순서.
 *
 * 1) 무효는 맨 아래로 가라앉힌다.
 *    순위에 안 들어가는 경기가 목록 한가운데 흐릿하게 끼어 있으면 훑어
 *    내려가는 눈이 매번 거기서 한 번씩 걸린다. 지운 것도 아니라서 찾으려면
 *    찾을 수 있어야 하고, 그러면 자리는 맨 아래가 맞다.
 *
 * 2) 그 안에서는 최근에 끝난 것이 위다.
 *    이 화면을 여는 시점은 대개 방금 경기가 끝난 직후다. "그거 몇 대 몇이었지"
 *    를 찾으려고 열었는데 아침 첫 경기부터 나오면 매번 끝까지 내려가야 한다.
 *
 * 원본을 건드리지 않도록 복사본을 정렬한다.
 */
export function orderRecords(matches: readonly MatchOverviewRow[]): MatchOverviewRow[] {
  return [...matches].sort((a, b) => {
    const voided = Number(a.status === 'void') - Number(b.status === 'void')
    if (voided !== 0) return voided
    return recordTime(b) - recordTime(a)
  })
}

/**
 * 이름으로 찾기 — 뛴 사람만 본다.
 *
 * 심판은 뺀다. 기록을 뒤지는 이유는 "내가 그 경기 몇 점 냈지" 지
 * "내가 어느 경기 심판이었지" 가 아니다. 심판까지 걸리면 이름 하나로
 * 자기가 관여한 모든 경기가 쏟아져서 정작 찾는 경기가 묻힌다.
 */
export function matchHasPlayer(m: MatchOverviewRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const names = [...(m.players_a ?? []), ...(m.players_b ?? [])]
  return names.some((n) => n.toLowerCase().includes(q))
}
