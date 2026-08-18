import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HomePage } from '@/pages/HomePage'

/**
 * 관리자·심판 화면은 라우트 단위로 나눠 받는다.
 *
 * 참가자 대부분은 대회에 들어와 점수만 보고 나간다. 그 사람들이 경기 편성
 * 화면이나 감사 로그 코드까지 내려받을 이유가 없다.
 * 체육관 회선이 느릴수록 첫 화면이 빨리 뜨는 게 중요하다.
 */
const CreateTournamentPage = lazy(() =>
  import('@/pages/CreateTournamentPage').then((m) => ({ default: m.CreateTournamentPage })),
)
const JoinTournamentPage = lazy(() =>
  import('@/pages/JoinTournamentPage').then((m) => ({ default: m.JoinTournamentPage })),
)
const MyTournamentsPage = lazy(() =>
  import('@/pages/MyTournamentsPage').then((m) => ({ default: m.MyTournamentsPage })),
)
const TournamentPage = lazy(() =>
  import('@/pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
)
const TournamentSetupPage = lazy(() =>
  import('@/pages/TournamentSetupPage').then((m) => ({ default: m.TournamentSetupPage })),
)
const TournamentSettingsPage = lazy(() =>
  import('@/pages/TournamentSettingsPage').then((m) => ({ default: m.TournamentSettingsPage })),
)
const TournamentAdminPage = lazy(() =>
  import('@/pages/TournamentAdminPage').then((m) => ({ default: m.TournamentAdminPage })),
)
const MatchCreatePage = lazy(() =>
  import('@/pages/MatchCreatePage').then((m) => ({ default: m.MatchCreatePage })),
)
const MatchScorePage = lazy(() =>
  import('@/pages/MatchScorePage').then((m) => ({ default: m.MatchScorePage })),
)
const LiveBoardPage = lazy(() =>
  import('@/pages/LiveBoardPage').then((m) => ({ default: m.LiveBoardPage })),
)
const RefereePage = lazy(() =>
  import('@/pages/RefereePage').then((m) => ({ default: m.RefereePage })),
)
const StandingsPage = lazy(() =>
  import('@/pages/StandingsPage').then((m) => ({ default: m.StandingsPage })),
)
const AuditLogPage = lazy(() =>
  import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

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

      <Route
        path="/t/:id/admin"
        element={
          <Protected>
            <TournamentAdminPage />
          </Protected>
        }
      />
      <Route
        path="/t/:id/matches/new"
        element={
          <Protected>
            <MatchCreatePage />
          </Protected>
        }
      />

      <Route
        path="/t/:id/matches/:matchId"
        element={
          <Protected>
            <MatchScorePage />
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
        path="/t/:id/standings"
        element={
          <Protected>
            <StandingsPage />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
