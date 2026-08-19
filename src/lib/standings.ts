import type { StandingRow } from '@/types/database'

/**
 * 조별 순위 정렬.
 *
 * 순서: 승점 → 조커 → 득실차 → 총득점 → 조 번호
 *
 * 조커조는 11점만 내면 이기지만 승점이 0.5 라, 같은 승점을 쌓으려면
 * 두 배를 이겨야 한다. 그렇게 따라붙은 조를 득실 몇 점 차이로 아래에 두면
 * 조커 규칙이 이득이 아니라 벌칙이 된다. 그래서 조커를 득실보다 앞에 둔다.
 *
 * 승자승(맞대결 우선)은 뺐다. 조커 규칙과 겹칠 때 어느 쪽이 먼저인지
 * 설명하기 어렵고, 같은 조합을 여러 번 붙는 대회에서는 기준 자체가 흔들린다.
 */
export function sortStandings(rows: readonly StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points
    if (a.is_joker !== b.is_joker) return a.is_joker ? -1 : 1
    if (a.diff !== b.diff) return b.diff - a.diff
    if (a.scored !== b.scored) return b.scored - a.scored
    return a.sort_order - b.sort_order
  })
}

/** 승점 표기: 2 → "2", 2.5 → "2.5" */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}
