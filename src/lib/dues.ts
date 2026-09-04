/**
 * 월 회비 장부의 판단들.
 *
 * 화면이 아니라 여기에 두는 이유는 `club.ts` 와 같다 — 판단을 페이지마다
 * 흩뿌리면 새 화면을 만들 때마다 하나씩 어긋난다. 특히 **금액 한계는 DB
 * CHECK 제약(`amount between 0 and 10000000`)의 사본**이라, 한쪽만 고치면
 * 화면은 통과시키고 서버가 거절하는 오류가 난다.
 *
 * ⚠ 여기에 "얼마를 내야 하는지" 를 계산하는 함수를 만들지 마라.
 *   동아리마다 규칙이 다르다(신입 할인 · 반년 선납 · 휴회). 금액은
 *   총무가 적는 값이지 앱이 정하는 값이 아니다 — 마이그레이션
 *   20260903000002 의 설계 판단 2번이 같은 말을 한다.
 */

/** DB CHECK 제약의 사본 — `amount between 0 and 10000000` */
export const DUES_AMOUNT_MAX = 10_000_000

// ── 돈 ──────────────────────────────────────────────────────────────

/**
 * 금액을 사람이 읽는 문자열로.
 *
 * '48만원' 같은 만원 단위 축약은 일부러 안 쓴다. 걷힌 돈이 39만 5천원처럼
 * 딱 안 떨어지는 순간 '39.5만원' 이나 '39만원'(반올림) 중 하나를 골라야
 * 하는데, 둘 다 장부에서는 틀린 값이다. 원 단위를 그대로 보여주고 자리를
 * `.tabular` 로 맞춘다.
 */
export function formatWon(amount: number): string {
  if (!Number.isFinite(amount)) return '0원'
  return `${Math.trunc(amount).toLocaleString('ko-KR')}원`
}

/**
 * 총무가 친 금액 문자열을 숫자로.
 *
 * 콤마와 '원' 을 걷어낸다 — 통장 화면에서 '30,000' 을 그대로 복사해 붙이는
 * 것이 실제 동작이다. 빈 값은 0 이 아니라 null 이다. 0 은 '면제' 라는 뜻이
 * 있어서(휴회 회원을 0원으로 두는 총무가 있다) 빈 입력과 같게 두면 안 된다.
 */
export function parseWon(raw: string): number | null {
  const cleaned = raw.replace(/[,\s원]/g, '')
  if (cleaned === '') return null
  if (!/^\d+$/.test(cleaned)) return null
  return Number(cleaned)
}

/** 화면에서 먼저 거른다. 진짜 벽은 RPC 안의 같은 검사다. */
export function validateDuesAmount(amount: number | null): string | null {
  if (amount === null) return '금액을 적어 주세요'
  if (!Number.isInteger(amount) || amount < 0) return '금액이 올바르지 않습니다'
  if (amount > DUES_AMOUNT_MAX) return `금액은 ${formatWon(DUES_AMOUNT_MAX)}까지 적을 수 있습니다`
  return null
}

/**
 * 총무가 친 **문자열**을 검사한다. 화면은 이쪽을 쓴다.
 *
 * `parseWon` 은 빈 칸에도 null, '-30000'·'30.5'·'삼만원' 에도 null 을 준다.
 * 그 null 을 그대로 `validateDuesAmount` 에 넘기면 무엇을 쳤든 "금액을 적어
 * 주세요" 가 나온다 — **적었는데** 그 말을 들으면 총무는 무엇이 틀렸는지
 * 모른 채 같은 값을 다시 친다. 빈 칸과 잘못 적은 값은 다른 오류다.
 */
export function validateDuesInput(raw: string): string | null {
  if (raw.replace(/[,\s원]/g, '') === '') return '금액을 적어 주세요'
  const amount = parseWon(raw)
  // 음수·소수·문자를 한 문장으로 묶는다. 총무가 할 일은 어느 쪽이든 같다.
  if (amount === null) return '숫자만 적어 주세요 (예: 30,000)'
  return validateDuesAmount(amount)
}

// ── 달 ──────────────────────────────────────────────────────────────
//
// 달은 'YYYY-MM' 문자열로 다룬다. Date 로 더하고 빼면 시간대에 걸린다 —
// `new Date('2026-09-01')` 은 UTC 자정이라, 로컬이 UTC 뒤에 있으면
// `getMonth()` 가 8월을 준다. 그래서 아래는 전부 문자열·정수 연산이다.

/** 'YYYY-MM' 인가 */
export function isMonthKey(key: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(key)) return false
  const month = Number(key.slice(5))
  return month >= 1 && month <= 12
}

/** Date → 'YYYY-MM' (로컬 기준. 총무가 보는 달력이 로컬이다) */
export function monthKeyOf(date: Date): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** 'YYYY-MM' → 'YYYY-MM-01'. DB 의 period_month 가 달의 1일이다 */
export function monthStart(key: string): string {
  return `${key}-01`
}

/** 'YYYY-MM' → '2026년 9월' */
export function monthLabel(key: string): string {
  if (!isMonthKey(key)) return key
  return `${key.slice(0, 4)}년 ${Number(key.slice(5))}월`
}

/** 달 이동. delta 는 달 수 (-1 = 지난 달) */
export function shiftMonth(key: string, delta: number): string {
  if (!isMonthKey(key)) return key
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5))
  // 0-based 로 옮겨 나눗셈이 음수에서도 맞게 한다
  const total = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

