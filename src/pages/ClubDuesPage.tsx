import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ClubScreen } from '@/features/club/ClubScreen'
import { DuesLedger } from '@/features/dues/DuesLedger'
import { MyDuesLine } from '@/features/dues/MyDuesLine'
import { useDuesEntries, useDuesSummary, usePreviousMonthDues } from '@/features/dues/queries'
import { isClubStaff } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'
import { formatWon, monthKeyOf, monthLabel, shiftMonth } from '@/lib/dues'

/**
 * 월 회비 — **이 달 회비가 어떻게 되고 있나.** 그것만 한다.
 *
 * 앱은 돈을 옮기지 않는다. 회비는 지금처럼 계좌이체로 오가고, 여기서 하는
 * 일은 총무가 **통장을 보면서 누가 냈는지 체크**하는 것 하나다. 총무의
 * 진짜 고통은 이체가 아니라 "누가 안 냈지" 를 카톡 스크롤과 엑셀에서
 * 찾는 것이기 때문이다.
 *
 * ⚠ 여기에 지출·수지 정산을 얹지 마라. 그건 "우리 동아리 돈이 얼마 남았나"
 *   라는 **다른 질문**이고, 그 질문이 들어오는 순간 이 화면은 회비 명부가
 *   아니라 가계부가 된다. 게스트비도 마찬가지로 여기가 아니다 — 그건 모임
 *   단위이고 게스트는 계정이 없다 (마이그레이션 20260903000002 머리 주석).
 *
 * ## 🔴 한 화면이지만 보는 것이 다르다
 *
 * 운영진 : 전원의 납부 상태 (`club_dues` 테이블을 직접 읽는다)
 * 회원   : 자기 것 한 줄 + 전체 합계 (`club_dues_summary` RPC 하나)
 *
 * 역할에 따라 **할 수 있는 일**이 다른 것이지 화면의 책임이 둘인 게 아니다
 * (`ClubMembersPage` 가 `canManage` 로 줄 안의 버튼을 가르는 것과 같다).
 * 진짜 벽은 여기가 아니라 RLS 다 — 회원이 이 화면의 코드를 아무리 뜯어도
 * `club_dues` 조회는 0행이 온다. 미납자 명단이 새면 실제로 사람이 나간다.
 */
export function ClubDuesPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()))

  return (
    <ClubScreen
      clubId={clubId!}
      title="회비"
      description="계좌이체로 들어온 회비를 여기서 체크합니다. 앱이 돈을 옮기지는 않습니다."
    >
      {({ club, me }) => (
        <DuesMonth
          clubId={club.id}
          monthKey={monthKey}
          onMonth={setMonthKey}
          canManage={isClubStaff(me?.role)}
        />
      )}
    </ClubScreen>
  )
}

function DuesMonth({
  clubId,
  monthKey,
  onMonth,
  canManage,
}: {
  clubId: string
  monthKey: string
  onMonth: (next: string) => void
  canManage: boolean
}) {
  const summary = useDuesSummary(clubId, monthKey)
  /*
   * 회원에게는 아예 안 부른다. 불러 봐야 RLS 가 걸러 0행이 오는데,
   * 그 0행은 "장부가 없다" 와 구별되지 않아 화면이 거짓말을 하게 된다.
   */
  const entries = useDuesEntries(clubId, monthKey, canManage)
  const previous = usePreviousMonthDues(clubId, monthKey, canManage)

  return (
    <>
      <MonthNav monthKey={monthKey} onMonth={onMonth} />

      {summary.error != null ? (
        <p role="alert" className="mt-4 text-sm font-medium text-team-b-fg">
          {toUserMessage(summary.error, '회비를 불러오지 못했습니다')}
        </p>
      ) : summary.data ? (
        <Totals expected={summary.data.expected_total} collected={summary.data.collected_total} />
      ) : (
        <div className="mt-4 h-20 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      )}

      <div className="mt-8">
        {canManage ? (
          entries.error != null ? (
            <p role="alert" className="text-sm font-medium text-team-b-fg">
              {toUserMessage(entries.error, '장부를 불러오지 못했습니다')}
            </p>
          ) : entries.data ? (
            <DuesLedger
              clubId={clubId}
              monthKey={monthKey}
              entries={entries.data}
              previousEntries={previous.data}
            />
          ) : (
            <div className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
          )
        ) : summary.data ? (
          <MyDuesLine summary={summary.data} />
        ) : null}
      </div>
    </>
  )
}

/**
 * 달 넘기기.
 *
 * 다음 달로도 갈 수 있게 둔다 — 총무가 월말에 다음 달 장부를 미리 여는
 * 것이 실제 동작이라, 여기서 막으면 1일까지 기다려야 한다.
 */
function MonthNav({
  monthKey,
  onMonth,
}: {
  monthKey: string
  onMonth: (next: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <MonthButton label="지난 달" onClick={() => onMonth(shiftMonth(monthKey, -1))}>
        <ChevronLeft className="size-5" aria-hidden />
      </MonthButton>
      <h2 className="tabular text-lg font-black tracking-tight text-ink-1">
        {monthLabel(monthKey)}
      </h2>
      <MonthButton label="다음 달" onClick={() => onMonth(shiftMonth(monthKey, 1))}>
        <ChevronRight className="size-5" aria-hidden />
      </MonthButton>
    </div>
  )
}

function MonthButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-xl border border-border-subtle
                 bg-surface-1 text-ink-2 hover:text-ink-1
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {children}
    </button>
  )
}

/**
 * 걷힌 돈 / 걷을 돈.
 *
 * 🔴 회원도 이 숫자를 본다. 합계는 보여도 되지만 **누가 안 냈는지는 절대
 *    안 보인다** — 그래서 여기에 인원 수를 그리지 않는다. 서버(`club_dues_summary`)
 *    도 같은 이유로 인원 수를 안 준다. 운영진용 인원 수는 아래 목록의
 *    섹션 제목이 진다.
 */
function Totals({ expected, collected }: { expected: number; collected: number }) {
  const left = Math.max(expected - collected, 0)
  // 0으로 나누지 않는다 — 장부를 막 연 달은 걷을 돈이 0일 수 있다
  const ratio = expected > 0 ? Math.min(collected / expected, 1) : 0

  return (
    <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-1 px-5 py-4">
      <p className="tabular text-2xl font-black tracking-tight text-ink-1">
        {formatWon(collected)}
        <span className="ml-1.5 text-sm font-semibold text-ink-3">
          / {formatWon(expected)} 걷힘
        </span>
      </p>
      {/*
        막대는 장식이 아니라 "얼마나 남았나" 를 한눈에 준다. 숫자를 읽지
        않아도 오늘 할 일이 남았는지 알 수 있어야 한다.
      */}
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${formatWon(expected)} 중 ${formatWon(collected)} 걷힘`}
      >
        <div
          className="h-full rounded-full bg-ok transition-[width] duration-300"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {left > 0 && <p className="tabular mt-2 text-sm text-ink-2">{formatWon(left)} 남음</p>}
    </div>
  )
}
