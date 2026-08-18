import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from '@/types/database'

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      // 체육관 네트워크가 자주 끊긴다. 재연결을 공격적으로.
      params: { eventsPerSecond: 20 },
    },
  },
)
