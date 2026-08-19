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

  // ── 대기열 미리 짜기 ────────────────────────────────────────────
  // 규칙을 '편성하는 순간' 이 아니라 '시작하는 순간' 에 검사해야 한다.
  // 지금 뛰는 선수도 몇 분 뒤면 내려오고, 도는 코트도 곧 빈다.
  console.log('\n── 대기열 미리 짜기 ──')
  const { rows: courtRows } = await db.query<{ id: string }>(
    `insert into courts (tournament_id,name,sort_order) values ($1,'1번 코트',1) returning id`,
    [t.id],
  )
  const courtId = courtRows[0]!.id

  const squad = {
    p_tournament_id: t.id,
    p_label: null,
    p_group_a: jokerGroup.id,
    p_players_a: [memberOf('선수1'), memberOf('선수2')],
    p_group_b: normalGroup.id,
    p_players_b: [memberOf('선수3'), memberOf('선수4')],
    p_referees: [],
  }

  const q1 = await rpc(admin.token, 'create_match', { ...squad, p_court_id: courtId })
  const q1Id = (q1.body as unknown as { id: string }).id
  await rpc(admin.token, 'start_match', { p_match_id: q1Id })

  const q2 = await rpc(admin.token, 'create_match', { ...squad, p_court_id: courtId })
  check(
    '진행 중인 코트에도 다음 경기를 줄 세울 수 있다',
    q2.status === 200,
    `status=${q2.status} ${JSON.stringify(q2.body)}`,
  )
  check('지금 뛰는 선수로도 다음 경기를 미리 짤 수 있다', q2.status === 200, `status=${q2.status}`)
  const q2Id = (q2.body as unknown as { id: string }).id

  const startSameCourt = await rpc(admin.token, 'start_match', { p_match_id: q2Id })
  check(
    '같은 코트에서 두 경기를 겹쳐 시작할 수 없다',
    startSameCourt.status === 400 &&
      /진행 중인 경기를 먼저/.test(String((startSameCourt.body as { message?: string })?.message)),
    `status=${startSameCourt.status} ${JSON.stringify(startSameCourt.body)}`,
  )

  // 코트를 비워도 선수가 겹치면 시작할 수 없어야 한다 (검사가 코트에만
  // 걸려 있으면 여기서 통과해버린다)
  await db.query(`update matches set court_id=null where id=$1`, [q2Id])
  const startSamePlayers = await rpc(admin.token, 'start_match', { p_match_id: q2Id })
  check(
    '선수가 다른 코트에서 뛰는 중이면 시작할 수 없다',
    startSamePlayers.status === 400 &&
      /다른 코트에서 경기 중/.test(
        String((startSamePlayers.body as { message?: string })?.message),
      ),
    `status=${startSamePlayers.status} ${JSON.stringify(startSamePlayers.body)}`,
  )

  await rpc(admin.token, 'record_score', {
    p_match_id: q1Id,
    p_side: 'A',
    p_delta: 1,
    p_client_event_id: `${q1Id}-queue-a1`,
  })
  await rpc(admin.token, 'finish_match', { p_match_id: q1Id, p_winner_side: 'A' })
  const startAfter = await rpc(admin.token, 'start_match', { p_match_id: q2Id })
  check(
    '앞 경기가 끝나면 대기 경기를 시작할 수 있다',
    startAfter.status === 200,
    `status=${startAfter.status} ${JSON.stringify(startAfter.body)}`,
  )

  // ── 시작 전 경기 고치기 ─────────────────────────────────────────
  console.log('\n── 시작 전 경기 고치기 ──')
  const editable = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: jokerGroup.id,
    p_players_a: [memberOf('선수1'), memberOf('선수2')],
    p_group_b: normalGroup.id,
    p_players_b: [memberOf('선수3'), memberOf('선수4')],
    p_referees: [memberOf('심판')],
  })
  const editId = (editable.body as unknown as { id: string }).id

  // A/B 를 맞바꾼다 — 조커가 A 에서 B 로 간다
  const edited = await rpc(admin.token, 'update_match', {
    p_match_id: editId,
    p_court_id: null,
    p_group_a: normalGroup.id,
    p_players_a: [memberOf('선수3'), memberOf('선수4')],
    p_group_b: jokerGroup.id,
    p_players_b: [memberOf('선수1'), memberOf('선수2')],
    p_referees: [],
  })
  check('시작 전 경기를 고친다', edited.status === 200, `status=${edited.status}`)

  const { rows: editedTeams } = await db.query<{
    side: string
    target_score: number
    win_points: string
    is_joker: boolean
  }>(
    `select side, target_score, win_points, is_joker from match_teams
      where match_id=$1 order by side`,
    [editId],
  )
  check(
    '조를 바꾸면 목표 점수 스냅샷도 따라 바뀐다',
    editedTeams[0]!.target_score === 21 &&
      !editedTeams[0]!.is_joker &&
      editedTeams[1]!.target_score === 11 &&
      editedTeams[1]!.is_joker &&
      Number(editedTeams[1]!.win_points) === 0.5,
    `A: ${editedTeams[0]!.target_score}점 / B: ${editedTeams[1]!.target_score}점 ` +
      `— 여기가 안 바뀌면 조커조가 21점을 내야 이기는 경기가 된다`,
  )

  const { rows: editedPlayers } = await db.query<{ n: string }>(
    `select count(*)::text n from match_team_players mtp
       join match_teams mt on mt.id = mtp.match_team_id
      where mt.match_id=$1`,
    [editId],
  )
  check('선수가 4명 그대로다 (중복 생성 없음)', editedPlayers[0]!.n === '4', `${editedPlayers[0]!.n}명`)

  const { rows: editedRefs } = await db.query<{ n: string }>(
    `select count(*)::text n from match_referees where match_id=$1`,
    [editId],
  )
  check('심판을 비우면 실제로 비워진다', editedRefs[0]!.n === '0', `${editedRefs[0]!.n}명`)

  const wrongGroup = await rpc(admin.token, 'update_match', {
    p_match_id: editId,
    p_court_id: null,
    p_group_a: normalGroup.id,
    p_players_a: [memberOf('선수1'), memberOf('선수2')],
    p_group_b: jokerGroup.id,
    p_players_b: [memberOf('선수3'), memberOf('선수4')],
    p_referees: [],
  })
  check(
    '조에 속하지 않은 선수는 넣을 수 없다 (편성과 같은 규칙)',
    wrongGroup.status >= 400,
    `status=${wrongGroup.status}`,
  )

  const byPlayer = await rpc(players[0]!.token, 'update_match', {
    p_match_id: editId,
    p_court_id: null,
    p_group_a: normalGroup.id,
    p_players_a: [memberOf('선수3'), memberOf('선수4')],
    p_group_b: jokerGroup.id,
    p_players_b: [memberOf('선수1'), memberOf('선수2')],
    p_referees: [],
  })
  check('일반 참가자는 경기를 고칠 수 없다', byPlayer.status >= 400, `status=${byPlayer.status}`)

  // 이미 끝난 경기(matchId)는 못 고친다 — 점수가 누구 것인지 알 수 없어진다
  const editFinished = await rpc(admin.token, 'update_match', {
    p_match_id: matchId,
    p_court_id: null,
    p_group_a: normalGroup.id,
    p_players_a: [memberOf('선수3'), memberOf('선수4')],
    p_group_b: jokerGroup.id,
    p_players_b: [memberOf('선수1'), memberOf('선수2')],
    p_referees: [],
  })
  check(
    '끝난 경기는 고칠 수 없다',
    editFinished.status >= 400,
    `status=${editFinished.status} — 점수가 붙어 있는데 선수를 바꾸면 그 점수가 누구 것인지 알 수 없다`,
  )


  // ── 무효 처리 ───────────────────────────────────────────────────
  // 대회 중에 엉뚱한 경기에 점수를 넣는 일은 실제로 일어난다.
  // 되돌릴 방법이 없으면 순위가 틀린 채로 대회가 끝난다.
  console.log('\n── 무효 처리 ──')
  const before = await rpc(admin.token, 'get_standings', { p_tournament_id: t.id })
  const beforeRows = before.body as unknown as { group_id: string; points: string; played: string }[]
  const jokerBefore = beforeRows.find((r) => r.group_id === jokerGroup.id)!

  const voided = await rpc(admin.token, 'void_match', {
    p_match_id: matchId,
    p_reason: '엉뚱한 경기에 기록함',
  })
  check('관리자가 경기를 무효 처리한다', voided.status === 200, `status=${voided.status}`)

  const after = await rpc(admin.token, 'get_standings', { p_tournament_id: t.id })
  const afterRows = after.body as unknown as { group_id: string; points: string; played: string }[]
  const jokerAfter = afterRows.find((r) => r.group_id === jokerGroup.id)!
  check(
    '무효 경기는 순위 집계에서 빠진다',
    Number(jokerAfter.played) === Number(jokerBefore.played) - 1 &&
      Number(jokerAfter.points) < Number(jokerBefore.points),
    `경기 ${jokerBefore.played}→${jokerAfter.played}, 승점 ${jokerBefore.points}→${jokerAfter.points}`,
  )

  const { rows: keptEvents } = await db.query<{ n: string }>(
    `select count(*)::text n from score_events where match_id=$1`,
    [matchId],
  )
  check(
    '점수 기록 자체는 지워지지 않는다',
    Number(keptEvents[0]!.n) > 0,
    `${keptEvents[0]!.n}건 — 지우면 왜 무효인지 나중에 확인할 수 없다`,
  )

  const { rows: auditRow } = await db.query<{ n: string }>(
    `select count(*)::text n from audit_logs where tournament_id=$1 and action='match.void'`,
    [t.id],
  )
  check('변경 기록에 남는다', Number(auditRow[0]!.n) > 0, `${auditRow[0]!.n}건`)

  const byRef = await rpc(ref.token, 'void_match', { p_match_id: matchId, p_reason: null })
  check('심판은 무효 처리할 수 없다', byRef.status >= 400, `status=${byRef.status}`)

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
