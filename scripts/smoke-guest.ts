/**
 * 게스트 등록(마일스톤 3)이 실제 DB 에서 도는지 확인한다.
 *
 * 이 마이그레이션의 핵심 주장은 "RLS 정책을 하나도 안 열었다" 는 것이다.
 * anon 은 `guest_sessions` · `join_as_guest` 딱 두 SECURITY DEFINER 함수로만
 * 그릇(tournament_members)에 닿고, 그 밖의 모든 테이블·RPC 는 anon 에게
 * 여전히 안 보인다. 이 주장은 코드를 읽어서는 확인할 수 없다 — 실제
 * anon 클라이언트로 직접 찔러 봐야 한다.
 *
 * 그래서 절반은 **로그인하지 않은** publishable(anon) 클라이언트로 돈다.
 * 세션 토큰이 없으므로 PostgREST 가 anon 롤로 요청을 처리한다.
 *
 *   npm run db:smoke:guest
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

// anon(비로그인) 경로 — 세션 토큰이 없으니 anon 키를 그대로 Authorization 에도
// 싣는다. Supabase 규약대로 PostgREST 가 이걸 anon 롤로 해석한다.
async function anonApi(path: string, init: RequestInit = {}): Promise<ApiResult> {
  return api(ANON, path, init)
}
async function anonRpc(fn: string, args: unknown): Promise<ApiResult> {
  return anonApi(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
}

function rows(r: ApiResult): Record<string, unknown>[] {
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []
}
function obj(r: ApiResult): Record<string, unknown> {
  return (r.body ?? {}) as Record<string, unknown>
}
function msg(r: ApiResult): string {
  return String(obj(r)['message'] ?? obj(r)['error'] ?? '(없음)')
}
// 테이블 직접 접근에 대한 "막혔다" 판정 — PostgREST 는 RLS 로 0행이
// 걸러져도 200 을 주기도 하고, grant 자체가 없으면 40x 를 주기도 한다.
// 둘 다 "anon 이 테이블에 못 닿는다" 는 같은 결론이라 하나로 묶는다.
function blocked(r: ApiResult): boolean {
  return r.status >= 400 || (r.status === 200 && rows(r).length === 0)
}

async function makeUser(db: Client, tag: string, name: string) {
  const email = `guest-${tag}-${Date.now()}@smashtest.local`
  const password = 'GuestTest12345!'
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
  return { email, uid, token: body.access_token, name }
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await db.connect()
const emails: string[] = []

type ClubRow = { id: string; name: string; invite_code: string; guest_code: string }
type SessionRow = { id: string; name: string; club_id: string | null; starts_at: string | null }
type MemberRow = { id: string; display_name: string; is_guest: boolean; user_id: string | null }

const memberByName = async (tid: string, name: string) => {
  const { rows: r } = await db.query<MemberRow>(
    `select id, display_name, is_guest, user_id from tournament_members
      where tournament_id=$1 and display_name=$2`,
    [tid, name],
  )
  return r[0]
}
const guestCount = async (tid: string) => {
  const { rows: r } = await db.query<{ n: string }>(
    `select count(*)::int as n from tournament_members where tournament_id=$1 and is_guest`,
    [tid],
  )
  return Number(r[0]!.n)
}

try {
  // ══════════════════════════════════════════════════════════════════
  // 사전 준비 — 동아리 둘(A·B) + 그 밑에 다양한 상태의 모임·대회
  // ══════════════════════════════════════════════════════════════════
  const ownerA = await makeUser(db, 'ownerA', '동아리A주인')
  const memberA = await makeUser(db, 'memberA', 'A동아리회원')
  const ownerB = await makeUser(db, 'ownerB', '동아리B주인')
  emails.push(ownerA.email, memberA.email, ownerB.email)

  const clubA = obj(
    await rpc(ownerA.token, 'create_club', {
      p_name: '게스트 스모크 A',
      p_display_name: '동아리A주인',
    }),
  ) as unknown as ClubRow
  const clubB = obj(
    await rpc(ownerB.token, 'create_club', {
      p_name: '게스트 스모크 B',
      p_display_name: '동아리B주인',
    }),
  ) as unknown as ClubRow
  const clubEmpty = obj(
    await rpc(ownerB.token, 'create_club', {
      p_name: '게스트 스모크 빈동아리',
      p_display_name: '동아리B주인',
    }),
  ) as unknown as ClubRow

  const joinedMemberA = await rpc(memberA.token, 'join_club', {
    p_code: clubA.invite_code,
    p_display_name: 'A동아리회원',
  })
  check(
    '사전) A동아리회원이 clubA 에 일반 회원으로 들어간다',
    obj(joinedMemberA)['ok'] === true,
    msg(joinedMemberA),
  )

  const sessionOpen1 = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '즉석 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow
  const sessionOpen2 = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '예약된 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
      p_starts_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    }),
  ) as unknown as SessionRow
  const sessionFinished = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '이미 끝난 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow
  await db.query(`update tournaments set status='finished' where id=$1`, [sessionFinished.id])
  const sessionOutWindow = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '먼 미래 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
      p_starts_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    }),
  ) as unknown as SessionRow
  const tournamentA = obj(
    await rpc(ownerA.token, 'create_tournament', {
      p_name: '동아리A 대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '동아리A주인',
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow
  const sessionCap = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '상한 테스트 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow
  const sessionConc = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '동시성 테스트 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow
  const sessionB = obj(
    await rpc(ownerB.token, 'create_session', {
      p_name: 'B동아리 모임',
      p_display_name: '동아리B주인',
      p_court_count: 2,
      p_club_id: clubB.id,
    }),
  ) as unknown as SessionRow

  check(
    '사전) 준비용 모임·대회가 전부 만들어졌다',
    [
      sessionOpen1,
      sessionOpen2,
      sessionFinished,
      sessionOutWindow,
      tournamentA,
      sessionCap,
      sessionConc,
      sessionB,
    ].every((r) => typeof r?.id === 'string'),
    '하나라도 실패하면 뒤 검사 전체가 무의미하다 — clubs.guest_code NOT NULL 과 create_club 의 INSERT 컬럼 목록이 어긋나지 않았는지부터 본다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 1. 게스트 코드로 오늘 열린 모임 후보가 나온다 (동아리 이름 포함) ──')
  // ══════════════════════════════════════════════════════════════════
  const candidates = await anonRpc('guest_sessions', { p_code: clubA.guest_code })
  const candBody = obj(candidates)
  const candSessions = Array.isArray(candBody['sessions'])
    ? (candBody['sessions'] as Record<string, unknown>[])
    : []
  check('guest_sessions 가 성공한다', candBody['ok'] === true, msg(candidates))
  check(
    '동아리 이름이 함께 온다',
    candBody['club_name'] === '게스트 스모크 A',
    String(candBody['club_name']),
  )
  check(
    '열린 두 모임만 후보로 온다 (끝난 모임·시각 창 밖·대회는 빠진다)',
    candSessions.length === 2 &&
      candSessions.some((s) => s['id'] === sessionOpen1.id) &&
      candSessions.some((s) => s['id'] === sessionOpen2.id),
    `${candSessions.length}건: ${candSessions.map((s) => s['name']).join(', ')}`,
  )
  const candKeys = candSessions.length > 0 ? Object.keys(candSessions[0]!).sort() : []
  check(
    '반환 필드가 정확히 넷이다 (id·name·starts_at, 인원수·초대코드 없음)',
    candKeys.join(',') === 'id,name,starts_at',
    candKeys.join(','),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 2. 이름을 적으면 게스트 컬럼이 정확히 채워진다 ──')
  // ══════════════════════════════════════════════════════════════════
  const joined1 = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOpen1.id,
    p_name: '테스트게스트',
  })
  check('join_as_guest 가 성공한다', obj(joined1)['ok'] === true, msg(joined1))
  check(
    '적은 이름 그대로 돌아온다 (첫 등록이라 접미사 없음)',
    obj(joined1)['display_name'] === '테스트게스트',
    String(obj(joined1)['display_name']),
  )
  const guest1 = await memberByName(sessionOpen1.id, '테스트게스트')
  check(
    'is_guest=true · user_id is null · role=member 로 들어간다',
    guest1?.is_guest === true && guest1?.user_id === null,
    `is_guest=${String(guest1?.is_guest)} user_id=${String(guest1?.user_id)}`,
  )
  const { rows: rsvpRow1 } = await db.query<{ rsvp: string; role: string }>(
    `select rsvp, role from tournament_members where id=$1`,
    [guest1!.id],
  )
  check(
    "rsvp='going' · role='member' 이다",
    rsvpRow1[0]!.rsvp === 'going' && rsvpRow1[0]!.role === 'member',
    `rsvp=${rsvpRow1[0]!.rsvp} role=${rsvpRow1[0]!.role}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 3. 같은 이름을 다시 적으면 접미사가 붙고, 기존 이름은 안 바뀐다 ──')
  // ══════════════════════════════════════════════════════════════════
  const joined2 = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOpen1.id,
    p_name: '테스트게스트',
  })
  check('두 번째 동명 등록도 성공한다', obj(joined2)['ok'] === true, msg(joined2))
  check(
    '접미사가 붙어 원래 이름과 달라진다',
    typeof obj(joined2)['display_name'] === 'string' &&
      obj(joined2)['display_name'] !== '테스트게스트',
    String(obj(joined2)['display_name']),
  )
  const guest1After = await memberByName(sessionOpen1.id, '테스트게스트')
  check('먼저 들어간 이름은 그대로다', guest1After?.id === guest1!.id, '기존 행이 바뀌면 안 된다')

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 4. 등록된 게스트가 모임장 화면(명단)에 뜬다 ──')
  // ══════════════════════════════════════════════════════════════════
  const roster = await api(
    ownerA.token,
    `tournament_members?tournament_id=eq.${sessionOpen1.id}&select=id,display_name,is_guest`,
  )
  check(
    '관리자에게 게스트 두 명이 명단에서 보인다',
    rows(roster).filter((r) => r['is_guest'] === true).length === 2,
    `${rows(roster).filter((r) => r['is_guest'] === true).length}명`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 5. 열린 모임이 없으면 no_open_session 이고, 그 이상 새지 않는다 ──')
  // ══════════════════════════════════════════════════════════════════
  const noOpen = await anonRpc('guest_sessions', { p_code: clubEmpty.guest_code })
  check(
    '열린 모임이 없는 동아리는 no_open_session 을 준다',
    obj(noOpen)['ok'] === false && obj(noOpen)['error'] === 'no_open_session',
    msg(noOpen),
  )
  const fakeSessionId = '00000000-0000-0000-0000-000000000000'
  const joinNoOpen = await anonRpc('join_as_guest', {
    p_code: clubEmpty.guest_code,
    p_session_id: fakeSessionId,
    p_name: '유령게스트',
  })
  check(
    '후보 없는 동아리에 아무 session_id 를 넣어도 session_closed 만 준다',
    obj(joinNoOpen)['ok'] === false && obj(joinNoOpen)['error'] === 'session_closed',
    msg(joinNoOpen),
  )
  const { rows: leaked } = await db.query(
    `select 1 from tournament_members where display_name='유령게스트'`,
  )
  check('이 시도로 어디에도 행이 안 생긴다', leaked.length === 0, `${leaked.length}행`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 6. 후보가 둘일 때 고른 쪽에만 들어간다 ──')
  // ══════════════════════════════════════════════════════════════════
  const joinedChosen = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOpen2.id,
    p_name: '고른모임게스트',
  })
  check(
    '고른 모임(sessionOpen2) 등록이 성공한다',
    obj(joinedChosen)['ok'] === true,
    msg(joinedChosen),
  )
  const inChosen = await memberByName(sessionOpen2.id, '고른모임게스트')
  const inOther = await memberByName(sessionOpen1.id, '고른모임게스트')
  check('고른 모임에는 들어간다', inChosen !== undefined, '행이 없다')
  check('고르지 않은 모임에는 안 들어간다', inOther === undefined, '엉뚱한 모임에도 들어갔다')

  // ══════════════════════════════════════════════════════════════════
  console.log(
    '\n── 7. anon 이 tournament_members 를 직접 SELECT/INSERT/PATCH/DELETE 하지 못한다 ──',
  )
  // ══════════════════════════════════════════════════════════════════
  const anonSelect = await anonApi('tournament_members?select=id,display_name')
  check(
    'anon 직접 SELECT 가 막힌다',
    blocked(anonSelect),
    `status=${anonSelect.status} ${rows(anonSelect).length}행`,
  )

  const anonInsert = await anonApi('tournament_members', {
    method: 'POST',
    body: JSON.stringify({
      tournament_id: sessionOpen1.id,
      user_id: null,
      role: 'member',
      display_name: '직접찌른게스트',
      rsvp: 'going',
      is_guest: true,
    }),
  })
  check('anon 직접 INSERT 가 막힌다', anonInsert.status >= 400, `status=${anonInsert.status}`)

  const anonPatch = await anonApi(`tournament_members?id=eq.${guest1!.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ display_name: '가로챈이름' }),
  })
  const { rows: patchCheck } = await db.query<{ display_name: string }>(
    `select display_name from tournament_members where id=$1`,
    [guest1!.id],
  )
  check(
    'anon 직접 PATCH 가 막힌다',
    patchCheck[0]!.display_name === '테스트게스트',
    `${patchCheck[0]!.display_name} (응답 ${anonPatch.status})`,
  )

  const anonDelete = await anonApi(`tournament_members?id=eq.${guest1!.id}`, { method: 'DELETE' })
  const { rowCount: stillThere } = await db.query(`select 1 from tournament_members where id=$1`, [
    guest1!.id,
  ])
  check('anon 직접 DELETE 가 막힌다', stillThere === 1, `응답 ${anonDelete.status}`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 8. anon 이 tournaments · clubs · matches · courts 를 직접 못 읽는다 ──')
  // ══════════════════════════════════════════════════════════════════
  for (const table of ['tournaments', 'clubs', 'matches', 'courts']) {
    const r = await anonApi(`${table}?select=id`)
    check(
      `anon 이 ${table} 을 직접 못 읽는다`,
      blocked(r),
      `status=${r.status} ${rows(r).length}행`,
    )
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 9. anon 이 회원 전용 RPC 를 못 부른다 ──')
  // ══════════════════════════════════════════════════════════════════
  const memberOnlyRpcs: [string, unknown][] = [
    [
      'record_score',
      { p_match_id: fakeSessionId, p_side: 'A', p_delta: 1, p_client_event_id: 'x' },
    ],
    [
      'create_session_match',
      { p_tournament_id: sessionOpen1.id, p_court_id: null, p_players_a: [], p_players_b: [] },
    ],
    ['set_my_rsvp', { p_tournament_id: sessionOpen1.id, p_rsvp: 'going' }],
    ['add_roster_member', { p_tournament_id: sessionOpen1.id, p_name: '몰래추가' }],
    ['join_club', { p_code: clubA.invite_code, p_display_name: '몰래가입' }],
  ]
  for (const [fn, args] of memberOnlyRpcs) {
    const r = await anonRpc(fn, args)
    check(`anon 이 ${fn} 을 못 부른다`, r.status >= 400, `status=${r.status}`)
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 10. 다른 동아리의 session_id 를 넣으면 거절된다 ──')
  // ══════════════════════════════════════════════════════════════════
  const crossClub = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionB.id,
    p_name: '교차동아리게스트',
  })
  check(
    'A 의 코드로 B 의 모임에 못 들어간다',
    obj(crossClub)['ok'] === false && obj(crossClub)['error'] === 'session_closed',
    msg(crossClub),
  )
  check(
    '후보 목록을 신뢰하지 않고 서버가 다시 검사한다 — 실제로 행이 안 생긴다',
    (await memberByName(sessionB.id, '교차동아리게스트')) === undefined,
    '엉뚱한 동아리 모임에 들어갔다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 11. 끝난 모임 · 시각 창 밖 모임에는 못 들어간다 ──')
  // ══════════════════════════════════════════════════════════════════
  const joinFinished = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionFinished.id,
    p_name: '끝난모임게스트',
  })
  check(
    '끝난 모임은 거절된다',
    obj(joinFinished)['ok'] === false && obj(joinFinished)['error'] === 'session_closed',
    msg(joinFinished),
  )
  const joinOutWindow = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOutWindow.id,
    p_name: '먼미래게스트',
  })
  check(
    '시각 창 밖 모임은 거절된다',
    obj(joinOutWindow)['ok'] === false && obj(joinOutWindow)['error'] === 'session_closed',
    msg(joinOutWindow),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 12. 대회 UUID 를 넣으면 거절된다 ──')
  // ══════════════════════════════════════════════════════════════════
  const joinTournament = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: tournamentA.id,
    p_name: '대회게스트',
  })
  check(
    "kind='tournament' 행은 거절된다",
    obj(joinTournament)['ok'] === false && obj(joinTournament)['error'] === 'session_closed',
    msg(joinTournament),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 13. 게스트를 심판으로 지정하지 못한다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 세션 모임은 심판을 RPC 로 붙이는 경로가 없다 — match_referees 직접
  // INSERT 뿐이다. guard_referee_has_account(20260819000008, 재사용)가
  // user_id is null 인 행이면 무조건 막으므로, 관리자가 직접 찔러도 막혀야 한다.
  const { rows: refMatch } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, status, created_by) values ($1,'scheduled',$2) returning id`,
    [sessionOpen1.id, ownerA.uid],
  )
  const refAttempt = await api(ownerA.token, 'match_referees', {
    method: 'POST',
    body: JSON.stringify({ match_id: refMatch[0]!.id, member_id: guest1!.id }),
  })
  check(
    '관리자도 계정 없는 게스트를 심판으로 못 넣는다',
    refAttempt.status >= 400,
    `status=${refAttempt.status} — guard_referee_has_account 가 재사용되어 게스트에도 그대로 적용돼야 한다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 14. 게스트 상한(60)을 넘기면 거절되고, 기존 게스트는 멀쩡하다 ──')
  // ══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 59; i++) {
    await db.query(
      `insert into tournament_members (tournament_id, user_id, role, display_name, rsvp, is_guest)
       values ($1, null, 'member', $2, 'going', true)`,
      [sessionCap.id, `상한사전게스트${String(i).padStart(2, '0')}`],
    )
  }
  const fillTo60 = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionCap.id,
    p_name: '상한60번째',
  })
  check('60번째 게스트는 들어간다', obj(fillTo60)['ok'] === true, msg(fillTo60))
  check('상한 모임의 게스트 수가 정확히 60 이다', (await guestCount(sessionCap.id)) === 60, '')

  const over60 = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionCap.id,
    p_name: '상한61번째',
  })
  check(
    '61번째는 guest_limit 으로 거절된다',
    obj(over60)['ok'] === false && obj(over60)['error'] === 'guest_limit',
    msg(over60),
  )
  check('넘긴 뒤에도 게스트 수는 여전히 60 이다', (await guestCount(sessionCap.id)) === 60, '')
  check(
    '기존 게스트는 그대로 남아 있다',
    (await memberByName(sessionCap.id, '상한사전게스트00'))?.is_guest === true,
    '상한을 넘긴 시도가 기존 행을 건드리면 안 된다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 15. 코드를 재발급하면 옛 링크가 즉시 죽고, 이미 등록된 게스트는 남는다 ──')
  // ══════════════════════════════════════════════════════════════════
  const oldGuestCode = clubA.guest_code
  const beforeRotateGuest = await memberByName(sessionOpen1.id, '테스트게스트')
  const rotated = await rpc(ownerA.token, 'rotate_guest_code', { p_club_id: clubA.id })
  const rotatedClub = obj(rotated) as unknown as ClubRow
  check(
    '재발급이 성공하고 코드가 바뀐다',
    typeof rotatedClub.guest_code === 'string' && rotatedClub.guest_code !== oldGuestCode,
    String(rotatedClub.guest_code),
  )
  const oldCodeDead = await anonRpc('guest_sessions', { p_code: oldGuestCode })
  check(
    '옛 링크는 즉시 bad_code 가 된다',
    obj(oldCodeDead)['ok'] === false && obj(oldCodeDead)['error'] === 'bad_code',
    msg(oldCodeDead),
  )
  const stillGuest = await memberByName(sessionOpen1.id, '테스트게스트')
  check(
    '이미 등록된 게스트는 재발급 이후에도 그대로 남는다',
    stillGuest?.id === beforeRotateGuest?.id,
    '재발급이 tournament_members 를 건드리면 안 된다',
  )
  clubA.guest_code = rotatedClub.guest_code // 뒤 검사는 새 코드로 진행한다

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 16. 운영진이 아닌 회원은 재발급하지 못하고, guest_code 직접 PATCH 도 막힌다 ──')
  // ══════════════════════════════════════════════════════════════════
  const rotateByMember = await rpc(memberA.token, 'rotate_guest_code', { p_club_id: clubA.id })
  check(
    '일반 회원은 재발급할 수 없다',
    rotateByMember.status >= 400,
    `status=${rotateByMember.status} ${msg(rotateByMember)}`,
  )
  const patchGuestCode = await api(ownerA.token, `clubs?id=eq.${clubA.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ guest_code: 'ZZZZZZZZZZZZZZZZZZZZZZ' }),
  })
  check(
    '동아리 주인도 guest_code 를 직접 PATCH 할 수 없다',
    patchGuestCode.status >= 400,
    `status=${patchGuestCode.status} — 재발급 RPC 로만 바뀌어야 한다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 17. is_guest 를 직접 PATCH 로 켜고 끌 수 없다 ──')
  // ══════════════════════════════════════════════════════════════════
  const patchIsGuest = await api(ownerA.token, `tournament_members?id=eq.${guest1!.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_guest: false }),
  })
  const { rows: isGuestAfter } = await db.query<{ is_guest: boolean }>(
    `select is_guest from tournament_members where id=$1`,
    [guest1!.id],
  )
  check(
    '관리자도 is_guest 를 직접 못 바꾼다',
    isGuestAfter[0]!.is_guest === true,
    `is_guest=${String(isGuestAfter[0]!.is_guest)} (응답 ${patchIsGuest.status})`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 18. 동아리 없는 모임 · 대회가 예전과 똑같이 돈다 (회귀) ──')
  // ══════════════════════════════════════════════════════════════════
  const plainSession = await rpc(ownerA.token, 'create_session', {
    p_name: '동아리 없는 모임',
    p_display_name: '주최자',
    p_court_count: 2,
  })
  check(
    '소속 없이 모임을 만들 수 있다',
    plainSession.status === 200 && obj(plainSession)['club_id'] === null,
    `status=${plainSession.status} ${msg(plainSession)}`,
  )
  const plainTournament = await rpc(ownerA.token, 'create_tournament', {
    p_name: '동아리 없는 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '주최자',
  })
  check(
    '소속 없이 대회를 만들 수 있다',
    plainTournament.status === 200 && obj(plainTournament)['club_id'] === null,
    `status=${plainTournament.status} ${msg(plainTournament)}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 19. 운영진이 손으로 올린 미가입 회원은 게스트로 표시되지 않는다 (회귀) ──')
  // ══════════════════════════════════════════════════════════════════
  const rosterAdded = await rpc(ownerA.token, 'add_roster_member', {
    p_tournament_id: sessionOpen1.id,
    p_name: '수기추가회원',
  })
  check('add_roster_member 가 성공한다', rosterAdded.status === 200, `status=${rosterAdded.status}`)
  check(
    '수기로 추가한 미가입 회원은 is_guest=false 다',
    obj(rosterAdded)['is_guest'] === false,
    String(obj(rosterAdded)['is_guest']),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 20. 경기에 나간 게스트는 remove_member 로 지워지지 않는다 (기록 보존) ──')
  // ══════════════════════════════════════════════════════════════════
  const { rows: histMatch } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, status, created_by) values ($1,'scheduled',$2) returning id`,
    [sessionOpen1.id, ownerA.uid],
  )
  const { rows: histTeam } = await db.query<{ id: string }>(
    `insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
     values ($1,'A',null,21,1.0,false) returning id`,
    [histMatch[0]!.id],
  )
  await db.query(`insert into match_team_players (match_team_id, member_id) values ($1,$2)`, [
    histTeam[0]!.id,
    guest1!.id,
  ])
  const removeAttempt = await rpc(ownerA.token, 'remove_member', { p_member_id: guest1!.id })
  check(
    '출전 기록이 있는 게스트는 뺄 수 없다',
    removeAttempt.status >= 400,
    `status=${removeAttempt.status} ${msg(removeAttempt)}`,
  )
  const { rowCount: guestStillThere } = await db.query(
    `select 1 from tournament_members where id=$1`,
    [guest1!.id],
  )
  check('게스트 행이 그대로 남아 있다', guestStillThere === 1, `${guestStillThere}행`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 21. my_member_id 가 게스트가 여럿인 모임에서도 정상 동작한다 ──')
  // ══════════════════════════════════════════════════════════════════
  const ownerMember = await memberByName(sessionOpen1.id, '동아리A주인')
  const myId = await rpc(ownerA.token, 'my_member_id', { tid: sessionOpen1.id })
  check(
    'user_id is null 인 게스트 행들에 흔들리지 않고 자기 행을 정확히 찾는다',
    myId.body === ownerMember?.id,
    `반환=${String(myId.body)} 기대=${String(ownerMember?.id)}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 22. 게스트 상한 동시성 — 동시 요청도 상한 60을 넘지 않는다 ──')
  // ══════════════════════════════════════════════════════════════════
  for (let i = 0; i < 55; i++) {
    await db.query(
      `insert into tournament_members (tournament_id, user_id, role, display_name, rsvp, is_guest)
       values ($1, null, 'member', $2, 'going', true)`,
      [sessionConc.id, `동시사전게스트${String(i).padStart(2, '0')}`],
    )
  }
  check(
    '사전) 동시성 모임에 게스트 55명이 미리 들어가 있다',
    (await guestCount(sessionConc.id)) === 55,
    '',
  )

  const concResults = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      anonRpc('join_as_guest', {
        p_code: clubA.guest_code,
        p_session_id: sessionConc.id,
        p_name: `동시게스트${String(i).padStart(2, '0')}`,
      }),
    ),
  )
  const concOk = concResults.filter((r) => obj(r)['ok'] === true).length
  const concBlocked = concResults.filter((r) => obj(r)['error'] === 'guest_limit').length
  check(
    '동시 10건 중 정확히 5건만 통과해 상한을 딱 채운다',
    concOk === 5 && concBlocked === 5,
    `통과=${concOk} 거절=${concBlocked} — advisory lock 이 없으면 READ COMMITTED 에서 다 같은 카운트를 읽어 60을 넘긴다`,
  )
  check(
    '동시 요청 뒤에도 게스트 수가 60을 넘지 않는다',
    (await guestCount(sessionConc.id)) === 60,
    `${await guestCount(sessionConc.id)}명`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 23. is_guest 직접 PATCH 로 상한을 우회할 수 없다 ──')
  // ══════════════════════════════════════════════════════════════════
  const bypassTarget = await memberByName(sessionConc.id, '동시사전게스트00')
  const bypassPatch = await api(ownerA.token, `tournament_members?id=eq.${bypassTarget!.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_guest: false }),
  })
  check(
    '관리자가 PATCH 로 기존 게스트를 카운트에서 뺄 수 없다',
    bypassPatch.status >= 400,
    `status=${bypassPatch.status} — 성공하면 대회 관리자가 상한을 무제한으로 우회할 수 있다`,
  )
  const afterBypassAttempt = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionConc.id,
    p_name: '우회시도이후게스트',
  })
  check(
    '우회 시도가 막혔으니 새 게스트는 여전히 상한에 걸린다',
    obj(afterBypassAttempt)['ok'] === false && obj(afterBypassAttempt)['error'] === 'guest_limit',
    msg(afterBypassAttempt),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 24. 이름 정리 — 제어문자·제로폭·방향재정렬 문자를 지운다 ──')
  // ══════════════════════════════════════════════════════════════════
  const dirtyName = '​게스트‮이름테스트'
  const dirtyJoin = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOpen1.id,
    p_name: dirtyName,
  })
  check(
    '숨은 문자를 지운 이름으로 등록된다',
    obj(dirtyJoin)['ok'] === true && obj(dirtyJoin)['display_name'] === '게스트이름테스트',
    `반환=${String(obj(dirtyJoin)['display_name'])}`,
  )

  const invisibleOnly = '​‌‍⁠'
  const invisibleJoin = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: sessionOpen1.id,
    p_name: invisibleOnly,
  })
  check(
    '지운 뒤 빈 문자열이면 bad_name 이다',
    obj(invisibleJoin)['ok'] === false && obj(invisibleJoin)['error'] === 'bad_name',
    msg(invisibleJoin),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 25. 열거 공격 신호 없음 — 서로 다른 원인이 같은 오류로 돌아온다 ──')
  // ══════════════════════════════════════════════════════════════════
  const wellFormedButMissing = await anonRpc('guest_sessions', { p_code: 'Z'.repeat(22) })
  const malformed = await anonRpc('guest_sessions', { p_code: `${'A'.repeat(20)}01` })
  check(
    '존재하지 않는 코드와 형식이 틀린 코드가 같은 오류를 준다',
    obj(wellFormedButMissing)['error'] === obj(malformed)['error'] &&
      obj(wellFormedButMissing)['message'] === obj(malformed)['message'],
    `${String(obj(wellFormedButMissing)['error'])} vs ${String(obj(malformed)['error'])}`,
  )
  const sameErrorMessages = new Set(
    [crossClub, joinFinished, joinOutWindow, joinTournament].map((r) => String(obj(r)['message'])),
  )
  check(
    '남의 동아리 모임 · 끝난 모임 · 시각 창 밖 모임 · 대회 UUID 가 전부 같은 메시지를 준다',
    sameErrorMessages.size === 1,
    `${sameErrorMessages.size}종류: ${[...sameErrorMessages].join(' / ')}`,
  )
} finally {
  // tournaments.owner_id · clubs.owner_id 는 둘 다 on delete restrict 다.
  // 계정보다 먼저 지우지 않으면 정리가 통째로 실패한다.
  await db.query(
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  await db.query(
    `delete from clubs where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  await db.query(`delete from auth.users where email = any($1)`, [emails])
  console.log(`\n🧹 테스트 계정 ${emails.length}개 정리 완료`)
  await db.end()
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