/**
 * 입금일을 짧게 — '9/1'.
 *
 * 년도를 뺀다. 장부는 언제나 한 달을 보고 있고, 그 달의 며칠인지만
 * 알면 통장과 맞춰볼 수 있다. 다른 달 날짜(선납·연체)면 '8/28' 처럼
 * 달까지 나오므로 그것만으로 구별된다.
 */
export function formatPaidOn(paidOn: string | null): string | null {
  if (!paidOn) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paidOn)
  if (!m) return null
  return `${Number(m[2])}/${Number(m[3])}`
}

// ── 명부 ────────────────────────────────────────────────────────────

/** 화면이 쓰는 한 줄. `features/dues/api.ts` 가 이 모양으로 좁혀 준다 */
export interface DuesEntry {
  id: string
  memberId: string | null
  memberName: string
  amount: number
  /** null 이면 미납 */
  paidOn: string | null
  note: string | null
  /**
   * 이 달 회비에서 뺀 시각. null 이면 살아 있는 줄.
   *
   * 「빼기」는 지우기가 아니다(20260904000002). 행이 남아 있어야 잘못 뺐을 때
   * 금액·메모·입금일을 **그대로** 되돌릴 수 있고, 이미 명단에서 나간 사람도
   * 되살릴 수 있다 — 새로 만드는 복구로는 둘 다 못 한다.
   */
  removedAt: string | null
}

export interface DuesTotals {
  /** 걷을 돈 */
  expected: number
  /** 걷힌 돈 */
  collected: number
  paidCount: number
  unpaidCount: number
}

/**
 * 뺀 사람은 어느 칸에도 안 든다 — 걷을 돈에도, 걷힌 돈에도, 인원 수에도.
 *
 * 서버(`club_dues_summary`)가 `removed_at is null` 만 더하는 것과 **같은
 * 규칙**이어야 한다. 두 곳이 다르면 위의 합계와 아래 목록이 어긋나고,
 * 그때 총무는 어느 쪽이 맞는지 알 방법이 없다.
 */
export function duesTotals(entries: DuesEntry[]): DuesTotals {
  let expected = 0
  let collected = 0
  let paidCount = 0
  let live = 0
  for (const e of entries) {
    if (e.removedAt) continue
    live += 1
    expected += e.amount
    if (e.paidOn) {
      collected += e.amount
      paidCount += 1
    }
  }
  return { expected, collected, paidCount, unpaidCount: live - paidCount }
}

/**
 * 안 낸 사람 · 낸 사람 · 뺀 사람으로 가른다.
 *
 * 셋 다 **이름순**이다. 총무의 실제 동작은 통장을 위에서 아래로 훑으며
 * 이름을 찾는 것이라, 순서가 매번 바뀌면(예: 최근 체크순) 방금 본 자리를
 * 다시 못 찾는다. 체크해도 그 사람만 아래 목록으로 내려가고 나머지 순서는
 * 그대로 남는 것이 이 정렬의 목적이다.
 *
 * 뺀 사람이 세 번째 칸인 이유: 「안 낸 사람」에 섞이면 총무가 독촉할 대상으로
 * 읽고, 화면에서 아예 사라지면 잘못 뺐을 때 되돌릴 길이 어디에도 없다.
 */
export function partitionDues(entries: DuesEntry[]): {
  unpaid: DuesEntry[]
  paid: DuesEntry[]
  removed: DuesEntry[]
} {
  const byName = (a: DuesEntry, b: DuesEntry) => a.memberName.localeCompare(b.memberName, 'ko')
  const live = entries.filter((e) => !e.removedAt)
  return {
    unpaid: live.filter((e) => !e.paidOn).sort(byName),
    paid: live.filter((e) => e.paidOn).sort(byName),
    removed: entries.filter((e) => e.removedAt).sort(byName),
  }
}

/**
 * 다음 달을 열 때 미리 채워 둘 금액.
 *
 * 지난 달에 **가장 많이 쓰인 금액**을 고른다. 평균이 아니다 — 신입 할인
 * 한 명 때문에 28,750원 같은 아무도 안 쓰는 값이 기본값으로 뜨면 총무가
 * 매번 지우고 다시 친다. 최빈값은 '우리 동아리 회비' 그 자체다.
 *
 * ⚠ 이건 계산이 아니라 **입력칸의 초기값**이다. 총무가 지우고 다른 값을
 *   칠 수 있어야 하고, 지난 달이 없으면 null 을 줘서 빈 칸으로 시작한다.
 */
export function suggestedAmount(previous: DuesEntry[]): number | null {
  // 뺀 사람의 금액은 '우리 동아리 회비' 가 아니다. 휴회로 0원을 둔 사람이
  // 둘만 있어도 다음 달 기본값이 0원으로 뜬다.
  const live = previous.filter((e) => !e.removedAt)
  if (live.length === 0) return null
  const counts = new Map<number, number>()
  for (const e of live) counts.set(e.amount, (counts.get(e.amount) ?? 0) + 1)
  let best: number | null = null
  let bestCount = 0
  for (const [amount, count] of counts) {
    // 같은 횟수면 큰 금액을 고른다 — 할인은 예외이지 기본이 아니다
    if (count > bestCount || (count === bestCount && best !== null && amount > best)) {
      best = amount
      bestCount = count
    }
  }
  return best
}
