import { useState } from 'react'
import { Check, MoreHorizontal, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/brand/EmptyState'
import { toUserMessage } from '@/lib/errors'
import {
  formatPaidOn,
  formatWon,
  monthLabel,
  parseWon,
  partitionDues,
  suggestedAmount,
  validateDuesAmount,
  type DuesEntry,
} from '@/lib/dues'
import { DuesEntrySheet } from './DuesEntrySheet'
import { useOpenDuesMonth, useSetDuesPaid } from './queries'

/**
 * 총무가 통장을 보며 체크하는 명부.
 *
 * ## 왜 두 칸이 아니라 '안 낸 사람' 이 위인가
 *
 * 총무의 실제 동작은 통장을 위에서 아래로 훑으며 **아직 안 낸 쪽을 눌러
 * 지워 나가는** 것이다. 끝은 미납 0명이다. 그래서 안 낸 사람이 위에 있고,
 * 한 번 누르면 아래로 내려간다. 스케치의 좌우 두 칸은 폰 폭 320px 에서
 * 이름이 두 줄로 접히고, 무엇보다 **오늘 할 일이 어느 쪽인지**가 안 보인다.
 *
 * ## 한 번 누르기 = 납부, 되돌리기 = 시트
 *
 * 빠른 길(체크)은 한 번, 위험한 길(되돌리기·금액·빼기)은 시트를 거친다.
 * 둘 다 한 번 누르기로 두면 훑어 내려가다 이미 체크한 사람을 스쳐 되돌린다.
 */
export function DuesLedger({
  clubId,
  monthKey,
  entries,
  previousEntries,
}: {
  clubId: string
  monthKey: string
  entries: DuesEntry[]
  /** 지난 달 장부 — 이 달을 열 때 채울 기본 금액을 여기서 고른다 */
  previousEntries: DuesEntry[] | undefined
}) {
  const [editing, setEditing] = useState<DuesEntry | null>(null)
  const paid = useSetDuesPaid(clubId)

  if (entries.length === 0) {
    return <OpenMonthForm clubId={clubId} monthKey={monthKey} previousEntries={previousEntries} />
  }

  const { unpaid, paid: done } = partitionDues(entries)

  async function markPaid(entry: DuesEntry) {
    try {
      await paid.mutateAsync({ duesId: entry.id, paid: true })
    } catch {
      /* paid.error 로 화면에 뿌린다 */
    }
  }

  return (
    <>
      {paid.error != null && (
        <p role="alert" className="mb-4 text-sm font-medium text-team-b-fg">
          {toUserMessage(paid.error, '납부를 표시하지 못했습니다')}
        </p>
      )}

      <Section title="안 낸 사람" count={unpaid.length}>
        {unpaid.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm font-semibold text-ok-fg">
            이 달은 다 걷혔습니다
          </p>
        ) : (
          unpaid.map((e) => (
            <Row key={e.id} entry={e} onDetail={() => setEditing(e)}>
              {/*
                누르는 자리가 곧 이름 전체다. 체육관에서 한 손으로 훑어
                내려가는 동작이라 표적이 작으면 옆 사람을 누른다.
              */}
              <button
                type="button"
                onClick={() => void markPaid(e)}
                disabled={paid.isPending}
                className="flex min-h-14 flex-1 items-center gap-3 px-5 text-left
                           disabled:opacity-60
                           focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-subtle">
                  <Check className="size-3.5 text-ink-3" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-1">{e.memberName}</span>
                  {e.note && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                      <StickyNote className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{e.note}</span>
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 text-sm text-ink-2">{formatWon(e.amount)}</span>
              </button>
            </Row>
          ))
        )}
      </Section>

      <Section title="낸 사람" count={done.length} className="mt-8">
        {done.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-3">아직 아무도 안 냈습니다</p>
        ) : (
          done.map((e) => (
            <Row key={e.id} entry={e} onDetail={() => setEditing(e)}>
              <div className="flex min-h-14 flex-1 items-center gap-3 px-5">
                <Check className="size-5 shrink-0 text-ok-fg" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-1">{e.memberName}</span>
                  {e.note && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                      <StickyNote className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{e.note}</span>
                    </span>
                  )}
                </span>
                <span className="tabular shrink-0 text-sm text-ink-3">
                  {formatPaidOn(e.paidOn)}
                </span>
                <span className="tabular shrink-0 text-sm text-ink-2">{formatWon(e.amount)}</span>
              </div>
            </Row>
          ))
        )}
      </Section>

      {/*
        중간에 들어온 회원은 이 달 장부에 행이 없다. 같은 RPC 를 다시 부르면
        빠진 사람만 채워진다 — 이미 있는 행의 금액은 안 덮어쓴다.
      */}
      <div className="mt-8 border-t border-border-subtle pt-6">
        <FillMissing clubId={clubId} monthKey={monthKey} entries={entries} />
      </div>

      {/* key: 사람이 바뀌면 새로 마운트해서 앞사람의 금액이 안 남게 한다 */}
      {editing && (
        <DuesEntrySheet
          key={editing.id}
          clubId={clubId}
          entry={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function Section({
  title,
  count,
  className,
  children,
}: {
  title: string
  count: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={className}>
      <h2 className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">
        {title} <span className="tabular ml-1 text-ink-2">{count}</span>
      </h2>
      <div className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
        {children}
      </div>
    </section>
  )
}

/**
 * 한 줄 = 넓은 표적 하나 + 좁은 «⋯» 하나.
 *
 * 버튼 안에 버튼을 넣을 수 없어서(HTML 이 금지한다) 형제로 둔다.
 */
function Row({
  entry,
  onDetail,
  children,
}: {
  entry: DuesEntry
  onDetail: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex items-stretch">
      {children}
      <button
        type="button"
        onClick={onDetail}
        aria-label={`${entry.memberName} 회비 고치기`}
        className="flex w-12 shrink-0 items-center justify-center text-ink-3 hover:text-ink-1
                   focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
    </div>
  )
}

/**
 * 아직 장부가 없는 달 — 여기서 연다.
 *
 * 기본 금액은 지난 달에 **가장 많이 쓰인 값**을 채워 둔다. 계산이 아니라
 * 입력칸의 초기값이다 — 총무가 지우고 다른 값을 칠 수 있어야 한다.
 */
function OpenMonthForm({
  clubId,
  monthKey,
  previousEntries,
}: {
  clubId: string
  monthKey: string
  previousEntries: DuesEntry[] | undefined
}) {
  const open = useOpenDuesMonth(clubId, monthKey)
  const suggested = suggestedAmount(previousEntries ?? [])
  const [typed, setTyped] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * 지난 달 장부는 늦게 도착한다. useState 의 초기값으로만 두면 도착 전에
   * 굳어 버려서 칸이 영영 비어 있다. 그렇다고 도착할 때 덮어쓰면 총무가
   * 이미 친 숫자를 지운다 — 그래서 '아직 안 친 동안만' 제안값을 보여준다.
   */
  const text = typed ?? (suggested === null ? '' : String(suggested))
  const setText = setTyped

  async function handleOpen() {
    const amount = parseWon(text)
    const message = validateDuesAmount(amount)
    setError(message)
    if (message !== null || amount === null) return
    try {
      await open.mutateAsync(amount)
    } catch {
      /* open.error 로 화면에 뿌린다 */
    }
  }

  return (
    <EmptyState
      icon="shuttlecock"
      title={`${monthLabel(monthKey)} 장부가 아직 없습니다`}
      description="회원 전원에게 같은 금액으로 만든 뒤, 다르게 받는 사람만 고치면 됩니다."
      action={
        <div className="w-full max-w-xs">
          <label htmlFor="open-amount" className="sr-only">
            한 사람당 회비
          </label>
          <div className="flex gap-2">
            <input
              id="open-amount"
              inputMode="numeric"
              value={text}
              placeholder="30,000"
              onChange={(e) => setText(e.target.value)}
              className="tabular min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-2
                         px-3 py-2.5 text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2
                         focus-visible:outline-brand-600"
            />
            <Button onClick={() => void handleOpen()} loading={open.isPending}>
              만들기
            </Button>
          </div>
          {(error !== null || open.error != null) && (
            <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
              {error ?? toUserMessage(open.error, '장부를 만들지 못했습니다')}
            </p>
          )}
        </div>
      }
    />
  )
}

/** 중간에 들어온 회원 채우기. 이미 있는 행은 안 건드린다 */
function FillMissing({
  clubId,
  monthKey,
  entries,
}: {
  clubId: string
  monthKey: string
  entries: DuesEntry[]
}) {
  const open = useOpenDuesMonth(clubId, monthKey)
  const [added, setAdded] = useState<number | null>(null)
  // 이 달에 이미 쓰이고 있는 금액을 그대로 쓴다 — 새 값을 묻지 않는다
  const fallback = suggestedAmount(entries) ?? 0

  async function handleFill() {
    try {
      const created = await open.mutateAsync(fallback)
      setAdded(created)
    } catch {
      /* open.error 로 화면에 뿌린다 */
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => void handleFill()}
        loading={open.isPending}
        className="w-full"
      >
        빠진 사람 채우기
      </Button>
      <p className="mt-2 text-xs break-keep text-ink-3">
        이 달 중간에 들어온 회원을 {formatWon(fallback)}으로 넣습니다. 이미 있는 사람의 금액은 그대로
        둡니다.
      </p>
      {added !== null && (
        <p role="status" className="mt-2 text-sm font-medium text-ink-2">
          {added === 0 ? '빠진 사람이 없습니다' : `${added}명을 넣었습니다`}
        </p>
      )}
      {open.error != null && (
        <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
          {toUserMessage(open.error, '채우지 못했습니다')}
        </p>
      )}
    </>
  )
}
