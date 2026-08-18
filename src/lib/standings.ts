import type { StandingRow, TeamSide } from '@/types/database'

/**
 * 조별 순위 정렬.
 *
 * get_standings(SQL)이 승점 → 득실차 → 총득점 까지 정렬해 주지만,
 * 승자승(동점인 조끼리 맞대결 결과)은 SQL 로 일반화하기 까다로워서 여기서 처리한다.
 *
 * 최종 순서: 승점 → 승자승 → 득실차 → 총득점 → 조 번호
 *
 * 조커조는 11점만 내면 이기지만 승점이 0.5 라, 승점을 1순위로 두면
 * 핸디캡이 순위에 자동으로 반영된다. 득실차를 앞에 두면
 * 만점이 11점인 조커조가 구조적으로 불리해지므로 3순위로 내렸다.
 */

export interface HeadToHead {
  /** 이긴 조 id */
  winnerGroupId: string
  /** 진 조 id */
  loserGroupId: string
}

/** 맞대결 전적을 조회하기 쉬운 형태로 접는다: "A가 B를 이긴 횟수" */
function buildH2HIndex(results: readonly HeadToHead[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const r of results) {
    const key = `${r.winnerGroupId}>${r.loserGroupId}`
    index.set(key, (index.get(key) ?? 0) + 1)
  }
  return index
}

/**
 * 두 조의 맞대결 우열. 양수면 a 가 앞선다.
 * 맞대결이 없거나 동률이면 0 — 다음 기준으로 넘어간다.
 */
function headToHeadDelta(a: string, b: string, index: Map<string, number>): number {
  const aWins = index.get(`${a}>${b}`) ?? 0
  const bWins = index.get(`${b}>${a}`) ?? 0
  return aWins - bWins
}

export function sortStandings(
  rows: readonly StandingRow[],
  headToHead: readonly HeadToHead[] = [],
): StandingRow[] {
  const index = buildH2HIndex(headToHead)

  return [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points

    const h2h = headToHeadDelta(a.group_id, b.group_id, index)
    if (h2h !== 0) return -h2h

    if (a.diff !== b.diff) return b.diff - a.diff
    if (a.scored !== b.scored) return b.scored - a.scored
    return a.sort_order - b.sort_order
  })
}

/** 순위표 행에서 맞대결 결과만 추려낸다 (종료된 경기만) */
export function extractHeadToHead(
  // 뷰에서 오는 값이라 전부 nullable 이다 (Postgres 는 뷰 컬럼의 NOT NULL 을 보존하지 않는다)
  matches: readonly {
    status: string | null
    winner_side: TeamSide | null
    group_a_id: string | null
    group_b_id: string | null
  }[],
): HeadToHead[] {
  const out: HeadToHead[] = []
  for (const m of matches) {
    if (m.status !== 'finished' || !m.winner_side) continue
    if (!m.group_a_id || !m.group_b_id) continue
    out.push(
      m.winner_side === 'A'
        ? { winnerGroupId: m.group_a_id, loserGroupId: m.group_b_id }
        : { winnerGroupId: m.group_b_id, loserGroupId: m.group_a_id },
    )
  }
  return out
}

/** 승점 표기: 2 → "2", 2.5 → "2.5" */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}
