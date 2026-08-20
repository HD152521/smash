import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'live' | 'ok' | 'joker' | 'warn'
}) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-border-subtle',
    live: 'bg-live/12 text-live-fg border-live/25',
    ok: 'bg-ok/12 text-ok-fg border-ok/25',
    joker: 'bg-joker-soft text-joker-ink border-joker/40',
    /* 손봐야 할 게 남았다는 표시 — 오류(team-b)와 달리 눌러서 고칠 수 있다 */
    warn: 'bg-warn/12 text-warn-fg border-warn/25',
  } as const

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-xs font-semibold tracking-tight',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <Badge tone="live" className={className}>
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-live" />
      진행중
    </Badge>
  )
}
