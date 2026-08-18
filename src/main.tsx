import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AppRoutes } from '@/app/routes'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 체육관 네트워크는 자주 끊긴다. 창을 다시 볼 때마다 조용히 최신화한다.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 10_000,
      retry: 2,
    },
    mutations: { retry: 0 },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
