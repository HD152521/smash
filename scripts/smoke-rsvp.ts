/**
 * 모임 참가 신청(마일스톤 2)이 실제 DB 에서 도는지 확인한다.
 *
 * 이 마이그레이션의 값은 **"버튼을 누를 수 있는 상태로 미리 만들어 둔다"** 에 있다.
 * 크론도 배치도 없이, 모임을 여는 순간 동아리 회원 전원을 명단에 심어 두고
 * rsvp 만 바꾼다. 그래서 검증해야 할 것은 세 종류다.
 *
 *   · 심기가 맞는가        — 전원이 심어졌는가, 역할과 초기 rsvp 가 맞는가.
 *                            **심어지지 않으면 tournaments_select 가 막아서
 *                            회원에게 모임 자체가 안 보인다** — 참가 버튼이
 *                            있는 화면에 도달할 수가 없다
 *   · 누르기가 맞는가      — 본인 행만, 모임에서만, 시작 뒤에도, 몇 번을 눌러도
 *   · 안 깨졌는가 (회귀)   — 동아리 없는 모임 · 대회가 예전과 똑같이 도는가.
 *                            rsvp 가 대회 쪽으로 새면 순위표가 조용히 망가진다
 *
 *   npm run db:smoke:rsvp
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
  body: unknown
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
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null }
}

async function rpc(token: string, fn: string, args: unknown): Promise<ApiResult> {
  return api(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
}

function obj(r: ApiResult): Record<string, unknown> {
  return (r.body ?? {}) as Record<string, unknown>
}
function msg(r: ApiResult): string {
  return String(obj(r)['message'] ?? obj(r)['error'] ?? '(없음)')
}
/** PostgREST 는 raise 의 errcode 를 body.code 로 그대로 돌려준다. */
function errcode(r: ApiResult): string {
  return String(obj(r)['code'] ?? '(없음)')
}

const emails: string[] = []

