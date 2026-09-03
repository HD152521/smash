import { describe, expect, test } from 'vitest'
import {
  DUES_AMOUNT_MAX,
  duesTotals,
  formatPaidOn,
  formatWon,
  isMonthKey,
  monthKeyOf,
  monthLabel,
  monthStart,
  parseWon,
  partitionDues,
  shiftMonth,
  suggestedAmount,
  validateDuesAmount,
  type DuesEntry,
} from './dues'

function entry(name: string, amount: number, paidOn: string | null = null): DuesEntry {
  return { id: `d-${name}`, memberId: `m-${name}`, memberName: name, amount, paidOn, note: null }
}

describe('formatWon', () => {
  test('천 단위로 끊어 원을 붙인다', () => {
    expect(formatWon(30000)).toBe('30,000원')
    expect(formatWon(480000)).toBe('480,000원')
  })

  test('0원도 그린다 — 면제를 빈칸으로 두면 안 낸 것과 구별이 안 된다', () => {
    expect(formatWon(0)).toBe('0원')
  })

  /*
   * 합계는 서버가 준 jsonb 에서 온다. 그 값이 어떤 이유로 숫자가 아니어도
   * 화면 전체가 죽는 것보다는 0원이 낫다.
   */
  test('숫자가 아니면 0원으로 떨어뜨린다', () => {
    expect(formatWon(Number.NaN)).toBe('0원')
    expect(formatWon(Number.POSITIVE_INFINITY)).toBe('0원')
  })
})

describe('parseWon — 통장에서 복사해 붙이는 것이 실제 동작이다', () => {
  test('콤마와 원을 걷어낸다', () => {
    expect(parseWon('30,000')).toBe(30000)
    expect(parseWon('30,000원')).toBe(30000)
    expect(parseWon(' 30000 ')).toBe(30000)
  })

  /*
   * 빈 입력을 0 으로 읽으면 총무가 금액을 지우다 만 순간 '면제' 로
   * 저장된다. 0 은 총무가 일부러 치는 값이라 빈 값과 달라야 한다.
   */
  test('빈 값은 0 이 아니라 null 이다', () => {
    expect(parseWon('')).toBeNull()
    expect(parseWon('   ')).toBeNull()
  })

  test('0 은 그대로 0 이다 (휴회 회원을 면제로 두는 총무가 있다)', () => {
    expect(parseWon('0')).toBe(0)
  })

  test('숫자가 아닌 값은 받지 않는다', () => {
    for (const bad of ['삼만원', '30.5', '-30000', '3e4', 'abc']) {
      expect(parseWon(bad)).toBeNull()
    }
  })
})

describe('validateDuesAmount — DB CHECK 제약의 사본', () => {
  test('빈 값을 먼저 잡는다', () => {
    expect(validateDuesAmount(null)).toBe('금액을 적어 주세요')
  })

  test('0 원은 통과한다 (면제)', () => {
    expect(validateDuesAmount(0)).toBeNull()
  })

  test('음수는 막는다', () => {
    expect(validateDuesAmount(-1)).not.toBeNull()
  })

  /*
   * 여기서 안 막으면 서버가 22023 으로 거절한다. 화면이 먼저 잡아야
   * 총무가 무엇이 문제인지 안다.
   */
  test('상한을 넘으면 막는다 — DB 제약과 같은 값이다', () => {
    expect(validateDuesAmount(DUES_AMOUNT_MAX)).toBeNull()
    expect(validateDuesAmount(DUES_AMOUNT_MAX + 1)).not.toBeNull()
  })
})

describe('달 다루기 — 시간대에 안 걸리게 문자열로만 센다', () => {
  test('YYYY-MM 만 달로 본다', () => {
    expect(isMonthKey('2026-09')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('2026-9')).toBe(false)
    expect(isMonthKey('')).toBe(false)
  })

  test('로컬 달력 기준으로 달을 뽑는다', () => {
    expect(monthKeyOf(new Date(2026, 8, 3))).toBe('2026-09')
    expect(monthKeyOf(new Date(2026, 0, 31))).toBe('2026-01')
  })

  test('DB 에 보내는 값은 그 달 1일이다', () => {
    expect(monthStart('2026-09')).toBe('2026-09-01')
  })

  test('사람이 읽는 이름', () => {
    expect(monthLabel('2026-09')).toBe('2026년 9월')
    expect(monthLabel('2026-01')).toBe('2026년 1월')
  })

  test('한 달 앞뒤로 옮긴다', () => {
    expect(shiftMonth('2026-09', -1)).toBe('2026-08')
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
  })

  /*
   * 12월 → 1월에서 해가 안 넘어가면 총무가 1월 장부를 못 연다.
   * 음수 나눗셈이 0 쪽으로 잘리는 언어라 1월 → 12월이 특히 잘 깨진다.
   */
  test('해를 넘어간다 — 양쪽 모두', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-01', -13)).toBe('2024-12')
    expect(shiftMonth('2026-12', 13)).toBe('2028-01')
  })
})

