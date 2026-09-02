import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Gavel,
  LayoutGrid,
  ListOrdered,
  MoreHorizontal,
  ScrollText,
  Settings,
  Sliders,
  Trophy,
  Users,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { TournamentTab } from './TournamentNav'

/**
 * 대회·모임 화면 하단 고정 탭바 (docs/design.md '구조 — 하단탭으로 내린다').
 *
 * ## 무엇이 탭에 남고 무엇이 더보기로 가나
 *
 * 대회 화면은 코트·대진표·심판·기록·순위·참가자로 6개다. 하단탭은
 * 엄지 하나가 좌우로 훑는 자리라 5개가 한계고, 6개를 다 늘어놓으면
 * 글자가 줄어들어 "글자를 빼지 마라" 원칙과 부딪힌다.
 *
 * 실측 근거(docs/design.md '이 앱이 실제로 쓰이는 상황')는 운영진이
 * 라이브 중 오가는 화면이 **코트 ↔ 대진표** 둘이라고 말한다. 여기에
 * "경기 몇 대 몇이었지" 를 찾는 기록을 더해 셋이 남는다. 나머지
 * (심판·순위)와 관리·설정은 '더보기' 시트 하나로 묶는다. 라우트는
 * 그대로 있다 — 탭에서 빠졌을 뿐 어디서도 도달 못 하게 막지 않는다.
 *
 * ## 2026-08-27 — 참가자를 탭으로 되돌렸다
 *
 * 개편 첫 판에서 참가자를 더보기로 내렸는데, 그게 명단 관리를 오히려
 * 나쁘게 만들었다(docs/ui-redesign.md '명단 관리가 편하지 않다').
 * 명단은 저녁 내내 바뀐다 — 늦게 오고, 먼저 가고, "쟤 몇 판 뛰었지" 를
 * 다음 경기 짤 때마다 본다. 그 화면이 시트 안에 있으면 매번 두 번
 * 눌러야 도달한다.
 *
 * 그래서 다섯 번째 탭으로 되돌린다. 자리는 대진표와 기록 사이다 —
 * 참가자를 보는 이유가 '다음 경기에 누굴 넣지' 라서 앞을 보는 화면
 * (코트·대진표) 쪽에 붙고, 지나간 것을 보는 기록이 뒤로 간다.
 *
 * 모임은 원래 심판·순위가 없다(TournamentNav 참고). 그래서 모임의
 * '더보기' 에는 관리·설정만 남는다.
 *
 * ## 2026-08-28 · 2026-09-01 — 홈이 없다
 *
 * 여기 있던 '홈' 은 한 번 머리말로 옮겼다가(2026-08-28) 지금은 아예 없다.
 * 대회를 떠나는 길은 머리말의 하나뿐이고(`TournamentNav` — 동아리 또는 내
 * 목록), 그 하나를 지나면 전역 하단탭에 홈이 바로 있다. 대회 안에 홈을
 * 다시 만들면 **대회를 떠나는 길이 둘**이 되고, 둘 중 어느 쪽이 맞는지
 * 아무도 모르게 된다.
 *
 * ⚠ 이 탭들은 전부 `/t/:id` **안**이다. 여기에 대회 밖 주소를 넣지 마라 —
 * 나가는 길은 머리말 한 곳에만 있어야 한다.
 */
const PRIMARY_TABS = [
  { key: 'court', label: '코트', path: '', icon: LayoutGrid },
  { key: 'schedule', label: '대진표', path: '/schedule', icon: ListOrdered },
  { key: 'members', label: '참가자', path: '/members', icon: Users },
  { key: 'records', label: '기록', path: '/records', icon: ScrollText },
] as const satisfies readonly { key: TournamentTab; label: string; path: string; icon: unknown }[]

/** '더보기' 시트 안으로 옮겨간 탭. 이 중 하나가 active 면 더보기 탭이 대신 켜진다. */
const MORE_TABS: readonly TournamentTab[] = ['referee', 'standings']

