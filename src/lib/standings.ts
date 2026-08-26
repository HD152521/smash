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
 *
 * ⚠ **화면 순위의 정본은 이 함수다. `get_standings` 의 `order by` 가 아니다.**
 * 그 SQL 은 `points desc, diff desc, scored desc, sort_order` 로만 정렬하고
 * **조커를 모른다**(20260818000004). 지금은 `StandingsTable` 이 받자마자 여기로
 * 다시 정렬하므로 화면에는 차이가 안 나타나지만, 두 곳이 같은 질문에 다르게
 * 답하고 있는 것은 사실이다.
 *
 * 그래서 **SQL 이 매겨 준 순서를 그대로 믿는 코드를 만들지 마라.** 조커조를
 * 득실 몇 점 차이로 아래에 두면 조커 규칙이 이득이 아니라 벌칙이 된다.
 * SQL 의 `order by` 는 "행 순서가 매번 흔들리지 않게" 하는 기본값으로만
 * 봐야 한다.
 *
 * 옮기고 싶다면 조커 순서까지 SQL 로 옮기고 이 함수를 지워야 한다.
 * 둘 다 두면 규칙이 갈릴 자리가 하나 더 생긴다 — 이 저장소가
 * `queuePosition` 을 하나로 합친 것과 같은 이유다.
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
