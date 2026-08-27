import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line)
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!
const APP = 'http://localhost:5175'

const stamp = Date.now()
const EMAIL = `dbgcourt-${stamp}@smashtest.local`
const PASSWORD = 'shots-pw-1234!'

async function auth(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await res.json()
}
async function rpc(token: string, fn: string, args: unknown): Promise<any> {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}
function storageKey(): string {
  const ref = new URL(URL_BASE).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

async function main() {
  const signup = await auth('signup', { email: EMAIL, password: PASSWORD, data: { name: '운영진' } })
  let session = signup.session
  if (!session) session = await auth('token?grant_type=password', { email: EMAIL, password: PASSWORD })
  const token = session.access_token
  const club = await rpc(token, 'create_club', { p_name: '디버그 동아리', p_display_name: '운영진' })
  const sess = await rpc(token, 'create_session', { p_name: '오늘 저녁 모임', p_display_name: '운영진', p_court_count: 4, p_club_id: club.id })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message))
  await page.goto(`${APP}/login`)
  await page.evaluate(([key, value]) => window.localStorage.setItem(key!, value!), [storageKey(), JSON.stringify(session)])
  await page.goto(`${APP}/t/${sess.id}/matches/new-session`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  const courtSection = await page.locator('section[aria-label="코트"]').count()
  console.log('court sections found:', courtSection)
  const html = await page.locator('section[aria-label="코트"]').innerHTML().catch((e) => 'ERR: ' + e.message)
  console.log('court section HTML:', html)

  await browser.close()
  await rpc(token, 'delete_club_cascade_stub', {}).catch(() => {})
  await fetch(`${URL_BASE}/rest/v1/tournaments?id=eq.${sess.id}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  await fetch(`${URL_BASE}/rest/v1/clubs?id=eq.${club.id}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
}
main().catch((e) => { console.error(e); process.exit(1) })
