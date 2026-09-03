import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  WEEK_HEADS,
  buildMonthGrid,
  cellLabel,
  cellMarks,
  clubSlot,
  keyLabel,
  monthIndex,
  shapeForSlot,
  toneForSlot,
  type CalendarCell,
  type CalendarItem,
  type ClubHorizon,
  type Horizon,
  type MarkShape,
} from '@/lib/calendar'
import { cn } from '@/lib/utils'

/**
 * 달 격자 — **패턴만 보여준다.**
 *
 * 이 칸이 답하는 질문은 둘뿐이다: "이번 달에 며칠 있나" · "화요일마다
 * 있구나". 정기모임은 요일이 고정이라 그게 눈에 박히는 것이 캘린더의
 * 유일한 존재 이유고, 목록으로는 절대 안 보인다.
 *
 * "다음 모임 언제 어디서 뭐" 는 여기가 아니라 아래 1주일 목록이 답한다.
 *
 * ── 320px 이 기준이다 ──────────────────────────────────────────────
 *
 * 화면 320 − 좌우 여백 40 = 280px 을 일곱으로 나누면 칸당 40px 이다.
 * **점 하나는 되지만 글자는 안 된다.** 사용자가 말한 "색칠만" 이 정확히
 * 그 제약에 맞는 설계다. 이름·시각을 욱여넣으면 그때부터 이건 캘린더가
 * 아니라 못 읽는 목록이 된다.
 *
 * ── 색이 유일한 단서면 안 된다 ─────────────────────────────────────
 *
 * 동아리는 **모양**(원·네모·세모·마름모)이 먼저 가른다. 색맹인 사람과
 * 흑백에서 색은 통째로 사라지지만 모양은 남는다. 자리(칸 안에서 몇 번째)도
 * 동아리마다 늘 같아서 두 번째 단서가 된다. 그리고 이름을 실제로 말해
 * 주는 것은 격자가 아니라 **아래 범례**다.
 *
 * 새 색을 만들지 않는다. `index.css` 의 기존 토큰만 쓰고, 고른 넷은 두
 * 테마 · 세 면 모두에서 3:1(비문자 UI 기준)을 넘는 값들이다 —
 * `src/lib/contrast.test.ts` 가 재는 그 값들이다.
 */
