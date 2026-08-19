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
  // player 는 뒤에서 '정상 임명' 검증 때 admin 으로 승진한다.
  // 그래서 끝까지 일반 참가자로 남을 계정을 따로 둔다.
  const bystander = await makeUser(db, 'bystander', '순수참가자')
  emails.push(owner.email, attacker.email, player.email, bystander.email)

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

  for (const u of [attacker, player, bystander]) {
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
  check(
    '정상적인 관리자 임명은 여전히 된다 (과잉 차단 아님)',
    rpcLegit.status === 200,
    `status=${rpcLegit.status}`,
  )

  console.log('\n── H-3. 경기 결과 조작 ──')
  const { rows: groups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    groups[0]!.id,
    [ownerMember.id, playerMember.id],
  ])
  await db.query(`update tournament_members set group_id=$1 where id=$2`, [
    groups[1]!.id,
    attackerMember.id,
  ])

  // 2조에 사람이 1명뿐이라 복식 편성이 안 되므로, 검증용 경기는 DB 로 직접 만든다
  const { rows: mrow } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, status, created_by) values ($1,'live',$2) returning id`,
    [t.id, owner.uid],
  )
  const matchId = mrow[0]!.id
  await db.query(
    `insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
     values ($1,'A',$2,11,0.5,true), ($1,'B',$3,21,1.0,false)`,
    [matchId, groups[0]!.id, groups[1]!.id],
  )

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
     values ($1,'A',1,'sec-test-event-0001',$2)`,
    [matchId, owner.uid],
  )
  const del = await api(attacker.token, `matches?id=eq.${matchId}`, { method: 'DELETE' })
  check(
    '점수 기록이 있는 경기를 삭제해 원장을 지울 수 없다',
    del.status >= 400,
    `status=${del.status}`,
  )

  const voided = await api(attacker.token, 'rpc/void_match', {
    method: 'POST',
    body: JSON.stringify({ p_match_id: matchId, p_reason: '테스트' }),
  })
  check('대신 무효 처리는 된다 (기록 보존)', voided.status === 200, `status=${voided.status}`)

  const { rows: auditRows } = await db.query<{ n: string }>(
    `select count(*)::text n from audit_logs where tournament_id=$1 and action='match.void'`,
    [t.id],
  )
  check('무효 처리가 감사 로그에 남는다', Number(auditRows[0]!.n) === 1)

  console.log('\n── 코트 관리 권한 ──')
  const { rows: courtRows } = await db.query<{ id: string }>(
    `insert into courts (tournament_id, name, sort_order) values ($1,'1번 코트',1),($1,'2번 코트',2)
     returning id`,
    [t.id],
  )
  // ⚠ PostgREST 는 RLS 로 0행이 걸러져도 삭제 성공 코드를 준다.
  //   상태 코드가 아니라 실제로 지워졌는지를 봐야 한다.
  const delCourt = await api(bystander.token, `courts?id=eq.${courtRows[0]!.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  const { rowCount: courtsLeft } = await db.query(`select 1 from courts where tournament_id=$1`, [
    t.id,
  ])
  check(
    '일반 참가자는 코트를 지울 수 없다',
    courtsLeft === 2,
    `남은 코트 ${courtsLeft}개 (응답 ${delCourt.status})`,
  )

  const moveByPlayer = await api(bystander.token, 'rpc/move_court', {
    method: 'POST',
    body: JSON.stringify({ p_court_id: courtRows[1]!.id, p_direction: -1 }),
  })
  check(
    '일반 참가자는 코트 순서를 바꿀 수 없다',
    moveByPlayer.status >= 400,
    `status=${moveByPlayer.status}`,
  )

  const moveByAdmin = await api(attacker.token, 'rpc/move_court', {
    method: 'POST',
    body: JSON.stringify({ p_court_id: courtRows[1]!.id, p_direction: -1 }),
  })
  const { rows: order } = await db.query<{ name: string }>(
    `select name from courts where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  check(
    '관리자는 코트 순서를 바꿀 수 있다 (과잉 차단 아님)',
    moveByAdmin.status === 200 && order[0]!.name === '2번 코트',
    `순서: ${order.map((o) => o.name).join(' → ')}`,
  )

  console.log('\n── 관리자의 정상 동작 (과잉 차단 회귀 방지) ──')
  // 이 검사가 없어서 가드 트리거가 권한 오류로 죽는 걸 놓쳤다.
  // '차단됐다' 만 보면 정상 동작이 막힌 것도 통과해 버린다.
  const okGroup = await api(attacker.token, `tournament_members?id=eq.${playerMember.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ group_id: groups[1]!.id }),
  })
  check(
    '관리자가 남의 조를 옮길 수 있다',
    okGroup.status === 200 && Array.isArray(okGroup.body) && okGroup.body.length === 1,
    `status=${okGroup.status}`,
  )

  const okName = await api(attacker.token, `tournaments?id=eq.${t.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '이름 바꾼 대회' }),
  })
  check(
    '관리자가 대회 이름을 바꿀 수 있다',
    okName.status === 200 && Array.isArray(okName.body) && okName.body.length === 1,
    `status=${okName.status}`,
  )

  console.log('\n── M-2. 경기 이력 소거 ──')
  await db.query(
    `insert into match_team_players (match_team_id, member_id)
     select id, $2 from match_teams where match_id=$1 and side='A'`,
    [matchId, playerMember.id],
  )
  const leave = await api(player.token, `tournament_members?id=eq.${playerMember.id}`, {
    method: 'DELETE',
  })
  const { rowCount: stillThere } = await db.query(`select 1 from tournament_members where id=$1`, [
    playerMember.id,
  ])
  check(
    '출전 기록이 있으면 탈퇴로 이력을 지울 수 없다',
    leave.status >= 400 && stillThere === 1,
    `status=${leave.status}`,
  )

  console.log('\n── H-2. 브루트포스 차단 ──')
  const countFails = async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text n from join_attempts where user_id=$1 and not succeeded`,
      [player.uid],
    )
    return Number(rows[0]!.n)
  }
  const before = await countFails()
  await api(player.token, 'rpc/join_tournament', {
    method: 'POST',
    body: JSON.stringify({ p_code: 'ZZZZZZ' }),
  })
  const after = await countFails()
  check(
    '실패한 코드 입력이 기록으로 남는다 (예전엔 롤백되어 사라졌다)',
    after > before,
    `실패 기록 ${before} → ${after}`,
  )

  for (let i = 0; i < 10; i++) {
    await api(player.token, 'rpc/join_tournament', {
      method: 'POST',
      body: JSON.stringify({ p_code: `ZZZZ${String(i).padStart(2, '0')}` }),
    })
  }
  const limited = await api(player.token, 'rpc/join_tournament', {
    method: 'POST',
    body: JSON.stringify({ p_code: t.invite_code }),
  })
  check(
    '10회 실패하면 정상 코드로도 차단된다',
    limited.body?.['ok'] === false && limited.body?.['error'] === 'rate_limited',
    `error=${String(limited.body?.['error'] ?? '(없음)')}`,
  )

  // ── 대진표에서 코트 배정 (관리자 전용) ──────────────────────────
  // 코트 배정은 RPC 가 아니라 matches 직접 UPDATE 다. 화면에서 버튼을
  // 안 그리는 건 보안이 아니다 — RLS 가 실제로 막는지 확인한다.
  console.log('\n── 코트 배정 권한 ──')
  const beforeCourt = await db.query<{ court_id: string | null }>(
    `select court_id from matches where id=$1`,
    [matchId],
  )

  const assignByPlayer = await api(bystander.token, `matches?id=eq.${matchId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ court_id: courtRows[0]!.id }),
  })
  const afterCourt = await db.query<{ court_id: string | null }>(
    `select court_id from matches where id=$1`,
    [matchId],
  )
  check(
    '일반 참가자는 경기에 코트를 배정할 수 없다',
    afterCourt.rows[0]!.court_id === beforeCourt.rows[0]!.court_id,
    `이전 ${String(beforeCourt.rows[0]!.court_id)} → 이후 ${String(afterCourt.rows[0]!.court_id)} (응답 ${assignByPlayer.status})`,
  )

  const startByPlayer = await api(bystander.token, 'rpc/start_match', {
    method: 'POST',
    body: JSON.stringify({ p_match_id: matchId }),
  })
  check(
    '일반 참가자는 경기를 시작할 수 없다',
    startByPlayer.status >= 400,
    `status=${startByPlayer.status}`,
  )

  const claimByPlayer = await api(bystander.token, 'rpc/claim_court', {
    method: 'POST',
    body: JSON.stringify({ p_match_id: matchId, p_court_id: courtRows[0]!.id }),
  })
  check(
    '일반 참가자는 코트를 잡을 수 없다',
    claimByPlayer.status >= 400,
    `status=${claimByPlayer.status}`,
  )

  // 관리자는 되어야 한다 — 막히는 것만 확인하면 권한 오류로 죽어도 통과한다
  const assignByAdmin = await api(attacker.token, `matches?id=eq.${matchId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ court_id: courtRows[0]!.id }),
  })
  const adminCourt = await db.query<{ court_id: string | null }>(
    `select court_id from matches where id=$1`,
    [matchId],
  )
  check(
    '관리자는 경기에 코트를 배정할 수 있다',
    adminCourt.rows[0]!.court_id === courtRows[0]!.id,
    `court_id=${String(adminCourt.rows[0]!.court_id)} (응답 ${assignByAdmin.status})`,
  )

  // ── 표시 이름 변경 ──────────────────────────────────────────────
  // 남의 이름을 바꿀 수 있으면 대진표에서 신분을 위장할 수 있다.
  // 심판 지정도 이름으로 확인하므로 채점 권한까지 흔들린다.
  console.log('\n── 표시 이름 변경 ──')

  const renameOther = await api(bystander.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: ownerMember.id, p_name: '가짜주최자' }),
  })
  check(
    '일반 참가자는 남의 이름을 바꿀 수 없다',
    renameOther.status >= 400,
    `status=${renameOther.status}`,
  )

  const { rows: bystanderRow } = await db.query<{ id: string }>(
    `select id from tournament_members where tournament_id=$1 and display_name='순수참가자'`,
    [t.id],
  )
  const renameSelf = await api(bystander.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: bystanderRow[0]!.id, p_name: '바꾼이름' }),
  })
  check('본인 이름은 바꿀 수 있다', renameSelf.status === 200, `status=${renameSelf.status}`)

  const dup = await api(bystander.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: bystanderRow[0]!.id, p_name: '주최자' }),
  })
  check(
    '같은 대회에 중복 이름은 막는다',
    dup.status >= 400,
    `status=${dup.status} — 중복되면 대진표에서 누가 누군지 알 수 없다`,
  )

  const blank = await api(bystander.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: bystanderRow[0]!.id, p_name: '   ' }),
  })
  check('공백만 있는 이름은 막는다', blank.status >= 400, `status=${blank.status}`)

  const renameByAdmin = await api(attacker.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: bystanderRow[0]!.id, p_name: '관리자가바꾼이름' }),
  })
  check(
    '관리자는 참가자 이름을 바꿀 수 있다',
    renameByAdmin.status === 200,
    `status=${renameByAdmin.status}`,
  )

  const { rows: renameLog } = await db.query(
    `select 1 from audit_logs where tournament_id=$1 and action='member.rename'`,
    [t.id],
  )
  check(
    '남의 이름을 바꾼 것은 기록에 남는다',
    renameLog.length > 0,
    `${renameLog.length}건 — 흔적 없이 바뀌면 나중에 추적할 수 없다`,
  )

  // group_id 를 함께 넘겨도 조가 바뀌면 안 된다 (RPC 는 이름만 건드린다)
  const { rows: groupBefore } = await db.query<{ group_id: string | null }>(
    `select group_id from tournament_members where id=$1`,
    [bystanderRow[0]!.id],
  )
  await api(bystander.token, 'rpc/set_display_name', {
    method: 'POST',
    body: JSON.stringify({ p_member_id: bystanderRow[0]!.id, p_name: '다시바꿈' }),
  })
  const { rows: groupAfter } = await db.query<{ group_id: string | null }>(
    `select group_id from tournament_members where id=$1`,
    [bystanderRow[0]!.id],
  )
  check(
    '이름을 바꿔도 조는 그대로다',
    groupBefore[0]!.group_id === groupAfter[0]!.group_id,
    '이름 변경으로 조 배정 규칙을 우회할 수 없어야 한다',
  )


  // ── 코트 이름 수정 ──────────────────────────────────────────────
  console.log('\n── 코트 이름 수정 ──')
  const renameCourtByPlayer = await api(bystander.token, `courts?id=eq.${courtRows[0]!.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '해킹코트' }),
  })
  const { rows: courtAfter } = await db.query<{ name: string }>(
    `select name from courts where id=$1`,
    [courtRows[0]!.id],
  )
  check(
    '일반 참가자는 코트 이름을 바꿀 수 없다',
    courtAfter[0]!.name !== '해킹코트',
    `${courtAfter[0]!.name} (응답 ${renameCourtByPlayer.status}) — PostgREST 는 0행이어도 200 을 준다`,
  )

  const renameCourtByAdmin = await api(attacker.token, `courts?id=eq.${courtRows[0]!.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '입구쪽' }),
  })
  const { rows: courtRenamed } = await db.query<{ name: string }>(
    `select name from courts where id=$1`,
    [courtRows[0]!.id],
  )
  check(
    '관리자는 코트 이름을 바꿀 수 있다',
    courtRenamed[0]!.name === '입구쪽',
    `${courtRenamed[0]!.name} (응답 ${renameCourtByAdmin.status})`,
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
