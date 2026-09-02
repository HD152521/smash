import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 자동 예약 스위치 — 코트 목록 바로 위, **모임장에게만** 보인다.
 *
 * 여기 두는 이유. 자동 예약이 하는 일은 코트 목록 안에서 벌어지고
 * (코트마다 '자동' 줄이 하나씩 생긴다), 끄고 싶어지는 순간은 그걸 보고
 * 있을 때다 — "오늘은 내가 짤게" 하는 그 순간. 관리 화면 안에 넣으면
 * 탭을 옮겨 찾아야 하고, 그 사이 자동 예약은 계속 돌고 있다.
 *
 * 모임장이 아닌 사람에게는 아예 안 그린다. 켜 봐야 서버가 거절한다
 * (`create_session_match` 는 관리자가 아니면 자기가 뛰는 경기만 허락한다)
 * — 눌러도 아무 일 없는 스위치는 고장으로 읽힌다.
 *
 * 큰 스위치가 아니라 작은 토글이다. 이건 화면의 주인공이 아니라 **평소엔
 * 켜져 있고 가끔 끄는 것**이고, 코트 카드보다 커지면 안 된다.
 */
export function AutoQueueToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          'flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          enabled
            ? 'border-brand-600/30 bg-brand-600/10 text-brand-fg'
            : 'border-border-subtle text-ink-3 hover:bg-surface-2',
        )}
      >
        <Sparkles className="size-3.5" aria-hidden />
        자동 예약 {enabled ? '켬' : '끔'}
      </button>
    </div>
  )
}