export function MonthCalendar({
  year,
  month,
  items,
  now,
  horizon,
  clubIds,
  clubNames,
  clubHorizonRows,
  range,
  onMove,
  selectedKey,
  onSelectDay,
}: {
  year: number
  month: number
  /** 이 사람이 볼 수 있는 일정 전부 (`useMyTournaments` 에서 나온 것) */
  items: readonly CalendarItem[]
  now: Date
  horizon: Horizon
  /** 내 동아리 — 모양·색을 고르는 순서이자 범례의 순서 */
  clubIds: readonly string[]
  clubNames: ReadonlyMap<string, string>
  clubHorizonRows: readonly ClubHorizon[]
  range: { first: number; last: number }
  onMove: (index: number) => void
  /** 지금 펼쳐 보고 있는 날. null 이면 아래는 '다음 7일' 이다 */
  selectedKey: string | null
  onSelectDay: (key: string | null) => void
}) {
  const weeks = buildMonthGrid(year, month, items, now, horizon)
  const index = monthIndex(year, month)
  const anchor = new Date(year, month, 1)

  return (
    <section aria-labelledby="calendar-heading" className="mt-4">
      <div className="flex items-center gap-1">
        <h2 id="calendar-heading" className="tabular text-base font-black text-ink-1">
          {anchor.getFullYear()}년 {anchor.getMonth() + 1}월
        </h2>
        <div className="ml-auto flex items-center gap-0.5">
          {/*
            지난 달로는 안 넘어간다 — 근거는 `monthRange` 주석에 있다.
            버튼을 지우지 않고 **끄는** 이유는, 없으면 "이 캘린더는 원래
            안 움직이나" 로 읽히기 때문이다. 꺼져 있으면 끝이라는 뜻이다.
          */}
          <MoveButton
            dir={-1}
            label="지난 달"
            disabled={index <= range.first}
            onClick={() => onMove(index - 1)}
          />
          <MoveButton
            dir={1}
            label="다음 달"
            disabled={index >= range.last}
            onClick={() => onMove(index + 1)}
          />
        </div>
      </div>

      {/*
        달력은 표다. `div` 격자로 그리면 스크린리더가 요일과 날짜의 관계를
        읽을 근거를 잃는다 — 열 머리(`th scope="col"`)가 그 근거다.
        `border-spacing` 으로 칸을 띄운다: `gap` 은 표에서 안 먹는다.
      */}
      <table className="mt-2 w-full table-fixed border-separate border-spacing-[2px]">
        <caption className="sr-only">
          내가 든 동아리의 이번 달 일정. 칸에는 표시만 있고, 자세한 것은 아래
          「다음 7일」에 있습니다.
        </caption>
        <thead>
          <tr>
            {WEEK_HEADS.map((h) => (
              <th
                key={h}
                scope="col"
                className="pb-1 text-center text-[0.65rem] font-black tracking-tight text-ink-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]!.key}>
              {week.map((cell) => (
                <td key={cell.key} className="p-0 align-top">
                  <DayCell
                    cell={cell}
                    clubIds={clubIds}
                    label={cellLabel(cell, clubNames)}
                    selected={cell.key === selectedKey}
                    onSelect={onSelectDay}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <Legend
        clubIds={clubIds}
        clubNames={clubNames}
        rows={clubHorizonRows}
        horizon={horizon}
        hasSolo={items.some((i) => i.clubId === null || !clubNames.has(i.clubId))}
      />
    </section>
  )
}

function MoveButton({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: -1 | 1
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 44px — 엄지로 누르는 것이라 아이콘 크기가 아니라 손가락 크기로 잡는다
        'grid size-11 place-items-center rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        disabled ? 'text-ink-3/40' : 'text-ink-2 hover:bg-surface-2 active:bg-surface-2',
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
}

/**
 * 칸 하나.
 *
 * 보이는 것은 날짜 숫자와 표시뿐이고, 둘 다 `aria-hidden` 이다. 눈으로 못
 * 보는 사람에게는 `cellLabel` 이 만든 한 줄이 칸의 전부다 — 숫자를 그대로
 * 읽히게 두면 "3 · 9월 3일 화요모임" 처럼 앞이 겹친다.
 *
 * ── 지평선 밖을 어떻게 그리나 ──────────────────────────────────────
 *
 * **면을 안 깐다.** 아는 칸에는 옅은 면(`surface-1`)이 깔리고 모르는 칸은
 * 맨바닥이다. 그러면 "채워진 데까지가 확인된 구간" 으로 읽힌다.
 *
 * 흐리게 하거나 빗금을 치는 쪽도 생각했는데, 그건 *꺼진 칸*(누를 수 없는
 * 날)처럼 보인다. 여기서 말하려는 건 "이 날은 안 된다" 가 아니라 "이 날에
 * 대해 아직 아는 게 없다" 다. 면을 빼는 쪽이 그 말에 가깝다.
 *
 * ── 왜 누를 수 있나 ────────────────────────────────────────────────
 *
 * 캘린더가 **보여주는** 것은 여전히 패턴 하나다. 누르는 것은 보여주기가
 * 아니라 **아래 상세가 어느 구간을 볼지 고르는 일**이다(기본은 다음 7일).
 * 이게 없으면 7일 밖의 일정에 이 탭에서 닿을 길이 없어진다 — 목록에서
 * 뺀 것을 다시 목록으로 되살리지 않고 푸는 방법이다.
 *
 * **일정이 있는 칸만** 누를 수 있다. 빈 칸까지 눌리면 눌러도 아무 일이 안
 * 일어나고, 그건 "여기 뭔가 있는데 안 열린다" 로 읽힌다.
 */
function DayCell({
  cell,
  clubIds,
  label,
  selected,
  onSelect,
}: {
  cell: CalendarCell
  clubIds: readonly string[]
  label: string
  selected: boolean
  onSelect: (key: string | null) => void
}) {
  if (!cell.inMonth) {
    // 격자를 네모로 두려고만 있는 칸. 아무 말도 하지 않는다
    return <div className="h-11" aria-hidden />
  }

  const marks = cellMarks(cell.items)
  const face = (
    <>
      <span
        aria-hidden
        className={cn(
          'tabular text-[0.7rem] leading-none font-bold',
          selected
            ? 'text-brand-fg'
            : cell.isToday
              ? 'text-brand-fg'
              : cell.beyond
                ? 'text-ink-3'
                : 'text-ink-2',
        )}
      >
        {cell.date}
      </span>
      <span aria-hidden className="flex items-center gap-[3px]">
        {marks.shown.map((it) => (
          <Mark key={it.id} item={it} clubIds={clubIds} />
        ))}
        {marks.more && (
          /* 정확한 수는 읽어 주는 글에 있다. 여기서는 "더 있다" 까지만 */
          <span className="text-[0.6rem] leading-none font-black text-ink-3">+</span>
        )}
      </span>
      <span className="sr-only">{label}</span>
    </>
  )

  const shell = cn(
    'flex h-11 w-full flex-col items-center gap-1 rounded-lg pt-1.5',
    !cell.beyond && 'bg-surface-1',
    cell.isToday && 'ring-2 ring-brand-600 ring-inset',
  )

  if (cell.items.length === 0) return <div className={shell}>{face}</div>

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : cell.key)}
      className={cn(
        shell,
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
        selected ? 'bg-brand-600/25' : 'hover:bg-surface-2 active:bg-surface-2',
      )}
    >
      {face}
    </button>
  )
}

/**
 * 표시 하나 — 6px 도형.
 *
 * 대회는 동아리와 무관하게 별이다. 모임은 매주 오는 것이고 대회는 한 해에
 * 몇 번뿐이라, 같은 문법으로 그리면 둘이 섞인다.
 *
 * ⚠ 지금 데이터로는 별이 한 번도 안 찍힌다 — 서버가 대회 시각을 안 받는다
 * (`toCalendarItems` 주석). 그래도 그려 두는 이유는 날짜가 생기는 날
 * 캘린더가 조용히 빠뜨리지 않게 하기 위해서다.
 */
function Mark({ item, clubIds }: { item: CalendarItem; clubIds: readonly string[] }) {
  if (item.kind !== 'session') {
    return <span className="size-[7px] shrink-0 bg-ink-1" style={SHAPE_STYLE.star} />
  }
  const slot = clubSlot(item.clubId, clubIds)
  return (
    <span
      className={cn('size-[6px] shrink-0', TONE_CLASS[toneForSlot(slot)])}
      style={SHAPE_STYLE[shapeForSlot(slot)]}
    />
  )
}

/**
 * 도형은 `clip-path` 로 만든다. 아이콘을 쓰면 6px 에서 선이 뭉개지고,
 * 파일 넷을 더 들이는 값어치가 없다.
 */
const SHAPE_STYLE: Record<MarkShape | 'star', React.CSSProperties> = {
  circle: { borderRadius: '9999px' },
  square: { borderRadius: '1px' },
  triangle: { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' },
  diamond: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  star: {
    clipPath:
      'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  },
}

/**
 * 표시 색 — **기존 토큰만 쓴다.**
 *
 * 넷 다 두 테마 · 세 면(`surface-0/1/2`)에서 3:1 을 넘는다. 상태색
 * (live·warn·ok)은 여기 못 쓴다 — 다크에서 2.3~2.8:1 로 떨어지기도 하고,
 * 무엇보다 이 앱에서 색은 상태를 뜻한다(`docs/design.md` 「색은 상태다」).
 * 동아리를 빨강으로 칠하면 그 동아리가 위험해 보인다.
 */
const TONE_CLASS = ['bg-brand-600', 'bg-accent-500', 'bg-team-a', 'bg-ink-2'] as const

/**
 * 범례 — **그리고 지평선의 실제 내용.**
 *
 * 여기가 이 화면에서 제일 중요한 몇 줄이다. 격자는 "이 아래로는 못
 * 믿는다" 까지만 말할 수 있고(면을 안 깔아서), *누가* 아직 안 만들었는지는
 * 40px 칸에 못 적는다. 범례가 그걸 적는다:
 *
 *     ● 화요모임    9월 16일까지
 *     ▲ 주말클럽    9월 5일까지
 *
 * 빈 9월 20일을 본 사람이 곧바로 근거를 찾을 수 있다 — "주말클럽은 아직
 * 안 만든 거구나". 흐린 칸만으로는 여기까지 못 간다.
 */
function Legend({
  clubIds,
  clubNames,
  rows,
  horizon,
  hasSolo,
}: {
  clubIds: readonly string[]
  clubNames: ReadonlyMap<string, string>
  rows: readonly ClubHorizon[]
  horizon: Horizon
  hasSolo: boolean
}) {
  return (
    <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-1 px-4 py-3">
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const slot = clubSlot(row.clubId, clubIds)
          const until = row.lastKey ? keyLabel(row.lastKey) : null
          return (
            <li key={row.clubId} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={cn('size-[7px] shrink-0', TONE_CLASS[toneForSlot(slot)])}
                style={SHAPE_STYLE[shapeForSlot(slot)]}
              />
              <span className="min-w-0 flex-1 truncate font-bold text-ink-1">
                {clubNames.get(row.clubId) ?? '동아리'}
              </span>
              {/*
                "9월 16일까지" 는 자랑이 아니라 **경고**다. 그 날 뒤의 빈칸을
                믿지 말라는 말이라, 아직 하나도 없는 동아리는 더 세게 적는다.
              */}
              <span
                className={cn(
                  'tabular shrink-0 font-semibold',
                  until ? 'text-ink-3' : 'text-warn-fg',
                )}
              >
                {until ? `${until}까지 올라옴` : '아직 일정 없음'}
              </span>
            </li>
          )
        })}
        {hasSolo && (
          <li className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={cn('size-[7px] shrink-0', TONE_CLASS[toneForSlot(clubIds.length)])}
              style={SHAPE_STYLE[shapeForSlot(clubIds.length)]}
            />
            <span className="min-w-0 flex-1 truncate font-bold text-ink-1">동아리 없이 연 것</span>
          </li>
        )}
      </ul>

      <p className="mt-2.5 border-t border-border-subtle pt-2.5 text-xs leading-relaxed text-ink-2">
        {horizonNote(horizon)}
      </p>
    </div>
  )
}

/**
 * 🔴 **빈칸이 "없음" 으로 읽히는 것을 글로도 한 번 막는다.**
 *
 * 면을 빼는 것(시각)과 범례의 날짜(사실)만으로는 부족하다고 봤다. 격자를
 * 처음 보는 사람은 "면이 없다" 를 그냥 디자인으로 읽는다. 그래서 한 줄로
 * 규칙 자체를 말해 준다 — 이 캘린더에서 딱 한 번 나오는 설명문이다.
 */
function horizonNote(horizon: Horizon): string {
  if (horizon.kind === 'open') {
    return '동아리에 들면 동아리 일정도 여기 함께 뜹니다.'
  }
  if (horizon.kind === 'none') {
    return '아직 올라온 일정이 없습니다. 빈칸은 "모임이 없는 날" 이 아니라 "아직 안 만들어진 날" 입니다.'
  }
  const until = keyLabel(horizon.key)
  return `일정은 ${until ?? '오늘'}까지 올라와 있습니다. 그 뒤의 빈칸은 "모임이 없는 날" 이 아니라 "아직 안 만들어진 날" 입니다.`
}