describe('formatPaidOn', () => {
  test('통장과 맞춰볼 수 있게 월/일만 남긴다', () => {
    expect(formatPaidOn('2026-09-01')).toBe('9/1')
    expect(formatPaidOn('2026-08-28')).toBe('8/28')
  })

  test('미납은 날짜가 없다', () => {
    expect(formatPaidOn(null)).toBeNull()
  })

  test('모르는 모양이면 그리지 않는다', () => {
    expect(formatPaidOn('2026/09/01')).toBeNull()
  })
})

describe('duesTotals', () => {
  test('걷을 돈은 전부, 걷힌 돈은 낸 사람 것만 더한다', () => {
    const t = duesTotals([
      entry('김민수', 30000, '2026-09-01'),
      entry('이서연', 30000, '2026-09-01'),
      entry('정하늘', 30000),
    ])
    expect(t.expected).toBe(90000)
    expect(t.collected).toBe(60000)
    expect(t.paidCount).toBe(2)
    expect(t.unpaidCount).toBe(1)
  })

  /*
   * 금액이 사람마다 다른 것이 정상이다(신입 할인·반년 선납).
   * 인원 수에 회비를 곱해 합계를 내면 안 되는 이유다.
   */
  test('사람마다 금액이 달라도 맞는다', () => {
    const t = duesTotals([entry('김민수', 30000, '2026-09-02'), entry('신입', 15000)])
    expect(t.expected).toBe(45000)
    expect(t.collected).toBe(30000)
  })

  test('아무도 없으면 전부 0 이다', () => {
    expect(duesTotals([])).toEqual({ expected: 0, collected: 0, paidCount: 0, unpaidCount: 0 })
  })
})

describe('partitionDues', () => {
  test('안 낸 사람과 낸 사람을 가른다', () => {
    const { unpaid, paid } = partitionDues([
      entry('김민수', 30000, '2026-09-01'),
      entry('정하늘', 30000),
      entry('최유진', 30000),
    ])
    expect(unpaid.map((e) => e.memberName)).toEqual(['정하늘', '최유진'])
    expect(paid.map((e) => e.memberName)).toEqual(['김민수'])
  })

  /*
   * 총무는 통장을 훑으며 이름을 찾는다. 정렬이 '최근 체크순' 이면
   * 한 명 체크할 때마다 목록 전체가 흔들려 방금 본 자리를 잃는다.
   */
  test('양쪽 다 이름순이다 — 체크해도 나머지 순서가 안 흔들린다', () => {
    const { unpaid } = partitionDues([entry('최유진', 30000), entry('김민수', 30000)])
    expect(unpaid.map((e) => e.memberName)).toEqual(['김민수', '최유진'])
  })

  test('원본 배열을 건드리지 않는다', () => {
    const rows = [entry('최유진', 30000), entry('김민수', 30000)]
    partitionDues(rows)
    expect(rows.map((e) => e.memberName)).toEqual(['최유진', '김민수'])
  })
})

describe('suggestedAmount — 계산이 아니라 입력칸의 초기값이다', () => {
  test('지난 달에 가장 많이 쓰인 금액을 고른다', () => {
    const previous = [
      entry('김민수', 30000),
      entry('이서연', 30000),
      entry('신입', 15000),
      entry('정하늘', 30000),
    ]
    expect(suggestedAmount(previous)).toBe(30000)
  })

  /*
   * 평균이면 여기서 26,250원이 나온다. 아무도 그 금액을 내지 않는데
   * 기본값으로 뜨면 총무가 매번 지우고 다시 친다.
   */
  test('평균이 아니다 — 할인 한 명이 기본값을 오염시키지 않는다', () => {
    const previous = [entry('a', 30000), entry('b', 30000), entry('c', 30000), entry('d', 15000)]
    expect(suggestedAmount(previous)).toBe(30000)
    expect(suggestedAmount(previous)).not.toBe(26250)
  })

  test('같은 횟수면 큰 금액 — 할인은 예외이지 기본이 아니다', () => {
    expect(suggestedAmount([entry('a', 20000), entry('b', 30000)])).toBe(30000)
  })

  test('지난 달이 없으면 빈 칸으로 시작한다', () => {
    expect(suggestedAmount([])).toBeNull()
  })
})
