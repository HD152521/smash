import type { MyTournament } from '@/features/tournament/api'
import type { TournamentKind } from '@/types/database'

/**
 * 「내 목록」 캘린더의 판단을 모아 둔 곳.
 *
 * ── 캘린더가 하는 일은 하나다 ──────────────────────────────────────
 *
 * **패턴.** "이번 달에 며칠 있나" · "화요일마다 있구나". 목록으로는 절대
 * 안 보이는 것이고, 이걸 잃으면 캘린더를 만들 이유가 없다. 그래서 칸에는
 * 점만 찍는다 — 320px 에서 칸 하나가 40px 남짓이라 글자가 안 들어가고,
 * 억지로 넣으면 패턴이 글자에 묻힌다.
 *
 * "다음 모임 언제 어디서 뭐" 는 캘린더가 아니라 **그 아래 1주일 목록**이
 * 답한다. 한 화면이지만 두 층이 서로 다른 질문을 맡는다.
 *
 * ── 🔴 빈칸이 "없음" 을 주장하는 문제 ───────────────────────────────
 *
 * 앱은 **만들어진 모임만** 안다. 매주 화·목 모이는 동아리라도 총무가 3주
 * 뒤 모임을 아직 안 만들었으면 그 칸은 비어 있고, 보는 사람은 그걸
 * "그 주는 모임이 없구나" 로 읽는다. 실제로는 "아직 안 만들었구나" 다.
 *
 * 목록에서는 이 착각이 안 생긴다 — 없으면 그냥 안 보인다. **격자는 빈칸을
 * 적극적으로 그려서 "없음" 을 주장한다.** 캘린더가 목록보다 나쁜 유일한
 * 지점이고, 안 풀면 확실히 오해가 생긴다.
 *
 * 여기서 푸는 방법이 `Horizon`(지평선)이다. 아래 그 타입 주석에 근거를
 * 적었다.
 *
 * ── 시각은 인자로 받는다 ────────────────────────────────────────────
 *
 * `rsvp.ts` 의 `hasStarted(startsAt, now)` · `home.ts` 의
 * `pickTodayFocus(list, now)` 와 같은 규율이다. 순수 함수 안에서 시계를
 * 읽으면 테스트가 오늘 날짜에 따라 흔들린다.
 *
 * ── ⚠ 날짜는 **로컬 시각**으로만 나눈다 ────────────────────────────
 *
 * `new Date(iso)` 는 기기 시간대(한국이면 KST)로 옮겨 준다. 칸을 나눌 때는
 * 반드시 `getFullYear/getMonth/getDate` 를 쓴다. `toISOString().slice(0,10)`
 * 은 UTC 로 자르므로 **새벽 1시 모임이 전날 칸에 찍힌다**(KST 04:00 은
 * UTC 전날 19:00). `rsvp.ts` 가 "서버 시계를 흉내 내려고 오프셋을 손으로
 * 더하지 않는다" 고 적어 둔 것과 같은 이유로, 여기서도 오프셋을 손대지
 * 않고 기기 시간대에 맡긴다.
 */

/** 캘린더 열 머리 — 사용자가 그린 격자가 월요일 시작이다 */
export const WEEK_HEADS = ['월', '화', '수', '목', '금', '토', '일'] as const

/**
 * 동아리를 가르는 **모양**. 색은 두 번째 단서일 뿐이다.
 *
 * 색맹인 사람과 흑백 출력에서 색은 통째로 사라진다. 모양은 남는다.
 * 넷을 넘어가면 모양이 돌아 쓰이므로 그때는 색이 함께 갈라 준다 —
 * 그래도 이름을 말해 주는 것은 격자가 아니라 **아래 범례**다.
 */
export const MARK_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const
export type MarkShape = (typeof MARK_SHAPES)[number]

/** 캘린더에 찍히는 일정 하나 */
export interface CalendarItem {
  id: string
  name: string
  kind: TournamentKind
  /** 소속 동아리. 동아리 없이 연 것은 null */
  clubId: string | null
  /** 기기 시간대로 옮긴 시작 시각 */
  at: Date
  /** 이 일정이 앉는 칸 — 'YYYY-MM-DD' (로컬 기준) */
  key: string
}