export function TournamentTabBar({
  id,
  active,
  isSession,
  isAdmin,
  refereeCount,
}: {
  id: string
  active: TournamentTab
  isSession: boolean
  isAdmin: boolean
  /** 내가 심판으로 걸린, 아직 안 끝난 경기 수 — 더보기 탭에 점으로 띄운다 */
  refereeCount: number
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MORE_TABS.includes(active)
  const hasRefereeAlert = !isSession && refereeCount > 0

  function closeMore() {
    setMoreOpen(false)
  }

  return (
    <>
      {/*
        엄지가 닿는 화면 맨 아래에 고정한다(docs/design.md '자주 누르는
        것은 아래에 둔다'). `env(safe-area-inset-bottom)` 로 아이폰 홈
        인디케이터 아래까지 배경을 깔되 탭 자체는 그 위에 남긴다.
      */}
      <nav
        aria-label={isSession ? '모임 메뉴' : '대회 메뉴'}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-1/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex w-full max-w-2xl">
          {PRIMARY_TABS.map((tab) => {
            const current = tab.key === active
            const Icon = tab.icon
            return (
              <li key={tab.key} className="min-w-0 flex-1">
                <Link
                  to={`/t/${id}${tab.path}`}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                    // 폰에는 hover 가 없다 — 누르는 순간 반응하는 것은 active 뿐이다
                    'transition-colors active:bg-surface-2',
                    // 색만으로 현재 탭을 말하지 않는다 — 굵기(아이콘 선 두께)도 같이 바뀐다
                    current ? 'text-brand-fg' : 'text-ink-3',
                  )}
                >
                  {/* 켜진 탭 위의 네온 눈금 — AppTabBar 와 같은 문법 */}
                  {current && (
                    <span
                      aria-hidden
                      className="absolute inset-x-[28%] top-0 h-0.5 rounded-full bg-brand-600"
                    />
                  )}
                  <Icon className={cn('size-5', current && 'stroke-[2.5]')} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            )
          })}
          <li className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'page' : undefined}
              className={cn(
                'relative flex min-h-16 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                'transition-colors active:bg-surface-2',
                moreActive ? 'text-brand-fg' : 'text-ink-3',
              )}
            >
              {moreActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-[28%] top-0 h-0.5 rounded-full bg-brand-600"
                />
              )}
              <MoreHorizontal className={cn('size-5', moreActive && 'stroke-[2.5]')} aria-hidden />
              더보기
            </button>
            {hasRefereeAlert && (
              <span
                aria-hidden
                className="tabular absolute top-2 right-[22%] min-w-4 rounded-full bg-brand-600
                           px-1 text-center text-[10px] leading-4 font-black text-brand-ink"
              >
                {refereeCount}
              </span>
            )}
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={closeMore} title={isSession ? '모임 메뉴' : '대회 메뉴'}>
        <ul className="flex flex-col gap-1">
          {!isSession && (
            <MoreLink to={`/t/${id}/referee`} icon={Gavel} onClick={closeMore}>
              심판
              {refereeCount > 0 && <CountBadge>{refereeCount}</CountBadge>}
            </MoreLink>
          )}
          {!isSession && (
            <MoreLink to={`/t/${id}/standings`} icon={Trophy} onClick={closeMore}>
              순위
            </MoreLink>
          )}
          {/* 보는 것과 바꾸는 것을 가른다 — 위는 탭에서 옮겨온 화면, 아래는 원래도 탭이 아니었다 */}
          {!isSession && <hr className="my-1.5 border-border-subtle" />}

          {isAdmin && (
            <MoreLink to={`/t/${id}/admin`} icon={Sliders} onClick={closeMore}>
              관리
            </MoreLink>
          )}
          <MoreLink to={`/t/${id}/settings`} icon={Settings} onClick={closeMore}>
            설정
          </MoreLink>
        </ul>
      </Modal>
    </>
  )
}

function MoreLink({
  to,
  icon: Icon,
  onClick,
  children,
}: {
  to: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        to={to}
        onClick={onClick}
        className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-ink-1
                   transition-colors hover:bg-surface-2
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
        {children}
      </Link>
    </li>
  )
}

function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular ml-auto min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-xs font-black text-brand-ink">
      {children}
    </span>
  )
}
