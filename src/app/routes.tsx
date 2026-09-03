import { Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazyPage } from './lazyPage'
import { AppTabBar } from '@/components/nav/AppTabBar'
import { useAuth } from '@/features/auth/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HomePage } from '@/pages/HomePage'
import { TournamentOnly } from '@/features/tournament/TournamentOnly'

/**
 * 관리자·심판 화면은 라우트 단위로 나눠 받는다.
 *
 * 참가자 대부분은 대회에 들어와 점수만 보고 나간다. 그 사람들이 경기 편성
 * 화면이나 감사 로그 코드까지 내려받을 이유가 없다.
 * 체육관 회선이 느릴수록 첫 화면이 빨리 뜨는 게 중요하다.
 */
const CreateTournamentPage = lazyPage(() =>
  import('@/pages/CreateTournamentPage').then((m) => ({ default: m.CreateTournamentPage })),
)
const JoinTournamentPage = lazyPage(() =>
  import('@/pages/JoinTournamentPage').then((m) => ({ default: m.JoinTournamentPage })),
)
const MyTournamentsPage = lazyPage(() =>
  import('@/pages/MyTournamentsPage').then((m) => ({ default: m.MyTournamentsPage })),
)
const TournamentPage = lazyPage(() =>
  import('@/pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
)
const TournamentSetupPage = lazyPage(() =>
  import('@/pages/TournamentSetupPage').then((m) => ({ default: m.TournamentSetupPage })),
)
const TournamentSettingsPage = lazyPage(() =>
  import('@/pages/TournamentSettingsPage').then((m) => ({ default: m.TournamentSettingsPage })),
)
const TournamentAdminPage = lazyPage(() =>
  import('@/pages/TournamentAdminPage').then((m) => ({ default: m.TournamentAdminPage })),
)
const AdminGroupsPage = lazyPage(() =>
  import('@/pages/AdminGroupsPage').then((m) => ({ default: m.AdminGroupsPage })),
)
const AdminCourtsPage = lazyPage(() =>
  import('@/pages/AdminCourtsPage').then((m) => ({ default: m.AdminCourtsPage })),
)
const AdminMembersPage = lazyPage(() =>
  import('@/pages/AdminMembersPage').then((m) => ({ default: m.AdminMembersPage })),
)
const AdminRulesPage = lazyPage(() =>
  import('@/pages/AdminRulesPage').then((m) => ({ default: m.AdminRulesPage })),
)
const CreateSessionPage = lazyPage(() =>
  import('@/pages/CreateSessionPage').then((m) => ({ default: m.CreateSessionPage })),
)
const SessionMatchCreatePage = lazyPage(() =>
  import('@/pages/SessionMatchCreatePage').then((m) => ({
    default: m.SessionMatchCreatePage,
  })),
)
const MatchCreatePage = lazyPage(() =>
  import('@/pages/MatchCreatePage').then((m) => ({ default: m.MatchCreatePage })),
)
const PastMatchEntryPage = lazyPage(() =>
  import('@/pages/PastMatchEntryPage').then((m) => ({ default: m.PastMatchEntryPage })),
)
const MatchEditPage = lazyPage(() =>
  import('@/pages/MatchEditPage').then((m) => ({ default: m.MatchEditPage })),
)
const SessionMatchEditPage = lazyPage(() =>
  import('@/pages/SessionMatchEditPage').then((m) => ({ default: m.SessionMatchEditPage })),
)
const MatchScorePage = lazyPage(() =>
  import('@/pages/MatchScorePage').then((m) => ({ default: m.MatchScorePage })),
)
const LiveBoardPage = lazyPage(() =>
  import('@/pages/LiveBoardPage').then((m) => ({ default: m.LiveBoardPage })),
)
const RefereePage = lazyPage(() =>
  import('@/pages/RefereePage').then((m) => ({ default: m.RefereePage })),
)
const StandingsPage = lazyPage(() =>
  import('@/pages/StandingsPage').then((m) => ({ default: m.StandingsPage })),
)
const SchedulePage = lazyPage(() =>
  import('@/pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
)
const MatchDetailPage = lazyPage(() =>
  import('@/pages/MatchDetailPage').then((m) => ({ default: m.MatchDetailPage })),
)
const MembersPage = lazyPage(() =>
  import('@/pages/MembersPage').then((m) => ({ default: m.MembersPage })),
)
const MatchRecordsPage = lazyPage(() =>
  import('@/pages/MatchRecordsPage').then((m) => ({ default: m.MatchRecordsPage })),
)
const AuditLogPage = lazyPage(() =>
  import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)

/*
 * 동아리는 선택 계층이라 대부분의 참가자는 이 코드를 한 줄도 안 받는다.
 * 나눠 받는 이유가 관리 화면과 같다 — 안 쓰는 사람에게 안 보내는 것.
 */
/*
 * 계정·기기 설정. 대회 밑이 아니라 홈 밑에 둔다 — 알림 구독은 브라우저
 * 하나에 하나라서, 대회 화면에 두면 같은 스위치가 참가한 대회 수만큼
 * 생기고 한 곳에서 끄면 나머지도 같이 죽는다.
 */
const NotificationSettingsPage = lazyPage(() =>
  import('@/pages/NotificationSettingsPage').then((m) => ({
    default: m.NotificationSettingsPage,
  })),
)
/*
 * 마이페이지 — 이름·급수·성별을 본인이 고치는 곳. 알림과 로그아웃도 여기
 * 모인다. 대회 밑이 아니라 홈 밑인 이유는 알림 설정과 같다: 계정 하나에
 * 하나뿐인 것을 대회 화면에 두면 참가한 대회 수만큼 같은 화면이 생긴다.
 */
const MyPage = lazyPage(() => import('@/pages/MyPage').then((m) => ({ default: m.MyPage })))

const MyClubsPage = lazyPage(() =>
  import('@/pages/MyClubsPage').then((m) => ({ default: m.MyClubsPage })),
)
const CreateClubPage = lazyPage(() =>
  import('@/pages/CreateClubPage').then((m) => ({ default: m.CreateClubPage })),
)
const JoinClubPage = lazyPage(() =>
  import('@/pages/JoinClubPage').then((m) => ({ default: m.JoinClubPage })),
)
const ClubPage = lazyPage(() => import('@/pages/ClubPage').then((m) => ({ default: m.ClubPage })))
const ClubGuestLinkPage = lazyPage(() =>
  import('@/pages/ClubGuestLinkPage').then((m) => ({ default: m.ClubGuestLinkPage })),
)
const ClubInvitePage = lazyPage(() =>
  import('@/pages/ClubInvitePage').then((m) => ({ default: m.ClubInvitePage })),
)
const ClubMembersPage = lazyPage(() =>
  import('@/pages/ClubMembersPage').then((m) => ({ default: m.ClubMembersPage })),
)
const ClubSettingsPage = lazyPage(() =>
  import('@/pages/ClubSettingsPage').then((m) => ({ default: m.ClubSettingsPage })),
)
const ClubDuesPage = lazyPage(() =>
  import('@/pages/ClubDuesPage').then((m) => ({ default: m.ClubDuesPage })),
)

/*
 * 게스트 화면 둘은 이 앱에서 **로그인 가드 밖**에 있는 유일한 화면들이다.
 * 계정 없는 사람이 링크로 바로 여는 화면이라, 다른 코드 스플릿 화면처럼
 * `Protected` 로 감싸면(RequireAuth 가 안에 있다) 정작 게스트가 못 연다.
 */
const GuestJoinPage = lazyPage(() =>
  import('@/pages/GuestJoinPage').then((m) => ({ default: m.GuestJoinPage })),
)
const GuestBoardPage = lazyPage(() =>
  import('@/pages/GuestBoardPage').then((m) => ({ default: m.GuestBoardPage })),
)

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  // 세션 복원이 끝나기 전에 판단하면 새로고침 때마다 로그인 화면이 번쩍인다
  if (!ready) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <span
        role="status"
        aria-label="불러오는 중"
        className="size-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent"
      />
    </div>
  )
}

