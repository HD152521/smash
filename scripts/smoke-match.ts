/**
 * 경기 한 판을 처음부터 끝까지 돌려본다.
 *
 *   편성 → 시작 → 득점 → 멱등 → 취소 → 조커 종료 → 순위 집계
 *
 * 이 앱의 핵심 규칙(조커 11점 / 일반 21점, 승점 0.5 / 1.0)이 실제 DB 에서
 * 그대로 작동하는지 확인한다. rules.ts 단위 테스트는 화면용 사본을 검증할 뿐이고,
 * 진실은 여기다.
 *
 *   npm run db:smoke:match
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
  const email = `match-${tag}-${Date.now()}@smashtest.local`
  const password = 'MatchTest12345!'
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
  const players = []
  for (let i = 0; i < 4; i++) {
    players.push(await makeUser(db, `p${i}`, `선수${i + 1}`))
  }
  const ref = await makeUser(db, 'ref', '심판')
  const outsider = await makeUser(db, 'out', '무관한사람')
  emails.push(admin.email, ...players.map((p) => p.email), ref.email, outsider.email)

  // 조 2개, 1조만 조커
  const created = await rpc(admin.token, 'create_tournament', {
    p_name: '경기 흐름 테스트',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 1,
    p_display_name: '관리자',
  })
  const t = created.body as unknown as { id: string; invite_code: string }

  for (const u of [...players, ref, outsider]) {
    await rpc(u.token, 'join_tournament', { p_code: t.invite_code })
  }

  const { rows: groups } = await db.query<{ id: string; name: string; is_joker: boolean }>(
    `select id, name, is_joker from groups where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  const jokerGroup = groups[0]!
  const normalGroup = groups[1]!

  const { rows: members } = await db.query<{ id: string; display_name: string }>(
    `select id, display_name from tournament_members where tournament_id=$1`,
    [t.id],
  )
  const memberOf = (name: string) => members.find((m) => m.display_name === name)!.id

  // 선수1·2 → 조커조, 선수3·4 → 일반조
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    jokerGroup.id,
    [memberOf('선수1'), memberOf('선수2')],
  ])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    normalGroup.id,
    [memberOf('선수3'), memberOf('선수4')],
  ])

  console.log('\n── 편성 ──')
  const match = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: jokerGroup.id,
    p_players_a: [memberOf('선수1'), memberOf('선수2')],
    p_group_b: normalGroup.id,
    p_players_b: [memberOf('선수3'), memberOf('선수4')],
    p_referees: [memberOf('심판')],
  })
  check('경기 편성', match.status === 200, `status=${match.status}`)
  const matchId = (match.body as unknown as { id: string }).id

  const { rows: teams } = await db.query<{
    side: string
    target_score: number
    win_points: string
    is_joker: boolean
  }>(
    `select side, target_score, win_points, is_joker from match_teams where match_id=$1 order by side`,
    [matchId],
  )
  check(
    '조커조 목표 11점 · 승점 0.5 로 굳혀졌다',
    teams[0]!.target_score === 11 && Number(teams[0]!.win_points) === 0.5 && teams[0]!.is_joker,
    `A: ${teams[0]!.target_score}점 / ${teams[0]!.win_points}승점`,
  )
  check(
    '일반조 목표 21점 · 승점 1.0 으로 굳혀졌다',
    teams[1]!.target_score === 21 && Number(teams[1]!.win_points) === 1 && !teams[1]!.is_joker,
    `B: ${teams[1]!.target_score}점 / ${teams[1]!.win_points}승점`,
  )

  console.log('\n── 권한 ──')
  const outsiderScore = await rpc(outsider.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: 'outsider-attempt-1',
  })
  check(
    '배정되지 않은 사람은 점수를 못 넣는다',
    outsiderScore.status >= 400,
    `status=${outsiderScore.status}`,
  )

  console.log('\n── 진행 ──')
  const notLive = await rpc(ref.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: 'before-start-1',
  })
  check('시작 전에는 점수를 넣을 수 없다', notLive.status >= 400, `status=${notLive.status}`)

  const started = await rpc(ref.token, 'start_match', { p_match_id: matchId })
  check('심판이 경기를 시작한다', started.status === 200, `status=${started.status}`)

  // 조커조(A) 를 10점까지 올린다
  for (let i = 1; i <= 10; i++) {
    await rpc(ref.token, 'record_score', {
      p_match_id: matchId,
      p_side: 'A',
      p_delta: 1,
      p_client_event_id: `evt-alpha-${String(i).padStart(3, '0')}`,
    })
  }
  const at10 = await db.query<{ score_a: number; status: string }>(
    `select score_a, status from matches where id=$1`,
    [matchId],
  )
  check(
    '조커조 10점에서는 아직 안 끝난다',
    at10.rows[0]!.score_a === 10 && at10.rows[0]!.status === 'live',
    `${at10.rows[0]!.score_a}점 / ${at10.rows[0]!.status}`,
  )

  console.log('\n── 멱등성 (체육관 와이파이 대비) ──')
  for (let i = 0; i < 5; i++) {
    await rpc(ref.token, 'record_score', {
      p_match_id: matchId,
      p_side: 'A',
      p_delta: 1,
      p_client_event_id: 'evt-alpha-010',
    })
  }
  const afterRetry = await db.query<{ score_a: number }>(
    `select score_a from matches where id=$1`,
    [matchId],
  )
  check(
    '같은 요청이 5번 더 도착해도 점수는 그대로다',
    afterRetry.rows[0]!.score_a === 10,
    `${afterRetry.rows[0]!.score_a}점`,
  )

  console.log('\n── 취소 ──')
  await rpc(ref.token, 'undo_score', { p_match_id: matchId })
  const afterUndo = await db.query<{ score_a: number }>(`select score_a from matches where id=$1`, [
    matchId,
  ])
  check(
    '취소하면 한 점 내려간다',
    afterUndo.rows[0]!.score_a === 9,
    `${afterUndo.rows[0]!.score_a}점`,
  )

  const { rows: ledger } = await db.query<{ n: string; voided: string }>(
    `select count(*)::text n, count(*) filter (where voided)::text voided
     from score_events where match_id=$1`,
    [matchId],
  )
  check(
    '원장은 지우지 않고 무효 표시만 한다 (감사 추적)',
    Number(ledger[0]!.n) === 10 && Number(ledger[0]!.voided) === 1,
    `이벤트 ${ledger[0]!.n}개 중 ${ledger[0]!.voided}개 무효`,
  )

  console.log('\n── 종료 (비대칭 목표) ──')
  await rpc(ref.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: 'evt-alpha-redo-010',
  })
  const stillLive = await db.query<{ status: string }>(`select status from matches where id=$1`, [
    matchId,
  ])
  check('다시 10점이어도 안 끝난다', stillLive.rows[0]!.status === 'live')

  await rpc(ref.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: 'evt-alpha-011',
  })
  const finished = await db.query<{
    status: string
    winner_side: string
    score_a: number
    score_b: number
  }>(`select status, winner_side, score_a, score_b from matches where id=$1`, [matchId])
  check(
    '조커조가 11점에 닿는 순간 끝나고 승리한다',
    finished.rows[0]!.status === 'finished' && finished.rows[0]!.winner_side === 'A',
    `${finished.rows[0]!.score_a} : ${finished.rows[0]!.score_b} / ${finished.rows[0]!.status}`,
  )

  const afterFinish = await rpc(ref.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'B',
    p_delta: 1,
    p_client_event_id: 'evt-bravo-after-finish',
  })
  check(
    '끝난 경기에는 점수를 더 넣을 수 없다',
    afterFinish.status >= 400,
    `status=${afterFinish.status}`,
  )

  console.log('\n── 종료 직후 되돌리기 ──')
  const undoAfterFinish = await rpc(ref.token, 'undo_score', { p_match_id: matchId })
  const reopened = await db.query<{ status: string; score_a: number }>(
    `select status, score_a from matches where id=$1`,
    [matchId],
  )
  check(
    '마지막 한 점이 잘못 들어갔으면 심판이 2분 안에 되돌릴 수 있다',
    undoAfterFinish.status === 200 &&
      reopened.rows[0]!.status === 'live' &&
      reopened.rows[0]!.score_a === 10,
    `${reopened.rows[0]!.score_a}점 / ${reopened.rows[0]!.status}`,
  )

  // 다시 끝내고 순위 확인
  await rpc(ref.token, 'record_score', {
    p_match_id: matchId,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: 'evt-alpha-final',
  })

  console.log('\n── 순위 집계 ──')
  const standings = await rpc(admin.token, 'get_standings', { p_tournament_id: t.id })
  const rows = standings.body as unknown as {
    group_name: string
    is_joker: boolean
    played: number
    wins: number
    losses: number
    points: string
    scored: number
    conceded: number
    diff: number
  }[]
  const joker = rows.find((r) => r.is_joker)!
  const normal = rows.find((r) => !r.is_joker)!

  check(
    '조커조가 이겼는데 승점은 0.5점이다',
    joker.wins === 1 && Number(joker.points) === 0.5,
    `${joker.group_name}: ${joker.wins}승 ${joker.losses}패 · 승점 ${joker.points}`,
  )
  check(
    '진 일반조는 승점 0점',
    normal.losses === 1 && Number(normal.points) === 0,
    `${normal.group_name}: ${normal.wins}승 ${normal.losses}패 · 승점 ${normal.points}`,
  )
  check(
    '득실차가 맞다',
    joker.diff === joker.scored - joker.conceded && joker.scored === 11,
    `${joker.scored} 득점 / ${joker.conceded} 실점 / 득실차 ${joker.diff}`,
  )

  const projection = await db.query<{ score_a: number }>(
    `select score_a from matches where id=$1`,
    [matchId],
  )
  const ledgerSum = await db.query<{ s: string }>(
    `select coalesce(sum(delta),0)::text s from score_events
     where match_id=$1 and side='A' and not voided`,
    [matchId],
  )
  check(
    '원장 합계와 화면에 보이는 점수가 일치한다',
    projection.rows[0]!.score_a === Number(ledgerSum.rows[0]!.s),
    `투영 ${projection.rows[0]!.score_a} / 원장 ${ledgerSum.rows[0]!.s}`,
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
