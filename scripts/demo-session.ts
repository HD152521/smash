/**
 * 자동 예약을 **눈으로 보기 위한** 모임 하나.
 *
 * 자동 예약(`src/lib/autoQueue.ts`)이 잘 되는지는 코드로 확인이 안 된다.
 * "코트마다 다음 경기가 하나씩 걸려 있다" 는 화면을 봐야 알고, "적게 친
 * 사람이 먼저 들어간다" 는 판수가 서로 다른 열두 명이 있어야 보인다.
 *
 *   npx tsx scripts/demo-session.ts          만들고 로그인 정보를 출력
 *   npx tsx scripts/demo-session.ts --clean  이 스크립트가 만든 것만 지운다
 *
 * ── ⚠ 프로덕션 DB 에 만들어진다 ────────────────────────────────────
 *
 * 로컬 DB 가 없다. 그래서 세 가지를 지킨다.
 *
 *   1. **이름에 표식.** 계정은 `demo-session-<시각>@smashtest.local`,
 *      모임은 `[데모] …`, 사람은 `데모…` 다. 실제 명단과 섞이면 누가 진짜
 *      회원인지 알 수 없게 된다.
 *   2. **만든 것을 적어 둔다.** `scripts/_demo-session.json` 에 이번 실행이
 *      만든 id 를 남기고, `--clean` 은 **그 파일에 적힌 것만** 지운다.
 *      ⚠ `@smashtest.local` 계정 중에는 `db:seed` 가 심은, 실제 대회 명단에
 *      들어가 있는 `seed-N@…` 이 있다. 도메인이나 이름으로 지우면 그것까지
 *      날아간다 — **이름만 보고 지우지 않는다.**
 *   3. **중간에 죽어도 지울 수 있게.** 계정을 만든 직후부터 한 단계마다
 *      기록 파일을 갱신한다. 모임을 만들다 실패해도 `--clean` 이 계정을
 *      찾아 지운다.
 *
 * 정리 방식은 `scripts/smoke-grade.ts` 의 teardown 을 따른다 — 삭제 전 id
 * 확보 → 단계별 try/catch → 재시도 → 마지막 잔여 재조회.
 */
import { Client } from 'pg'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

// ── 환경 ────────────────────────────────────────────────────────────
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!

const MANIFEST = 'scripts/_demo-session.json'
const PASSWORD = 'DemoSession12345!'

interface Manifest {
  email: string
  password: string
  /** 만들다 실패한 단계는 비어 있다 — `--clean` 은 있는 것만 지운다 */
  clubId?: string
  tournamentId?: string
  createdAt: string
}

function saveManifest(m: Manifest): void {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2), 'utf8')
}

function loadManifest(): Manifest | null {
  if (!existsSync(MANIFEST)) return null
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
}

// ── 서버 부르기 ─────────────────────────────────────────────────────
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
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})

/**
 * 열두 명 — 급수를 골고루 흩어 놓는다.
 *
 * 급수가 전원 같으면 2단계(급수 맞추기)가 화면에서 안 보이고, 전원 비어
 * 있으면 '급수를 모르는 사람도 후보다' 가 안 보인다. **급수 없는 사람 둘**
 * 이 중요하다 — 실제 동아리에서 급수는 선택 입력이라 늘 비어 있는 사람이
 * 있고, 그 사람이 편성에서 빠지면 앱을 안 쓰게 된다.
 *
 * (지시받은 분포는 열넷이 되어 열둘에 맞게 B·C 를 한 명씩 줄였다. 골고루
 *  + 급수 없는 둘 이라는 뜻은 그대로다.)
 */
const ROSTER: readonly { name: string; grade: string | null }[] = [
  { name: '데모김민수', grade: 'S' },
  { name: '데모이서연', grade: 'A' },
  { name: '데모박지훈', grade: 'A' },
  { name: '데모최유진', grade: 'B' },
  { name: '데모정하늘', grade: 'B' },
  { name: '데모강도윤', grade: 'B' },
  { name: '데모윤채원', grade: 'C' },
  { name: '데모임태호', grade: 'C' },
  { name: '데모오세훈', grade: 'D' },
  { name: '데모신유진', grade: 'beginner' },
  { name: '데모배준호', grade: null },
  { name: '데모문가영', grade: null },
]

async function main(): Promise<void> {
  await db.connect()
  try {
    if (process.argv.includes('--clean')) await clean()
    else await create()
  } finally {
    try {
      await db.end()
    } catch {
      // 연결 종료 실패가 위에서 찍은 결과 보고를 덮지 않게 한다
    }
  }
}

