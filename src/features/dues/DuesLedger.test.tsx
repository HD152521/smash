import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DuesLedger } from './DuesLedger'
import type { DuesEntry } from '@/lib/dues'

/**
 * 「빼기」가 약속을 지키는지 본다.
 *
 * ## 이 파일이 생긴 이유
 *
 * 시트의 빼기 버튼은 *"다시 넣으려면 «빠진 사람 채우기»를 누르세요"* 라고
 * **약속**했지만, 핸들러는 행을 통째로 지웠다. 그 결과 세 가지가 조용히
 * 어긋났다:
 *
 *   · 낸 사람을 빼면 **걷힌 돈까지 줄었다** — 확인창은 걷을 돈만 말했다
 *   · 안내한 복구는 그 달 **최빈값**으로 새 행을 만들었다. 총무가 손으로
 *     고친 금액도, 입금일도 안 돌아왔다
 *   · 이미 명단에서 나간 사람은 `club_members` 를 도는 복구가 **영영**
 *     못 만들었다
 *
 * 그래서 답은 셋이다. **낸 사람은 못 뺀다**(돈이 들어온 기록을 지우는 것과
 * 잘못 넣은 사람을 빼는 것은 다른 일이다), **확인창은 사실만 말한다**,
 * **되돌리는 길이 화면에 보인다**.
 *
 * 🔴 이 파일은 운영진 화면만 본다. 회원에게 미납이 안 보이는 것은
 *    `src/pages/ClubDuesPage.test.tsx` 와 `scripts/smoke-dues.ts` 가 지킨다.
 */

const CLUB_ID = '22222222-2222-2222-2222-222222222222'

function entry(over: Partial<DuesEntry> = {}): DuesEntry {
  return {
    id: 'd1',
    memberId: 'cm1',
    memberName: '김철수',
    amount: 30000,
    paidOn: null,
    note: null,
    removedAt: null,
    ...over,
  }
}

const setPaid = vi.fn()
const setAmount = vi.fn()
const setNote = vi.fn()
const removeEntry = vi.fn()
const restoreEntry = vi.fn()
const openMonth = vi.fn()

const idle = { isPending: false, error: null as unknown, mutate: vi.fn(), mutateAsync: vi.fn() }

vi.mock('./queries', () => ({
  useOpenDuesMonth: () => ({ ...idle, mutateAsync: openMonth }),
  useSetDuesPaid: () => ({ ...idle, mutateAsync: setPaid }),
  useSetDuesAmount: () => ({ ...idle, mutateAsync: setAmount }),
  useSetDuesNote: () => ({ ...idle, mutateAsync: setNote }),
  useRemoveDuesEntry: () => ({ ...idle, mutateAsync: removeEntry }),
  useRestoreDuesEntry: () => ({ ...idle, mutateAsync: restoreEntry }),
}))

function renderLedger(entries: DuesEntry[]) {
  return render(
    <DuesLedger
      clubId={CLUB_ID}
      monthKey="2026-09"
      entries={entries}
      previousEntries={undefined}
    />,
  )
}

/** «⋯» 를 눌러 그 사람의 시트를 연다 */
async function openSheet(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `${name} 회비 고치기` }))
}

beforeEach(() => {
  for (const fn of [setPaid, setAmount, setNote, removeEntry, restoreEntry, openMonth]) {
    fn.mockReset()
    fn.mockResolvedValue(undefined)
  }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('🟠 낸 사람은 못 뺀다 — 납부를 되돌리는 것이 먼저다', () => {
  /*
   * 잘못 넣은 사람을 빼는 것과 들어온 돈의 기록을 지우는 것은 다른 일이다.
   * 후자를 한 번의 확인창으로 열어 두면, 30,000원이 걷힌 돈에서 조용히
   * 사라지고 그 사실을 아무도 못 본다.
   */
  test('납부한 사람의 빼기 버튼은 눌리지 않는다', async () => {
    const user = userEvent.setup()
    renderLedger([entry({ paidOn: '2026-09-02' })])
    await openSheet(user, '김철수')

    const button = screen.getByRole('button', { name: /빼기/ })
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.click(button)
    expect(removeEntry).not.toHaveBeenCalled()
  })

  test('무엇을 먼저 해야 하는지 말해 준다 — 납부 되돌리기', async () => {
    const user = userEvent.setup()
    renderLedger([entry({ paidOn: '2026-09-02' })])
    await openSheet(user, '김철수')
    expect(screen.getByText(/납부를 먼저 되돌/)).toBeTruthy()
  })

  test('안 낸 사람은 그대로 뺄 수 있다 — 과잉 차단이 아니다', async () => {
    const user = userEvent.setup()
    renderLedger([entry()])
    await openSheet(user, '김철수')

    await user.click(screen.getByRole('button', { name: /빼기/ }))
    expect(removeEntry).toHaveBeenCalledWith('d1')
  })
})

describe('🟠 확인창은 사실만 말한다', () => {
  /*
   * 옛 확인창은 "걷을 돈 합계에서도 빠집니다" 만 말하고, 다시 넣는 길을
   * «빠진 사람 채우기» 라고 **틀리게** 안내했다. 그 버튼은 club_members 를
   * 돌며 새 행을 만들 뿐이라, 금액도 입금일도 안 돌아온다.
   */
  test('되돌리는 길을 «뺀 사람» 으로 안내한다', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLedger([entry()])
    await openSheet(user, '김철수')
    await user.click(screen.getByRole('button', { name: /빼기/ }))

    const text = String(confirmSpy.mock.calls[0]?.[0] ?? '')
    expect(text).toContain('뺀 사람')
    expect(text).not.toContain('빠진 사람 채우기')
  })

  test('취소하면 아무 일도 안 일어난다', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderLedger([entry()])
    await openSheet(user, '김철수')
    await user.click(screen.getByRole('button', { name: /빼기/ }))
    expect(removeEntry).not.toHaveBeenCalled()
  })
})

