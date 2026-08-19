/**
 * 알림 대상이 제대로 정해지는지 확인한다.
 *
 * 알림은 "안 왔다" 를 사후에 알아채기가 어렵다. 경기가 잡혔는데 선수
 * 폰이 안 울려도 아무도 오류를 못 본다. 그래서 '누구 앞으로 몇 개가
 * 쌓였나' 를 DB 에서 직접 세어 본다.
 *
 *   npm run db:smoke:notify
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!
const SECRET = env['SUPABASE_SECRET_KEY']!

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `\n     ${detail}` : ''}`)
}

async function rpc(token: string, fn: string, args: unknown) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null }
}

async function makeUser(db: Client, tag: string, name: string) {
  const email = `notify-${tag}-${Date.now()}@smashtest.local`
  const password = 'NotifyTest12345!'
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,
       email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,
       confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1,crypt($2,gen_salt('bf')),now(),now(),now(),
       '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('name',$3::text),
       '','','','','') returning id`,
    [email, password, name],
  )
  const uid = rows[0]!.id
  await db.query(
    `insert into auth.identities (id,user_id,identity_data,provider,provider_id,
       last_sign_in_at,created_at,updated_at)
     values (gen_random_uuid(),$1::uuid,jsonb_build_object('sub',$2::text,'email',$3::text),
       'email',$2::text,now(),now(),now())`,
    [uid, uid, email],
  )
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json()) as { access_token: string }
  return { email, uid, token: body.access_token, name }
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await db.connect()
const emails: string[] = []

try {
  const admin = await makeUser(db, 'admin', '관리자')
  const p: Awaited<ReturnType<typeof makeUser>>[] = []
  for (let i = 0; i < 4; i++) p.push(await makeUser(db, `p${i}`, `선수${i + 1}`))
  const ref = await makeUser(db, 'ref', '심판')
  const bystander = await makeUser(db, 'by', '무관한사람')
  emails.push(admin.email, ...p.map((x) => x.email), ref.email, bystander.email)

  const created = await rpc(admin.token, 'create_tournament', {
    p_name: '알림 테스트 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '관리자',
  })
  const t = created.body as unknown as { id: string; invite_code: string }
  for (const u of [...p, ref, bystander]) {
    await rpc(u.token, 'join_tournament', { p_code: t.invite_code })
  }

  const { rows: groups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  const { rows: members } = await db.query<{ id: string; user_id: string; display_name: string }>(
    `select id, user_id, display_name from tournament_members where tournament_id=$1`,
    [t.id],
  )
  const memberOf = (name: string) => members.find((m) => m.display_name === name)!
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    groups[0]!.id,
    [memberOf('선수1').id, memberOf('선수2').id],
  ])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    groups[1]!.id,
    [memberOf('선수3').id, memberOf('선수4').id],
  ])

  console.log('\n── 편성하면 관련된 사람에게만 쌓인다 ──')
  const match = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: groups[0]!.id,
    p_players_a: [memberOf('선수1').id, memberOf('선수2').id],
    p_group_b: groups[1]!.id,
    p_players_b: [memberOf('선수3').id, memberOf('선수4').id],
    p_referees: [memberOf('심판').id],
  })
  check('경기 편성', match.status === 200, `status=${match.status}`)
  const matchId = (match.body as unknown as { id: string }).id

  const { rows: box } = await db.query<{ user_id: string }>(
    `select user_id from notification_outbox where match_id=$1`,
    [matchId],
  )
  const notified = new Set(box.map((r) => r.user_id))
  check(
    '뛰는 선수 4명 모두에게 쌓인다',
    p.every((x) => notified.has(x.uid)),
    `쌓인 수 ${notified.size}`,
  )
  check('심판에게도 쌓인다', notified.has(ref.uid))
  check('상관없는 참가자에게는 안 쌓인다', !notified.has(bystander.uid))
  check(
    '편성한 본인에게는 안 쌓인다',
    !notified.has(admin.uid),
    '자기가 만든 걸 자기 폰이 알릴 이유가 없다',
  )
  check('사람 수만큼만 쌓인다 (중복 없음)', box.length === 5, `${box.length}건`)

  console.log('\n── 수동 기록은 알리지 않는다 ──')
  // 이미 끝난 경기를 장부에만 남기는 것이라 알릴 대상이 없다
  const manual = await rpc(admin.token, 'record_manual_match', {
    p_tournament_id: t.id,
    p_group_a: groups[0]!.id,
    p_players_a: [memberOf('선수1').id, memberOf('선수2').id],
    p_score_a: 21,
    p_group_b: groups[1]!.id,
    p_players_b: [memberOf('선수3').id, memberOf('선수4').id],
    p_score_b: 15,
    p_label: null,
  })
  const manualId = (manual.body as unknown as { id: string } | null)?.id
  const { rows: manualBox } = await db.query(
    `select 1 from notification_outbox where match_id=$1`,
    [manualId ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '수동 기록이 실제로 만들어졌다',
    manual.status === 200 && Boolean(manualId),
    `status=${manual.status} — 여기서 실패하면 아래 검사는 의미가 없다`,
  )
  check(
    '수동 기록은 알림을 만들지 않는다',
    Boolean(manualId) && manualBox.length === 0,
    `status=${manual.status} / ${manualBox.length}건`,
  )

  console.log('\n── 내 알림만 보인다 ──')
  const mine = await fetch(`${URL_BASE}/rest/v1/notification_outbox?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${p[0]!.token}` },
  })
  const mineRows = (await mine.json()) as unknown[]
  const others = await fetch(`${URL_BASE}/rest/v1/notification_outbox?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${bystander.token}` },
  })
  const otherRows = (await others.json()) as unknown[]
  check('선수는 자기 알림을 본다', mineRows.length === 1, `${mineRows.length}건`)
  check('무관한 사람에게는 아무것도 안 보인다', otherRows.length === 0, `${otherRows.length}건`)

  console.log('\n── 구독 정보 권한 ──')
  const sub = await fetch(`${URL_BASE}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${p[0]!.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: p[0]!.uid,
      endpoint: `https://example.com/ep-${Date.now()}`,
      p256dh: 'x',
      auth: 'y',
    }),
  })
  check('본인 구독은 등록된다', sub.status === 201, `status=${sub.status}`)

  const stealSub = await fetch(`${URL_BASE}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${bystander.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: p[0]!.uid,
      endpoint: `https://example.com/steal-${Date.now()}`,
      p256dh: 'x',
      auth: 'y',
    }),
  })
  check(
    '남의 이름으로 구독을 등록할 수 없다',
    stealSub.status >= 400,
    `status=${stealSub.status} — 되면 남의 알림을 가로챈다`,
  )

  const readOthers = await fetch(`${URL_BASE}/rest/v1/push_subscriptions?select=endpoint`, {
    headers: { apikey: ANON, Authorization: `Bearer ${bystander.token}` },
  })
  const readRows = (await readOthers.json()) as unknown[]
  check('남의 구독 정보는 읽을 수 없다', readRows.length === 0, `${readRows.length}건`)

  console.log('\n── 발송기 전용 함수는 잠겨 있다 ──')
  const peek = await rpc(p[0]!.token, 'pending_notifications', { p_limit: 10 })
  check(
    '일반 사용자는 발송 대기열을 볼 수 없다',
    peek.status >= 400,
    `status=${peek.status} — 열리면 남의 구독 키가 새어 나간다`,
  )

  const asService = await fetch(`${URL_BASE}/rest/v1/rpc/pending_notifications`, {
    method: 'POST',
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_limit: 100 }),
  })
  const pend = (await asService.json()) as { outbox_id: string; body: string; url: string }[]
  const forThisMatch = pend.filter((r) => r.url.includes(matchId))
  check(
    '발송기는 대기열을 읽는다',
    asService.status === 200 && forThisMatch.length === 5,
    `status=${asService.status} / 이 경기 ${forThisMatch.length}건`,
  )
  check(
    '알림 문구에 대진과 대회가 들어간다',
    Boolean(
      forThisMatch[0]?.body.includes('vs') && forThisMatch[0]?.body.includes('알림 테스트 대회'),
    ),
    forThisMatch[0]?.body ?? '(없음)',
  )
} finally {
  await db.query(
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  await db.query(`delete from auth.users where email = any($1)`, [emails])
  console.log(`\n🧹 테스트 계정 ${emails.length}개 정리 완료`)
  await db.end()
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
