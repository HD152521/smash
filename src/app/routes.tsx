import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { HomePage } from '@/pages/HomePage'
import { CreateTournamentPage } from '@/pages/CreateTournamentPage'
import { JoinTournamentPage } from '@/pages/JoinTournamentPage'
import { MyTournamentsPage } from '@/pages/MyTournamentsPage'
import { TournamentPage } from '@/pages/TournamentPage'
import { TournamentSetupPage } from '@/pages/TournamentSetupPage'
import { TournamentSettingsPage } from '@/pages/TournamentSettingsPage'
import { TournamentAdminPage } from '@/pages/TournamentAdminPage'
import { MatchCreatePage } from '@/pages/MatchCreatePage'
import { MatchScorePage } from '@/pages/MatchScorePage'
import { LiveBoardPage } from '@/pages/LiveBoardPage'
import { AuditLogPage } from '@/pages/AuditLogPage'

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
          <RequireAuth>
            <CreateTournamentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join"
        element={
          <RequireAuth>
            <JoinTournamentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/my"
        element={
          <RequireAuth>
            <MyTournamentsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/t/:id"
        element={
          <RequireAuth>
            <TournamentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/t/:id/setup"
        element={
          <RequireAuth>
            <TournamentSetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/t/:id/settings"
        element={
          <RequireAuth>
            <TournamentSettingsPage />
          </RequireAuth>
        }
      />

      <Route
        path="/t/:id/admin"
        element={
          <RequireAuth>
            <TournamentAdminPage />
          </RequireAuth>
        }
      />
      <Route
        path="/t/:id/matches/new"
        element={
          <RequireAuth>
            <MatchCreatePage />
          </RequireAuth>
        }
      />

      <Route
        path="/t/:id/matches/:matchId"
        element={
          <RequireAuth>
            <MatchScorePage />
          </RequireAuth>
        }
      />

      <Route
        path="/t/:id/live"
        element={
          <RequireAuth>
            <LiveBoardPage />
          </RequireAuth>
        }
      />

      <Route
        path="/t/:id/audit"
        element={
          <RequireAuth>
            <AuditLogPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