async function makeUser(db: Client, tag: string, name: string) {
  const email = `rsvp-${tag}-${Date.now()}@smashtest.local`
  const password = 'RsvpTest12345!'
  const { rows: created } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,
       email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,
       confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1,crypt($2,gen_salt('bf')),now(),now(),now(),
       '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('name',$3::text),
       '','','','','') returning id`,
    [email, password, name],
  )
  const uid = created[0]!.id
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

// 표시명 20자 경계 — unique_display_name 은 19자로 자른 뒤 접미사를 붙인다.
const NAME20 = '가나다라마바사아자차카타파하거너더러머버'
const NAME19 = NAME20.slice(0, 19)

const NIL = '00000000-0000-0000-0000-000000000000'

type ClubRow = { id: string; invite_code: string }
type SessionRow = { id: string; invite_code: string; kind: string; starts_at: string | null }
type TmRow = {
  id: string
  user_id: string | null
  role: string
  display_name: string
  rsvp: string
}

const tmRows = async (tid: string) => {
  const { rows } = await db.query<TmRow>(
    `select id, user_id, role, display_name, rsvp
       from tournament_members where tournament_id=$1 order by joined_at, id`,
    [tid],
  )
  return rows
}
const rsvpOf = async (tid: string, uid: string) => {
  const { rows } = await db.query<{ rsvp: string }>(
    `select rsvp from tournament_members where tournament_id=$1 and user_id=$2`,
    [tid, uid],
  )
  return rows[0]?.rsvp ?? '(행 없음)'
}
const startsAtOf = async (tid: string) => {
  const { rows } = await db.query<{ starts_at: Date | null }>(
    `select starts_at from tournaments where id=$1`,
    [tid],
  )
  return rows[0]?.starts_at ?? null
}

const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000)
const PAST = new Date(Date.now() - 3 * 3600 * 1000)

try {
  const owner = await makeUser(db, 'owner', '동아리주인')
  const staff = await makeUser(db, 'staff', '부운영진')
  const m1 = await makeUser(db, 'm1', '회원하나')
  const m2 = await makeUser(db, 'm2', '회원둘')
  const late = await makeUser(db, 'late', '늦게온회원')
  const outsider = await makeUser(db, 'out', '남의사람')
  const twin1 = await makeUser(db, 'twin1', '동명이인하나')
  const twin2 = await makeUser(db, 'twin2', '동명이인둘')

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 0. 동아리를 꾸린다 (운영진 1 · 회원 2 · 계정 없는 회원 1) ──')
  // ══════════════════════════════════════════════════════════════════
  const club = obj(
    await rpc(owner.token, 'create_club', {
      p_name: 'RSVP 스모크 동아리',
      p_display_name: '동아리주인',
      p_description: '참가 신청 실DB 검증용',
    }),
  ) as unknown as ClubRow

  for (const u of [staff, m1, m2]) {
    const joined = await rpc(u.token, 'join_club', {
      p_code: club.invite_code,
      p_display_name: u.name,
    })
    check(`${u.name} 이 동아리에 들어온다`, obj(joined)['ok'] === true, msg(joined))
  }
  const { rows: staffRows } = await db.query<{ id: string }>(
    `select id from club_members where club_id=$1 and user_id=$2`,
    [club.id, staff.uid],
  )
  const promote = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: staffRows[0]!.id,
    p_role: 'admin',
  })
  check('부운영진을 운영진으로 올린다', promote.status === 200, msg(promote))

  // 계정 없는 회원. 아직 이 사람을 넣는 RPC 가 없어서(마일스톤 2 의 다음 조각)
  // 명단 행을 직접 심는다. 검사 대상은 "심는 방법" 이 아니라 "모임을 열 때
  // 이 사람도 함께 심어지는가" 다.
  await db.query(
    `insert into club_members (club_id, user_id, role, display_name)
     values ($1, null, 'member', '계정없는회원')`,
    [club.id],
  )
  const { rows: clubCount } = await db.query<{ n: number }>(
    `select count(*)::int as n from club_members where club_id=$1`,
    [club.id],
  )
  check(
    '동아리 명단이 5명이다 (주인·운영진·회원2·계정없는회원)',
    clubCount[0]!.n === 5,
    `${clubCount[0]!.n}명`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 1. 동아리 모임을 열면 회원 전원이 명단에 심어진다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 심어지지 않으면 tournaments_select(is_tournament_member) 가 막아서
  // 회원에게 모임 자체가 안 보인다. 참가 버튼이 있는 화면에 도달할 수가 없다.
  const createdMain = await rpc(owner.token, 'create_session', {
    p_name: 'RSVP 스모크 모임',
    p_display_name: '동아리주인',
    p_court_count: 2,
    p_club_id: club.id,
    p_starts_at: FUTURE.toISOString(),
  })
  check(
    '모임 생성 RPC (5인자 — p_starts_at 이 맨 뒤에 붙었다)',
    createdMain.status === 200,
    `status=${createdMain.status} ${msg(createdMain)}`,
  )
  const main = obj(createdMain) as unknown as SessionRow

  const mainRows = await tmRows(main.id)
  check(
    '동아리 회원 5명이 전원 심어진다',
    mainRows.length === 5,
    `${mainRows.length}명: ${mainRows.map((r) => `${r.display_name}(${r.role}/${r.rsvp})`).join(' / ')}` +
      ' — 한 명이라도 빠지면 그 사람에게는 모임이 보이지도 않는다',
  )
  check(
    '계정 없는 회원(user_id null)도 심어진다',
    mainRows.some((r) => r.user_id === null && r.display_name === '계정없는회원'),
    mainRows.map((r) => `${r.display_name}:${r.user_id === null ? 'null' : 'uid'}`).join(' / ') +
      ' — 참가를 못 누를 뿐, 모임장이 대신 경기에 넣을 수 있어야 한다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 2. 만든 사람만 going, 나머지는 전부 invited ──')
  // ══════════════════════════════════════════════════════════════════
  check(
    '만든 사람은 going 이다 (자기가 여는 모임에 참가 여부를 다시 묻지 않는다)',
    (await rsvpOf(main.id, owner.uid)) === 'going',
    await rsvpOf(main.id, owner.uid),
  )
  const others = mainRows.filter((r) => r.user_id !== owner.uid)
  check(
    '나머지 4명은 전부 invited 다',
    others.length === 4 && others.every((r) => r.rsvp === 'invited'),
    others.map((r) => `${r.display_name}=${r.rsvp}`).join(' / ') +
      " — 심자마자 going 이면 '참가 12명' 이 거짓말이 된다",
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 3. 동아리 역할이 모임 역할로 옮겨 심어진다 ──')
  // ══════════════════════════════════════════════════════════════════
  const roleOf = (uid: string | null, name?: string) =>
    mainRows.find((r) => (uid ? r.user_id === uid : r.display_name === name))?.role ?? '(행 없음)'
  check('만든 사람 = owner', roleOf(owner.uid) === 'owner', roleOf(owner.uid))
  check(
    '동아리 운영진 = admin (모임을 대신 관리할 수 있어야 한다)',
    roleOf(staff.uid) === 'admin',
    roleOf(staff.uid),
  )
  check(
    '동아리 회원 = member',
    roleOf(m1.uid) === 'member' && roleOf(m2.uid) === 'member',
    `${roleOf(m1.uid)} / ${roleOf(m2.uid)}`,
  )
  check(
    '계정 없는 회원 = member (계정 없는 사람이 admin 으로 심어지는 경로는 없다)',
    roleOf(null, '계정없는회원') === 'member',
    roleOf(null, '계정없는회원'),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 4. 명단은 생성 시점 스냅샷이다 (의도된 귀결) ──')
  // ══════════════════════════════════════════════════════════════════
  const lateJoin = await rpc(late.token, 'join_club', {
    p_code: club.invite_code,
    p_display_name: late.name,
  })
  check('늦게온회원이 동아리에 들어온다', obj(lateJoin)['ok'] === true, msg(lateJoin))
  const afterLate = await tmRows(main.id)
  check(
    '모임을 연 뒤에 들어온 회원은 그 모임 명단에 없다',
    afterLate.length === 5 && !afterLate.some((r) => r.user_id === late.uid),
    `${afterLate.length}명 — 버그가 아니라 마일스톤 1b 와 같은 모양의 스냅샷. 재동기화는 다음 범위다`,
  )
  const lateRsvp = await rpc(late.token, 'set_my_rsvp', {
    p_tournament_id: main.id,
    p_rsvp: 'going',
  })
  check(
    '그래서 늦게 온 회원은 참가를 누를 수도 없다 (42501)',
    errcode(lateRsvp) === '42501',
    `code=${errcode(lateRsvp)} status=${lateRsvp.status} ${msg(lateRsvp)}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 5. 참가/불참을 누른다 — 본인 행만 바뀐다 ──')
  // ══════════════════════════════════════════════════════════════════
  const going = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: main.id, p_rsvp: 'going' })
  check(
    '회원이 참가를 누른다',
    going.status === 200 && (obj(going)['rsvp'] ?? '') === 'going',
    `status=${going.status} rsvp=${String(obj(going)['rsvp'])} ${msg(going)}`,
  )
  check(
    '반환 행이 본인 행이다 (화면이 낙관적 갱신에 그대로 쓴다)',
    obj(going)['user_id'] === m1.uid,
    String(obj(going)['user_id']),
  )
  check(
    '남의 행은 그대로 invited 다',
    (await rsvpOf(main.id, m2.uid)) === 'invited',
    await rsvpOf(main.id, m2.uid),
  )
  check(
    '만든 사람 행도 안 건드린다',
    (await rsvpOf(main.id, owner.uid)) === 'going',
    await rsvpOf(main.id, owner.uid),
  )

  // ── 왕복: 마음이 바뀌는 게 정상이다 ─────────────────────────────
  const declined = await rpc(m1.token, 'set_my_rsvp', {
    p_tournament_id: main.id,
    p_rsvp: 'declined',
  })
  check(
    'going → declined 로 되돌린다',
    declined.status === 200 && (await rsvpOf(main.id, m1.uid)) === 'declined',
    `status=${declined.status} → ${await rsvpOf(main.id, m1.uid)}`,
  )
  const backToGoing = await rpc(m1.token, 'set_my_rsvp', {
    p_tournament_id: main.id,
    p_rsvp: 'going',
  })
  check(
    'declined → going 으로 다시 돌아온다 (한 번 불참하면 끝이 아니다)',
    backToGoing.status === 200 && (await rsvpOf(main.id, m1.uid)) === 'going',
    `status=${backToGoing.status} → ${await rsvpOf(main.id, m1.uid)}`,
  )

  // ── 멱등: 같은 버튼을 두 번 눌러도 조용히 통과한다 ─────────────
  const again = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: main.id, p_rsvp: 'going' })
  check(
    '같은 값을 두 번 눌러도 200 이다 (더블탭·재전송이 에러 토스트를 띄우면 안 된다)',
    again.status === 200 && (obj(again)['rsvp'] ?? '') === 'going',
    `status=${again.status} rsvp=${String(obj(again)['rsvp'])} ${msg(again)}`,
  )
  const { rows: unchanged } = await db.query<{ n: number }>(
    `select count(*)::int as n from tournament_members
       where tournament_id=$1 and user_id=$2 and rsvp='going'`,
    [main.id, m1.uid],
  )
  check('멱등 호출 뒤에도 행은 하나뿐이다', unchanged[0]!.n === 1, `${unchanged[0]!.n}행`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 6. 남의 모임에는 못 누른다 (본인 행만) ──')
  // ══════════════════════════════════════════════════════════════════
  const byOutsider = await rpc(outsider.token, 'set_my_rsvp', {
    p_tournament_id: main.id,
    p_rsvp: 'going',
  })
  check(
    '동아리 밖 사람이 남의 모임에 참가를 누르면 42501',
    errcode(byOutsider) === '42501',
    `code=${errcode(byOutsider)} status=${byOutsider.status} ${msg(byOutsider)}` +
      ' — 참가 인원이 남의 손에 부풀려지면 코트를 잘못 빌린다',
  )
  const notFound = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: NIL, p_rsvp: 'going' })
  check(
    '없는 모임 UUID 도 같은 42501 로 막힌다 (존재 여부가 새지 않는다)',
    errcode(notFound) === '42501',
    `code=${errcode(notFound)} ${msg(notFound)}` +
      " — '없는 모임' 과 '참가자 아님' 이 갈리면 UUID 를 넣어 보며 존재를 알아낼 수 있다",
  )
  const nullRsvp = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: main.id, p_rsvp: null })
  check(
    '참가 여부를 안 보내면 22023',
    errcode(nullRsvp) === '22023',
    `code=${errcode(nullRsvp)} ${msg(nullRsvp)}`,
  )
  const badRsvp = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: main.id, p_rsvp: '아무거나' })
  check(
    '열거형에 없는 값은 400 대로 거절된다',
    badRsvp.status >= 400,
    `status=${badRsvp.status} code=${errcode(badRsvp)} — 화면 오타가 조용히 저장되면 안 된다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 7. 참가는 게이트가 아니다 — 불참자도 경기에 넣을 수 있다 ──')
  // ══════════════════════════════════════════════════════════════════
  await rpc(m2.token, 'set_my_rsvp', { p_tournament_id: main.id, p_rsvp: 'declined' })
  const { rows: mainCourts } = await db.query<{ id: string }>(
    `select id from courts where tournament_id=$1 order by sort_order`,
    [main.id],
  )
  const mainRoster = await tmRows(main.id)
  const R = (name: string) => mainRoster.find((r) => r.display_name === name)!
  const gateMatch = await rpc(owner.token, 'create_session_match', {
    p_tournament_id: main.id,
    p_court_id: mainCourts[0]!.id,
    p_players_a: [R('동아리주인').id, R('회원하나').id],
    p_players_b: [R('회원둘').id, R('계정없는회원').id],
  })
  check(
    "불참(declined)·미응답(invited)·계정 없는 회원까지 한 경기에 넣을 수 있다",
    gateMatch.status === 200,
    `status=${gateMatch.status} ${msg(gateMatch)}` +
      ' — 누르지 않으면 못 치게 하는 앱은 동아리에서 미움받는다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 8. 이미 시작한 모임에서도 눌러진다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 늦게 도착해서 누르는 게 정상 경로다. 서버는 '시작했나' 를 판단하지 않는다.
  const createdPast = await rpc(owner.token, 'create_session', {
    p_name: '이미 시작한 모임',
    p_display_name: '동아리주인',
    p_court_count: 1,
    p_club_id: club.id,
    p_starts_at: PAST.toISOString(),
  })
  check(
    '과거 시각으로도 모임이 만들어진다 (어제 친 모임을 나중에 기록하는 길)',
    createdPast.status === 200,
    `status=${createdPast.status} ${msg(createdPast)}` +
      " — 서버가 '미래여야 한다' 를 우기면 시계가 어긋난 기기에서 개설이 막힌다",
  )
  const past = obj(createdPast) as unknown as SessionRow
  const pastStored = await startsAtOf(past.id)
  check(
    '과거 시각이 그대로 저장된다',
    pastStored !== null && Math.abs(pastStored.getTime() - PAST.getTime()) < 2000,
    `${String(pastStored)} (보낸 값 ${PAST.toISOString()})`,
  )
  const lateArrival = await rpc(m1.token, 'set_my_rsvp', {
    p_tournament_id: past.id,
    p_rsvp: 'going',
  })
  check(
    '시작 시각이 지난 모임에도 참가를 누를 수 있다',
    lateArrival.status === 200 && (await rsvpOf(past.id, m1.uid)) === 'going',
    `status=${lateArrival.status} ${msg(lateArrival)}` + ' — 늦게 도착해서 누르는 게 정상 경로다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 9. p_starts_at 없이 부르면 즉석 모임이 된다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 인자가 맨 뒤에 default null 로 붙었으므로, 안 보내는 기존 호출이 그대로 산다.
  const createdNow = await rpc(owner.token, 'create_session', {
    p_name: '지금 모여서 치는 날',
    p_display_name: '동아리주인',
    p_court_count: 1,
    p_club_id: club.id,
  })
  check(
    'p_starts_at 을 안 보내는 옛 호출이 그대로 200 이다',
    createdNow.status === 200,
    `status=${createdNow.status} ${msg(createdNow)} — 여기서 깨지면 배포 순간 모임 생성이 통째로 막힌다`,
  )
  const now = obj(createdNow) as unknown as SessionRow
  check(
    'starts_at 이 NULL 이다 (화면은 곧바로 진행 화면을 그린다)',
    (await startsAtOf(now.id)) === null,
    String(await startsAtOf(now.id)),
  )

  // ── 만든 뒤에 시각을 고치는 길이 열려 있다 (잠그지 않았다) ──────
  const newTime = new Date(Date.now() + 5 * 24 * 3600 * 1000)
  const patchByOwner = await api(owner.token, `tournaments?id=eq.${now.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ starts_at: newTime.toISOString() }),
  })
  const patched = await startsAtOf(now.id)
  check(
    '모임장은 나중에 시각을 넣을 수 있다 (guard 로 잠그지 않았다)',
    patched !== null && Math.abs(patched.getTime() - newTime.getTime()) < 2000,
    `${String(patched)} (응답 ${patchByOwner.status})`,
  )
  const patchByMember = await api(m1.token, `tournaments?id=eq.${now.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ starts_at: PAST.toISOString() }),
  })
  const afterMemberPatch = await startsAtOf(now.id)
  check(
    '일반 회원이 시각을 바꾸면 아무 행도 안 바뀐다 (RLS)',
    afterMemberPatch !== null &&
      Math.abs(afterMemberPatch.getTime() - newTime.getTime()) < 2000 &&
      Array.isArray(patchByMember.body) &&
      (patchByMember.body as unknown[]).length === 0,
    `status=${patchByMember.status} 반환 ${JSON.stringify(patchByMember.body)}` +
      ' — ⚠ 화면은 상태코드가 아니라 **반환 행 수**로 성패를 판정해야 한다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 10. 동아리 없는 모임은 예전 그대로 주최자 한 명뿐이다 (회귀) ──')
  // ══════════════════════════════════════════════════════════════════
  const createdSolo = await rpc(owner.token, 'create_session', {
    p_name: '동아리 없는 모임',
    p_display_name: '동아리주인',
    p_court_count: 2,
  })
  check(
    '동아리 없이 모임을 여는 기존 경로가 산다',
    createdSolo.status === 200,
    `status=${createdSolo.status} ${msg(createdSolo)}`,
  )
  const solo = obj(createdSolo) as unknown as SessionRow
  const soloRows = await tmRows(solo.id)
  check(
    '명단에 만든 사람 한 명만 있다',
    soloRows.length === 1 && soloRows[0]!.user_id === owner.uid,
    `${soloRows.length}명: ${soloRows.map((r) => r.display_name).join(' / ')}` +
      ' — 여기가 늘어나면 동아리 없는 사용자의 모임에 유령 참가자가 생긴 것이다',
  )
  check(
    '그 한 명은 owner/going 이다',
    soloRows[0]!.role === 'owner' && soloRows[0]!.rsvp === 'going',
    `${soloRows[0]!.role}/${soloRows[0]!.rsvp}`,
  )
  const soloByOther = await rpc(m1.token, 'set_my_rsvp', {
    p_tournament_id: solo.id,
    p_rsvp: 'going',
  })
  check(
    '남의 모임 tournament_id 를 넣어도 42501 (본인 행만)',
    errcode(soloByOther) === '42501',
    `code=${errcode(soloByOther)} status=${soloByOther.status} ${msg(soloByOther)}`,
  )
  check(
    '코트는 예전처럼 함께 만들어진다',
    (
      await db.query<{ n: number }>(
        `select count(*)::int as n from courts where tournament_id=$1`,
        [solo.id],
      )
    ).rows[0]!.n === 2,
    '2개여야 한다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 11. 동명이인 동아리에서도 모임이 열리고 이름이 갈린다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 여기서 실패하면 그 동아리는 모임을 영영 못 연다 — 이름 하나 때문에 생성
  // 트랜잭션 전체가 롤백되기 때문이다.
  const clubTwin = obj(
    await rpc(owner.token, 'create_club', {
      p_name: '동명이인 동아리',
      p_display_name: NAME20,
    }),
  ) as unknown as ClubRow
  for (const t of [twin1, twin2]) {
    const joined = await rpc(t.token, 'join_club', {
      p_code: clubTwin.invite_code,
      p_display_name: NAME20,
    })
    check(`${t.name} 이 같은 20자 이름으로 들어온다`, obj(joined)['ok'] === true, msg(joined))
  }
  const createdTwin = await rpc(owner.token, 'create_session', {
    p_name: '동명이인 모임',
    p_display_name: NAME20,
    p_court_count: 1,
    p_club_id: clubTwin.id,
    p_starts_at: FUTURE.toISOString(),
  })
  check(
    '셋이 모두 같은 이름이어도 모임 생성이 성공한다',
    createdTwin.status === 200,
    `status=${createdTwin.status} ${msg(createdTwin)}`,
  )
  const twinRows = await tmRows((obj(createdTwin) as unknown as SessionRow).id ?? NIL)
  check(
    '셋이 모두 명단에 들어간다',
    twinRows.length === 3,
    `${twinRows.length}명: ${twinRows.map((r) => r.display_name).join(' / ')}`,
  )
  check(
    '이름이 서로 겹치지 않게 갈린다',
    new Set(twinRows.map((r) => r.display_name)).size === 3,
    twinRows.map((r) => r.display_name).join(' / ') +
      " — 겹치면 참가 목록에서 '누가 온다는 건지' 를 알 수 없다",
  )
  check(
    '먼저 들어간 이름은 바뀌지 않는다 (확정 결정 7)',
    twinRows.some((r) => r.display_name === NAME20),
    `원래 이름 ${NAME20} 이 그대로 있는가 — 대진표·심판 배지가 이름으로 사람을 찾는다`,
  )
  check(
    '접미사는 19자로 자른 뒤 붙어 20자 제약을 넘지 않는다',
    twinRows.every((r) => [...r.display_name].length <= 20) &&
      twinRows.filter((r) => r.display_name.startsWith(NAME19) && r.display_name !== NAME20)
        .length === 2,
    twinRows.map((r) => `${r.display_name}(${[...r.display_name].length}자)`).join(' / '),
  )
  check(
    '동명이인이어도 초기 rsvp 규칙은 같다 (만든 사람만 going)',
    twinRows.filter((r) => r.rsvp === 'going').length === 1 &&
      twinRows.find((r) => r.role === 'owner')?.rsvp === 'going',
    twinRows.map((r) => `${r.role}=${r.rsvp}`).join(' / '),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 12. 대회는 rsvp 를 쓰지 않는다 (회귀) ──')
  // ══════════════════════════════════════════════════════════════════
  // rsvp 가 대회 쪽으로 새어 들어가면 순위표가 조용히 망가진다.
  const createdT = await rpc(owner.token, 'create_tournament', {
    p_name: 'RSVP 대조군 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '동아리주인',
    p_club_id: club.id,
  })
  check(
    '동아리 밑 대회 생성이 예전 그대로다',
    createdT.status === 200,
    `status=${createdT.status} ${msg(createdT)}`,
  )
  const t = obj(createdT) as unknown as { id: string; invite_code: string }
  const tRows0 = await tmRows(t.id)
  check(
    '대회는 회원 전원을 심지 않는다 — 운영진만 (create_tournament 는 안 넓혔다)',
    tRows0.length === 2 && tRows0.every((r) => r.role === 'owner' || r.role === 'admin'),
    `${tRows0.length}명: ${tRows0.map((r) => `${r.display_name}(${r.role})`).join(' / ')}` +
      ' — 대회 명단은 운영진이 짜는 것이지 참가 신청으로 만들어지지 않는다',
  )
  const tStarts = await startsAtOf(t.id)
  check('대회의 starts_at 은 NULL 이다 (대회는 이 컬럼을 안 쓴다)', tStarts === null, String(tStarts))

  for (const u of [m1, m2]) await rpc(u.token, 'join_tournament', { p_code: t.invite_code })
  const tRows = await tmRows(t.id)
  const TM = (n: string) => tRows.find((r) => r.display_name === n)!
  /*
   * 대회에는 참가 신청이라는 개념이 없다 (set_my_rsvp 가 대회를 거절한다).
   * 명단에 있다 = 나온다. 그러니 값은 'going' 하나뿐이어야 한다.
   *
   * 'invited' 로 두면 20260827000001 의 backfill 로 'going' 이 된 옛 대회 행과
   * 갈려서, 나중에 이 테이블을 읽는 사람이 왜 다른지 알 수 없게 된다.
   * tm_fill_rsvp 트리거(20260827000002)가 넣는 곳이 몇 개든 맞춰 준다.
   */
  check(
    '대회 참가자는 언제 들어왔든 going 이다 (대회에 미응답이란 없다)',
    TM('회원하나').rsvp === 'going' && TM('회원둘').rsvp === 'going',
    `${TM('회원하나').rsvp} / ${TM('회원둘').rsvp}` +
      ' — invited 가 나오면 옛 행과 새 행이 갈린 것이다 (tm_fill_rsvp 확인)',
  )

  const tSetRsvp = await rpc(m1.token, 'set_my_rsvp', { p_tournament_id: t.id, p_rsvp: 'going' })
  check(
    '대회에서 참가 신청을 부르면 22023 으로 거절된다',
    errcode(tSetRsvp) === '22023',
    `code=${errcode(tSetRsvp)} status=${tSetRsvp.status} ${msg(tSetRsvp)}`,
  )
  check(
    '거절 문구가 왜 안 되는지 말해 준다',
    msg(tSetRsvp).includes('대회'),
    msg(tSetRsvp),
  )

  const { rows: tGroups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [t.id],
  )
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    tGroups[0]!.id,
    [TM('동아리주인').id, TM('부운영진').id],
  ])
  await db.query(`update tournament_members set group_id=$1 where id = any($2)`, [
    tGroups[1]!.id,
    [TM('회원하나').id, TM('회원둘').id],
  ])
  const tMatch = await rpc(owner.token, 'create_match', {
    p_tournament_id: t.id,
    p_court_id: null,
    p_label: null,
    p_group_a: tGroups[0]!.id,
    p_players_a: [TM('동아리주인').id, TM('부운영진').id],
    p_group_b: tGroups[1]!.id,
    p_players_b: [TM('회원하나').id, TM('회원둘').id],
    p_referees: [],
  })
  check(
    "rsvp='invited' 인 사람들로도 대회 경기가 편성된다",
    tMatch.status === 200,
    `status=${tMatch.status} ${msg(tMatch)} — 참가 신청이 대회의 게이트가 되면 안 된다`,
  )
  const tMatchId = (obj(tMatch)['id'] as string | undefined) ?? NIL
  await rpc(owner.token, 'start_match', { p_match_id: tMatchId })
  for (let i = 0; i < 21; i++) {
    await rpc(owner.token, 'record_score', {
      p_match_id: tMatchId,
      p_side: 'B',
      p_delta: 1,
      p_client_event_id: `rsvp-t-${i}-${Date.now()}`,
    })
  }
  const { rows: tMatchRow } = await db.query<{ status: string; winner_side: string | null }>(
    `select status, winner_side from matches where id=$1`,
    [tMatchId],
  )
  check(
    '21점에 닿으면 예전처럼 끝나고 승자가 정해진다',
    tMatchRow[0]?.status === 'finished' && tMatchRow[0]?.winner_side === 'B',
    `${tMatchRow[0]?.status} / ${tMatchRow[0]?.winner_side}`,
  )
  const { rows: standings } = await db.query<{
    group_name: string
    played: string
    wins: string
    losses: string
  }>(`select group_name, played, wins, losses from get_standings($1)`, [t.id])
  check(
    "순위표가 rsvp 와 무관하게 두 조를 모두 센다 ('invited' 라고 빠지지 않는다)",
    standings.length === 2 && standings.every((r) => Number(r.played) === 1),
    standings.map((r) => `${r.group_name}:${r.played}경기`).join(' / ') +
      ' — 여기가 비면 rsvp 가 순위 집계로 새어 들어간 것이다',
  )
  check(
    '이긴 조가 1승, 진 조가 1패로 잡힌다',
    standings.filter((r) => Number(r.wins) === 1).length === 1 &&
      standings.filter((r) => Number(r.losses) === 1).length === 1,
    standings.map((r) => `${r.group_name} ${r.wins}승${r.losses}패`).join(' / '),
  )

  const tRowsAfter = await tmRows(t.id)
  check(
    '대회를 한 판 끝까지 돌려도 rsvp 값은 아무도 안 건드린다',
    tRowsAfter.filter((r) => r.user_id === m1.uid || r.user_id === m2.uid).every(
      (r) => r.rsvp === 'going',
    ),
    tRowsAfter.map((r) => `${r.display_name}=${r.rsvp}`).join(' / '),
  )
} finally {
  // ⚠ seed-* · demo@ · rosterui-* 는 사용자의 실제 대회 참가자다. 이 스크립트가
  //   만든 rsvp-*@smashtest.local 계정만 지운다.
  //
  // 한 단계가 실패해도 다음 단계를 건너뛰지 않는다. 이 스크립트를 만들다 실제로
  // 한 번 겪었다 — 검사 도중에 예외가 나자 정리가 반만 돌고 프로덕션 DB 에
  // 테스트 계정 8개·동아리·모임이 남았다. 남았으면 손으로 지울 SQL 까지 찍는다.
  const sweep = async (label: string, sql: string) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await db.query(sql, [emails])
        return r.rowCount ?? 0
      } catch (e) {
        console.log(`⚠ 정리 실패(${label} ${attempt}/3): ${(e as Error).message}`)
      }
    }
    return -1
  }
  // 순서가 중요하다 — clubs.owner_id 는 on delete restrict 라 대회·모임을 먼저
  // 지우지 않으면 계정 삭제가 FK 에 걸린다.
  await sweep(
    'tournaments',
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
  )
  await sweep(
    'clubs',
    `delete from clubs where owner_id in (select id from auth.users where email = any($1))`,
  )
  await sweep('auth.users', `delete from auth.users where email = any($1)`)

  try {
    const { rows: left } = await db.query<{ n: number }>(
      `select count(*)::int as n from auth.users where email = any($1)`,
      [emails],
    )
    if (left[0]!.n === 0) {
      console.log(`\n🧹 테스트 계정 ${emails.length}개 정리 완료`)
    } else {
      failed++
      console.log(
        `\n❌ 프로덕션 DB 에 테스트 계정 ${left[0]!.n}개가 남았다. 손으로 지울 것:\n` +
          `     delete from tournaments where owner_id in (select id from auth.users where email like 'rsvp-%@smashtest.local');\n` +
          `     delete from clubs where owner_id in (select id from auth.users where email like 'rsvp-%@smashtest.local');\n` +
          `     delete from auth.users where email like 'rsvp-%@smashtest.local';`,
      )
    }
  } catch (e) {
    console.log(`⚠ 정리 확인 실패: ${(e as Error).message}`)
  }
  await db.end()
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
