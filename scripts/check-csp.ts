/**
 * vercel.json 의 CSP 가 실제로 앱이 접속하는 오리진과 맞는지 확인한다.
 *
 * 프로젝트 ref 가 CSP 에 하드코딩되어 있어서, Supabase 프로젝트를 옮기면
 * 조용히 깨진다. 로컬에서는 CSP 가 안 걸리므로 배포한 뒤에야 알게 되고,
 * 그때는 앱이 아무것도 못 한다 (모든 API 호출이 차단된다).
 *
 *   npm run check:csp
 */
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}

const supabaseUrl = env['VITE_SUPABASE_URL']
if (!supabaseUrl) {
  console.error('❌ .env.local 에 VITE_SUPABASE_URL 이 없습니다')
  process.exit(1)
}
const host = new URL(supabaseUrl).host

interface VercelConfig {
  headers?: { headers?: { key: string; value: string }[] }[]
}
const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig
const csp = cfg.headers
  ?.flatMap((h) => h.headers ?? [])
  .find((kv) => kv.key === 'Content-Security-Policy')?.value

if (!csp) {
  console.error('❌ vercel.json 에 Content-Security-Policy 가 없습니다')
  process.exit(1)
}

const problems: string[] = []
if (!csp.includes(`https://${host}`)) problems.push(`connect-src 에 https://${host} 가 없습니다`)
if (!csp.includes(`wss://${host}`)) problems.push(`connect-src 에 wss://${host} 가 없습니다 (Realtime)`)

// 옛 프로젝트 ref 가 남아 있는지
const refs = [...csp.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/g)].map((m) => m[1])
const current = host.split('.')[0]
const stale = [...new Set(refs)].filter((r) => r !== current)
if (stale.length > 0) problems.push(`옛 프로젝트 ref 가 남아 있습니다: ${stale.join(', ')}`)

if (problems.length > 0) {
  console.error('❌ CSP 가 실제 오리진과 맞지 않습니다. 배포하면 모든 API 호출이 차단됩니다.')
  for (const p of problems) console.error(`   · ${p}`)
  process.exit(1)
}

console.log(`✅ CSP 가 ${host} 와 일치합니다 (REST + Realtime)`)
