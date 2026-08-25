import { Link } from 'react-router-dom'
import { Home, Settings, Sliders } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useTournamentNav } from './useTournamentNav'
import type { TournamentStatus } from '@/types/database'

/**
 * 대회 화면들의 공통 머리말 — 대회 이름 · 배지 · 가로 탭.
 *
 * 여섯 화면이 같은 머리말을 쓴다. 탭만 옮겨 다니고 이름은 그대로 있어야
 * "내가 어느 대회에 있는지" 를 매번 되짚지 않는다. 예전에는 이름이
 * 코트 화면에만 있어서 순위나 기록으로 넘어가면 단서가 사라졌다.
 *
 * 카드를 세로로 쌓았을 때는 메뉴만으로 화면 한 판이 찼고, 다른 화면으로
 * 가려면 매번 대회 화면까지 되돌아와야 했다. 가로 한 줄이면 바로 넘어간다.
 *
 * '대회 관리' 는 탭에 넣지 않는다. 관리자만 보이는 데다 성격이 다르다 —
 * 탭은 '보는 곳', 관리는 '바꾸는 곳' 이다.
 */
const TABS = [
  { key: 'court', label: '코트', path: '' },
  { key: 'schedule', label: '대진표', path: '/schedule' },
  { key: 'referee', label: '심판', path: '/referee' },
  { key: 'records', label: '기록', path: '/records' },
  { key: 'standings', label: '순위', path: '/standings' },
  { key: 'members', label: '참가자', path: '/members' },
] as const

/**
 * 모임에 없는 탭.
 *
 * 심판은 모임에 지정하지 않고(뛰는 사람이 점수를 넣는다), 순위는 모임의
 * 목적이 아니다. 빈 화면으로 가는 탭을 남겨 두면 눌러 보고 나서야 안다.
 */
const HIDDEN_IN_SESSION: readonly TournamentTab[] = ['referee', 'standings']

export type TournamentTab = (typeof TABS)[number]['key']

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

export function TournamentNav({ id, active }: { id: string; active: TournamentTab }) {
  const nav = useTournamentNav(id)
  const tabs = nav.isSession ? TABS.filter((t) => !HIDDEN_IN_SESSION.includes(t.key)) : TABS

  return (
    <header>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <BackLink to="/my">{nav.isSession ? '내 모임' : '내 대회'}</BackLink>
          {/*
            뒤로가기만 있으면 대회 안에서 빠져나갈 길이 없다.
            히스토리를 되짚는 것과 '다른 대회로 옮겨 가는 것' 은 다른 일이라
            버튼을 따로 둔다.
          */}
          <Link
            to="/"
            aria-label="홈으로"
            className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors
                       hover:bg-surface-2 hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Home className="size-5" aria-hidden />
          </Link>
        </div>
        <div className="flex items-center gap-1">
          {nav.isAdmin && (
            <Link
              to={`/t/${id}/admin`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold
                         text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Sliders className="size-4" aria-hidden />
              관리
            </Link>
          )}
          <Link
            to={`/t/${id}/settings`}
            aria-label="설정"
            className="grid size-11 place-items-center rounded-lg text-ink-2 transition-colors
                       hover:bg-surface-2 hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Settings className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* 이름은 화면이 바뀌어도 그대로 있는다 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h1 className="text-2xl leading-tight font-black tracking-tight text-ink-1">
          {nav.name ?? ' '}
        </h1>
        {nav.status === 'live' ? (
          <LiveBadge />
        ) : (
          nav.status && (
            <Badge tone={nav.status === 'finished' ? 'neutral' : 'ok'}>
              {STATUS_LABEL[nav.status]}
            </Badge>
          )
        )}
        {nav.myGroupName && (
          <Badge tone={nav.myGroupIsJoker ? 'joker' : 'neutral'}>
            {nav.myGroupIsJoker && <span aria-hidden>🃏</span>}내 조 · {nav.myGroupName}
          </Badge>
        )}
      </div>

      {/* 탭이 화면보다 길면 가로로 민다. 본문은 절대 가로로 넘치지 않는다. */}
      <nav
        aria-label={nav.isSession ? '모임 메뉴' : '대회 메뉴'}
        className="no-scrollbar -mx-5 mt-3 overflow-x-auto px-5"
      >
        <ul className="flex w-max gap-1.5">
          {tabs.map((tab) => {
            const current = tab.key === active
            return (
              <li key={tab.key}>
                <Link
                  to={`/t/${id}${tab.path}`}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                    current
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-2 text-ink-2 transition-colors hover:text-ink-1',
                  )}
                >
                  {tab.label}
                  {tab.key === 'referee' && nav.refereeCount > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs font-black',
                        current ? 'bg-white/25' : 'bg-brand-600 text-white',
                      )}
                    >
                      {nav.refereeCount}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
