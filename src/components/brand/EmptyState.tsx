import type { ReactNode } from 'react'
import { EmptyCourt } from '@/components/brand/EmptyCourt'
import { Shuttlecock } from '@/components/brand/Shuttlecock'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** 셔틀콕 — 사람·기록·목록이 비었을 때. 코트 — 경기·코트가 비었을 때 */
  icon: 'shuttlecock' | 'court'
  /** 안내이지 사과가 아니다 — "없습니다" 로 끝내지 않는다 (docs/design.md) */
  title: string
  /** 권한이 있는 사람에게만 다음 동작을 말한다. 없는 기능을 권하지 않는다 */
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/**
 * 빈 상태 — 원래 비어 있던 자리에 정체성을 넣는다.
 *
 * 지금까지 이 자리는 회색 글씨 한 줄이었다. 탭을 하나도 늘리지 않고
 * (docs/design.md 「시각 정체성 · 어디에 넣나」) 선화 하나 + 안내 한 줄 +
 * (있으면) 다음 동작을 올린다. 일러스트는 셔틀콕과 빈 코트 둘뿐이다 —
 * 화면마다 다른 그림을 그리면 통일감이 깨지고 용량만 는다.
 *
 * 기존에 화면마다 흩어져 있던 `rounded-2xl border-dashed` 박스와 같은
 * 문법을 쓴다 — 새 컴포넌트가 낯선 상자로 보이지 않게 한다.
 *
 * ⚠ **크기 (2026-08-28, 코디네이터 확인).** 처음엔 40px 짜리 아이콘이었는데
 * "일러스트가 아니라 아이콘이다" — 빈 상태는 원래 비어 있던 자리라 공간이
 * 남아돈다. 셔틀콕 96px · 빈 코트 높이 88px(코트 비율이라 가로는 더 넓다)로
 * 두 배 넘게 키운다. 다만 화면을 꽉 채우지는 않는다 — 빈 상태가 주인공이
 * 되면 그것도 이상하다.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl border border-dashed border-border-subtle',
        'px-6 py-12 text-center',
        className,
      )}
    >
      {icon === 'shuttlecock' ? (
        <Shuttlecock size={96} className="text-ident-navy-fg/80" />
      ) : (
        <EmptyCourt height={88} className="text-ident-navy-fg/80" />
      )}
      <p className="mt-6 text-base font-bold text-ink-1">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