describe('🟠 되돌리기가 진짜 되돌리기다', () => {
  /*
   * 뺀 사람이 화면에서 사라지면 되돌릴 길이 화면 어디에도 없다. 감사로그에
   * 남아 있다는 말은 총무에게 아무 도움이 안 된다 — 총무는 SQL 을 안 친다.
   */
  test('뺀 사람이 목록 아래에 남아 있다', () => {
    renderLedger([entry(), entry({ id: 'd2', memberName: '휴회자', removedAt: '2026-09-03T00:00:00Z' })])
    const section = screen.getByRole('heading', { name: /뺀 사람/ }).parentElement!
    expect(within(section).getByText('휴회자')).toBeTruthy()
  })

  test('뺀 사람은 「안 낸 사람」 에 안 섞인다 — 독촉 대상이 아니다', () => {
    renderLedger([entry({ id: 'd2', memberName: '휴회자', removedAt: '2026-09-03T00:00:00Z' })])
    const unpaid = screen.getByRole('heading', { name: /안 낸 사람/ })
    expect(unpaid.textContent).toContain('0')
  })

  /*
   * 되돌리기는 그 행을 그대로 살린다 — 금액도 메모도 그 사람의 것이
   * 그대로다. 새로 만드는 것이 아니므로 이미 명단에서 나간 사람도 돌아온다.
   */
  test('다시 넣기는 그 행을 살린다 — 새로 만들지 않는다', async () => {
    const user = userEvent.setup()
    renderLedger([entry({ id: 'd2', memberName: '휴회자', removedAt: '2026-09-03T00:00:00Z' })])
    await user.click(screen.getByRole('button', { name: /휴회자.*다시 넣기/ }))
    expect(restoreEntry).toHaveBeenCalledWith('d2')
    expect(openMonth).not.toHaveBeenCalled()
  })

  test('뺀 사람이 없으면 그 칸을 아예 안 그린다', () => {
    renderLedger([entry()])
    expect(screen.queryByRole('heading', { name: /뺀 사람/ })).toBeNull()
  })
})

describe('실패한 쓰기는 화면에서 안 사라진다', () => {
  /*
   * 시트를 닫으면 그 안의 오류도 같이 사라졌다. 총무는 "저장했다" 고
   * 믿고 다음 사람으로 넘어간다 — 장부와 통장이 어긋나기 시작하는 자리다.
   */
  test('시트에서 실패한 저장이 시트를 닫아도 남는다', async () => {
    const user = userEvent.setup()
    setAmount.mockRejectedValue(new Error('네트워크 연결을 확인해 주세요'))
    renderLedger([entry()])
    await openSheet(user, '김철수')

    const input = screen.getByLabelText('금액')
    await user.clear(input)
    await user.type(input, '25000')
    // 시트에는 저장이 둘이다(금액·메모). 첫 번째가 금액이다.
    await user.click(screen.getAllByRole('button', { name: '저장' })[0]!)
    await user.click(screen.getByRole('button', { name: '닫기' }))

    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((el) => el.textContent?.includes('김철수'))).toBe(true)
    expect(alerts.some((el) => el.textContent?.includes('네트워크'))).toBe(true)
  })

  test('총무가 확인하면 지운다', async () => {
    const user = userEvent.setup()
    setPaid.mockRejectedValue(new Error('네트워크 연결을 확인해 주세요'))
    renderLedger([entry()])

    await user.click(screen.getByText('김철수'))
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '알림 지우기' }))
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})
