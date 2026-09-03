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
    /*
     * 시간대를 한국으로 못 박는다.
     *
     * 이 앱의 날짜 판단은 전부 **기기 시간대**로 한다 — 서버는 시각을
     * 판단하지 않는다는 규율(`src/lib/rsvp.ts` `hasStarted`)의 뒷면이다.
     * 캘린더가 격자의 칸을 나누는 것도 로컬 시각이다(`src/lib/calendar.ts`).
     *
     * 그 말은 **테스트 결과가 도는 기기의 시간대에 따라 갈린다**는 뜻이다.
     * 새벽 1시 모임은 KST 로는 그 날이고 UTC 로는 전날이다. 한국 노트북에서는
     * 통과하고 CI(대개 UTC)에서만 깨지는, 제일 찾기 싫은 종류의 실패가
     * 정확히 여기서 나온다.
     *
     * 그래서 사용자가 실제로 서 있는 시간대 하나로 고정한다. 이 값을 바꾸면
     * `src/lib/calendar.test.ts` 의 날짜 경계 테스트가 곧바로 걸린다.
     */
    env: { TZ: 'Asia/Seoul' },
    // 기본값이면 vitest 가 CSS import 를 빈 문자열로 바꿔치기한다.
    // 명암비 테스트가 index.css 를 ?raw 로 읽어 토큰을 직접 검사하므로 필요하다.
    css: true,
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      exclude: ['**/*.config.*', 'src/main.tsx', 'src/test/**', 'supabase/**', 'scripts/**'],
    },
  },
})
