/**
 * 인증 + 권한 모델을 실제 DB 에 대고 검증한다.
 *
 * "RLS 정책이 존재한다"(verify-schema) 와 "실제로 막힌다" 는 다른 이야기다.
 * 여기서는 진짜 사용자 두 명을 만들어서, 남의 대회가 실제로 안 보이는지
 * 일반 회원이 관리자 API 를 못 부르는지를 요청 단위로 확인한다.
 *
 * 테스트 계정은 끝나면 지운다 (cascade 로 대회까지 함께 삭제된다).
 *
 *   npm run db:smoke
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim()
  }
  return out
}

const env = loadEnv()
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `\n     ${detail}` : ''}`)
}

async function authFetch(path: string, body: unknown) {
  const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** 로그인한 사용자로 RPC 를 호출한다 — 앱이 하는 것과 정확히 같은 경로 */
async function rpc(token: string, fn: string, args: unknown) {
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
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

/** 로그인한 사용자로 테이블을 조회한다 — RLS 가 적용되는 경로 */
async function select(token: string, path: string) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  return { status: res.status, body: (await res.json()) as unknown[] }
}

/**
 * 테스트 계정을 DB 에 직접 만든다.
 *
 * 가입 API 를 쓰지 않는 이유:
 *   - Supabase 가 example.com 같은 도메인을 거부한다
 *   - 실제 도메인을 쓰면 확인 메일이 나가고 무료 플랜 발송 한도를 깎는다
 *   - 이메일 확인 설정에 테스트가 흔들린다
 * 로그인은 실제 API 로 하므로, 검증하려는 경로(JWT + RLS)는 그대로 지난다.
 */
