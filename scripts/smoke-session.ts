/**
 * 모임 모드가 실제 DB 에서 도는지 확인한다.
 *
 * 이 기능의 값은 '못 하던 것을 하게 된다' 에 있다 — 조 없이 경기를 만들고,
 * 점수를 안 세고 끝내고, 심판이 아닌 사람이 자기 경기를 돌린다.
 * 셋 다 예전에는 DB 제약과 권한 검사가 막았던 일이라, 프론트만 봐서는
 * 열렸는지 알 수 없다.
 *
 * 동시에 **대회가 그대로인지** 도 본다. 승자 없는 종료가 대회로 새어 들어가면
 * 순위표가 조용히 망가진다.
 *
 *   npm run db:smoke:session
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
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  }
}

const emails: string[] = []

async function makeUser(db: Client, tag: string, name: string) {
  const email = `session-${tag}-${Date.now()}@smashtest.local`
  const password = 'SessionTest12345!'
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
  emails.push(email)
  return { email, uid, token: body.access_token, name }
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await db.connect()

try {
  const host = await makeUser(db, 'host', '모임장')
  const players = [
    await makeUser(db, 'p1', '가나다'),
    await makeUser(db, 'p2', '라마바'),
    await makeUser(db, 'p3', '사아자'),
    await makeUser(db, 'p4', '차카타'),
  ]
  const outsider = await makeUser(db, 'out', '남의사람')

  console.log('\n── 모임 열기 ──')
  const created = await rpc(host.token, 'create_session', {
    p_name: '스모크 모임',
    p_display_name: '모임장',
    p_court_count: 2,
  })
  check('모임 생성 RPC', created.status === 200, `status=${created.status}`)
  const s = created.body as unknown as { id: string; invite_code: string; kind: string }

  check("kind 가 'session' 이다", s.kind === 'session', s.kind)

  const { rows: gRows } = await db.query<{ n: string }>(
    `select count(*)::int as n from groups where tournament_id=$1`,
    [s.id],
  )
  check('조가 하나도 안 만들어진다', Number(gRows[0]!.n) === 0, `${gRows[0]!.n}개`)

  const { rows: cRows } = await db.query<{ n: string }>(
    `select count(*)::int as n from courts where tournament_id=$1`,
    [s.id],
  )
  check('코트가 함께 만들어진다', Number(cRows[0]!.n) === 2, `${cRows[0]!.n}개`)

  const { rows: stRows } = await db.query<{ status: string }>(
    `select status from tournaments where id=$1`,
    [s.id],
  )
  check(
    "상태가 바로 'live' 다",
    stRows[0]!.status === 'live',
    `${stRows[0]!.status} — draft 면 참가자가 조 선택 온보딩으로 끌려간다`,
  )

  for (const u of [...players, outsider]) {
    await rpc(u.token, 'join_tournament', { p_code: s.invite_code })
  }

  const { rows: members } = await db.query<{ id: string; display_name: string }>(
    `select id, display_name from tournament_members where tournament_id=$1`,
    [s.id],
  )
  const M = (n: string) => members.find((m) => m.display_name === n)!
  const { rows: courts } = await db.query<{ id: string }>(
    `select id from courts where tournament_id=$1 order by sort_order`,
    [s.id],
  )

  console.log('\n── 조 없이 경기를 만든다 ──')
  const m1 = await rpc(host.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('사아자').id, M('차카타').id],
  })
  check('모임 경기 편성', m1.status === 200, `status=${m1.status} ${JSON.stringify(m1.body)}`)
  const m1Id = (m1.body as unknown as { id: string } | null)?.id

  const { rows: teams } = await db.query<{ group_id: string | null; target_score: number }>(
    `select group_id, target_score from match_teams where match_id=$1`,
    [m1Id ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '양 팀 모두 조가 없다 (group_id NULL)',
    teams.length === 2 && teams.every((t) => t.group_id === null),
    JSON.stringify(teams.map((t) => t.group_id)),
  )
  check(
    '목표 점수는 그대로 들어간다 (세고 싶은 사람을 위해)',
    teams.every((t) => t.target_score === 21),
    JSON.stringify(teams.map((t) => t.target_score)),
  )

  console.log('\n── 같은 사람을 두 번 넣을 수 없다 ──')
  // 조가 없으니 '같은 조끼리 못 붙는다' 가 이 역할을 대신 못 한다
  const dup = await rpc(host.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: null,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('가나다').id, M('차카타').id],
  })
  check('양쪽에 걸친 사람을 거부한다', dup.status >= 400, `status=${dup.status}`)

  console.log('\n── 심판이 아닌 선수가 자기 경기를 돌린다 ──')
  const started = await rpc(players[0]!.token, 'start_match', { p_match_id: m1Id })
  check(
    '뛰는 사람이 경기를 시작할 수 있다',
    started.status === 200,
    `status=${started.status} — 모임에는 지정 심판이 없다`,
  )

  console.log('\n── 점수를 안 세고 끝낸다 ──')
  const ended = await rpc(players[0]!.token, 'finish_match', { p_match_id: m1Id })
  check('0:0 에서 경기를 끝낼 수 있다', ended.status === 200, `status=${ended.status}`)

  const { rows: m1Row } = await db.query<{
    status: string
    winner_side: string | null
    scored: boolean
  }>(`select status, winner_side, scored from matches where id=$1`, [m1Id])
  check('끝난 상태로 남는다', m1Row[0]?.status === 'finished', m1Row[0]?.status ?? '(없음)')
  check('승자가 없다', m1Row[0]?.winner_side === null, String(m1Row[0]?.winner_side))
  check(
    "scored 가 false 다 — 화면이 '점수 없음' 을 그릴 근거",
    m1Row[0]?.scored === false,
    String(m1Row[0]?.scored),
  )

  console.log('\n── 남의 경기는 못 건드린다 (보안 경계) ──')
  const m2 = await rpc(players[0]!.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: courts[1]!.id,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('사아자').id, M('차카타').id],
  })
  check(
    '뛰는 사람 본인은 경기를 만들 수 있다',
    m2.status === 200,
    `status=${m2.status} — 모임장이 매번 짜 주지 않아도 된다`,
  )
  const m2Id = (m2.body as unknown as { id: string } | null)?.id
  await rpc(players[0]!.token, 'start_match', { p_match_id: m2Id })

  const stolen = await rpc(outsider.token, 'record_score', {
    p_match_id: m2Id,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: `steal-${Date.now()}`,
  })
  check(
    '뛰지 않는 참가자는 점수를 못 넣는다',
    stolen.status >= 400,
    `status=${stolen.status} — 모임이라도 '자기 경기' 만 허용해야 한다`,
  )

  const stolenFinish = await rpc(outsider.token, 'finish_match', { p_match_id: m2Id })
  check('뛰지 않는 참가자는 경기를 끝낼 수 없다', stolenFinish.status >= 400,
    `status=${stolenFinish.status}`)

  console.log('\n── 점수를 세면 대회와 똑같이 동작한다 ──')
  for (let i = 0; i < 21; i++) {
    await rpc(players[0]!.token, 'record_score', {
      p_match_id: m2Id,
      p_side: 'A',
      p_delta: 1,
      p_client_event_id: `pt-${i}-${Date.now()}`,
    })
  }
  const { rows: m2Row } = await db.query<{
    status: string
    winner_side: string | null
    scored: boolean
    score_a: number
  }>(`select status, winner_side, scored, score_a from matches where id=$1`, [m2Id])
  check(
    '21점에 닿으면 저절로 끝나고 승자가 정해진다',
    m2Row[0]?.status === 'finished' && m2Row[0]?.winner_side === 'A',
    `${m2Row[0]?.status} / ${m2Row[0]?.winner_side} / ${m2Row[0]?.score_a}점`,
  )
  check('점수를 셌으니 scored 가 true 다', m2Row[0]?.scored === true, String(m2Row[0]?.scored))

  console.log('\n── 모임 경기는 조별 순위에 안 섞인다 ──')
  const { rows: standings } = await db.query(`select * from get_standings($1)`, [s.id])
  check(
    '조가 없으니 순위표가 비어 있다',
    standings.length === 0,
    `${standings.length}행 — 유령 조가 생기면 여기서 걸린다`,
  )

  console.log('\n── 대회는 그대로다 ──')
  const t = await rpc(host.token, 'create_tournament', {
    p_name: '스모크 대조군 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '주최자',
  })
  const tId = (t.body as unknown as { id: string; invite_code: string }).id
  const tCode = (t.body as unknown as { invite_code: string }).invite_code
  for (const u of players) await rpc(u.token, 'join_tournament', { p_code: tCode })

  const { rows: tGroups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [tId],
  )
  const { rows: tMembers } = await db.query<{ id: string; display_name: string }>(
    `select id, display_name from tournament_members where tournament_id=$1`,
    [tId],
  )
  const TM = (n: string) => tMembers.find((m) => m.display_name === n)!
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    tGroups[0]!.id,
    [TM('가나다').id, TM('라마바').id],
  ])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    tGroups[1]!.id,
    [TM('사아자').id, TM('차카타').id],
  ])

  const tMatch = await rpc(host.token, 'create_match', {
    p_tournament_id: tId,
    p_court_id: null,
    p_label: null,
    p_group_a: tGroups[0]!.id,
    p_players_a: [TM('가나다').id, TM('라마바').id],
    p_group_b: tGroups[1]!.id,
    p_players_b: [TM('사아자').id, TM('차카타').id],
    p_referees: [],
  })
  const tMatchId = (tMatch.body as unknown as { id: string } | null)?.id
  await rpc(host.token, 'start_match', { p_match_id: tMatchId })

  const tEnd = await rpc(host.token, 'finish_match', { p_match_id: tMatchId })
  check(
    '대회 경기는 0:0 에서 끝낼 수 없다',
    tEnd.status >= 400,
    `status=${tEnd.status} — 승자 없는 결과가 순위에 들어가면 순위표가 망가진다`,
  )
  check(
    '거절 문구가 무엇을 해야 할지 알려준다',
    String((tEnd.body as { message?: string } | null)?.message ?? '').includes('승리 팀'),
    String((tEnd.body as { message?: string } | null)?.message ?? '(없음)'),
  )

  const tPlayerScore = await rpc(players[0]!.token, 'record_score', {
    p_match_id: tMatchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: `t-steal-${Date.now()}`,
  })
  check(
    '대회에서는 뛰는 사람이 점수를 못 넣는다 (심판·관리자만)',
    tPlayerScore.status >= 400,
    `status=${tPlayerScore.status} — 모임 완화가 대회로 새면 안 된다`,
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
