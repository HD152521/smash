import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { BackBar } from '@/components/ui/BackBar'
import { useAuth } from '@/features/auth/useAuth'
import { useClub, useClubMembers } from './queries'
import { isClubStaff } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'
import type { ClubMemberSummary } from './api'
import type { ClubRow } from '@/types/database'

interface ClubScreenProps {
  clubId: string
  /** 화면 제목 — 허브에 적힌 이름과 같아야 한다 */
  title: string
  /** 제목 밑 한 줄. 여기서 무엇을 하는지 */
  description?: string
  /**
   * 운영진만 들어올 수 있는 화면인가.
   *
   * 진짜 벽은 RLS 와 RPC 안의 검사다. 여기서 막는 것은 **눌러도 안 되는
   * 화면에 들어와 버튼을 눌러 보게 두지 않는** 것뿐이다 — 대회장에서
   * 그건 "앱이 고장났다" 로 읽힌다.
   */
  staffOnly?: boolean
  children: (ctx: {
    club: ClubRow
    members: ClubMemberSummary[]
    me?: ClubMemberSummary
  }) => ReactNode
}

/**
 * 동아리 하위 화면의 공통 껍데기 — 조회 · 권한 · 뒤로가기 · 제목 · 로딩.
 *
 * `AdminScreen`(대회 관리)과 같은 자리다. 동아리도 한 장에 다 얹어 뒀다가
 * 목록 둘(산하 대회 · 명단)에 게스트 링크까지 끼어 들어 스크롤 화면이
 * 됐다. 체육관에서 운영진이 이 화면을 여는 이유는 거의 언제나 하나 —
 * **게스트 링크를 카톡에 붙여넣기** — 인데, 그게 회원 30명 명단 밑에
 * 있었다.
 *
 * 뒤로는 허브로 보낸다. 허브에서 들어오는 게 유일한 길이라 되짚는 것과
 * 결과가 같고, 주소로 바로 들어온 사람도 갈 곳이 생긴다.
 */
export function ClubScreen({
  clubId,
  title,
  description,
  staffOnly = false,
  children,
}: ClubScreenProps) {
  const { user } = useAuth()
  const club = useClub(clubId)
  const members = useClubMembers(clubId)

  /*
   * 내 역할은 명단에서 찾는다. 목록 화면(`useMyClubs`)이 이미 역할을 들고
   * 있지만 여기까지 들고 오지 않는다 — 코드로 막 들어온 사람이나 주소로
   * 바로 들어온 사람에게는 그 목록이 아직 없다.
   */
  const me = members.data?.find((m) => m.userId === user?.id)

  if (club.error) return <ClubUnavailable error={club.error} />

  /*
   * 명단이 아직 안 왔을 때 내보내지 않는다. `me` 가 undefined 인 것은
   * "권한이 없다" 가 아니라 "아직 모른다" 이고, 여기서 쫓아내면 회선이
   * 느린 체육관에서 운영진이 자기 화면에서 튕긴다.
   */
  const known = Boolean(members.data)
  if (staffOnly && known && !isClubStaff(me?.role)) {
    return <Navigate to={`/c/${clubId}`} replace />
  }

  const pending = !club.data || !members.data

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6" style={{ paddingBottom: APP_TAB_PADDING }}>
      {/*
        홈 버튼은 끈다 — 동아리 화면에는 이제 전역 하단탭이 깔리고 그 안에
        '홈' 이 있다. 같은 화면에 같은 곳으로 가는 버튼이 둘이면 둘 다 덜
        믿게 된다(BackBar 주석). 뒤로가기는 그대로 둔다 — 되짚어 나가는
        것과 처음으로 돌아가는 것은 다른 일이다.
      */}
      <BackBar to={`/c/${clubId}`} label="동아리" home={false} />

      <h1 className="mt-4 text-3xl font-black tracking-tight text-ink-1">{title}</h1>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}

      {members.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(members.error, '명단을 불러오지 못했습니다')}
        </p>
      )}

      {pending ? (
        <div className="mt-8 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        <div className="mt-8">{children({ club: club.data!, members: members.data!, me })}</div>
      )}
    </main>
  )
}

/**
 * 남의 동아리는 아예 안 보인다(`clubs_select` 가 `is_club_member`).
 * '없다' 와 '내가 회원이 아니다' 를 구별할 수 없으므로 둘 다 안내한다.
 */
export function ClubUnavailable({ error }: { error: unknown }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6" style={{ paddingBottom: APP_TAB_PADDING }}>
      <BackBar to="/clubs" label="내 동아리" home={false} />
      <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
        {toUserMessage(error, '동아리를 불러오지 못했습니다')}
      </p>
      <p className="mt-2 text-sm text-ink-2">
        회원만 볼 수 있습니다.{' '}
        <Link
          to="/clubs/join"
          className="font-semibold text-brand-fg underline underline-offset-2
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          동아리 코드로 들어가기
        </Link>
      </p>
    </main>
  )
}