async function makeUser(db: Client, tag: string, name: string) {
  const email = `smoke-${tag}-${Date.now()}@smashtest.local`
  const password = 'SmokeTest12345!'

  const { rows } = await db.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data,
       -- GoTrue 는 이 토큰 컬럼들을 Go 문자열로 읽는다.
       -- NULL 이면 로그인 시 "Database error querying schema" 500 이 난다.
       confirmation_token, recovery_token, email_change,
       email_change_token_new, email_change_token_current
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated', $1, crypt($2, gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('name', $3::text),
       '', '', '', '', ''
     ) returning id`,
    [email, password, name],
  )
  const userId = rows[0].id as string

  // GoTrue 는 비밀번호 로그인 시 identities 를 함께 본다
  await db.query(
    `insert into auth.identities (
       id, user_id, identity_data, provider, provider_id,
       last_sign_in_at, created_at, updated_at
     ) values (
       gen_random_uuid(), $1::uuid,
       jsonb_build_object('sub', $2::text, 'email', $3::text),
       'email', $2::text, now(), now(), now()
     )`,
    [userId, userId, email],
  )

  const signin = await authFetch('token?grant_type=password', { email, password })
  if (signin.status >= 400)
    throw new Error(`로그인 실패(${signin.status}): ${JSON.stringify(signin.body)}`)

  return { email, token: signin.body['access_token'] as string }
}

async function main() {
  const db = new Client({
    connectionString: env['SUPABASE_DB_URL'],
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  const emails: string[] = []

  try {
    // ── 가입 & profiles 트리거 ────────────────────────────────────────
    const alice = await makeUser(db, 'alice', '앨리스')
    emails.push(alice.email)
    check('이메일 가입 + 로그인', Boolean(alice.token))

    const { rows: profs } = await db.query(
      `select name from profiles where id = (select id from auth.users where email = $1)`,
      [alice.email],
    )
    check(
      'auth.users 트리거가 profiles 를 만들었는가',
      profs.length === 1 && profs[0].name === '앨리스',
      `profiles.name = ${profs[0]?.name ?? '(없음)'}`,
    )

    // ── 대회 생성 (조 4개, 조커 2개) ──────────────────────────────────
    const created = await rpc(alice.token, 'create_tournament', {
      p_name: '스모크 테스트 대회',
      p_description: null,
      p_group_count: 4,
      p_joker_group_count: 2,
      p_display_name: '앨리스',
    })
    check('대회 생성 RPC', created.status === 200, `status=${created.status}`)
    const tournament = created.body as { id: string; invite_code: string }

    const { rows: groups } = await db.query(
      `select name, is_joker from groups where tournament_id = $1 order by sort_order`,
      [tournament.id],
    )
    check(
      '조 4개가 생기고 1~2조만 조커인가',
      groups.length === 4 &&
        groups[0].is_joker === true &&
        groups[1].is_joker === true &&
        groups[2].is_joker === false &&
        groups[3].is_joker === false,
      groups.map((g) => `${g.name}${g.is_joker ? '🃏' : ''}`).join(' '),
    )

    check(
      '초대 코드가 혼동 문자를 피했는가',
      /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(tournament.invite_code),
      `code = ${tournament.invite_code}`,
    )

    // ── RLS: 남의 대회는 안 보인다 ────────────────────────────────────
    const bob = await makeUser(db, 'bob', '밥')
    emails.push(bob.email)

    const bobSees = await select(bob.token, `tournaments?id=eq.${tournament.id}`)
    check(
      '참가하지 않은 사람에게 대회가 보이지 않는가 (RLS)',
      Array.isArray(bobSees.body) && bobSees.body.length === 0,
      `조회 결과 ${Array.isArray(bobSees.body) ? bobSees.body.length : '?'}건`,
    )

    // ── 잘못된 코드 ───────────────────────────────────────────────────
    // join_tournament 은 예외를 던지지 않는다 — 던지면 트랜잭션이 롤백되면서
    // 브루트포스 시도 기록까지 사라져 차단 카운터가 무력화된다.
    const wrong = await rpc(bob.token, 'join_tournament', { p_code: 'ZZZZZZ' })
    check(
      '없는 코드로는 참가할 수 없다',
      wrong.body?.ok === false && wrong.body?.error === 'not_found',
      `error=${String(wrong.body?.error ?? '(없음)')} ${String(wrong.body?.message ?? '').slice(0, 30)}`,
    )

    // ── 정상 참가 ─────────────────────────────────────────────────────
    const joined = await rpc(bob.token, 'join_tournament', {
      p_code: tournament.invite_code,
      p_display_name: '밥',
    })
    check('초대 코드로 참가', joined.body?.ok === true, `status=${joined.status}`)

    const bobSeesNow = await select(bob.token, `tournaments?id=eq.${tournament.id}`)
    check(
      '참가 후에는 대회가 보인다',
      Array.isArray(bobSeesNow.body) && bobSeesNow.body.length === 1,
    )

    // 멱등: 같은 코드를 또 넣어도 중복 참가가 안 생긴다
    await rpc(bob.token, 'join_tournament', { p_code: tournament.invite_code })
    const { rows: memberCount } = await db.query(
      `select count(*)::int as n from tournament_members where tournament_id = $1`,
      [tournament.id],
    )
    check(
      '같은 코드를 다시 넣어도 중복 참가되지 않는다',
      memberCount[0].n === 2,
      `멤버 ${memberCount[0].n}명`,
    )

    // ── 권한: 일반 회원은 관리자 기능을 쓸 수 없다 ────────────────────
    const bobTriesAdmin = await rpc(bob.token, 'regenerate_invite_code', {
      p_tournament_id: tournament.id,
    })
    check(
      '일반 회원은 초대 코드를 재발급할 수 없다',
      bobTriesAdmin.status >= 400,
      `status=${bobTriesAdmin.status}`,
    )

    const bobTriesCourt = await fetch(`${URL_BASE}/rest/v1/courts`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${bob.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tournament_id: tournament.id, name: '1번 코트', sort_order: 1 }),
    })
    check(
      '일반 회원은 코트를 만들 수 없다 (RLS)',
      bobTriesCourt.status >= 400,
      `status=${bobTriesCourt.status}`,
    )

    // ── score_events 직접 삽입 차단 ───────────────────────────────────
    const forge = await fetch(`${URL_BASE}/rest/v1/score_events`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${bob.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        match_id: '00000000-0000-0000-0000-000000000000',
        side: 'A',
        delta: 1,
        client_event_id: 'forged-event-0001',
      }),
    })
    check('score_events 에 직접 점수를 넣을 수 없다', forge.status >= 400, `status=${forge.status}`)

    // ── 감사 로그 위조 차단 ───────────────────────────────────────────
    const forgeAudit = await rpc(bob.token, 'log_audit', {
      p_tid: tournament.id,
      p_action: 'forged',
      p_target_type: 'tournament',
      p_target_id: tournament.id,
      p_before: null,
      p_after: null,
    })
    check('감사 로그를 위조할 수 없다', forgeAudit.status >= 400, `status=${forgeAudit.status}`)

    // ── 남의 프로필은 안 보인다 ───────────────────────────────────────
    const bobSeesProfiles = await select(bob.token, 'profiles?select=id,email')
    check(
      '다른 사람의 프로필(이메일)이 보이지 않는다',
      Array.isArray(bobSeesProfiles.body) && bobSeesProfiles.body.length === 1,
      `조회된 프로필 ${Array.isArray(bobSeesProfiles.body) ? bobSeesProfiles.body.length : '?'}건 (본인만이어야 함)`,
    )

    // ── 조 선택 ───────────────────────────────────────────────────────
    const jokerGroup = await db.query(
      `select id from groups where tournament_id = $1 and is_joker order by sort_order limit 1`,
      [tournament.id],
    )
    const setGroup = await rpc(bob.token, 'set_my_group', {
      p_tournament_id: tournament.id,
      p_group_id: jokerGroup.rows[0].id,
    })
    check('본인 조 선택', setGroup.status === 200, `status=${setGroup.status}`)

    // 다른 대회의 조는 고를 수 없어야 한다
    const otherGroup = await rpc(bob.token, 'set_my_group', {
      p_tournament_id: tournament.id,
      p_group_id: '00000000-0000-0000-0000-000000000000',
    })
    check(
      '이 대회의 조가 아니면 선택할 수 없다',
      otherGroup.status >= 400,
      `status=${otherGroup.status}`,
    )
  } finally {
    if (emails.length) {
      // tournaments.owner_id 는 on delete restrict 라 대회를 먼저 지워야 한다.
      // (창설자가 탈퇴해도 대회 기록이 사라지지 않게 하려는 의도적 제약)
      await db.query(
        `delete from tournaments
         where owner_id in (select id from auth.users where email = any($1))`,
        [emails],
      )
      await db.query(`delete from auth.users where email = any($1)`, [emails])
      console.log(`\n🧹 테스트 계정 ${emails.length}개 + 대회 삭제 완료`)
    }
    await db.end()
  }

  console.log(`\n${passed}/${passed + failed} 통과`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('\n실행 실패:', err instanceof Error ? err.message : err)
  process.exit(1)
})
