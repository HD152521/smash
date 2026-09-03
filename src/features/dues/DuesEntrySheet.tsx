import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toUserMessage } from '@/lib/errors'
import { formatPaidOn, parseWon, validateDuesAmount, type DuesEntry } from '@/lib/dues'
import {
  useRemoveDuesEntry,
  useSetDuesAmount,
  useSetDuesNote,
  useSetDuesPaid,
} from './queries'

/**
 * 한 사람의 회비를 **고치는** 자리.
 *
 * 목록에서 한 번 눌러 되는 일(납부 체크)은 여기에 없다. 여기 있는 것은
 * 자주 하지 않지만 틀리면 아픈 일들이다 — 금액 고치기, 되돌리기, 빼기.
 * `ClubSettingsPage` 가 "자주 하는 일과 파괴적인 일을 한 화면에 섞으면
 * 급할 때 지우기 버튼을 스친다" 고 한 것과 같은 이유로 갈라 뒀다.
 *
 * ## 되돌리기가 여기 있는 이유
 *
 * 돈 기록은 **반드시 틀린다.** 잘못 체크하고, 이체가 늦게 들어온다.
 * 되돌릴 수 없으면 총무가 앱을 안 믿고 엑셀로 돌아간다. 다만 되돌리기를
 * 목록의 한 번 누르기로 두면, 통장을 훑으며 빠르게 내려가다가 이미 체크한
 * 사람을 스쳐 되돌려 버린다 — 그래서 목록이 아니라 이 시트에 둔다.
 */
export function DuesEntrySheet({
  clubId,
  entry,
  onClose,
}: {
  clubId: string
  entry: DuesEntry
  onClose: () => void
}) {
  const paid = useSetDuesPaid(clubId)
  const amount = useSetDuesAmount(clubId)
  const note = useSetDuesNote(clubId)
  const remove = useRemoveDuesEntry(clubId)

  /*
   * 부모가 `key={entry.id}` 로 사람마다 새로 마운트한다. 그래서 여기서
   * entry 가 바뀌는 일이 없고, 초기값만 두면 된다 — effect 로 값을 되돌리면
   * 저장 직후 서버가 준 새 금액이 다시 옛 값으로 덮인다.
   */
  const [amountText, setAmountText] = useState(String(entry.amount))
  const [noteText, setNoteText] = useState(entry.note ?? '')
  const [amountError, setAmountError] = useState<string | null>(null)

  const paidOn = formatPaidOn(entry.paidOn)
  const busy = paid.isPending || amount.isPending || note.isPending || remove.isPending
  const error = paid.error ?? amount.error ?? note.error ?? remove.error

  async function handleSaveAmount() {
    const next = parseWon(amountText)
    const message = validateDuesAmount(next)
    setAmountError(message)
    if (message !== null || next === null) return
    try {
      await amount.mutateAsync({ duesId: entry.id, amount: next })
    } catch {
      /* amount.error 로 화면에 뿌린다 */
    }
  }

  async function handleSaveNote() {
    try {
      await note.mutateAsync({ duesId: entry.id, note: noteText })
    } catch {
      /* note.error 로 화면에 뿌린다 */
    }
  }

  async function handleTogglePaid() {
    try {
      await paid.mutateAsync({ duesId: entry.id, paid: !entry.paidOn })
      onClose()
    } catch {
      /* paid.error 로 화면에 뿌린다 */
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        `${entry.memberName}님을 이 달 회비에서 뺍니다.\n걷을 돈 합계에서도 빠집니다. 계속할까요?`,
      )
    )
      return
    try {
      await remove.mutateAsync(entry.id)
      onClose()
    } catch {
      /* remove.error 로 화면에 뿌린다 */
    }
  }

  return (
    <Modal open onClose={onClose} title={entry.memberName}>
      <div className="space-y-6">
        {/* ── 금액 ── */}
        <div>
          <label htmlFor="dues-amount" className="block text-sm font-semibold text-ink-1">
            금액
          </label>
          {/*
            앱이 회비를 계산하지 않는다. 신입 할인·반년 선납·휴회는 동아리마다
            다르고, 앱이 정하면 총무가 고칠 방법이 없어진다.
          */}
          <p className="mt-1 text-xs text-ink-3">이 사람만 다르게 받는다면 여기서 고칩니다</p>
          <div className="mt-2 flex gap-2">
            <input
              id="dues-amount"
              inputMode="numeric"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="tabular min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-2
                         px-3 py-2.5 text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2
                         focus-visible:outline-brand-600"
            />
            <Button
              variant="secondary"
              onClick={() => void handleSaveAmount()}
              loading={amount.isPending}
              disabled={busy}
            >
              저장
            </Button>
          </div>
          {amountError && (
            <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
              {amountError}
            </p>
          )}
        </div>

        {/* ── 메모 ── */}
        <div>
          <label htmlFor="dues-note" className="block text-sm font-semibold text-ink-1">
            메모
          </label>
          {/*
            입금자명이 회원 이름과 다를 수 있다(가족 계좌·별명). 통장에서
            못 찾는 순간이 실제로 오고, 그때 다음 달의 총무가 읽을 수 있게
            남기는 자리다. 운영진만 본다 — 본인에게도 안 보인다.
          */}
          <p className="mt-1 text-xs text-ink-3">입금자명이 다르면 적어 두세요 (운영진만 봅니다)</p>
          <div className="mt-2 flex gap-2">
            <input
              id="dues-note"
              value={noteText}
              maxLength={100}
              placeholder="예: 아내 계좌 김영희"
              onChange={(e) => setNoteText(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-2
                         px-3 py-2.5 text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2
                         focus-visible:outline-brand-600"
            />
            <Button
              variant="secondary"
              onClick={() => void handleSaveNote()}
              loading={note.isPending}
              disabled={busy}
            >
              저장
            </Button>
          </div>
        </div>

        {/* ── 납부 되돌리기 ── */}
        <div className="border-t border-border-subtle pt-5">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void handleTogglePaid()}
            loading={paid.isPending}
            disabled={busy}
          >
            {entry.paidOn ? `납부 취소 (${paidOn ?? '입금'} 기록을 지웁니다)` : '납부로 표시'}
          </Button>
        </div>

        {/*
          빼기는 파괴적이라 복사·저장과 같은 무게로 두지 않는다. 선을 긋고
          맨 아래로 내려, 금액을 고치러 온 손가락이 스치지 않게 한다
          (`ClubGuestLinkPage` 의 재발급 버튼과 같은 규율).
        */}
        <div className="border-t border-border-subtle pt-5">
          <Button
            variant="danger"
            className="w-full"
            onClick={() => void handleRemove()}
            loading={remove.isPending}
            disabled={busy}
          >
            이 달 회비에서 빼기
          </Button>
          <p className="mt-2 text-xs break-keep text-ink-3">
            휴회처럼 이 달에 받을 것이 없을 때만. 다시 넣으려면 «빠진 사람 채우기»를 누르세요.
          </p>
        </div>

        {error != null && (
          <p role="alert" className="text-sm font-medium text-team-b-fg">
            {toUserMessage(error, '회비를 고치지 못했습니다')}
          </p>
        )}
      </div>
    </Modal>
  )
}
