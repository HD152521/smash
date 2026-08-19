import { formatPoints, sortStandings } from '@/lib/standings'
import { cn } from '@/lib/utils'
import type { StandingRow } from '@/types/database'

interface StandingsTableProps {
  standings: StandingRow[]
  /** 내 조를 강조한다 */
  myGroupId?: string | null
}

/**
 * 조별 순위표.
 *
 * 정렬: 승점 → 조커 → 득실차 → 총득점 → 조 번호
 *
 * 조커조는 이겨도 승점이 0.5 라 같은 승점을 쌓으려면 두 배를 이겨야 한다.
 * 그래서 승점이 같으면 조커를 위에 둔다 — 득실로 가리면 조커 규칙이
 * 이득이 아니라 벌칙이 된다.
 */
export function StandingsTable({ standings, myGroupId }: StandingsTableProps) {
  const sorted = sortStandings(standings)
  const anyPlayed = sorted.some((r) => r.played > 0)

  if (!anyPlayed) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        아직 끝난 경기가 없습니다.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <caption className="sr-only">조별 순위 — 승점, 조커, 득실차, 총득점 순으로 정렬</caption>
        <thead>
          <tr className="bg-surface-2 text-xs font-bold text-ink-2">
            <th scope="col" className="px-3 py-2.5 text-left">
              순위
            </th>
            <th scope="col" className="px-2 py-2.5 text-left">
              조
            </th>
            <th scope="col" className="px-2 py-2.5 text-right">
              경기
            </th>
            <th scope="col" className="px-2 py-2.5 text-right">
              승
            </th>
            <th scope="col" className="px-2 py-2.5 text-right">
              패
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              승점
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              득실
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const mine = myGroupId === r.group_id
            return (
              <tr
                key={r.group_id}
                className={cn(
                  'border-t border-border-subtle',
                  mine ? 'bg-brand-50' : 'bg-surface-1',
                )}
              >
                <td className="tabular px-3 py-3 font-black text-ink-2">{i + 1}</td>
                <td className="px-2 py-3">
                  <span className="font-bold text-ink-1">
                    {r.is_joker && <span aria-hidden>🃏 </span>}
                    {r.group_name}
                  </span>
                  {mine && (
                    <span className="ml-1.5 text-xs font-semibold text-brand-fg">내 조</span>
                  )}
                </td>
                <td className="tabular px-2 py-3 text-right text-ink-2">{r.played}</td>
                <td className="tabular px-2 py-3 text-right font-semibold text-ink-1">{r.wins}</td>
                <td className="tabular px-2 py-3 text-right text-ink-2">{r.losses}</td>
                <td className="tabular px-3 py-3 text-right text-base font-black text-ink-1">
                  {formatPoints(Number(r.points))}
                </td>
                <td
                  className={cn(
                    'tabular px-3 py-3 text-right font-semibold',
                    r.diff > 0 ? 'text-ok-fg' : r.diff < 0 ? 'text-team-b-fg' : 'text-ink-3',
                  )}
                >
                  {r.diff > 0 ? '+' : ''}
                  {r.diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {sorted.some((r) => r.is_joker) && (
        <p className="border-t border-border-subtle bg-surface-2 px-3 py-2 text-xs text-ink-3">
          🃏 조커조는 더 적은 점수로 이기지만 승점을 절반만 받습니다.
        </p>
      )}
    </div>
  )
}
