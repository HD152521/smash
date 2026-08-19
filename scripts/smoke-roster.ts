/**
 * 명단 관리 — 추가 · 제외.
 *
 * 가장 무서운 것은 '제외' 다. match_team_players 가 on delete cascade 라
 * 경기에 나간 사람을 지우면 그 사람이 지난 경기에서 조용히 사라진다.
 * 21:19 경기가 1:2 복식이 되는데 오류도 안 뜬다.
 * 그게 실제로 막히는지 여기서 확인한다.
 *
 *   npm run db:smoke:roster
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
  const email = `roster-${tag}-${Date.now()}@smashtest.local`
  const password = 'RosterTest12345!'
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
  const admin = await makeUser(db, 'admin', '주최자')
  const outsider = await makeUser(db, 'out', '무관한사람')
  emails.push(admin.email, outsider.email)

  const created = await rpc(admin.token, 'create_tournament', {
    p_name: '명단 테스트 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '주최자',
  })
  const t = created.body as unknown as { id: string; invite_code: string }
  await rpc(outsider.token, 'join_tournament', { p_code: t.invite_code })

  console.log('\n── 명단에 미리 넣기 ──')
  const add = await rpc(admin.token, 'add_roster_member', {
    p_tournament_id: t.id,
    p_name: '김철수',
  })
  check('관리자가 명단에 사람을 추가한다', add.status === 200, `status=${add.status}`)
  const roster = add.body as unknown as { id: string; user_id: string | null }
  check('계정 없이 들어간다 (미가입)', roster.user_id === null, `user_id=${String(roster.user_id)}`)

  const dup = await rpc(admin.token, 'add_roster_member', {
    p_tournament_id: t.id,
    p_name: '김철수',
  })
  check('같은 이름은 두 번 못 넣는다', dup.status >= 400, `status=${dup.status}`)

  const byOther = await rpc(outsider.token, 'add_roster_member', {
    p_tournament_id: t.id,
    p_name: '몰래추가',
  })
  check('일반 참가자는 추가할 수 없다', byOther.status >= 400, `status=${byOther.status}`)

  console.log('\n── 미가입 참가자는 심판을 맡을 수 없다 ──')
  // 열 수 있는 사람이 아무도 없는 경기가 만들어지면 코트에서야 발견한다
  const others = await rpc(admin.token, 'add_roster_member', { p_tournament_id: t.id, p_name: '박영희' })
  const other2 = await rpc(admin.token, 'add_roster_member', { p_tournament_id: t.id, p_name: '이민수' })
  const other3 = await rpc(admin.token, 'add_roster_member', { p_tournament_id: t.id, p_name: '최지훈' })
  const ids = [roster, others.body, other2.body, other3.body].map(
    (r) => (r as unknown as { id: string }).id,
  )
  const { rows: groups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    groups[0]!.id,
    [ids[0], ids[1]],
  ])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    groups[1]!.id,
    [ids[2], ids[3]],
  ])

  const withRosterRef = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: groups[0]!.id,
    p_players_a: [ids[0], ids[1]],
    p_group_b: groups[1]!.id,
    p_players_b: [ids[2], ids[3]],
    p_referees: [ids[0]],
  })
  check(
    '미가입 참가자를 심판으로 지정할 수 없다',
    withRosterRef.status >= 400,
    `status=${withRosterRef.status} — 되면 아무도 못 여는 경기가 만들어진다`,
  )

  console.log('\n── 미가입 참가자도 경기는 뛴다 ──')
  const match = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: groups[0]!.id,
    p_players_a: [ids[0], ids[1]],
    p_group_b: groups[1]!.id,
    p_players_b: [ids[2], ids[3]],
    p_referees: [],
  })
  check('미가입 참가자로 경기를 편성한다', match.status === 200, `status=${match.status}`)

  console.log('\n── 제외 ──')
  const removePlayed = await rpc(admin.token, 'remove_member', { p_member_id: ids[0] })
  const { rows: stillThere } = await db.query(`select 1 from tournament_members where id=$1`, [
    ids[0],
  ])
  check(
    '경기에 나간 사람은 뺄 수 없다',
    removePlayed.status >= 400 && stillThere.length === 1,
    `status=${removePlayed.status} — 지우면 그 경기 기록에서도 사라진다`,
  )

  const { rows: playersLeft } = await db.query<{ n: string }>(
    `select count(*)::text n from match_team_players mtp
       join match_teams mt on mt.id = mtp.match_team_id
      where mt.match_id = $1`,
    [(match.body as unknown as { id: string }).id],
  )
  check(
    '막힌 덕에 경기의 선수 4명이 그대로다',
    playersLeft[0]!.n === '4',
    `${playersLeft[0]!.n}명 — 여기가 줄면 기록이 조용히 망가진 것이다`,
  )

  const spare = await rpc(admin.token, 'add_roster_member', {
    p_tournament_id: t.id,
    p_name: '잘못넣은사람',
  })
  const spareId = (spare.body as unknown as { id: string }).id
  const removeUnplayed = await rpc(admin.token, 'remove_member', { p_member_id: spareId })
  const { rows: gone } = await db.query(`select 1 from tournament_members where id=$1`, [spareId])
  check(
    '경기에 안 나간 사람은 뺄 수 있다',
    removeUnplayed.status < 300 && gone.length === 0,
    `status=${removeUnplayed.status}`,
  )

  const { rows: ownerRow } = await db.query<{ id: string }>(
    `select id from tournament_members where tournament_id=$1 and role='owner'`,
    [t.id],
  )
  const removeOwner = await rpc(admin.token, 'remove_member', { p_member_id: ownerRow[0]!.id })
  check('주최자는 뺄 수 없다', removeOwner.status >= 400, `status=${removeOwner.status}`)

  const { rows: outsiderRow } = await db.query<{ id: string }>(
    `select id from tournament_members where tournament_id=$1 and display_name='무관한사람'`,
    [t.id],
  )
  const removeByOther = await rpc(outsider.token, 'remove_member', {
    p_member_id: outsiderRow[0]!.id,
  })
  check('일반 참가자는 아무도 뺄 수 없다', removeByOther.status >= 400, `status=${removeByOther.status}`)

  // 명단·계정 짝짓기는 걷어냈다. 명단 행을 남기고 계정 행을 지우는 방식이라
  // 계정 쪽에 있던 조 배정이 함께 사라졌다 — 본인이 고른 조가 조용히 날아간다.
  // 어느 쪽 정보를 남길지 칸 단위로 정한 뒤에 다시 만든다.
  // (자세한 내용은 20260819000009_drop_link_member.sql)

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
