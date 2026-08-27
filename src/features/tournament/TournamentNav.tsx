import { BackLink } from '@/components/ui/BackLink'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { TournamentTabBar } from './TournamentTabBar'
import { useTournamentNav } from './useTournamentNav'
import type { TournamentStatus } from '@/types/database'

/**
 * 대회 화면들의 공통 머리말 — 대회 이름 · 배지 · (하단탭은 TournamentTabBar).
 *
 * 여섯 화면이 같은 머리말을 쓴다. 탭만 옮겨 다니고 이름은 그대로 있어야
 * "내가 어느 대회에 있는지" 를 매번 되짚지 않는다.
 *
 * ## 2026-08-27 — 탭을 하단으로, 상단을 제목 한 줄로
 *
 * 예전엔 여기 [뒤로가기·홈] ↔ [관리·설정] 아이콘 4개 + 제목 + 배지 +
 * 가로 탭까지, 화면 첫 40% 를 썼다(docs/design.md '구조 — 하단탭으로
 * 내린다'). 운영진은 저녁 내내 코트 ↔ 대진표를 오가는데 탭이 맨 위에
 * 있어 매번 화면 꼭대기까지 손을 뻗어야 했다.
 *
 * 지금은 상단에 **뒤로가기 + 제목 한 줄 + 상태 배지**만 남는다. 홈·관리·
 * 설정은 아이콘 자리를 셋이나 차지할 이유가 없다 — 관리는 운영진만,
 * 설정은 드물게 쓴다. 셋 다 하단탭의 '더보기' 시트로 옮겼다
 * (TournamentTabBar 참고). 줄어든 자리만큼 코트가 한 칸 더 보인다.
 *
 * 탭 자체(코트·대진표·심판·기록·순위·참가자)와 '어느 게 하단탭에 남고
 * 어느 게 더보기로 가는지' 는 TournamentTabBar 의 주석에 근거가 있다.
 */
const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

export type TournamentTab = 'court' | 'schedule' | 'referee' | 'records' | 'standings' | 'members'

export function TournamentNav({ id, active }: { id: string; active: TournamentTab }) {
  const nav = useTournamentNav(id)

  return (
    <>
      <header className="flex items-center justify-between gap-2">
        {/*
          뒤로가기만 남긴다. '내 대회/내 모임' 목록으로 옮겨 가는 길은
          더보기 시트의 '홈' 과 겹치지 않는다 — 히스토리를 되짚는 것과
          '다른 대회로 옮겨 가는 것' 은 다른 일이라 뒤로가기는 그대로 둔다.
        */}
        <BackLink to="/my">{nav.isSession ? '내 모임' : '내 대회'}</BackLink>

        {/* 이름은 화면이 바뀌어도 그대로 있는다 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
          <h1 className="truncate text-xl leading-tight font-black tracking-tight text-ink-1">
            {nav.name ?? ' '}
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
      </header>

      <TournamentTabBar
        id={id}
        active={active}
        isSession={nav.isSession}
        isAdmin={nav.isAdmin}
        refereeCount={nav.refereeCount}
      />
    </>
  )
}