/**
 * 로컬 달력 칸 열쇠.
 *
 * ⚠ `toISOString()` 을 쓰지 않는다. 그건 UTC 로 자르므로 KST 새벽 모임이
 * 하루 앞 칸으로 밀린다 — 캘린더의 전형적 사고다.
 */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 그 날 00:00 (로컬). 날짜 계산은 전부 여기서 출발한다 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 내 대회·모임 목록에서 **날짜가 있는 것만** 캘린더 일정으로 바꾼다.
 *
 * ⚠ 여기서 걸러지는 것이 둘 있고, 둘 다 의도한 것이다.
 *
 *  - **즉석 모임**(`starts_at` NULL) — "지금 모여서 치는 날" 이라 앉을 칸이
 *    없다. `created_at` 으로 찍으면 그럴듯해 보이지만 그건 만든 시각이지
 *    모인 날이 아니다. 억지로 세면 숫자가 조용히 틀린다
 *    (`home.ts` `attendanceThisMonth` 와 같은 판단).
 *  - **대회** — 서버가 대회의 시각을 아예 안 받는다(`create_tournament` 에
 *    `p_starts_at` 이 없다. 20260827000001 주석: "대회는 안 씀"). 그래서
 *    지금 데이터로는 ★ 가 한 번도 안 찍힌다. 그래도 `kind` 를 그대로
 *    실어 두는 이유는, 날짜가 생기는 날 캘린더가 **조용히 빠뜨리지 않게**
 *    하기 위해서다.
 *
 * 못 읽는 값도 버린다 — 서버가 보낸 것이라도 믿지 않는다(`home.ts`).
 */
export function toCalendarItems(list: readonly MyTournament[]): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const t of list) {
    if (!t.startsAt) continue
    const at = new Date(t.startsAt)
    if (Number.isNaN(at.getTime())) continue
    items.push({ id: t.id, name: t.name, kind: t.kind, clubId: t.clubId, at, key: dayKey(at) })
  }
  return items.sort((a, b) => a.at.getTime() - b.at.getTime())
}

/**
 * **빈칸을 어디까지 믿을 수 있는가.**
 *
 * 격자가 그리는 빈칸에는 두 가지가 섞여 있다 — *정말 모임이 없는 날* 과
 * *아직 안 만들어진 날*. 화면은 이 둘을 구별할 근거가 하나뿐이다:
 * **각 동아리의 일정이 어디까지 올라와 있는가.**
 *
 *  - `open`  — 기다릴 동아리가 아예 없다. 내가 만든 것만 있으므로 빈칸은
 *              정말 빈칸이다(내가 안 만든 날이다).
 *  - `until` — 이 날짜까지는 모든 동아리가 일정을 올려 뒀다. 그 뒤의
 *              빈칸은 "없음" 이 아니라 "아직 모름" 이다.
 *  - `none`  — 동아리는 있는데 날짜가 있는 일정이 하나도 안 보인다.
 *              어떤 날에 대해서도 할 말이 없다.
 *
 * ── 왜 **가장 이른** 동아리에 맞추는가 ─────────────────────────────
 *
 * 화요모임은 9월 30일까지 만들어 뒀고 주말클럽은 9월 5일까지만 만들었다고
 * 하자. 9월 20일 칸이 비어 있으면 그건 화요모임에 대해서는 사실이지만
 * 주말클럽에 대해서는 거짓이다. **한 동아리라도 거짓이면 그 칸은 못
 * 믿는다.** 가장 늦은 쪽(max)에 맞추면 늦게 만드는 동아리의 빈칸이
 * 그대로 "없음" 을 주장한다 — 정확히 안 풀리는 경우다.
 *
 * 대신 **점은 지평선 밖에서도 그대로 찍힌다.** 지평선은 *없다는 주장*만
 * 거두는 것이지 *있는 것*을 감추지 않는다.
 *
 * 소속 없는 일정(clubId null)은 계산에서 뺀다. 거기엔 "총무가 아직 안
 * 만들었다" 라는 개념이 없다 — 본인이 그때그때 여는 것이다.
 */
