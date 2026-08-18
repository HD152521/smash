/**
 * 보안 검수에서 나온 구멍이 실제로 막혔는지 공격으로 확인한다.
 *
 * "정책을 고쳤다" 와 "공격이 실패한다" 는 다른 이야기다.
 * 실제 admin 계정으로 실제 공격 요청을 쏴서 거부되는지 본다.
 *
 *   npm run db:smoke:security
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

interface ApiResult {
  status: number
  body: Record<string, unknown> | null
}

async function api(token: string, path: string, init: RequestInit = {}): Promise<ApiResult> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null }
}

async function makeUser(db: Client, tag: string, name: string) {
  const email = `sec-${tag}-${Date.now()}@smashtest.local`
  const password = 'SecTest12345!'
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
  return { email, uid, token: body.access_token }
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await db.connect()
const emails: string[] = []

try {
  const owner = await makeUser(db, 'owner', '주최자')
  const attacker = await makeUser(db, 'admin', '악의적관리자')
  const player = await makeUser(db, 'player', '일반참가자')
  emails.push(owner.email, attacker.email, player.email)

  const created = await api(owner.token, 'rpc/create_tournament', {
    method: 'POST',
    body: JSON.stringify({
      p_name: '보안 테스트 대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 1,
      p_display_name: '주최자',
    }),
  })
  const t = created.body as unknown as { id: string; invite_code: string }

  for (const u of [attacker, player]) {
    await api(u.token, 'rpc/join_tournament', {
      method: 'POST',
      body: JSON.stringify({ p_code: t.invite_code }),
    })
  }

  const { rows: members } = await db.query<{ id: string; display_name: string }>(
    `select id, display_name from tournament_members where tournament_id = $1`,
    [t.id],
  )
  const attackerMember = members.find((r) => r.display_name === '악의적관리자')!
  const ownerMember = members.find((r) => r.display_name === '주최자')!
  const playerMember = members.find((r) => r.display_name === '일반참가자')!

  // 공격자를 관리자로 승격 (owner 가 정상적으로 임명한 상황을 가정)
  await db.query(`update tournament_members set role='admin' where id=$1`, [attackerMember.id])

  console.log('\n── H-1. 대회 소유권 탈취 ──')
  const attacks: [string, Record<string, unknown>][] = [
    ['admin 이 owner_id 를 바꿔 대회를 탈취할 수 없다', { owner_id: attacker.uid }],
    ['초대 코드를 직접 바꿀 수 없다 (감사 우회 차단)', { invite_code: 'HACKED' }],
    ['대회 상태를 직접 바꿀 수 없다 (조 미선택 가드 우회 차단)', { status: 'live' }],
    ['경기 규칙을 직접 바꿀 수 없다', { config: { jokerPoints: 1 } }],
  ]
  for (const [name, payload] of attacks) {
    const r = await api(attacker.token, `tournaments?id=eq.${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    check(name, r.status >= 400, `status=${r.status}`)
  }

  console.log('\n── M-1. 역할 탈취 ──')
  const roleAttacks: [string, string, Record<string, unknown>][] = [
    ['admin 이 스스로 owner 가 될 수 없다', attackerMember.id, { role: 'owner' }],
    ['admin 이 주최자를 강등시킬 수 없다', ownerMember.id, { role: 'member' }],
    ['멤버의 계정을 바꿔 멤버십을 가로챌 수 없다', ownerMember.id, { user_id: attacker.uid }],
  ]
  for (const [name, id, payload] of roleAttacks) {
    const r = await api(attacker.token, `tournament_members?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    check(name, r.status >= 400, `status=${r.status}`)
  }

  const rpcOwner = await api(attacker.token, 'rpc/set_member_role', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: attackerMember.id, p_role: 'owner' }),
  })
  check('RPC 로도 owner 를 부여할 수 없다', rpcOwner.status >= 400, `status=${rpcOwner.status}`)

  const rpcDemote = await api(attacker.token, 'rpc/set_member_role', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: ownerMember.id, p_role: 'member' }),
  })
  check('RPC 로도 주최자를 강등할 수 없다', rpcDemote.status >= 400, `status=${rpcDemote.status}`)

  const rpcLegit = await api(attacker.token, 'rpc/set_member_role', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: playerMember.id, p_role: 'admin' }),
  })
  check('정상적인 관리자 임명은 여전히 된다 (과잉 차단 아님)', rpcLegit.status === 200,
    `status=${rpcLegit.status}`)

  console.log('\n── H-3. 경기 결과 조작 ──')
  const { rows: groups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`, [t.id])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`,
    [groups[0]!.id, [ownerMember.id, playerMember.id]])
  await db.query(`update tournament_members set group_id=$1 where id=$2`,
    [groups[1]!.id, attackerMember.id])

  // 2조에 사람이 1명뿐이라 복식 편성이 안 되므로, 검증용 경기는 DB 로 직접 만든다
  const { rows: mrow } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, status, created_by) values ($1,'live',$2) returning id`,
    [t.id, owner.uid])
  const matchId = mrow[0]!.id
  await db.query(
    `insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
     values ($1,'A',$2,11,0.5,true), ($1,'B',$3,21,1.0,false)`,
    [matchId, groups[0]!.id, groups[1]!.id])

  const scoreAttacks: [string, Record<string, unknown>][] = [
    ['점수를 직접 조작할 수 없다 (원장 우회 차단)', { score_a: 21, score_b: 0 }],
    ['승자를 직접 지정할 수 없다', { status: 'finished', winner_side: 'B' }],
    ['경기 출처를 위조할 수 없다', { source: 'manual' }],
  ]
  for (const [name, payload] of scoreAttacks) {
    const r = await api(attacker.token, `matches?id=eq.${matchId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    check(name, r.status >= 400, `status=${r.status}`)
  }

  await db.query(
    `insert into score_events (match_id, side, delta, client_event_id, created_by)
     values ($1,'A',1,'sec-test-event-0001',$2)`, [matchId, owner.uid])
  const del = await api(attacker.token, `matches?id=eq.${matchId}`, { method: 'DELETE' })
  check('점수 기록이 있는 경기를 삭제해 원장을 지울 수 없다', del.status >= 400,
    `status=${del.status}`)

  const voided = await api(attacker.token, 'rpc/void_match', {
    method: 'POST',
    body: JSON.stringify({ p_match_id: matchId, p_reason: '테스트' }),
  })
  check('대신 무효 처리는 된다 (기록 보존)', voided.status === 200, `status=${voided.status}`)

  const { rows: auditRows } = await db.query<{ n: string }>(
    `select count(*)::text n from audit_logs where tournament_id=$1 and action='match.void'`, [t.id])
  check('무효 처리가 감사 로그에 남는다', Number(auditRows[0]!.n) === 1)

  console.log('\n── M-2. 경기 이력 소거 ──')
  await db.query(
    `insert into match_team_players (match_team_id, member_id)
     select id, $2 from match_teams where match_id=$1 and side='A'`,
    [matchId, playerMember.id])
  const leave = await api(player.token, `tournament_members?id=eq.${playerMember.id}`, {
    method: 'DELETE',
  })
  const { rowCount: stillThere } = await db.query(
    `select 1 from tournament_members where id=$1`, [playerMember.id])
  check('출전 기록이 있으면 탈퇴로 이력을 지울 수 없다',
    leave.status >= 400 && stillThere === 1, `status=${leave.status}`)

  console.log('\n── H-2. 브루트포스 차단 ──')
  const countFails = async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text n from join_attempts where user_id=$1 and not succeeded`, [player.uid])
    return Number(rows[0]!.n)
  }
  const before = await countFails()
  await api(player.token, 'rpc/join_tournament', {
    method: 'POST', body: JSON.stringify({ p_code: 'ZZZZZZ' }),
  })
  const after = await countFails()
  check('실패한 코드 입력이 기록으로 남는다 (예전엔 롤백되어 사라졌다)',
    after > before, `실패 기록 ${before} → ${after}`)

  for (let i = 0; i < 10; i++) {
    await api(player.token, 'rpc/join_tournament', {
      method: 'POST',
      body: JSON.stringify({ p_code: `ZZZZ${String(i).padStart(2, '0')}` }),
    })
  }
  const limited = await api(player.token, 'rpc/join_tournament', {
    method: 'POST', body: JSON.stringify({ p_code: t.invite_code }),
  })
  check('10회 실패하면 정상 코드로도 차단된다',
    limited.body?.['ok'] === false && limited.body?.['error'] === 'rate_limited',
    `error=${String(limited.body?.['error'] ?? '(없음)')}`)
} finally {
  await db.query(
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails])
  await db.query(`delete from auth.users where email = any($1)`, [emails])
  console.log(`\n🧹 테스트 계정 ${emails.length}개 정리 완료`)
  await db.end()
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
