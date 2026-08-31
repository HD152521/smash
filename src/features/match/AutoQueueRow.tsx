import { Link } from 'react-router-dom'
import { Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { matchTitle } from '@/lib/schedule'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 자동으로 걸어 둔 다음 경기 한 줄 — **접힌 대기 줄 안에 숨기지 않는다.**
 *
 * 이 줄이 코트 카드 바깥에 나와 있어야 하는 이유는 하나다. 자동 예약은
 * 사람 넷을 묶는다(`busy.ts`) — 그 넷은 누가 이 경기를 지워 주기 전까지
 * 다른 경기에 못 들어간다. 앱이 멋대로 짠 편성이 사람을 묶어 놓는데
 * 그게 접힌 목록 안에 있으면, 총무는 왜 여섯 명이 후보에서 사라졌는지
 * 모른 채 명단만 들여다보게 된다.
 *
 * 그래서 세 가지를 함께 만족시킨다: **보인다**(자동 배지 + 누구인지) ·
 * **한 명만 바꾼다**(연필) · **한 번에 지운다**(×).
 *
 * ── 연필이 왜 필요한가 ─────────────────────────────────────────────
 * 오래 × 만 있었다. 그러면 앱이 고른 넷 중 **한 명이 마음에 안 들 때도
 * 통째로 지우고 처음부터 짜는 수밖에** 없다 — 지우는 순간 나머지 셋도
 * 풀리고, 총무는 스무 명 명단에서 그 셋을 다시 찾아 누른다. 자동 편성이
 * 대개 셋은 맞히므로 이건 거의 매번 하는 일이 된다.
 *
 * 확인 창은 여전히 × 에만 안 띄운다 — 사람이 만든 게 아니라 앱이 만든
 * 것이고, 지워도 다시 걸릴 수 있다.
 */
export function AutoQueueRow({
  match,
  editTo,
  canDelete,
  deleting,
  onDelete,
}: {
  match: MatchOverviewRow
  /**
   * 고치러 갈 자리. **관리자에게만 내려온다** — 고치기는 지웠다 다시 만드는
   * 것이라 경기 삭제 권한(RLS `matches_write_admin`)이 그대로 필요하다.
   */
  editTo: string | null
  /** 지울 권한이 있나 — 서버 RLS 는 관리자만 지우게 한다 */
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
}) {
  const title = matchTitle(match)

  return (
    <div className="flex min-h-11 items-center gap-2 border-t border-border-subtle bg-surface-2/40 py-2 pl-3 pr-1.5">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600/12 px-2 py-0.5 text-xs font-bold text-brand-fg">
        <Sparkles className="size-3" aria-hidden />
        자동
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-2">{title}</p>
      {editTo && (
        <Link
          to={editTo}
          aria-label={`자동으로 걸린 ${title} 경기 고치기`}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3
                     transition-colors hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Pencil className="size-4" aria-hidden />
        </Link>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`자동으로 걸린 ${title} 경기 지우기`}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3
                     transition-colors hover:bg-surface-2 hover:text-ink-1 disabled:opacity-50
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <X className="size-4" aria-hidden />
          )}
        </button>
      )}
    </div>
  )
}
