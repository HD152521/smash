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
    live: 'bg-live/12 text-live border-live/25',
    ok: 'bg-ok/12 text-ok border-ok/25',
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

/**
 * 조커조 표시.
 *
 * 색만으로 구분하지 않는다 — 색약인 사람도, 흑백 출력물에서도 읽혀야 한다.
 * 그래서 아이콘 + "조커" 텍스트 + 목표 점수를 함께 노출한다.
 * 심판이 목표를 착각하면 경기가 통째로 잘못 끝나기 때문에 과할 정도로 반복한다.
 */
export function JokerBadge({
  targetScore,
  className,
}: {
  targetScore?: number
  className?: string
}) {
  return (
    <Badge tone="joker" className={className}>
      <span aria-hidden>🃏</span>
      조커
      {targetScore !== undefined && <span className="tabular font-bold">· {targetScore}점</span>}
    </Badge>
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
