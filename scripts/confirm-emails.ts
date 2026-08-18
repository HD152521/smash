/**
 * 이메일 미인증 계정을 전부 확인 처리한다.
 *
 * 이 앱은 초대 코드 + RLS 가 실제 접근 통제라 이메일 검증이 보태는 게 없다.
 * 게다가 Supabase 내장 메일은 시간당 몇 통이 한도라, 개발 중에 가입을
 * 몇 번만 시도해도 막힌다.
 *
 * 근본 해결은 대시보드에서 Confirm email 을 끄는 것이고,
 * 이 스크립트는 그 전에 이미 막힌 계정을 푸는 용도다.
 *
 *   npm run db:confirm
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}

const client = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const { rows } = await client.query(
  `update auth.users
      set email_confirmed_at = now(),
          confirmation_token = ''
    where email_confirmed_at is null
    returning email`,
)

if (rows.length === 0) {
  console.log('✅ 미인증 계정이 없습니다')
} else {
  console.log(`✅ ${rows.length}개 계정을 인증 처리했습니다`)
  for (const r of rows) console.log(`   · ${r.email}`)
}

await client.end()
