import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'
import { buildMatchupIndex, cellState, scoreForRow, type GroupLite } from '@/lib/schedule'

/**
 * 조 맞대결 격자.
 *
 * 조 대항전에서 사람들이 가장 먼저 묻는 건 "우리 조가 어디랑 붙었고
 * 어디가 남았나" 다. 목록으로는 그걸 셀 수 없다. 격자면 한 눈에 보인다.
 *
 * 조가 6개만 넘어가도 폰 너비를 넘으므로 가로로 스크롤하고,
 * 조 이름 열은 고정해서 어느 행을 보고 있는지 놓치지 않게 한다.
 */
export function MatchupGrid({
  tournamentId,
  groups,
  matches,
  myGroupId,
  isAdmin,
}: {
  tournamentId: string
  groups: readonly GroupLite[]
  matches: readonly MatchOverviewRow[]
  myGroupId?: string | null
  isAdmin: boolean
}) {
  const index = buildMatchupIndex(matches)
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order)

  if (sorted.length < 2) {
    return (
      <p className="rounded-2xl border border-border-subtle bg-surface-1 p-5 text-sm text-ink-2">
        조가 2개 이상이어야 대진표가 만들어집니다.
      </p>
    )
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-1">
      <table className="border-separate border-spacing-1 text-center">
        <caption className="sr-only">
          조별 맞대결 표. 행이 우리 조, 열이 상대 조이고 칸은 결과입니다.
        </caption>
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-surface-0" />
            {sorted.map((g) => (
              <th
                key={g.id}
                scope="col"
                className={cn(
                  'w-14 min-w-14 rounded-lg px-1 py-1.5 text-xs font-bold',
                  g.id === myGroupId ? 'bg-brand-600 text-white' : 'text-ink-2',
                )}
              >
                {shortName(g.name)}
                {g.is_joker && <span className="ml-0.5 text-[10px] text-warn-fg">★</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className={cn(
                  'sticky left-0 z-10 whitespace-nowrap rounded-lg bg-surface-0 pr-2 text-right text-xs font-bold',
                  row.id === myGroupId ? 'text-brand-fg' : 'text-ink-2',
                )}
              >
                {shortName(row.name)}
                {row.is_joker && <span className="ml-0.5 text-[10px] text-warn-fg">★</span>}
              </th>
              {sorted.map((col) => (
                <td key={col.id} className="p-0">
                  <Cell
                    tournamentId={tournamentId}
                    index={index}
                    rowId={row.id}
                    colId={col.id}
                    rowName={row.name}
                    colName={col.name}
                    isAdmin={isAdmin}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "1조" 는 그대로, "초보 A조" 처럼 길면 앞을 자른다 — 칸이 좁다 */
function shortName(name: string): string {
  return name.length <= 4 ? name : `${name.slice(0, 3)}…`
}

const CELL = 'flex h-11 w-14 min-w-14 flex-col items-center justify-center rounded-lg text-xs'

function Cell({
  tournamentId,
  index,
  rowId,
  colId,
  rowName,
  colName,
  isAdmin,
}: {
  tournamentId: string
  index: ReturnType<typeof buildMatchupIndex>
  rowId: string
  colId: string
  rowName: string
  colName: string
  isAdmin: boolean
}) {
  const state = cellState(index, rowId, colId)

  if (state.kind === 'self') {
    return <div className={cn(CELL, 'bg-surface-2/50 text-ink-3')} aria-label="자기 조">—</div>
  }

  if (state.kind === 'empty') {
    // 관리자에게 빈 칸은 "여기 편성해라" 라는 뜻이다. 바로 편성으로 보낸다.
    if (isAdmin) {
      return (
        <Link
          to={`/t/${tournamentId}/matches/new?a=${rowId}&b=${colId}`}
          aria-label={`${rowName} 대 ${colName} 경기 편성`}
          className={cn(
            CELL,
            'border border-dashed border-border-subtle text-ink-3 transition-colors',
            'hover:border-brand-600 hover:text-brand-fg',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
          )}
        >
          <span aria-hidden className="text-base leading-none">+</span>
        </Link>
      )
    }
    return (
      <div
        className={cn(CELL, 'border border-dashed border-border-subtle text-ink-3')}
        aria-label={`${rowName} 대 ${colName} 아직 안 함`}
      >
        <span aria-hidden>·</span>
      </div>
    )
  }

  const { mine, theirs } = scoreForRow(state.match, rowId)
  const to = state.match.id ? `/t/${tournamentId}/matches/${state.match.id}` : undefined

  const body =
    state.kind === 'live' ? (
      <>
        <span className="text-[10px] font-black text-live-fg">LIVE</span>
        <span className="font-bold tabular-nums text-ink-1">
          {mine}:{theirs}
        </span>
      </>
    ) : state.kind === 'scheduled' ? (
      <span className="text-[11px] font-semibold text-ink-2">예정</span>
    ) : (
      <>
        <span className={cn('font-black tabular-nums', state.aWon ? 'text-ok-fg' : 'text-ink-3')}>
          {mine}:{theirs}
        </span>
        {state.extra > 0 && <span className="text-[10px] text-ink-3">+{state.extra}</span>}
      </>
    )

  const label =
    state.kind === 'live'
      ? `${rowName} 대 ${colName} 진행 중 ${mine} 대 ${theirs}`
      : state.kind === 'scheduled'
        ? `${rowName} 대 ${colName} 예정`
        : `${rowName} 대 ${colName} ${mine} 대 ${theirs} ${state.aWon ? '승' : '패'}`

  const tone =
    state.kind === 'live'
      ? 'bg-live/15 ring-1 ring-live/40'
      : state.kind === 'scheduled'
        ? 'bg-surface-2'
        : state.aWon
          ? 'bg-ok/12'
          : 'bg-surface-2'

  if (!to) return <div className={cn(CELL, tone)} aria-label={label}>{body}</div>

  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        CELL,
        tone,
        'transition-transform hover:-translate-y-0.5',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
      )}
    >
      {body}
    </Link>
  )
}