export type Horizon = { kind: 'open' } | { kind: 'none' } | { kind: 'until'; key: string }

export function scheduleHorizon(
  clubIds: readonly string[],
  items: readonly CalendarItem[],
): Horizon {
  if (clubIds.length === 0) return { kind: 'open' }

  let earliest: string | null = null
  for (const clubId of clubIds) {
    const last = lastKeyOfClub(clubId, items)
    // 한 동아리라도 아무 일정이 없으면 어떤 칸도 못 믿는다
    if (last === null) return { kind: 'none' }
    if (earliest === null || last < earliest) earliest = last
  }
  return earliest === null ? { kind: 'none' } : { kind: 'until', key: earliest }
}

/** 한 동아리의 일정이 올라와 있는 마지막 날. 없으면 null */
export function lastKeyOfClub(clubId: string, items: readonly CalendarItem[]): string | null {
  let last: string | null = null
  for (const it of items) {
    if (it.clubId !== clubId) continue
    if (last === null || it.key > last) last = it.key
  }
  return last
}

/** 이 칸이 "없음" 을 주장해도 되는가 — 안 되면 true */
export function isBeyondHorizon(key: string, horizon: Horizon): boolean {
  if (horizon.kind === 'open') return false
  if (horizon.kind === 'none') return true
  return key > horizon.key
}

/**
 * 범례에 적을 줄 — 동아리마다 **어디까지 만들어져 있는지**.
 *
 * 격자는 40px 칸이라 이 말을 담을 자리가 없다. 그래서 지평선의 정확한
 * 내용은 범례가 말한다: 모양이 무엇인지와 "9월 16일까지" 가 같은 줄에
 * 서면, 빈칸을 본 사람이 곧바로 근거를 찾을 수 있다.
 */
export interface ClubHorizon {
  clubId: string
  /** 마지막으로 올라온 날. null 이면 아직 하나도 없다 */
  lastKey: string | null
}

export function clubHorizons(
  clubIds: readonly string[],
  items: readonly CalendarItem[],
): ClubHorizon[] {
  return clubIds.map((clubId) => ({ clubId, lastKey: lastKeyOfClub(clubId, items) }))
}

/** 'YYYY-MM-DD' 를 "9월 16일" 로. 못 읽는 값은 null */
export function keyLabel(key: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return `${Number(m[2])}월 ${Number(m[3])}일`
}

// ── 달 격자 ──────────────────────────────────────────────────────────

/** 격자 한 칸 */
export interface CalendarCell {
  /** 'YYYY-MM-DD' (로컬) */
  key: string
  /** 며칠인가 */
  date: number
  /** 이 달의 날인가. 앞뒤 채움 칸은 false — 격자를 네모로 유지하려고 둔다 */
  inMonth: boolean
  isToday: boolean
  /** 지평선 밖 — "없음" 을 주장하지 않는 칸 */
  beyond: boolean
  /** 이 칸의 일정. 시각 순 */
  items: CalendarItem[]
}

