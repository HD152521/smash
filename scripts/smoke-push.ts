/**
 * 발송기가 실제로 서명·암호화해서 푸시 서비스까지 닿는지 확인한다.
 *
 * 브라우저 알림 권한 없이는 진짜 구독을 만들 수 없다. 그래서 진짜 ECDH
 * 키쌍으로 '형식은 완전히 올바른' 가짜 구독을 만든다.
 * 이러면 web-push 가 로컬에서 튕기지 않고 실제로 FCM 에 POST 하므로,
 * VAPID 서명과 페이로드 암호화가 맞는지까지 검증된다.
 * 엔드포인트가 가짜라 FCM 은 404 를 준다 — 그게 '닿았다' 는 증거다.
 */
import { Client } from 'pg'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(l.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}
const URL_BASE = env['VITE_SUPABASE_URL']!
const ANON = env['VITE_SUPABASE_PUBLISHABLE_KEY']!
const PW = 'PushE2E12345!'

const b64 = (b: Buffer) => b.toString('base64')

async function rpc(token: string, fn: string, args: unknown) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn} ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function makeUser(db: Client, tag: string, name: string) {
  const email = `pushe2e-${tag}-${Date.now()}@smashtest.local`
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,
       email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,
       confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1,crypt($2,gen_salt('bf')),now(),now(),now(),
       '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('name',$3::text),
       '','','','','') returning id`,
    [email, PW, name],
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
    body: JSON.stringify({ email, password: PW }),
  })
  return { email, uid, token: ((await res.json()) as { access_token: string }).access_token }
}

const db = new Client({ connectionString: env['SUPABASE_DB_URL'], ssl: { rejectUnauthorized: false } })
await db.connect()
const emails: string[] = []
let ok = 0
let bad = 0
const check = (n: string, c: boolean, d = '') => {
  if (c) ok++
  else bad++
  console.log(`${c ? '✅' : '❌'} ${n}${d ? `\n     ${d}` : ''}`)
}

try {
  const admin = await makeUser(db, 'admin', '관리자')
  const players = []
  for (let i = 0; i < 4; i++) players.push(await makeUser(db, `p${i}`, `선수${i + 1}`))
  emails.push(admin.email, ...players.map((x) => x.email))

  const t = await rpc(admin.token, 'create_tournament', {
    p_name: '푸시 e2e', p_description: null, p_group_count: 2,
    p_joker_group_count: 0, p_display_name: '관리자',
  })
  for (const u of players) await rpc(u.token, 'join_tournament', { p_code: t.invite_code })

  const { rows: groups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`, [t.id])
  const { rows: mem } = await db.query<{ id: string; display_name: string; user_id: string }>(
    `select id, display_name, user_id from tournament_members where tournament_id=$1`, [t.id])
  const M = (n: string) => mem.find((m) => m.display_name === n)!
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`,
    [groups[0]!.id, [M('선수1').id, M('선수2').id]])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`,
    [groups[1]!.id, [M('선수3').id, M('선수4').id]])

  // 진짜 P-256 키쌍으로 형식이 올바른 가짜 구독을 만든다
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const p256dh = b64(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]))
  const auth = b64(randomBytes(16))
  const endpoint = `https://fcm.googleapis.com/fcm/send/FAKE-${Date.now()}`

  await db.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,$2,$3,$4)`,
    [M('선수1').user_id, endpoint, p256dh, auth],
  )

  await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id, p_court_id: null, p_label: null,
    p_group_a: groups[0]!.id, p_players_a: [M('선수1').id, M('선수2').id],
    p_group_b: groups[1]!.id, p_players_b: [M('선수3').id, M('선수4').id],
    p_referees: [],
  })

  const { rows: before } = await db.query<{ n: string }>(
    `select count(*)::text n from notification_outbox where sent_at is null`)
  check('편성으로 발송 대기가 생겼다', Number(before[0]!.n) >= 4, `${before[0]!.n}건`)

  const res = await fetch(`${URL_BASE}/functions/v1/send-push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const out = (await res.json()) as { sent: number; gone: number; processed: number; error?: string }
  console.log('발송기 응답:', JSON.stringify(out))
  check('발송기가 오류 없이 끝났다', res.status === 200 && !out.error, `HTTP ${res.status}`)

  // 가짜 엔드포인트라 FCM 이 404 를 준다. gone 으로 잡혔다면
  // VAPID 서명과 암호화가 통과해 실제로 FCM 까지 갔다는 뜻이다.
  check(
    'VAPID 서명·암호화가 통과해 푸시 서비스까지 닿았다',
    out.gone === 1,
    `gone=${out.gone} — 0 이면 요청이 로컬에서 튕긴 것(키 형식/서명 오류)`,
  )

  const { rows: subLeft } = await db.query(
    `select 1 from push_subscriptions where endpoint=$1`, [endpoint])
  check('죽은 구독은 지워진다', subLeft.length === 0, `남은 ${subLeft.length}건`)

  const { rows: after } = await db.query<{ n: string }>(
    `select count(*)::text n from notification_outbox where sent_at is null`)
  check(
    '구독 없는 사람 몫은 다시 시도하지 않게 처리된다',
    Number(after[0]!.n) === 0,
    `남은 대기 ${after[0]!.n}건 — 안 지우면 매번 다시 시도한다`,
  )
} finally {
  await db.query(
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails])
  await db.query(`delete from auth.users where email = any($1)`, [emails])
  console.log(`\n🧹 계정 ${emails.length}개 정리 완료`)
  await db.end()
}
console.log(`\n${ok}/${ok + bad} 통과`)
if (bad > 0) process.exit(1)
