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

  console.log('\n── 코트를 안 정하면 알리지 않는다 ──')
  // 편성만 해두고 코트를 안 정하면 언제 뛰는지 알 수 없다.
  // 그 상태로 알림이 가면 받는 사람이 할 게 없다.
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

  const { rows: beforeCourt } = await db.query(
    `select 1 from notification_outbox where match_id=$1`,
    [matchId],
  )
  check('코트 미배정 상태에서는 알림이 안 쌓인다', beforeCourt.length === 0, `${beforeCourt.length}건`)

  console.log('\n── 코트에 배정돼 앞줄에 서면 관련된 사람에게만 쌓인다 ──')
  const { rows: courtRows } = await db.query<{ id: string }>(
    `insert into courts (tournament_id,name,sort_order) values ($1,'1번 코트',1) returning id`,
    [t.id],
  )
  const assigned = await fetch(`${URL_BASE}/rest/v1/matches?id=eq.${matchId}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${admin.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ court_id: courtRows[0]!.id }),
  })
  check('관리자가 코트를 배정한다', assigned.status === 200, `status=${assigned.status}`)

  const { rows: box } = await db.query<{ user_id: string; kind: string }>(
    `select user_id, kind from notification_outbox where match_id=$1`,
    [matchId],
  )
  const notified = new Set(box.map((r) => r.user_id))
  check('뛰는 선수 4명 모두에게 쌓인다', p.every((x) => notified.has(x.uid)), `쌓인 수 ${notified.size}`)
  check('심판에게도 쌓인다', notified.has(ref.uid))
  check('상관없는 참가자에게는 안 쌓인다', !notified.has(bystander.uid))
  check('배정한 본인에게는 안 쌓인다', !notified.has(admin.uid), '자기가 배정한 걸 자기 폰이 알릴 이유가 없다')
  check('사람 수만큼만 쌓인다 (중복 없음)', box.length === 5, `${box.length}건`)
  check(
    "종류가 'up_next' 다",
    box.length > 0 && box.every((r) => r.kind === 'up_next'),
    box[0]?.kind ?? '(없음)',
  )

  console.log('\n── 코트를 지정해서 편성해도 알린다 ──')
  // create_match 는 경기를 먼저 넣고 선수를 나중에 넣는다. 일반 트리거였다면
  // 이 경우 '알릴 사람이 없다' 고 판단해 조용히 아무것도 안 보냈을 것이다.
  const withCourt = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: courtRows[0]!.id,
    p_label: null,
    p_group_a: groups[0]!.id,
    p_players_a: [memberOf('선수1').id, memberOf('선수2').id],
    p_group_b: groups[1]!.id,
    p_players_b: [memberOf('선수3').id, memberOf('선수4').id],
    p_referees: [],
  })
  const withCourtId = (withCourt.body as unknown as { id: string } | null)?.id
  const { rows: box2 } = await db.query(
    `select 1 from notification_outbox where match_id=$1`,
    [withCourtId ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '코트를 지정해 편성하면 그 자리에서 쌓인다',
    withCourt.status === 200 && box2.length === 4,
    `status=${withCourt.status} / ${box2.length}건 (선수 4명)`,
  )

  console.log('\n── 뒷줄은 아직 알리지 않는다 ──')
  /*
   * 알림의 요점이 여기 있다. 코트에 걸리기만 하면 알리던 예전 방식은
   * 앞에 다섯 경기가 밀려 있어도 똑같이 울렸다. 지금은 순번이 앞으로
   * 당겨질 때 울린다.
   *
   * 이 시점의 1번 코트 대기열: [첫 경기, 코트지정 경기] ← 둘 다 이미 알림이 나갔다
   * 여기에 하나 더 넣으면 3번째라 아직 알릴 때가 아니다.
   */
  const third = await rpc(admin.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: courtRows[0]!.id,
    p_label: null,
    p_group_a: groups[0]!.id,
    p_players_a: [memberOf('선수1').id, memberOf('선수2').id],
    p_group_b: groups[1]!.id,
    p_players_b: [memberOf('선수3').id, memberOf('선수4').id],
    p_referees: [],
  })
  const thirdId = (third.body as unknown as { id: string } | null)?.id
  const NO_MATCH = '00000000-0000-0000-0000-000000000000'
  check('세 번째 경기 편성', third.status === 200 && Boolean(thirdId), `status=${third.status}`)

  const { rows: thirdBox } = await db.query(
    `select 1 from notification_outbox where match_id=$1`,
    [thirdId ?? NO_MATCH],
  )
  check('대기 3번째에게는 아직 안 쌓인다', thirdBox.length === 0, `${thirdBox.length}건`)

  console.log('\n── 앞 경기가 시작되면 한 칸씩 당겨지고, 그때 알린다 ──')
  /*
   * 바뀐 행은 '첫 경기' 하나뿐인데 알림은 '세 번째 경기' 사람들에게 가야 한다.
   * 트리거가 바뀐 행이 아니라 그 코트의 줄 전체를 다시 세지 않으면 여기서 걸린다.
   */
  const started = await rpc(admin.token, 'start_match', { p_match_id: matchId })
  check('첫 경기를 시작한다', started.status === 200, `status=${started.status}`)

  const { rows: thirdBox2 } = await db.query<{ user_id: string; kind: string }>(
    `select user_id, kind from notification_outbox where match_id=$1`,
    [thirdId ?? NO_MATCH],
  )
  check(
    '2번째로 올라온 경기의 선수들에게 쌓인다',
    thirdBox2.length === 4 && thirdBox2.every((r) => r.kind === 'up_next'),
    `${thirdBox2.length}건 / ${thirdBox2[0]?.kind ?? '(없음)'}`,
  )

  console.log('\n── 같은 경기로 두 번 울리지 않는다 ──')
  // 관리자가 대진표를 정리하는 동안 순번이 몇 번씩 흔들린다.
  // 그때마다 전원의 폰이 울리면 아무도 알림을 안 보게 된다.
  await rpc(admin.token, 'set_court_queue', {
    p_tournament_id: t.id,
    p_court_id: courtRows[0]!.id,
    p_match_ids: [thirdId, withCourtId],
  })
  const { rows: thirdBox3 } = await db.query(
    `select 1 from notification_outbox where match_id=$1`,
    [thirdId ?? NO_MATCH],
  )
  check('순서를 바꿔도 다시 쌓이지 않는다', thirdBox3.length === 4, `${thirdBox3.length}건`)

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
  // 위에서 경기를 둘 만들었고(코트 배정 1 + 코트 지정 편성 1) 선수1 은 둘 다 뛴다
  check('선수는 자기 알림을 본다', mineRows.length === 2, `${mineRows.length}건`)
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
  const pend = (await asService.json()) as {
    outbox_id: string
    title: string
    body: string
    url: string
  }[]
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
  check(
    '제목이 어느 코트인지 알려준다',
    Boolean(forThisMatch[0]?.title.includes('1번 코트')),
    `${forThisMatch[0]?.title ?? '(없음)'} — 받는 사람이 알아야 할 건 어디로 가느냐다`,
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