// ── 만들기 ──────────────────────────────────────────────────────────
async function create(): Promise<void> {
  const existing = loadManifest()
  if (existing) {
    console.log(`⚠️ 이미 만들어 둔 데모가 있습니다 (${existing.email}).`)
    console.log('   먼저 지우세요:  npx tsx scripts/demo-session.ts --clean')
    process.exitCode = 1
    return
  }

  const email = `demo-session-${Date.now()}@smashtest.local`
  const manifest: Manifest = { email, password: PASSWORD, createdAt: new Date().toISOString() }

  console.log('계정 만드는 중…')
  const token = await signUp(email)
  saveManifest(manifest)

  console.log('동아리 · 모임 만드는 중…')
  const club = (await rpc(token, 'create_club', {
    p_name: '[데모] 배드민턴 동아리',
    p_display_name: '데모운영진',
  })) as { id: string }
  manifest.clubId = club.id
  saveManifest(manifest)

  const session = (await rpc(token, 'create_session', {
    p_name: '[데모] 자동 예약 보기',
    p_display_name: '데모운영진',
    p_court_count: 3,
    p_club_id: club.id,
    // 30분 전에 시작한 것으로 — 화면이 참가 신청이 아니라 코트 현황을 그린다
    p_starts_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  })) as { id: string }
  manifest.tournamentId = session.id
  saveManifest(manifest)

  console.log(`명단 ${ROSTER.length}명 넣는 중…`)
  const memberId = await addRoster(token, session.id)

  console.log('지난 경기 만드는 중…')
  await playPast(token, session.id, memberId)

  report(email, session.id)
}

/** 계정 하나. 메일 확인이 걸려 있으면 브라우저로 못 들어가므로 DB 로 풀어 준다 */
async function signUp(email: string): Promise<string> {
  const signup = await auth('signup', {
    email,
    password: PASSWORD,
    data: { name: '데모운영진' },
  })
  await db.query(
    `update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now())
     where email = $1`,
    [email],
  )
  const session = signup['session'] as { access_token: string } | null
  if (session?.access_token) return session.access_token

  const login = (await auth('token?grant_type=password', { email, password: PASSWORD })) as {
    access_token?: string
  }
  if (!login.access_token) throw new Error(`로그인 실패: ${JSON.stringify(login)}`)
  return login.access_token
}

/**
 * 명단 열두 명 + 급수.
 *
 * `add_roster_member` 는 급수를 안 받는다(계정 없이 올리는 경로라 복사할
 * 프로필이 없다). 데모는 급수가 있어야 편성 규칙이 보이므로 넣은 뒤
 * 직접 채운다 — 데모 전용이라 스키마를 건드리지 않는다.
 */
async function addRoster(token: string, tournamentId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  for (const person of ROSTER) {
    const row = (await rpc(token, 'add_roster_member', {
      p_tournament_id: tournamentId,
      p_name: person.name,
    })) as { id: string }
    byName.set(person.name, row.id)
    if (person.grade) {
      await db.query(`update tournament_members set grade = $1::player_grade where id = $2`, [
        person.grade,
        row.id,
      ])
    }
  }
  return byName
}

/**
 * 판수를 사람마다 다르게 만든다 — **이게 이 데모의 본론이다.**
 *
 * 전원이 0판이면 "적게 친 사람 먼저" 가 화면에서 안 보인다. 두 판 친
 * 넷 · 한 판 친 넷 · 아직 못 친 넷을 만들어 두면, 자동 예약이 고른
 * 네 명이 왜 그 네 명인지 코트 화면에서 바로 읽힌다.
 *
 * 마지막 한 경기는 **진행 중으로 남긴다.** 코트 하나는 뛰는 중, 둘은
 * 비어 있는 상태가 이 앱의 평상시 모습이고, 뛰는 사람이 자동 예약 후보에서
 * 빠지는 것(`busy.ts`)도 그때만 보인다.
 */
async function playPast(
  token: string,
  tournamentId: string,
  member: Map<string, string>,
): Promise<void> {
  const courts = (
    await db.query<{ id: string }>(
      `select id from courts where tournament_id = $1 order by sort_order`,
      [tournamentId],
    )
  ).rows
  const id = (name: string) => member.get(name)!
  const P = ROSTER.map((r) => r.name)

  // 1·2번은 두 판, 3~6번은 한 판, 7~12번은 아직 0판
  await runMatch(token, tournamentId, courts[0]!.id, [P[0]!, P[1]!], [P[2]!, P[3]!], id, 'finish')
  await runMatch(token, tournamentId, courts[1]!.id, [P[0]!, P[1]!], [P[4]!, P[5]!], id, 'finish')
  // 3·4번이 지금 1번 코트에서 뛰는 중 — 자동 예약 후보에서 빠진다
  await runMatch(token, tournamentId, courts[0]!.id, [P[2]!, P[3]!], [P[6]!, P[7]!], id, 'live')
}

