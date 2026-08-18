import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        /**
         * 벤더 코드를 앱 코드와 분리한다.
         *
         * 총 바이트가 줄지는 않지만 두 가지가 좋아진다:
         *  · 앱을 배포해도 벤더 청크는 캐시가 살아 있다 (대회 중 재배포해도
         *    참가자 폰이 React 를 다시 받지 않는다)
         *  · 첫 방문에 병렬로 내려받는다
         *
         * ⚠ Rolldown 은 manualChunks 를 객체가 아니라 함수로 받는다.
         *   객체로 쓰면 'manualChunks is not a function' 으로 빌드가 깨진다.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          // 윈도우는 경로 구분자가 역슬래시라 먼저 통일한다
          const path = id.split('\\').join('/')
          if (
            path.includes('/node_modules/react/') ||
            path.includes('/node_modules/react-dom/') ||
            path.includes('/node_modules/react-router') ||
            path.includes('/node_modules/scheduler/')
          ) {
            return 'react'
          }
          if (path.includes('@supabase')) return 'supabase'
          if (path.includes('@tanstack')) return 'query'
          return 'vendor'
        },
      },
    },
    // 벤더를 나눈 뒤 남는 청크 기준. 이보다 커지면 다시 들여다볼 신호다.
    chunkSizeWarningLimit: 300,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      exclude: ['**/*.config.*', 'src/main.tsx', 'src/test/**', 'supabase/**', 'scripts/**'],
    },
  },
})
