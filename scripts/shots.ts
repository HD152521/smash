/*
 * 화면을 눈으로 보기 위한 장치.
 *
 * 이 앱의 문제는 "기능이 되나" 가 아니라 "쓸 만한가" 이고, 그건 코드를 읽어서는
 * 안 보인다. 실제로 로그인한 상태의 화면을 찍어 놓고 봐야 한다.
 *
 * 검증(smoke)과 달리 통과/실패를 내지 않는다. 그냥 찍는다.
 *
 *   npx tsx scripts/shots.ts            기본 세트
 *   npx tsx scripts/shots.ts --wide     데스크톱 폭도 함께
 *
 * 만든 데이터는 지운다. 프로덕션에 붙으므로 남기면 실제 명단이 더러워진다.
 */
import { chromium, type Page } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

// ── 환경 ────────────────────────────────────────────────────────────
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line)
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!
const APP = process.env['APP_URL'] ?? 'http://localhost:5175'
const OUT = 'shots'

const stamp = Date.now()
const EMAIL = `shots-${stamp}@smashtest.local`
const PASSWORD = 'shots-pw-1234!'

interface Session {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: string
  user: unknown
}

async function auth(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as Record<string, unknown>
}

async function rpc(token: string, fn: string, args: unknown): Promise<unknown> {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/*
 * Supabase 클라이언트는 세션을 localStorage 에 둔다. 키 이름은 프로젝트 ref 에서
 * 나온다 — 브라우저에서 로그인 화면을 거치지 않고 바로 안쪽 화면을 찍으려면
 * 이 값을 직접 심어야 한다.
 */
function storageKey(): string {
  const ref = new URL(URL_BASE).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

async function shoot(page: Page, path: string, name: string, wide = false) {
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' })
  // 데이터가 붙고 스켈레톤이 걷힐 시간을 준다
  await page.waitForTimeout(1200)
  const file = `${OUT}/${name}${wide ? '-wide' : ''}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(`  ${file}`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  console.log('계정 만들는 중…')
  const signup = await auth('signup', {
    email: EMAIL,
    password: PASSWORD,
    data: { name: '운영진' },
  })
  let session = signup['session'] as Session | null
  if (!session) {
    session = (await auth('token?grant_type=password', {
      email: EMAIL,
      password: PASSWORD,
    })) as unknown as Session
  }
  const token = session.access_token

  console.log('데모 데이터 만드는 중…')
  const club = (await rpc(token, 'create_club', {
    p_name: '스크린샷 동아리',
    p_display_name: '운영진',
  })) as { id: string }

  const sess = (await rpc(token, 'create_session', {
    p_name: '오늘 저녁 모임',
    p_display_name: '운영진',
    p_court_count: 4,
    p_club_id: club.id,
  })) as { id: string }

  // 사람이 있어야 화면이 실제 모습에 가까워진다
  const names = ['김민수', '이서연', '박지훈', '최유진', '정하늘', '강도윤', '윤채원', '임태호']
  for (const n of names) {
    await rpc(token, 'add_roster_member', { p_tournament_id: sess.id, p_name: n })
  }

  console.log('브라우저 띄우는 중…')
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()

  // 세션 주입 — 로그인 화면을 거치지 않는다
  await page.goto(`${APP}/login`)
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [storageKey(), JSON.stringify(session)],
  )

  console.log('찍는 중…')
  await shoot(page, '/', 'home')
  await shoot(page, `/t/${sess.id}`, 'court')
  await shoot(page, `/t/${sess.id}/matches/new-session`, 'match-create')
  await shoot(page, `/t/${sess.id}/schedule`, 'schedule')
  await shoot(page, `/t/${sess.id}/members`, 'members')
  await shoot(page, `/clubs`, 'clubs')
  await shoot(page, `/c/${club.id}`, 'club')

  await browser.close()

  console.log('정리 중…')
  await rpc(token, 'delete_club_cascade_stub', {}).catch(() => {})
  await fetch(`${URL_BASE}/rest/v1/tournaments?id=eq.${sess.id}`, {
    method: 'DELETE',
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  await fetch(`${URL_BASE}/rest/v1/clubs?id=eq.${club.id}`, {
    method: 'DELETE',
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  console.log(`\n${OUT}/ 에 저장했습니다. 계정: ${EMAIL}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