/**
 * 한 달치 격자를 만든다.
 *
 * **1일이 무슨 요일이든, 말일이 며칠이든 깨지지 않는다.** 주 수를 4·5·6 중
 * 고정하지 않고 `ceil((앞 채움 + 말일) / 7)` 로 센다 — 6주로 고정하면 2월에
 * 빈 줄이 하나 생기고, 5주로 고정하면 31일이 일요일에 시작하는 달의 말일이
 * 잘린다.
 *
 * `year`/`month` 는 정규화해서 쓴다. 부르는 쪽이 `month + 1` 같은 산술을
 * 해서 12나 -1 을 넘겨도 `new Date` 가 알아서 해를 넘겨 준다.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  items: readonly CalendarItem[],
  now: Date,
  horizon: Horizon,
): CalendarCell[][] {
  const anchor = new Date(year, month, 1)
  const y = anchor.getFullYear()
  const m = anchor.getMonth()

  // 월요일 시작. getDay() 는 일요일이 0 이라 두 칸 옮긴다
  const lead = (anchor.getDay() + 6) % 7
  const lastDate = new Date(y, m + 1, 0).getDate()
  const weekCount = Math.ceil((lead + lastDate) / 7)

  const byKey = new Map<string, CalendarItem[]>()
  for (const it of items) {
    const bucket = byKey.get(it.key)
    if (bucket) bucket.push(it)
    else byKey.set(it.key, [it])
  }

  const todayKey = dayKey(now)
  const weeks: CalendarCell[][] = []

  for (let w = 0; w < weekCount; w++) {
    const week: CalendarCell[] = []
    for (let i = 0; i < 7; i++) {
      const offset = w * 7 + i - lead
      const d = new Date(y, m, 1 + offset)
      const key = dayKey(d)
      const inMonth = offset >= 0 && offset < lastDate
      week.push({
        key,
        date: d.getDate(),
        inMonth,
        isToday: key === todayKey,
        // 이 달 밖의 채움 칸은 아무 주장도 하지 않는다 — 흐리게 할 것도 없다
        beyond: inMonth && isBeyondHorizon(key, horizon),
        items: inMonth ? (byKey.get(key) ?? []) : [],
      })
    }
    weeks.push(week)
  }

  return weeks
}

/**
 * 한 칸에 그릴 표시.
 *
 * 40px 칸에 들어가는 도형은 셋이 한계다. 그보다 많으면 셋만 그리고 '＋' 를
 * 붙인다 — **개수를 속이는 것보다 "더 있다" 고 말하는 편이 낫다.** 정확한
 * 수는 읽어 주는 글(`cellLabel`)에 늘 들어간다.
 */
export interface CellMarks {
  shown: CalendarItem[]
  /** 셋을 넘겼는가 */
  more: boolean
}

const MARK_LIMIT = 3

export function cellMarks(items: readonly CalendarItem[]): CellMarks {
  return { shown: items.slice(0, MARK_LIMIT), more: items.length > MARK_LIMIT }
}

/**
 * 동아리가 앉는 자리 번호 — 모양·색을 고르는 근거이자 **칸 안에서의 순서**.
 *
 * 자리가 늘 같아야 "화요일마다 두 번째 표시" 같은 패턴이 눈에 박힌다.
 * 소속 없는 일정은 동아리들 뒤에 온다.
 */
export function clubSlot(clubId: string | null, clubIds: readonly string[]): number {
  if (clubId === null) return clubIds.length
  const i = clubIds.indexOf(clubId)
  return i < 0 ? clubIds.length : i
}

export function shapeForSlot(slot: number): MarkShape {
  return MARK_SHAPES[slot % MARK_SHAPES.length]!
}

/**
 * 자리에 붙는 색 번호. **모양이 1차 단서고 색은 2차다.**
 *
 * 앞의 넷은 모양도 색도 전부 다르다 — 동아리를 넷까지 드는 것이 현실의
 * 거의 전부라, 그 구간에서 두 단서가 겹치지 않게 한다.
 *
 * 다섯 번째부터는 모양이 한 바퀴 돈다. 그때 색까지 같이 돌면 1번과 5번이
 * 통째로 같아지므로 색을 한 칸 밀어 둔다(`+ floor(slot/4)`). 이러면
 * (모양, 색) 짝이 **열여섯까지 겹치지 않는다.** 그보다 많이 드는 사람은
 * 겹치고, 그때는 아래 범례의 이름이 유일한 답이다 — 색에도 모양에도
 * 기대지 않는 단서가 하나는 있어야 한다.
 */
export function toneForSlot(slot: number): number {
  const cycle = MARK_SHAPES.length
  return (slot + Math.floor(slot / cycle)) % cycle
}

