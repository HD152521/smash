import { BackBar } from '@/components/ui/BackBar'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { TournamentTabBar } from './TournamentTabBar'
import { useTournamentNav } from './useTournamentNav'
import { useClub } from '@/features/club/queries'
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
 * 지금은 상단에 **뒤로가기 + 제목 한 줄 + 상태 배지**만 남는다. 관리·
 * 설정은 아이콘 자리를 둘이나 차지할 이유가 없다 — 관리는 운영진만,
 * 설정은 드물게 쓴다. 둘 다 하단탭의 '더보기' 시트로 옮겼다
 * (TournamentTabBar 참고). 줄어든 자리만큼 코트가 한 칸 더 보인다.
 *
 * 탭 자체(코트·대진표·심판·기록·순위·참가자)와 '어느 게 하단탭에 남고
 * 어느 게 더보기로 가는지' 는 TournamentTabBar 의 주석에 근거가 있다.
 *
 * ## 2026-08-28 — 뒤로가기가 온 동아리로, 홈은 머리말로
 *
 * 뒤로가기만 있으면 홈까지 더보기 시트를 한 번 더 열어야 했고(2탭), 동아리
 * 로 가려면 '내 모임' 목록을 지나 세 번을 눌러야 했다 — 정작 뒤로가기는
 * `/my` 로 가서 **원래 있던 동아리가 아니었다.** 이제 뒤로가기 자체가 그
 * 대회·모임의 소속 동아리로 간다(`useTournamentNav.clubId`, `tournaments`
 * 행에 이미 실려 오므로 새 왕복이 없다) — 소속이 없으면 지금처럼 `/my`.
 * 이름은 `useClub` 으로 한 번 더 부르는데, 소속이 있는 대회에서만 켜지므로
 * (`enabled: Boolean(clubId)`) 대부분(소속 없는 대회)은 요청 자체가 없다.
 *
 * 홈은 머리말 오른쪽으로 옮겼다(`BackBar` 기본값) — 대신 더보기 시트의
 * '홈' 은 뺐다(TournamentTabBar). 같은 곳으로 가는 버튼이 한 화면에 둘이면
 * 안 된다는 원칙은 그대로고, 자리만 바뀌었다.
 */
const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

export type TournamentTab = 'court' | 'schedule' | 'referee' | 'records' | 'standings' | 'members'

/**
 * 뒤로가기 라벨의 최대 길이 — 클럽 이름은 최대 60자까지 갈 수 있는데
 * (`clubs.name` 제약), 이 라벨은 `whitespace-nowrap shrink-0` 라 줄바꿈
 * 대신 옆으로 넘친다(BackLink 주석). 320px 화면에서 그러면 뒤로가기 자체가
 * 화면 밖으로 밀려 나간다 — 이 라벨만은 잘라서 항상 짧게 둔다. 실제로
 * 보이는 건 대부분 '뒤로'(BackLink, 되짚을 히스토리가 있을 때)라 이 상한은
 * 링크로 바로 들어온 드문 경우에만 작동한다.
 */
const MAX_BACK_LABEL = 10

function truncateBackLabel(name: string): string {
  return name.length > MAX_BACK_LABEL ? `${name.slice(0, MAX_BACK_LABEL)}…` : name
}

export function TournamentNav({ id, active }: { id: string; active: TournamentTab }) {
  const nav = useTournamentNav(id)
  // 소속이 있는 대회에서만 켜진다 — 대부분(소속 없는 대회)은 요청이 아예 없다.
  const club = useClub(nav.clubId ?? undefined)

  /*
   * 뒤로가기 목적지 — 왔던 동아리로.
   *
   * `nav.clubId` 는 `tournaments.club_id` 그대로다(useTournamentNav 주석).
   * 소속이 없으면 지금까지처럼 '내 모임/내 대회' 목록(`/my`)이다.
   *
   * 이름이 아직 안 왔거나(로딩) 더는 그 동아리 회원이 아니라 조회가 막힌
   * 경우(RLS)에도 '동아리' 로 짧게 둔다 — `/c/:clubId` 자체는 그 화면
   * (`ClubUnavailable`)이 이미 "회원만 볼 수 있습니다" 로 받아 낸다.
   */
  const backTo = nav.clubId ? `/c/${nav.clubId}` : '/my'
  const backLabel = nav.clubId
    ? truncateBackLabel(club.data?.name ?? '동아리')
    : nav.isSession
      ? '내 모임'
      : '내 대회'

  return (
    <>
      {/*
        뒤로가기는 히스토리가 있으면 온 길을 그대로 되짚는다(BackLink).
        되짚을 것이 없을 때만(카톡 링크로 바로 들어온 경우) 위 `backTo` 로
        간다 — 소속 동아리가 있으면 그 동아리, 없으면 '내 모임/내 대회'
        목록이다. 히스토리를 되짚는 것과 '어디서 왔는지로 나가는 것' 은
        다른 일이라 뒤로가기는 그대로 두고 목적지만 정확하게 잡는다.

        `BackBar` 라 스크롤을 내려도 남는다. 대진표·기록·참가자는 다 긴
        화면이라, 예전엔 나가려고 맨 위까지 되감아야 했다. 덤으로 대회
        이름도 같이 남아서 "내가 어느 대회에 있는지" 가 끝까지 붙어 있다.

        홈은 켠다(`BackBar` 기본값) — 더보기 시트의 '홈' 은 뺐다
        (TournamentTabBar 주석). 자리는 이 화면도 빠듯하다 — 대회 이름 +
        상태 배지 + 내 조 배지가 이미 오른쪽을 다 쓰지만, 밀리는 쪽은 항상
        제목(`truncate`)이지 양옆 버튼이 아니다(BackLink · HomeLink 둘 다
        `shrink-0`).
      */}
      <BackBar to={backTo} label={backLabel}>
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
      </BackBar>

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