async function runMatch(
  token: string,
  tournamentId: string,
  courtId: string,
  a: readonly string[],
  b: readonly string[],
  id: (name: string) => string,
  end: 'finish' | 'live',
): Promise<void> {
  const match = (await rpc(token, 'create_session_match', {
    p_tournament_id: tournamentId,
    p_court_id: courtId,
    p_players_a: a.map(id),
    p_players_b: b.map(id),
    p_label: null,
  })) as { id: string }
  await rpc(token, 'start_match', { p_match_id: match.id })
  // 모임은 점수를 안 세고 끝낼 수 있다 (finish_match 의 scored=false 경로)
  if (end === 'finish') await rpc(token, 'finish_match', { p_match_id: match.id })
}

function report(email: string, tournamentId: string): void {
  const app = process.env['APP_URL'] ?? 'http://localhost:5174'
  console.log('\n════════════════════════════════════════════════')
  console.log('  데모 모임이 준비됐습니다')
  console.log('════════════════════════════════════════════════')
  console.log(`  주소     ${app}/t/${tournamentId}`)
  console.log(`  이메일   ${email}`)
  console.log(`  비밀번호 ${PASSWORD}`)
  console.log('')
  console.log('  코트 3개 · 명단 12명 · 지난 경기 3판(1판은 진행 중)')
  console.log('  로그인하면 코트마다 [자동] 대기 경기가 하나씩 걸립니다.')
  console.log('  오른쪽 위 "자동 예약 켬" 을 누르면 꺼집니다.')
  console.log('')
  console.log('  다 보고 나면:  npx tsx scripts/demo-session.ts --clean')
  console.log('════════════════════════════════════════════════\n')
}

// ── 지우기 ──────────────────────────────────────────────────────────
/**
 * 기록 파일에 적힌 것만 지운다.
 *
 * `tournaments.owner_id` · `clubs.owner_id` 가 둘 다 `on delete restrict` 라
 * **계정보다 모임·동아리를 먼저** 지워야 한다. 순서를 바꾸면 정리가 통째로
 * 실패한다 (smoke-grade.ts 에서 한 번 겪은 사고다).
 */
async function clean(): Promise<void> {
  const m = loadManifest()
  if (!m) {
    console.log('지울 데모가 없습니다 (scripts/_demo-session.json 이 없음).')
    return
  }
  console.log(`정리 대상: ${m.email}`)

  const tours = m.tournamentId ? [m.tournamentId] : []
  const clubs = m.clubId ? [m.clubId] : []
  const delTours = await sweep('모임', `delete from tournaments where id = any($1::uuid[])`, [
    tours,
  ])
  const delClubs = await sweep('동아리', `delete from clubs where id = any($1::uuid[])`, [clubs])
  const delUsers = await sweep('계정', `delete from auth.users where email = $1`, [m.email])
  console.log(`🧹 정리 — 모임 ${delTours}건 · 동아리 ${delClubs}건 · 계정 ${delUsers}건`)

  const gone = await verifyGone(m.email, tours, clubs)
  if (gone) rmSync(MANIFEST, { force: true })
  else process.exitCode = 1
}

/** pooler 의 간헐적 끊김은 재시도로 넘긴다. 실패해도 다음 단계는 돌아야 한다 */
async function sweep(label: string, sql: string, params: unknown[]): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await db.query(sql, params)
      return r.rowCount ?? 0
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      if (attempt === 3) {
        console.log(`⚠️ 정리 실패(${label}): ${detail}`)
        return -1
      }
      console.log(`   정리 재시도 ${attempt}/2 (${label}): ${detail}`)
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
  return -1
}

/** "지웠다" 와 "안 남았다" 는 다른 이야기다 — 다시 조회해서 눈으로 본다 */
async function verifyGone(email: string, tours: string[], clubs: string[]): Promise<boolean> {
  try {
    const { rows } = await db.query<{ users: number; clubs: number; tours: number }>(
      `select (select count(*) from auth.users  where email = $1)::int            as users,
              (select count(*) from clubs       where id = any($2::uuid[]))::int  as clubs,
              (select count(*) from tournaments where id = any($3::uuid[]))::int  as tours`,
      [email, clubs, tours],
    )
    const rest = rows[0]!
    const gone = rest.users === 0 && rest.clubs === 0 && rest.tours === 0
    console.log(
      gone
        ? '🧹 잔여 확인: 계정 0 · 동아리 0 · 모임 0 — 프로덕션에 남은 것이 없다'
        : `🚨 잔여: 계정 ${rest.users} · 동아리 ${rest.clubs} · 모임 ${rest.tours} — 손으로 지워야 한다`,
    )
    return gone
  } catch (err) {
    console.log(`🚨 잔여 확인 자체가 실패 — 남았는지 알 수 없다: ${String(err)}`)
    return false
  }
}

await main()
