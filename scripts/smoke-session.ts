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

  /*
   * 경기 고치기 절을 위한 세 명. 고치는 것과 **다른 코트에서 뛰는 것**을 동시에
   * 세워야 '한 사람이 두 코트' 검사가 실제로 걸린다. 네 명만으로는 고칠
   * 경기의 선수가 곧 다른 경기의 선수라 무엇을 검사했는지 가려진다.
   *
   * `players` 에 안 넣는다 — 그 배열은 아래 대조군 대회에도 그대로 들어가고,
   * 거기서는 네 명이 두 조로 갈려 있어야 한다.
   */
  const extras = [
    await makeUser(db, 'p5', '마바사'),
    await makeUser(db, 'p6', '아자차'),
    await makeUser(db, 'p7', '카타파'),
  ]

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

  for (const u of [...players, ...extras, outsider]) {
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

  console.log('\n── 모임 경기를 제자리에서 고친다 (update_session_match) ──')

  /*
   * 고칠 경기 하나와, 그 뒤에 서 있는 경기 하나.
   *
   * 뒤 경기가 필요한 이유는 하나다 — **자리가 안 밀렸다** 를 증명하려면
   * 비교 대상이 있어야 한다. 우회(지우고 다시 만들기)에서는 새 경기가
   * queue_order 기본값(시퀀스)을 받아 여기서 순서가 뒤집혔다.
   */
  const eA = await rpc(host.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('사아자').id, M('차카타').id],
    p_label: '자동',
  })
  check('고칠 경기를 만든다', eA.status === 200, `status=${eA.status} ${JSON.stringify(eA.body)}`)
  const eAId = (eA.body as unknown as { id: string } | null)?.id

  const eB = await rpc(host.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: courts[0]!.id,
    p_players_a: [M('마바사').id, M('아자차').id],
    p_players_b: [M('카타파').id, M('모임장').id],
  })
  const eBId = (eB.body as unknown as { id: string } | null)?.id

  /** 그 경기의 편성을 사람 이름으로 한 줄로 — 바뀌었나/그대로인가를 이걸로 본다 */
  async function lineup(matchId: string | undefined) {
    const { rows } = await db.query<{ sig: string | null }>(
      `select string_agg(mt.side || ':' || tm.display_name, ' ' order by mt.side, tm.display_name) as sig
         from match_teams mt
         join match_team_players mtp on mtp.match_team_id = mt.id
         join tournament_members tm  on tm.id = mtp.member_id
        where mt.match_id = $1`,
      [matchId ?? '00000000-0000-0000-0000-000000000000'],
    )
    return rows[0]?.sig ?? ''
  }

  async function matchRow(matchId: string | undefined) {
    const { rows } = await db.query<{
      queue_order: string
      court_id: string | null
      label: string | null
      status: string
    }>(`select queue_order, court_id, label, status from matches where id=$1`, [
      matchId ?? '00000000-0000-0000-0000-000000000000',
    ])
    return rows[0]
  }

  const beforeA = await matchRow(eAId)
  const beforeB = await matchRow(eBId)
  const beforeLineup = await lineup(eAId)

  console.log('\n   · 권한')
  const byOutsider = await rpc(outsider.token, 'update_session_match', {
    p_match_id: eAId,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('사아자').id],
    p_players_b: [M('라마바').id, M('차카타').id],
    p_label: null,
  })
  check(
    '그 경기에 없는 참가자는 못 고친다',
    byOutsider.status >= 400,
    `status=${byOutsider.status} — can_run_match 의 '자기 경기' 경계가 여기도 그대로여야 한다`,
  )
  check(
    '거절해도 편성은 그대로다',
    (await lineup(eAId)) === beforeLineup,
    `${await lineup(eAId)}`,
  )

  console.log('\n   · 고치면 바뀌고, 경기 id 와 자리는 그대로다')
  /*
   * **뛰는 사람이 부른다.** 고치기는 남을 빼는 일이지만 경계는
   * `can_run_match` 하나여야 한다 — 넣는 쪽(`create_session_match`)이 이미
   * 열려 있는데 빼는 쪽만 막으면, 잘못 넣은 사람을 본인이 못 뺀다.
   */
  const edited = await rpc(players[0]!.token, 'update_session_match', {
    p_match_id: eAId,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('사아자').id],
    p_players_b: [M('라마바').id, M('차카타').id],
    // 화면이 labelAfterHumanEdit 로 '자동' 을 떼고 보낸 그대로
    p_label: null,
  })
  check(
    '그 경기에 뛰는 사람이 편성을 고칠 수 있다',
    edited.status === 200,
    `status=${edited.status} ${JSON.stringify(edited.body)}`,
  )
  check(
    '경기 id 가 그대로다 — 지우고 다시 만든 것이 아니다',
    (edited.body as unknown as { id: string } | null)?.id === eAId,
    `${(edited.body as unknown as { id: string } | null)?.id} vs ${eAId}`,
  )

  const afterA = await matchRow(eAId)
  check(
    'queue_order 가 그대로다 — 대기 줄에서 자리가 안 밀린다',
    afterA?.queue_order === beforeA?.queue_order,
    `${beforeA?.queue_order} → ${afterA?.queue_order}`,
  )
  check(
    '뒤에 선 경기보다 여전히 앞이다',
    Number(afterA?.queue_order) < Number(beforeB?.queue_order),
    `${afterA?.queue_order} < ${beforeB?.queue_order} — 우회에서는 여기가 뒤집혔다`,
  )
  check(
    '편성이 실제로 바뀌었다',
    (await lineup(eAId)) === 'A:가나다 A:사아자 B:라마바 B:차카타',
    await lineup(eAId),
  )
  check(
    "'자동' 표시가 없어진다 (화면이 떼고 보낸다)",
    afterA?.label === null,
    String(afterA?.label),
  )

  const { rows: eaTeams } = await db.query<{ group_id: string | null; target_score: number }>(
    `select group_id, target_score from match_teams where match_id=$1`,
    [eAId ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '팀이 둘이고 조는 여전히 없다 (group_id NULL)',
    eaTeams.length === 2 && eaTeams.every((t) => t.group_id === null && t.target_score === 21),
    JSON.stringify(eaTeams),
  )

  console.log('\n   · 🔴 실패하면 아무것도 안 바뀐다 (원자성)')
  /*
   * **이 절이 이 작업의 핵심이다.**
   *
   * 검증에서 거절되는 것은 원자성의 증거가 아니다 — 그때는 애초에 쓰기가
   * 시작되지 않는다. 증명하려면 **팀을 지우고 다시 넣는 도중에** 터뜨려야
   * 한다. 그래서 이 경기 하나에만 걸리는 트리거를 잠깐 심는다.
   *
   * 우회(지우고 다시 만들기)였다면 여기서 경기가 통째로 사라졌다.
   * 한 트랜잭션이면 delete 까지 되돌아가 고치기 전 그대로 남는다.
   */
  const atomicBefore = await lineup(eAId)
  const atomicRowBefore = await matchRow(eAId)
  try {
    // 이 경기 하나에만 걸린다 — 다른 트래픽은 그대로 지나간다
    await db.query(
      `create or replace function smoke_block_lineup() returns trigger
         language plpgsql as $t$
       begin
         if exists (select 1 from match_teams mt
                     where mt.id = new.match_team_id
                       and mt.match_id = '${eAId}'::uuid) then
           raise exception 'smoke: injected failure';
         end if;
         return new;
       end $t$`,
    )
    await db.query(
      `create trigger smoke_block_lineup before insert on match_team_players
         for each row execute function smoke_block_lineup()`,
    )

    const boom = await rpc(host.token, 'update_session_match', {
      p_match_id: eAId,
      p_court_id: courts[1]!.id,
      p_players_a: [M('가나다').id, M('라마바').id],
      p_players_b: [M('사아자').id, M('차카타').id],
      p_label: '실패해야 하는 이름',
    })
    check('편성 쓰기 도중에 터지면 400 이다', boom.status >= 400, `status=${boom.status}`)
  } finally {
    await db.query(`drop trigger if exists smoke_block_lineup on match_team_players`)
    await db.query(`drop function if exists smoke_block_lineup()`)
  }

  const atomicAfter = await matchRow(eAId)
  check(
    '경기가 그대로 있다 — 우회였다면 여기서 사라졌다',
    atomicAfter !== undefined,
    String(atomicAfter?.status),
  )
  check(
    '편성이 하나도 안 바뀌었다 (delete 까지 되돌아간다)',
    (await lineup(eAId)) === atomicBefore,
    `${atomicBefore} → ${await lineup(eAId)}`,
  )
  check(
    '코트도 이름도 안 바뀌었다',
    atomicAfter?.court_id === atomicRowBefore?.court_id &&
      atomicAfter?.label === atomicRowBefore?.label,
    `${atomicRowBefore?.court_id}/${atomicRowBefore?.label} → ${atomicAfter?.court_id}/${atomicAfter?.label}`,
  )

  console.log('\n   · 다른 코트에서 뛰는 중인 사람은 못 넣는다')
  const eC = await rpc(host.token, 'create_session_match', {
    p_tournament_id: s.id,
    p_court_id: courts[1]!.id,
    p_players_a: [M('마바사').id, M('아자차').id],
    p_players_b: [M('카타파').id, M('모임장').id],
  })
  const eCId = (eC.body as unknown as { id: string } | null)?.id
  const cStart = await rpc(host.token, 'start_match', { p_match_id: eCId })
  check('다른 코트에서 한 경기를 시작한다', cStart.status === 200, `status=${cStart.status}`)

  const busyEdit = await rpc(host.token, 'update_session_match', {
    p_match_id: eAId,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('사아자').id],
    p_players_b: [M('라마바').id, M('마바사').id],
    p_label: null,
  })
  check(
    '이미 다른 경기에서 뛰는 사람을 넣으면 거절한다',
    busyEdit.status >= 400,
    `status=${busyEdit.status} — start_match 와 같은 기준(다른 경기가 live)`,
  )
  check(
    '거절 문구가 누구 때문인지 말한다',
    String((busyEdit.body as { message?: string } | null)?.message ?? '').includes('마바사'),
    String((busyEdit.body as { message?: string } | null)?.message ?? '(없음)'),
  )
  check('거절했으니 편성도 그대로다', (await lineup(eAId)) === atomicBefore, await lineup(eAId))

  console.log('\n   · 예정 경기만 고친다')
  await rpc(host.token, 'start_match', { p_match_id: eAId })
  const liveEdit = await rpc(host.token, 'update_session_match', {
    p_match_id: eAId,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('사아자').id, M('차카타').id],
    p_label: null,
  })
  check(
    '진행 중인 경기는 못 고친다',
    liveEdit.status >= 400,
    `status=${liveEdit.status} — 점수가 붙은 뒤 선수를 바꾸면 그 점수가 누구 것인지 알 수 없다`,
  )

  await rpc(host.token, 'finish_match', { p_match_id: eAId })
  const doneEdit = await rpc(host.token, 'update_session_match', {
    p_match_id: eAId,
    p_court_id: courts[0]!.id,
    p_players_a: [M('가나다').id, M('라마바').id],
    p_players_b: [M('사아자').id, M('차카타').id],
    p_label: null,
  })
  check('끝난 경기도 못 고친다', doneEdit.status >= 400, `status=${doneEdit.status}`)
  check('끝난 뒤에도 편성은 그대로다', (await lineup(eAId)) === atomicBefore, await lineup(eAId))

  console.log('\n   · 대회 경기는 거절하고 update_match 로 보낸다')
  const wrongKind = await rpc(host.token, 'update_session_match', {
    p_match_id: tMatchId,
    p_court_id: null,
    p_players_a: [TM('가나다').id, TM('라마바').id],
    p_players_b: [TM('사아자').id, TM('차카타').id],
    p_label: null,
  })
  check(
    '대회 경기로 부르면 거절한다',
    wrongKind.status >= 400,
    `status=${wrongKind.status} — 여기서 고치면 group_id 가 NULL 이 되어 순위표에서 사라진다`,
  )
  check(
    "거절 문구가 '대회 경기' 라고 말한다",
    String((wrongKind.body as { message?: string } | null)?.message ?? '').includes('대회 경기'),
    String((wrongKind.body as { message?: string } | null)?.message ?? '(없음)'),
  )

  const { rows: tTeams } = await db.query<{ group_id: string | null }>(
    `select group_id from match_teams where match_id=$1`,
    [tMatchId ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '대회 경기의 조가 그대로 남아 있다',
    tTeams.length === 2 && tTeams.every((t) => t.group_id !== null),
    JSON.stringify(tTeams.map((t) => t.group_id)),
  )

  console.log('\n   · 감사로그')
  const { rows: audit } = await db.query<{
    action: string
    before: { playersA?: string[] } | null
    after: { playersA?: string[] } | null
  }>(
    `select action, before, after from audit_logs
      where tournament_id=$1 and action='match.edit' and target_id=$2
      order by created_at desc limit 1`,
    [s.id, eAId ?? '00000000-0000-0000-0000-000000000000'],
  )
  check('match.edit 로 남는다 — 삭제+생성이 아니다', audit.length === 1, `${audit.length}행`)
  /*
   * 편이 바뀐 것을 알아보려면 **선수가 어느 편이었나** 가 남아야 한다.
   * to_jsonb(matches) 만 남기면 선수는 그 행에 없어서 before 와 after 가
   * 똑같아 보인다 — 그러면 감사로그를 남길 이유가 없다.
   */
  check(
    'before 에 고치기 전 A팀이 남는다',
    JSON.stringify(audit[0]?.before?.playersA ?? []) === JSON.stringify(['가나다', '라마바']),
    JSON.stringify(audit[0]?.before?.playersA ?? []),
  )
  check(
    'after 에 고친 뒤 A팀이 남는다',
    JSON.stringify(audit[0]?.after?.playersA ?? []) === JSON.stringify(['가나다', '사아자']),
    JSON.stringify(audit[0]?.after?.playersA ?? []),
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