/**
 * 칸을 읽어 주는 글.
 *
 * 화면에는 숫자 하나와 점뿐이라, 눈으로 못 보는 사람에게는 이 글이 칸의
 * 전부다. **지평선 밖이라는 사실도 여기 들어간다** — 흐린 배경은 소리로
 * 전해지지 않는다.
 */
export function cellLabel(cell: CalendarCell, clubNames: ReadonlyMap<string, string>): string {
  const head = `${Number(cell.key.slice(5, 7))}월 ${cell.date}일`
  if (cell.items.length === 0) {
    return cell.beyond ? `${head} · 아직 일정이 올라오지 않았습니다` : head
  }
  const names = cell.items.map((it) => {
    const club = it.clubId ? clubNames.get(it.clubId) : undefined
    const what = it.kind === 'session' ? '모임' : '대회'
    return club ? `${club} ${what}` : `${it.name} ${what}`
  })
  return `${head} · ${names.join(', ')}`
}

// ── 1주일 안 ─────────────────────────────────────────────────────────

/**
 * 오늘부터 `days` 일 안에 있는 일정.
 *
 * 시:분이 아니라 **날짜 경계로 자른다.** 밤 11시에 "168시간 뒤" 로 자르면
 * 일주일 뒤 아침 일정이 들쭉날쭉 들어왔다 빠졌다 한다(`daysUntilLabel` 이
 * 날짜로 세는 것과 같은 이유).
 *
 * 오늘 이미 시작한 것도 넣는다. 저녁 8시 모임을 밤 9시에 보면서 "오늘
 * 일정이 없다" 고 하면 그게 더 이상하다 — 시작 여부는 홈이 판단한다.
 */
export function withinNextDays(
  items: readonly CalendarItem[],
  now: Date,
  days: number,
): CalendarItem[] {
  const from = startOfDay(now).getTime()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).getTime()
  return items.filter((it) => {
    const t = it.at.getTime()
    return t >= from && t < to
  })
}

/** 그 날 칸의 일정. 캘린더에서 하루를 골랐을 때 아래에 펼칠 것 */
export function itemsOnDay(items: readonly CalendarItem[], key: string): CalendarItem[] {
  return items.filter((it) => it.key === key)
}

// ── 달 넘기기 ────────────────────────────────────────────────────────

/**
 * 볼 수 있는 달의 범위 — `연 * 12 + 월` 로 센다.
 *
 * ── 과거로는 안 넘긴다 ─────────────────────────────────────────────
 *
 * 이 탭의 질문은 "내가 언제 어디서 치나" 이고 그건 **앞으로**의 질문이다.
 * 지난 달을 넘겨 보는 것은 "몇 번 나왔나" 라는 다른 질문이고, 그건 홈의
 * 이번 달 출석 줄과 대회별 「기록」 화면이 이미 맡고 있다. 여기에 또 두면
 * 같은 것을 세는 자리가 셋이 된다.
 *
 * (이번 달 안의 지난 날들은 그대로 보인다. 그건 이동이 아니라 지금 서 있는
 * 달의 일부다.)
 *
 * ── 앞으로는 일정이 있는 데까지 ────────────────────────────────────
 *
 * 최소 다음 달까지는 넘길 수 있다. 오늘이 말일이면 이번 달 격자에 앞이
 * 거의 안 남기 때문이다. 그 뒤로는 **실제 일정이 있는 달까지만** 연다 —
 * 빈 격자를 무한히 넘기게 두면 지평선이 말하려는 것("여기부터는 모른다")이
 * 스크롤에 묻힌다.
 */
export function monthIndex(year: number, month: number): number {
  const d = new Date(year, month, 1)
  return d.getFullYear() * 12 + d.getMonth()
}

export function monthRange(
  now: Date,
  items: readonly CalendarItem[],
): { first: number; last: number } {
  const first = monthIndex(now.getFullYear(), now.getMonth())
  let last = first + 1
  for (const it of items) {
    const i = monthIndex(it.at.getFullYear(), it.at.getMonth())
    if (i > last) last = i
  }
  return { first, last }
}

/** `monthIndex` 를 다시 연·월로 */
export function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: index % 12 }
}
