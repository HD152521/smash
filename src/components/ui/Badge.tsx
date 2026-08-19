import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Badge({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode
  className?: string
  tone?: 'neutral' | 'live' | 'ok' | 'joker'
}) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-border-subtle',
    live: 'bg-live/12 text-live-fg border-live/25',
    ok: 'bg-ok/12 text-ok-fg border-ok/25',
    joker: 'bg-joker-soft text-joker-ink border-joker/40',
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
