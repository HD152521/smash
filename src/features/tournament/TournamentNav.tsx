import { Link } from 'react-router-dom'
import { Settings, Sliders } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { cn } from '@/lib/utils'

/**
 * 대회 안에서 화면을 옮겨 다니는 가로 탭.
 *
 * 카드를 세로로 쌓으면 메뉴만으로 화면 한 판이 차고, 다른 화면으로 가려면
 * 매번 대회 화면까지 되돌아와야 했다. 가로 한 줄이면 어디서든 바로 넘어간다.
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

export type TournamentTab = (typeof TABS)[number]['key']

export function TournamentNav({
  id,
  active,
  isAdmin = false,
  refereeCount = 0,
}: {
  id: string
  active: TournamentTab
  isAdmin?: boolean
  /** 내가 심판으로 걸린 경기 수. 있으면 심판 탭에 표시한다 */
  refereeCount?: number
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <BackLink to="/my">내 대회</BackLink>
        <div className="flex items-center gap-1">
          {isAdmin && (
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

      {/* 탭이 화면보다 길면 가로로 민다. 본문은 절대 가로로 넘치지 않는다. */}
      <nav aria-label="대회 메뉴" className="no-scrollbar -mx-5 mt-3 overflow-x-auto px-5">
        <ul className="flex w-max gap-1.5">
          {TABS.map((tab) => {
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
                  {tab.key === 'referee' && refereeCount > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs font-black',
                        current ? 'bg-white/25' : 'bg-brand-600 text-white',
                      )}
                    >
                      {refereeCount}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