/** 로그인 확인 + 청크 로딩을 한 번에 감싼다 */
function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
    </RequireAuth>
  )
}

/** 로그인 확인 없이 청크 로딩만 감싼다 — 가드 밖 화면(`/login` 등)과 같은 자리 */
function Public({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
}

export function AppRoutes() {
  return (
    <>
      <AppRouteTable />
      {/*
        전역 하단탭은 라우트 **밖에** 한 번만 둔다. 화면마다 붙이면 새
        화면을 만드는 사람이 빠뜨리거나 두 번 붙일 수 있고, 대회 화면에
        실수로 붙으면 `TournamentTabBar` 와 겹친다. 여기 하나면 규칙
        (`appTabs.ts`)이 곧 답이라 겹칠 자리가 없다.
      */}
      <AppTabBar />
    </>
  )
}

function AppRouteTable() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/*
        게스트 등록 — 계정 없는 사람이 그날 명단에 스스로 들어오는 유일한 문.
        `/login` 과 같은 자리에 둔다. `Protected` 안에 넣으면 `RequireAuth` 가
        먼저 `/login` 으로 돌려보내 게스트가 영영 못 연다.
      */}
      <Route
        path="/g/:guestCode"
        element={
          <Public>
            <GuestJoinPage />
          </Public>
        }
      />
      {/*
        게스트 현황판 — 등록을 마친 사람이 코트를 보는 곳. 주소의 두 조각이
        `guest_board(p_code, p_session_id)` 의 인자와 1:1 로 맞아, 새로고침해도
        정확히 그 모임으로 돌아온다.

        등록 화면과 **같은 자리**에 둔다. 여기만 `Protected` 로 옮기면 등록은
        되는데 현황판이 `/login` 으로 튕겨, 코트 앞에 선 게스트를 정확히
        막는다.
      */}
      <Route
        path="/g/:guestCode/:sessionId"
        element={
          <Public>
            <GuestBoardPage />
          </Public>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/new"
        element={
          <Protected>
            <CreateTournamentPage />
          </Protected>
        }
      />
      <Route
        path="/new/session"
        element={
          <Protected>
            <CreateSessionPage />
          </Protected>
        }
      />
      <Route
        path="/join"
        element={
          <Protected>
            <JoinTournamentPage />
          </Protected>
        }
      />
      <Route
        path="/my"
        element={
          <Protected>
            <MyTournamentsPage />
          </Protected>
        }
      />
      <Route
        path="/settings/alerts"
        element={
          <Protected>
            <NotificationSettingsPage />
          </Protected>
        }
      />
      {/*
        `/my`(내 목록)와 한 글자 차이라 헷갈릴 수 있다. 그래도 `/me` 다 —
        '나' 를 뜻하는 주소로 이보다 짧고 관습적인 것이 없고, 화면 제목
        ('내 정보' 대 '내 목록')과 들어가는 자리가 서로 다르다.
      */}
      <Route
        path="/me"
        element={
          <Protected>
            <MyPage />
          </Protected>
        }
      />
      {/*
        동아리는 `/clubs`, 대회는 `/t`. 초대 코드가 두 종류가 됐으므로 들어오는
        문도 갈라 둔다 — `/join` 은 대회 코드, `/clubs/join` 은 동아리 코드다.
        한 칸에서 둘 다 받으면 누르기 전에는 어디로 들어가는지 알 수 없다.
      */}
      <Route
        path="/clubs"
        element={
          <Protected>
            <MyClubsPage />
          </Protected>
        }
      />
      <Route
        path="/clubs/new"
        element={
          <Protected>
            <CreateClubPage />
          </Protected>
        }
      />
      <Route
        path="/clubs/join"
        element={
          <Protected>
            <JoinClubPage />
          </Protected>
        }
      />
      {/* 동아리 화면은 짧게 — 코드와 함께 카톡으로 오가는 주소다 */}
      <Route
        path="/c/:clubId"
        element={
          <Protected>
            <ClubPage />
          </Protected>
        }
      />
      {/*
        동아리도 대회 관리와 같은 모양이다 — 허브 하나에 하위 다섯.
        한 장에 이름·코드 둘·산하 대회·명단 30줄·나가기를 쌓아 뒀더니,
        체육관에서 가장 자주 쓰는 게스트 링크가 명단 밑으로 밀렸다.

        코드 둘을 일부러 갈라 둔다. 동아리 코드는 명단에 영구히 남기는
        코드고 게스트 링크는 오늘 하루짜리다 — 나란히 두면 급할 때
        엉뚱한 것을 복사해 뿌린다. 위의 들어오는 문(`/join` ·
        `/clubs/join`)을 가른 것과 같은 이유다.
      */}
      <Route
        path="/c/:clubId/guest"
        element={
          <Protected>
            <ClubGuestLinkPage />
          </Protected>
        }
      />
      <Route
        path="/c/:clubId/invite"
        element={
          <Protected>
            <ClubInvitePage />
          </Protected>
        }
      />
      <Route
        path="/c/:clubId/members"
        element={
          <Protected>
            <ClubMembersPage />
          </Protected>
        }
      />
      {/*
        회비는 명단 옆이지 설정 안이 아니다 — 매달 여는 화면이고, 설정은
        어쩌다 한 번 여는 화면이다. `/admin/` 같은 하위 이름공간을 안 쓰는
        것은 동아리 쪽 규칙이다(운영진 전용 화면인 게스트 링크·동아리 코드도
        한 단어짜리다). 운영진만 보이는 것은 주소가 아니라 화면이 가른다.
      */}
      <Route
        path="/c/:clubId/dues"
        element={
          <Protected>
            <ClubDuesPage />
          </Protected>
        }
      />
      <Route
        path="/c/:clubId/settings"
        element={
          <Protected>
            <ClubSettingsPage />
          </Protected>
        }
      />

      <Route
        path="/t/:id"
        element={
          <Protected>
            <TournamentPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/setup"
        element={
          <Protected>
            <TournamentSetupPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/settings"
        element={
          <Protected>
            <TournamentSettingsPage />
          </Protected>
        }
      />

      {/*
        관리는 목록 화면(허브) 하나에 하위 화면 셋이다. 코트·참가자·조를 한
        화면에 쌓으면 급할 때 필요한 게 스크롤 밑으로 밀린다.
      */}
      <Route
        path="/t/:id/admin"
        element={
          <Protected>
            <TournamentAdminPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/admin/groups"
        element={
          <Protected>
            <AdminGroupsPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/admin/courts"
        element={
          <Protected>
            <AdminCourtsPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/admin/members"
        element={
          <Protected>
            <AdminMembersPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/admin/rules"
        element={
          <Protected>
            <AdminRulesPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/matches/new-session"
        element={
          <Protected>
            <SessionMatchCreatePage />
          </Protected>
        }
      />
      {/*
        경기를 만들고 고치는 일은 셋이다 — 성격이 달라 주소도 셋이다.
        앞으로 할 경기(new) · 이미 치른 경기의 결과(record) · 이미 편성한
        경기 고치기(edit). 한 화면에 토글로 겹쳐 놨더니 급히 다음 판을 짜러
        온 운영자가 '이미 끝난 경기' 가 눌린 채로 들어와 코트 칸을 못 찾았다.
      */}
      <Route
        path="/t/:id/matches/new"
        element={
          <Protected>
            <MatchCreatePage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/matches/record"
        element={
          <Protected>
            <PastMatchEntryPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/matches/:matchId/edit"
        element={
          <Protected>
            <MatchEditPage />
          </Protected>
        }
      />
      {/*
        모임 경기 고치기. 대회의 `edit` 와 **주소를 갈라 둔다** — 대회는 조를
        먼저 고르고 모임에는 조가 없어, 같은 화면으로는 둘 다 못 그린다.
        한 주소에 모드를 얹지 않는 이유는 위 셋과 같다.
      */}
      <Route
        path="/t/:id/matches/:matchId/edit-session"
        element={
          <Protected>
            <SessionMatchEditPage />
          </Protected>
        }
      />

      {/*
        점수판은 대회에만 있다. 모임에서 열면 코트 화면으로 돌려보낸다 —
        모임에서 하는 일은 코트에 들어가고 나오는 것 둘뿐이다.
        링크를 지우는 것만으로는 부족해서 라우트에서 막는다(주소 직접 입력 ·
        열어 둔 탭 새로고침 · 카톡으로 받은 링크).
      */}
      <Route
        path="/t/:id/matches/:matchId"
        element={
          <Protected>
            <TournamentOnly>
              <MatchScorePage />
            </TournamentOnly>
          </Protected>
        }
      />

      <Route
        path="/t/:id/live"
        element={
          <Protected>
            <LiveBoardPage />
          </Protected>
        }
      />

      <Route
        path="/t/:id/audit"
        element={
          <Protected>
            <AuditLogPage />
          </Protected>
        }
      />

      <Route
        path="/t/:id/referee"
        element={
          <Protected>
            <RefereePage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/schedule"
        element={
          <Protected>
            <SchedulePage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/standings"
        element={
          <Protected>
            <StandingsPage />
          </Protected>
        }
      />

      <Route
        path="/t/:id/records/:matchId"
        element={
          <Protected>
            <MatchDetailPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/records"
        element={
          <Protected>
            <MatchRecordsPage />
          </Protected>
        }
      />

      <Route
        path="/t/:id/members"
        element={
          <Protected>
            <MembersPage />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
