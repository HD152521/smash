import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Home, User, Users } from 'lucide-react'
import { appTabFor, type AppTab } from './appTabs'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

/**
 * 대회 밖 화면들이 공유하는 하단 고정 탭바.
 *
 * 문법은 `TournamentTabBar` 를 그대로 따른다 — 같은 높이(`min-h-16`),
 * 같은 `z-40`, 같은 `env(safe-area-inset-bottom)`, 아이콘 위 글자 아래,
 * 켜진 탭은 색만이 아니라 **획 두께**로도 말한다. 두 탭바가 서로 다르게
 * 생기면 대회에 들어가고 나올 때마다 앱이 바뀐 것처럼 보인다.
 *
 * 어느 화면에 뜨는지는 `appTabs.ts` 의 규칙 하나가 정한다. 두 탭바가
 * 동시에 뜨는 일은 거기서 막힌다(`/t/**` 는 허용 목록에 없다).
 *
 * ## 동아리 탭은 **언제나 목록으로** 간다
 *
 * 한때 동아리가 하나뿐이면 그 동아리로 바로 보냈다. 홈의 큰 버튼이 쓰던
 * 규칙("고를 것이 하나뿐인 목록을 한 번 더 보여주는 것은 탭만 하나 늘리는
 * 일이다")을 그대로 옮겨 온 것이었는데, **탭에는 그 규칙이 안 맞는다.**
 *
 * 탭은 늘 화면 아래에 있는 것이라 **누르기 전에 어디로 갈지 알아야 한다.**
 * 동아리 수에 따라 목적지가 달라지면, 두 번째 동아리에 들어간 날부터
 * 같은 탭이 다른 곳으로 간다 — 그날 사용자는 앱이 바뀌었다고 느낀다.
 *
 * 그리고 동아리 하나짜리 사용자는 그 바로가기 때문에 **`/clubs` 에 영영
 * 못 갔다.** 거기에만 있는 '동아리 만들기 · 코드로 참가' 가 같이 사라져,
 * 두 번째 동아리를 만들 길이 없었다.
 *
 * 지름길이 필요하면 홈의 카드가 한다 — 거기는 "오늘" 을 보여주는 자리라
 * 상황에 따라 달라지는 것이 맞다.
 */
const TABS = [
  { key: 'home', label: '홈', to: '/', icon: Home },
  { key: 'clubs', label: '동아리', to: '/clubs', icon: Users },
  // 지난·앞으로의 대회와 모임 목록. 달력 아이콘인 이유는 이 목록에서
  // 사람이 찾는 것이 이름이 아니라 "언제 것" 이기 때문이다.
  { key: 'list', label: '내 목록', to: '/my', icon: CalendarDays },
  // 여럿(동아리)과 하나(나)를 아이콘 모양으로 가른다 — 글자를 못 읽는
  // 거리에서도 왼쪽 둘과 오른쪽 둘이 다른 성격인 게 보인다.
  { key: 'me', label: '나', to: '/me', icon: User },
] as const satisfies readonly { key: AppTab; label: string; to: string; icon: unknown }[]

export function AppTabBar() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const active = appTabFor(pathname)

  // 탭이 안 뜨는 화면에서는 컴포넌트 자체를 렌더하지 않는다.
  if (!user || !active) return null
  return <Bar active={active} />
}

function Bar({ active }: { active: AppTab }) {
  return (
    /*
      엄지가 닿는 화면 맨 아래(docs/design.md '자주 누르는 것은 아래에
      둔다'). `env(safe-area-inset-bottom)` 로 아이폰 홈 인디케이터 아래까지
      배경을 깔되 탭 자체는 그 위에 남긴다 — TournamentTabBar 와 같은 규율.
    */
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-1/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const current = tab.key === active
          const Icon = tab.icon
          return (
            <li key={tab.key} className="min-w-0 flex-1">
              <Link
                to={tab.to}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-bold',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                  // 폰에는 hover 가 없다. 누르는 순간 반응하는 것은 active 뿐이다.
                  'transition-colors active:bg-surface-2',
                  // 색만으로 현재 탭을 말하지 않는다 — 굵기(아이콘 선 두께)도 같이 바뀐다
                  current ? 'text-brand-fg' : 'text-ink-3',
                )}
              >
                <Icon className={cn('size-5', current && 'stroke-[2.5]')} aria-hidden />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
