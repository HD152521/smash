import { z } from 'zod'

/**
 * 환경변수는 시스템 경계다. 앱이 뜨는 시점에 한 번 검증하고,
 * 이후로는 타입이 보장된 값만 쓴다. 런타임 중간에 undefined 로 터지는 걸 막는다.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL 이 올바른 URL 이 아닙니다'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY 가 비어 있습니다'),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `  · ${i.message}`).join('\n')
  throw new Error(`환경변수 설정이 올바르지 않습니다. .env.local 을 확인하세요.\n${detail}`)
}

export const env = parsed.data
