import { Badge } from '@/components/ui/Badge'
import { formatPaidOn, formatWon } from '@/lib/dues'
import type { ClubDuesSummary } from '@/types/database'

/**
 * 회원이 보는 회비 — **내 것 한 줄.**
 *
 * 회원에게 필요한 것은 "내가 냈나" 하나다. 남이 냈는지는 알 필요가 없고,
 * 알게 두면 안 된다 — 동아리에서 "누가 회비 안 냈다" 가 공개되면 실제로
 * 사람이 나간다. 그래서 이 컴포넌트가 그릴 수 있는 데이터는
 * `club_dues_summary` 가 돌려준 봉투뿐이고, 그 봉투에는 애초에 남의 이름이
 * 들어 있지 않다 (`ClubDuesSummary` 주석 참고).
 *
 * ⚠ 여기에 "미납 3명" 을 그리지 마라. 서버가 인원 수를 안 주는 것도 같은
 *   이유다 — 회원 몇 명인지 아는 사람에게는 인원 수가 곧 좁혀 들어가는
 *   단서가 된다.
 */
export function MyDuesLine({ summary }: { summary: ClubDuesSummary }) {
  const mine = summary.mine

  if (!mine) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-1 px-5 py-4">
        <p className="text-sm text-ink-2">이 달 회비는 아직 정해지지 않았습니다.</p>
      </div>
    )
  }

  const paidOn = formatPaidOn(mine.paid_on)

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-1 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-3 uppercase">내 회비</p>
          <p className="tabular mt-1 text-2xl font-black tracking-tight text-ink-1">
            {formatWon(mine.amount)}
          </p>
        </div>
        {/*
          `ok` 와 `warn` 을 쓴다. `warn` 은 오류가 아니라 "아직 남은 일"
          이라는 뜻이다 (Badge 주석) — 미납은 잘못이 아니라 아직 안 한 일이다.
        */}
        {mine.paid_on ? (
          <Badge tone="ok">납부 완료{paidOn ? ` · ${paidOn}` : ''}</Badge>
        ) : (
          <Badge tone="warn">미납</Badge>
        )}
      </div>

      {/*
        총무에게 말을 걸라고 쓰지 않는다. 앱이 사람을 재촉하는 자리가
        아니다 — 독촉은 총무가 직접 한다.
      */}
      {!mine.paid_on && (
        <p className="mt-3 text-sm break-keep text-ink-2">
          입금 확인은 총무가 통장을 보고 표시합니다. 시간이 걸릴 수 있습니다.
        </p>
      )}
    </div>
  )
}
