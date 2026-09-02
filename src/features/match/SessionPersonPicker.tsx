import { ArrowLeftRight, X } from 'lucide-react'
import { busyLabel, busyReason, type BusyInfo } from '@/lib/busy'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'

/**
 * 모임 경기 편성 화면의 **고르는 부분** — 사람 칸 · 하단 대진 요약 · 칩.
 *
 * 화면(`SessionMatchEditor`)에서 떼어 둔 이유는 하나다. 그 화면은 이제
 * 두 라우트가 쓴다(새로 짜기 · 고치기). 고르는 모양은 두 곳에서 **똑같아야
 * 하는데**, 한 파일에 다 두면 파일이 800줄을 넘어가 결국 누군가 한쪽만
 * 복사해 간다. 판단은 하나도 안 들어 있다 — 잠그는 규칙은 `lib/busy.ts`,
 * 고르는 규칙은 `lib/matchPicker.ts` 에 그대로 있다.
 */

/** 고를 사람 묶음 하나. 참가한 사람과 그 외를 같은 모양으로 그린다 */
export function PersonGrid({
  members,
  picked,
  busy,
  plays,
  showPlays,
  squad,
  showAccountBadge,
  onToggle,
}: {
  members: MemberSummary[]
  picked: string[]
  /** 이름 → 다른 경기에 묶인 사정 (`buildBusyMap`) */
  busy: Map<string, BusyInfo>
  /** 이름 → 오늘 판수 (`countPlays`) */
  plays: Map<string, number>
  /** 판수 배지를 붙일 값어치가 있는가 — 전원이 0판이면 아무 정보도 아니다 */
  showPlays: boolean
  squad: number
  /** 이 묶음 안에 계정 있는 사람과 없는 사람이 섞여 있을 때만 true (`hasAccountContrast`) */
  showAccountBadge: boolean
  onToggle: (memberId: string) => void
}) {
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {members.map((m) => (
        <li key={m.id}>
          <PersonButton
            member={m}
            order={picked.indexOf(m.id)}
            busy={busy.get(m.displayName) ?? null}
            plays={showPlays ? (plays.get(m.displayName) ?? 0) : null}
            squad={squad}
            showAccountBadge={showAccountBadge}
            onClick={() => onToggle(m.id)}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * 하단 고정 바의 대진 요약 — 고른 사람은 이름 칩, 안 고른 자리는 번호만.
 *
 * 빈 자리에 "비어 있음" 을 매번 적지 않는다 — 점선 자체가 이미 빈 칸이라고
 * 말하고 있어서 네 칸 모두 같은 글자를 반복하면 잡음만 는다. 대신 번호
 * (1 2 │ 3 4) 를 넣는다 — "앞 둘이 한 편" 규칙이 숫자만으로도 보인다.
 * 고른 사람은 눌러서 바로 뺄 수 있다 — 잘못 고른 사람을 다시 목록까지
 * 스크롤해 찾지 않아도 된다.
 */
export function PickedBar({
  teamA,
  teamB,
  squad,
  nameOf,
  onRemove,
}: {
  teamA: string[]
  teamB: string[]
  squad: number
  nameOf: (memberId: string) => string
  onRemove: (memberId: string) => void
}) {
  return (
    <div aria-label="고른 사람" className="flex items-center gap-2">
      <PickedSlots
        ids={teamA}
        squad={squad}
        side="a"
        numberFrom={1}
        nameOf={nameOf}
        onRemove={onRemove}
      />
      <ArrowLeftRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      <PickedSlots
        ids={teamB}
        squad={squad}
        side="b"
        align="right"
        numberFrom={squad + 1}
        nameOf={nameOf}
        onRemove={onRemove}
      />
    </div>
  )
}

function PickedSlots({
  ids,
  squad,
  side,
  align = 'left',
  numberFrom,
  nameOf,
  onRemove,
}: {
  ids: string[]
  squad: number
  side: 'a' | 'b'
  align?: 'left' | 'right'
  /** 이 팀의 첫 자리가 전체에서 몇 번째인가 (A팀 1, B팀 squad+1) */
  numberFrom: number
  nameOf: (memberId: string) => string
  onRemove: (memberId: string) => void
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-1 items-center gap-1.5', align === 'right' && 'justify-end')}
    >
      {Array.from({ length: squad }, (_, i) => {
        const memberId = ids[i]
        const slotNumber = numberFrom + i
        if (!memberId) {
          return (
            <span
              key={i}
              aria-label={`${slotNumber}번 자리 — 비어 있음`}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-xs font-bold',
                side === 'a'
                  ? 'border-team-a/40 text-team-a/60'
                  : 'border-team-b/40 text-team-b/60',
              )}
            >
              {slotNumber}
            </span>
          )
        }
        return (
          <button
            key={memberId}
            type="button"
            onClick={() => onRemove(memberId)}
            aria-label={`${nameOf(memberId)} 빼기`}
            className={cn(
              'flex h-11 min-w-0 items-center gap-1 rounded-lg border pl-2.5 pr-2 text-xs font-bold',
              'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              side === 'a'
                ? 'border-team-a bg-team-a/10 text-team-a-fg hover:bg-team-a/15'
                : 'border-team-b bg-team-b/10 text-team-b-fg hover:bg-team-b/15',
            )}
          >
            <span className="max-w-24 truncate">{nameOf(memberId)}</span>
            <X className="size-3.5 shrink-0" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * 사람 한 칸.
 *
 * 다른 경기에 묶인 사람은 **지우지 않고 잠근다**. 이름은 그대로 두고, 흐리게
 * 만든 뒤 어느 코트에 있는지를 오른쪽에 적는다. 지워 버리면 명단을 아무리
 * 훑어도 그 사람이 없어서 "빠졌나, 내가 잘못 봤나" 를 확인할 방법이 없다.
 * 잠가 두면 "아, 3번 코트에 있구나" 로 끝난다 — 화면이 답까지 준다.
 *
 * 이미 고른 사람은 묶여 있어도 누를 수 있게 둔다. 고른 뒤에 다른 사람이
 * 그를 편성해 버린 드문 경우, 잠가 버리면 목록에서 뺄 방법이 없어진다.
 */
function PersonButton({
  member,
  order,
  busy,
  plays,
  squad,
  showAccountBadge,
  onClick,
}: {
  member: MemberSummary
  /** 몇 번째로 골랐나. -1 이면 안 골랐다 */
  order: number
  /** 다른 경기에 묶여 있으면 그 사정, 아니면 null */
  busy: BusyInfo | null
  /** 오늘 판수. null 이면 안 그린다 (전원이 0판이라 볼 값어치가 없는 경우) */
  plays: number | null
  squad: number
  /** 이 목록 안에 계정 있는 사람도 섞여 있을 때만 true — 아니면 배지가 아무 정보도 안 준다 */
  showAccountBadge: boolean
  onClick: () => void
}) {
  const picked = order >= 0
  // 앞쪽 절반은 A편, 뒤쪽은 B편. 색으로 어느 편인지 바로 보이게 한다
  const sideA = picked && order < squad
  const locked = Boolean(busy) && !picked

  /*
   * 읽어 주는 이름 — "다라 — 오늘 0판 — 1번 코트에서 경기 중이라…".
   *
   * 배지들은 aria-hidden 이고 사정은 여기 한 줄로 모은다. 배지에 각각
   * aria-label 을 달면 스크린 리더가 이름과 배지를 이어 붙여
   * "다라오늘 0판" 처럼 읽는다 (실제로 이 검사에서 걸렸다).
   */
  const parts = [
    member.displayName,
    plays !== null ? `오늘 ${plays}판` : null,
    locked && busy ? busyReason(busy) : null,
  ].filter((x): x is string => x !== null)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={picked}
      aria-label={parts.length > 1 ? parts.join(' — ') : undefined}
      className={cn(
        'flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-left',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        !picked && !locked && 'border-border-subtle bg-surface-1 hover:bg-surface-2',
        locked && 'cursor-not-allowed border-border-subtle border-dashed bg-surface-2/40',
        picked && sideA && 'border-team-a bg-team-a/10',
        picked && !sideA && 'border-team-b bg-team-b/10',
      )}
    >
      <span
        className={cn('min-w-0 flex-1 truncate font-bold', locked ? 'text-ink-3' : 'text-ink-1')}
      >
        {member.displayName}
      </span>
      {/*
        오늘 몇 판 쳤나. 제안이 왜 이 사람을 골랐는지(혹은 왜 안 골랐는지)를
        총무가 눈으로 확인하는 유일한 자리다 — 숫자가 없으면 제안은 그냥
        "앱이 시킨 것" 이고, 그러면 매번 다시 짜게 된다.
      */}
      {/*
        ⚠ 처음에는 이것도 알약 배지였는데, 찍어 보니 "2판  2번 코트" 처럼
        똑같이 생긴 회색 알약 둘이 나란히 붙어 한 덩어리로 읽혔다. 둘은
        말하는 게 전혀 다르다 — 판수는 **제안의 근거**고, 코트 이름은
        **못 고르는 이유**다. 알약 모양은 "이 사람은 예외다" 쪽에만 남기고
        판수는 맨 글자로 둔다. 그래야 눈이 둘을 구분한다.
      */}
      {plays !== null && (
        <span aria-hidden className="tabular shrink-0 text-[11px] font-semibold text-ink-3">
          {plays}판
        </span>
      )}
      {/*
        왜 못 고르는지 옆에 적는다 — 코트 이름이 있으면 코트를 부른다.
        "3번 코트" 는 상태이면서 동시에 그 사람을 찾아갈 자리다.
      */}
      {busy && (
        <span
          aria-hidden
          className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3"
        >
          {busyLabel(busy)}
        </span>
      )}
      {/* 앱에 안 들어온 사람(게스트·명단만)은 알림을 못 받는다 — 이 목록이 섞여 있을 때만 말해 준다 */}
      {showAccountBadge && !member.userId && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
          명단만
        </span>
      )}
      {picked && (
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white',
            sideA ? 'bg-team-a' : 'bg-team-b',
          )}
        >
          {order + 1}
        </span>
      )}
    </button>
  )
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
