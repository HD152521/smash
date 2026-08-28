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
  // 절 번호를 같이 찍는다 — 계획서와 보고가 "73번(키 전수 검사)" 처럼
  // 번호로 이야기하는데, 번호가 출력에 없으면 어느 줄이 그 번호인지
  // 세어 봐야 알 수 있다. 이 스크립트의 절 번호가 정본이다.
  const no = passed + failed + 1
  if (ok) passed++
  else failed++
  console.log(`${ok ? '✅' : '❌'} ${no}. ${name}${detail ? `\n     ${detail}` : ''}`)
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

// 응답 전체(중첩 객체·배열 안까지)의 키를 재귀로 모은다. 73절이 쓰는
// 도구다 — 최상위 키만 세면 matches[] 안에 label 이나 scored 가 하나
// 늘어난 것을 영영 못 잡는다. "필드 하나가 곧 노출 표면" 이라는 규율은
// 전수 검사로만 지켜진다.
function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      into.add(k)
      collectKeys(v, into)
    }
  }
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

// 현황판(마일스톤 4)이 읽을 경기를 손으로 세운다.
// create_session_match 는 authenticated 전용이라 anon 스모크에서 부를 수
// 없고, 애초에 여기서 필요한 것은 "이 status · 이 court_id · 이 queue_order
// 를 가진 경기" 라 RPC 보다 직접 INSERT 가 정확하다. 13·20절이 이미 같은
// 방식으로 경기를 만든다.
async function makeMatch(
  tid: string,
  createdBy: string,
  opts: {
    status: 'scheduled' | 'live' | 'finished'
    courtId: string | null
    queueOrder: number
    scoreA?: number
    scoreB?: number
    started?: boolean
    winner?: 'A' | 'B' | null
    playersA: string[]
    playersB: string[]
  },
): Promise<string> {
  const { rows: made } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, court_id, status, queue_order,
                          score_a, score_b, started_at, winner_side, created_by)
     values ($1,$2,$3::match_status,$4,$5,$6,$7,$8::team_side,$9) returning id`,
    [
      tid,
      opts.courtId,
      opts.status,
      opts.queueOrder,
      opts.scoreA ?? 0,
      opts.scoreB ?? 0,
      opts.started ? new Date().toISOString() : null,
      opts.winner ?? null,
      createdBy,
    ],
  )
  const matchId = made[0]!.id
  for (const [side, members] of [
    ['A', opts.playersA],
    ['B', opts.playersB],
  ] as const) {
    const { rows: team } = await db.query<{ id: string }>(
      `insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
       values ($1,$2::team_side,null,21,1.0,false) returning id`,
      [matchId, side],
    )
    for (const memberId of members) {
      await db.query(`insert into match_team_players (match_team_id, member_id) values ($1,$2)`, [
        team[0]!.id,
        memberId,
      ])
    }
  }
  return matchId
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
  // 후보 개수를 단정하지 않는다 — 뒤 절에서 쓰려고 만든 모임(상한·동시성)도
  // 같은 동아리의 열린 모임이라 정당한 후보다. 확인해야 하는 것은 "몇 개냐" 가
  // 아니라 **들어와야 할 것이 들어오고 빠져야 할 것이 빠지는가** 다.
  const candIds = candSessions.map((s) => s['id'])
  check(
    '열려 있는 모임이 후보로 온다',
    candIds.includes(sessionOpen1.id) && candIds.includes(sessionOpen2.id),
    `${candSessions.length}건: ${candSessions.map((s) => s['name']).join(', ')}`,
  )
  check(
    '끝난 모임 · 시각 창 밖 모임 · 대회는 후보에서 빠진다',
    !candIds.includes(sessionFinished.id) &&
      !candIds.includes(sessionOutWindow.id) &&
      !candIds.includes(tournamentA.id),
    `끝난=${candIds.includes(sessionFinished.id)} 창밖=${candIds.includes(sessionOutWindow.id)} 대회=${candIds.includes(tournamentA.id)}`,
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

  // ══════════════════════════════════════════════════════════════════
  // 여기까지가 마일스톤 3(게스트 등록) 통로 — 1~67절.
  // 85절이 이 지점의 성적을 그대로 되읽어 "회귀가 없었다" 를 단정한다.
  // 아래 마일스톤 4 절을 추가하면서 위쪽을 건드리면 여기서 걸린다.
  // ══════════════════════════════════════════════════════════════════
  const milestone3Passed = passed
  const milestone3Failed = failed

  // ══════════════════════════════════════════════════════════════════
  // 마일스톤 4 사전 준비 — 현황판 전용 모임을 따로 세운다
  //
  // sessionOpen1 을 쓰지 않는다. 13·20절이 거기에 이미 경기를 꽂아 뒀고,
  // 상한·동시성 절이 게스트를 60명 채워 놨다. "경기가 정확히 넷이고
  // 편성 안 된 사람이 정확히 누구인가" 를 단정하려면 아무도 안 건드린
  // 모임이 필요하다.
  // ══════════════════════════════════════════════════════════════════
  const sessionBoard = obj(
    await rpc(ownerA.token, 'create_session', {
      p_name: '현황판 모임',
      p_display_name: '동아리A주인',
      p_court_count: 2,
      p_club_id: clubA.id,
    }),
  ) as unknown as SessionRow

  const { rows: boardCourts } = await db.query<{ id: string; name: string }>(
    `select id, name from courts where tournament_id=$1 order by sort_order`,
    [sessionBoard.id],
  )
  const court1 = boardCourts[0]!.id
  const court2 = boardCourts[1]!.id

  // 코트에 편성될 둘 + **명단에만 있고 어떤 경기에도 안 들어가는 한 명**.
  // 셋째 사람이 74절의 전부다.
  for (const name of ['코트뛰는사람하나', '코트뛰는사람둘', '명단에만있는사람']) {
    await anonRpc('join_as_guest', {
      p_code: clubA.guest_code,
      p_session_id: sessionBoard.id,
      p_name: name,
    })
  }
  const playerOne = (await memberByName(sessionBoard.id, '코트뛰는사람하나'))!.id
  const playerTwo = (await memberByName(sessionBoard.id, '코트뛰는사람둘'))!.id

  // 삽입 순서를 queue_order 의 **역순**으로 둔다 — 서버가 created_at 으로
  // 정렬하고 있으면 70절에서 정확히 뒤집힌 순서가 나온다.
  const matchNoCourt = await makeMatch(sessionBoard.id, ownerA.uid, {
    status: 'scheduled',
    courtId: null,
    queueOrder: 3003,
    playersA: [playerOne],
    playersB: [playerTwo],
  })
  const matchWaiting = await makeMatch(sessionBoard.id, ownerA.uid, {
    status: 'scheduled',
    courtId: court1,
    queueOrder: 3002,
    playersA: [playerOne],
    playersB: [playerTwo],
  })
  const matchLive = await makeMatch(sessionBoard.id, ownerA.uid, {
    status: 'live',
    courtId: court1,
    queueOrder: 3001,
    scoreA: 11,
    scoreB: 7,
    started: true,
    playersA: [playerOne],
    playersB: [playerTwo],
  })
  const matchDone = await makeMatch(sessionBoard.id, ownerA.uid, {
    status: 'finished',
    courtId: court2,
    queueOrder: 3000,
    scoreA: 21,
    scoreB: 15,
    started: true,
    winner: 'A',
    playersA: [playerOne],
    playersB: [playerTwo],
  })

  const board = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: sessionBoard.id,
  })
  const boardBody = obj(board)
  const boardRaw = JSON.stringify(board.body)
  const boardSession = (boardBody['session'] ?? {}) as Record<string, unknown>
  const boardCourtList = Array.isArray(boardBody['courts'])
    ? (boardBody['courts'] as Record<string, unknown>[])
    : []
  const boardMatches = Array.isArray(boardBody['matches'])
    ? (boardBody['matches'] as Record<string, unknown>[])
    : []

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 26. [68~72절] 통로 — 게스트가 코트 현황을 읽는다 ──')
  // ══════════════════════════════════════════════════════════════════
  check(
    '로그인 없이 현황판이 열리고 동아리·모임·코트가 온다',
    boardBody['ok'] === true &&
      boardBody['club_name'] === '게스트 스모크 A' &&
      boardSession['id'] === sessionBoard.id &&
      boardSession['status'] === 'live' &&
      boardCourtList.length === 2,
    `${msg(board)} — 실패하면 사전 준비(create_session · join_as_guest · 경기 4건)부터 본다`,
  )

  const liveRow = boardMatches.find((m) => m['id'] === matchLive) ?? {}
  const livePlayersA = Array.isArray(liveRow['players_a']) ? (liveRow['players_a'] as string[]) : []
  const livePlayersB = Array.isArray(liveRow['players_b']) ? (liveRow['players_b'] as string[]) : []
  check(
    '진행 중 경기에 점수와 **코트에 편성된 사람 이름**이 실린다',
    liveRow['status'] === 'live' &&
      liveRow['score_a'] === 11 &&
      liveRow['score_b'] === 7 &&
      typeof liveRow['started_at'] === 'string' &&
      livePlayersA.join() === '코트뛰는사람하나' &&
      livePlayersB.join() === '코트뛰는사람둘',
    `${String(liveRow['score_a'])}:${String(liveRow['score_b'])} A=${livePlayersA.join(',')} B=${livePlayersB.join(',')}`,
  )

  const boardOrder = boardMatches.map((m) => Number(m['queue_order']))
  check(
    'created_at 이 아니라 queue_order 순으로 온다 (알림이 세는 줄과 같은 순서)',
    boardOrder.join(',') === '3001,3002,3003',
    `${boardOrder.join(',')} — 삽입은 3003→3002→3001 순이었다. 3003,3002,3001 이 나오면 서버가 created_at 으로 정렬하고 있다`,
  )

  const unassignedRows = boardMatches.filter((m) => m['court_id'] === null)
  check(
    '코트 미배정 경기는 코트마다 복제되지 않고 응답에 딱 한 번만 실린다',
    unassignedRows.length === 1 &&
      unassignedRows[0]!['id'] === matchNoCourt &&
      boardMatches.length === 3,
    `미배정 ${unassignedRows.length}건 / 전체 ${boardMatches.length}건 — 코트가 둘이라 복제되면 2건이 된다`,
  )

  const finishedBoard = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: sessionFinished.id,
  })
  const finishedBody = obj(finishedBoard)
  check(
    '끝난 경기는 목록이 아니라 finished_count 숫자 하나이고, 끝난 모임도 ok:true 로 열린다',
    boardMatches.every((m) => m['id'] !== matchDone) &&
      boardBody['finished_count'] === 1 &&
      finishedBody['ok'] === true &&
      ((finishedBody['session'] ?? {}) as Record<string, unknown>)['status'] === 'finished',
    `finished_count=${String(boardBody['finished_count'])} · 끝난 모임 ok=${String(finishedBody['ok'])} ${msg(finishedBoard)}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 27. [73~74절] 관문 — 응답에 무엇이 실렸는가 ──')
  // ══════════════════════════════════════════════════════════════════
  // 이 두 절이 마일스톤 4 의 합격선이다. 나머지는 통로 확인이고,
  // 여기가 "링크 하나로 무엇이 새는가" 를 정면으로 본다.
  const seenKeys = new Set<string>()
  collectKeys(board.body, seenKeys)
  // 설계 판단 6 · 마이그레이션 머리 표의 목록 그대로. 중첩까지 펼친
  // 전수 목록이라 matches[] · courts[] · session 안의 키도 여기 다 있다.
  const allowedKeys = [
    'club_name',
    'court_id',
    'courts',
    'finished_count',
    'id',
    'matches',
    'name',
    'ok',
    'players_a',
    'players_b',
    'queue_order',
    'score_a',
    'score_b',
    'session',
    'sort_order',
    // started_at(경기가 시작된 시각)과 starts_at(모임 예정 시각)은 서로
    // 다른 필드다. 둘 다 실린다 — 한 글자 차이라 목록에서 빠뜨리기 쉽다.
    'started_at',
    'starts_at',
    'status',
  ]
  // 이름을 따로 적어 두는 이유: 집합 비교만 하면 실패 메시지가
  // "집합이 다르다" 로만 나온다. **무엇이 새로 샜는지**가 보여야 한다.
  const forbiddenKeys = [
    'referees',
    'member_id',
    'user_id',
    'label',
    'target_score',
    'target_a',
    'target_b',
    'deuce',
    'max_score',
    'invite_code',
    'guest_code',
    'club_id',
    'scored',
    'winner_side',
    'finished_at',
    'group_id',
    'group_a_id',
    'group_a_name',
    'is_joker',
    'created_by',
    'updated_by',
    'edited_at',
    'source',
    'tournament_id',
    'created_at',
    'is_guest',
    'rsvp',
    'role',
  ]
  const extraKeys = [...seenKeys].filter((k) => !allowedKeys.includes(k)).sort()
  const missingKeys = allowedKeys.filter((k) => !seenKeys.has(k))
  const leakedForbidden = forbiddenKeys.filter((k) => seenKeys.has(k))
  check(
    '반환 JSON 의 키가 설계 판단 6 목록과 정확히 일치한다 (중첩까지 전수)',
    extraKeys.length === 0 && missingKeys.length === 0 && leakedForbidden.length === 0,
    `늘어난 키=[${extraKeys.join(', ')}] 사라진 키=[${missingKeys.join(', ')}] 금지 키=[${leakedForbidden.join(', ')}]`,
  )

  // ── 74절 — 이 마일스톤에서 가장 중요한 한 줄 ────────────────────────
  // 명단(tournament_members)에는 있지만 어떤 경기에도 안 들어간 사람의
  // 이름이 응답 **문자열 어디에도** 없어야 한다. 키 검사(73절)로는 절대
  // 안 잡힌다 — players_a 라는 허용된 키 안에 명단 전체를 담아도 키는
  // 그대로이기 때문이다. 그래서 값을 본다.
  const { rows: boardRoster } = await db.query<{ display_name: string }>(
    `select display_name from tournament_members where tournament_id=$1`,
    [sessionBoard.id],
  )
  const assignedNames = new Set(['코트뛰는사람하나', '코트뛰는사람둘'])
  const unassignedNames = boardRoster
    .map((r) => r.display_name)
    .filter((n) => !assignedNames.has(n))
  const leakedNames = unassignedNames.filter((n) => boardRaw.includes(n))
  check(
    '편성되지 않은 참가자의 이름이 응답 어디에도 없다',
    // 편성 안 된 사람이 애초에 없으면 이 검사는 아무것도 증명하지 않는다.
    // 그래서 "샌 사람이 0명" 과 "볼 사람이 있었다" 를 같이 단정한다.
    unassignedNames.length >= 2 && leakedNames.length === 0,
    `명단 ${boardRoster.length}명 중 미편성 ${unassignedNames.length}명(${unassignedNames.join(', ')}) · 샌 이름 ${leakedNames.length}개[${leakedNames.join(', ')}]`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 28. [75~76절] anon 은 여전히 테이블·뷰에 직접 못 닿는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // ⚠ match_overview 에는 anon SELECT grant 가 **이미 있다**(Supabase 기본
  //   권한, 마일스톤 4 이전부터). 뷰가 security_invoker=true 라 기반
  //   테이블의 RLS 가 그대로 걸려 0행이 나올 뿐이다. 그래서 403 을
  //   기대하면 안 되고, **반환 행 수**로 판정해야 한다 — PostgREST 는 RLS
  //   로 전부 걸러져도 200 을 낸다.
  const anonOverview = await anonApi(
    `match_overview?tournament_id=eq.${sessionBoard.id}&select=id,players_a,referees`,
  )
  check(
    'anon 이 match_overview 를 직접 SELECT 해도 한 행도 못 얻는다',
    blocked(anonOverview),
    `status=${anonOverview.status} ${rows(anonOverview).length}행 — grant 는 있으나 security_invoker + RLS 로 0행이어야 한다`,
  )

  const directTables = [
    'matches',
    'courts',
    'match_teams',
    'match_team_players',
    'tournament_members',
    'score_events',
  ]
  const reachable: string[] = []
  for (const table of directTables) {
    const r = await anonApi(`${table}?select=*&limit=1`)
    if (!blocked(r)) reachable.push(`${table}(status=${r.status}, ${rows(r).length}행)`)
  }
  check(
    'anon 이 현황판 기반 테이블 여섯을 전부 직접 못 읽는다',
    reachable.length === 0,
    reachable.length
      ? `⚠ 뚫린 테이블: ${reachable.join(', ')}`
      : `${directTables.join(' · ')} 전부 차단`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 29. [77~80절] 오류가 갈리지 않는다 — 탐색기가 되지 않게 ──')
  // ══════════════════════════════════════════════════════════════════
  const boardOtherClub = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: sessionB.id,
  })
  const boardTournament = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: tournamentA.id,
  })
  const boardGhost = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: fakeSessionId,
  })
  const closedTrio = [boardOtherClub, boardTournament, boardGhost]
  const closedCodes = new Set(closedTrio.map((r) => String(obj(r)['error'])))
  const closedMessages = new Set(closedTrio.map((r) => String(obj(r)['message'])))
  check(
    '다른 동아리 · 대회 UUID · 없는 UUID 가 전부 board_closed 하나로 (코드도 메시지도 안 갈린다)',
    closedTrio.every((r) => obj(r)['ok'] === false) &&
      closedCodes.size === 1 &&
      closedCodes.has('board_closed') &&
      closedMessages.size === 1,
    `코드 ${closedCodes.size}종[${[...closedCodes].join(', ')}] 메시지 ${closedMessages.size}종 — 갈리면 임의 UUID 로 "이 동아리에 이 모임이 있나" 를 알아낼 수 있다`,
  )

  const boardOutWindow = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: sessionOutWindow.id,
  })
  check(
    '시각 창 밖(48시간 뒤) 모임은 board_closed 다 — 읽기 창이 등록 창보다 넓지 않다',
    obj(boardOutWindow)['ok'] === false && obj(boardOutWindow)['error'] === 'board_closed',
    msg(boardOutWindow),
  )

  const boardWrongCode = await anonRpc('guest_board', {
    p_code: 'Z'.repeat(22),
    p_session_id: sessionBoard.id,
  })
  check(
    '틀린 코드 + 맞는 session_id 는 bad_code 로 거절된다 (session_id 만으로는 아무것도 안 열린다)',
    obj(boardWrongCode)['ok'] === false && obj(boardWrongCode)['error'] === 'bad_code',
    msg(boardWrongCode),
  )

  const boardCrossCode = await anonRpc('guest_board', {
    p_code: clubB.guest_code,
    p_session_id: sessionBoard.id,
  })
  check(
    '맞는 코드(B동아리) + 다른 동아리(A)의 session_id 는 board_closed 로 거절된다',
    obj(boardCrossCode)['ok'] === false && obj(boardCrossCode)['error'] === 'board_closed',
    `${msg(boardCrossCode)} — club_id 를 같이 걸지 않으면 아무 동아리 코드로 남의 모임이 열린다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 30. [81~83절] anon 표면 — 늘어난 것이 정확히 무엇인가 ──')
  // ══════════════════════════════════════════════════════════════════
  // 개수가 아니라 **집합**으로 센다. 개수만 세면 하나가 빠지고 하나가
  // 늘어난 교체를 못 잡는다.
  //
  // ⚠ is_direct_api_call() 이 이 넷에 들어 있는 것은 의도다
  //   (20260819000001_fix_guard_permission.sql). 가드 트리거는 SECURITY
  //   INVOKER 여야만 발동하는데(DEFINER 로 바꾸면 current_user 가 postgres 가
  //   되어 가드가 영영 안 걸린다), 그러면 호출자 권한으로 이 함수를 불러야
  //   한다. 예전에 이 grant 를 걷었다가 관리자 수정이 통째로 막혔다.
  //   노출되는 정보는 "당신이 authenticated 인가" 불리언 하나뿐이다.
  //
  // ⚠ 트리거 함수(prorettype = 'trigger')는 제외한다 — PostgREST 가
  //   노출하지 않으므로 anon 이 부를 수 있는 표면이 아니다.
  const { rows: anonFns } = await db.query<{ sig: string }>(
    `select p.proname || '(' || pg_get_function_arguments(p.oid) || ')' as sig
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by 1`,
  )
  const expectedAnonFns = [
    'guest_board(p_code text, p_session_id uuid)',
    'guest_sessions(p_code text)',
    'is_direct_api_call()',
    // p_grade 는 20260901000001(급수)에서 **맨 뒤 default null** 로 붙었고,
    // 옛 3인자 함수는 같은 파일에서 drop 했다. 그래서 여기 이름이 하나
    // 늘어난 것이 아니라 **같은 함수의 시그니처가 바뀐 것**이다.
    //
    // 이 파일의 3인자 `join_as_guest` 호출 수십 건이 그대로 남아 있는 것이
    // 곧 회귀 관문이다 — 옛 함수를 안 지웠으면 `function is not unique` 로,
    // 새 인자에 default 를 안 줬으면 `function does not exist` 로 그 호출들이
    // 전부 무너진다. 명시적인 급수 검사는 scripts/smoke-grade.ts 에 있다.
    'join_as_guest(p_code text, p_session_id uuid, p_name text, p_grade text DEFAULT NULL::text)',
  ]
  const actualAnonFns = anonFns.map((r) => r.sig)
  check(
    'anon 이 호출할 수 있는 public 함수가 정확히 이 넷이다 (개수가 아니라 집합)',
    actualAnonFns.join(' | ') === expectedAnonFns.join(' | '),
    `실제: ${actualAnonFns.join(' | ') || '(없음)'}`,
  )

  const codeBeforeBoardRotate = clubA.guest_code
  const rotatedForBoard = obj(
    await rpc(ownerA.token, 'rotate_guest_code', { p_club_id: clubA.id }),
  ) as unknown as ClubRow
  const boardOldCode = await anonRpc('guest_board', {
    p_code: codeBeforeBoardRotate,
    p_session_id: sessionBoard.id,
  })
  const boardNewCode = await anonRpc('guest_board', {
    p_code: rotatedForBoard.guest_code,
    p_session_id: sessionBoard.id,
  })
  check(
    '재발급하면 옛 코드로 현황판도 즉시 안 열리고, 새 코드로는 열린다',
    obj(boardOldCode)['ok'] === false &&
      obj(boardOldCode)['error'] === 'bad_code' &&
      obj(boardNewCode)['ok'] === true,
    `옛코드=${msg(boardOldCode)} 새코드 ok=${String(obj(boardNewCode)['ok'])} — 유출된 링크를 닫는 유일한 수단이다`,
  )
  clubA.guest_code = rotatedForBoard.guest_code

  const writeRpcs: [string, unknown][] = [
    ['record_score', { p_match_id: matchLive, p_side: 'A', p_delta: 1, p_client_event_id: 'g4' }],
    ['finish_match', { p_match_id: matchLive, p_winner_side: 'A' }],
    ['claim_court', { p_match_id: matchWaiting, p_court_id: court2 }],
    [
      'set_court_queue',
      { p_tournament_id: sessionBoard.id, p_court_id: court1, p_match_ids: [matchWaiting] },
    ],
  ]
  const callable: string[] = []
  for (const [fn, args] of writeRpcs) {
    const r = await anonRpc(fn, args)
    if (r.status < 400) callable.push(`${fn}(status=${r.status})`)
  }
  const { rows: liveAfterWrites } = await db.query<{ score_a: number; status: string }>(
    `select score_a, status::text as status from matches where id=$1`,
    [matchLive],
  )
  check(
    '현황판이 열려도 게스트는 여전히 아무것도 못 쓴다 (점수·종료·코트잡기·대기열)',
    callable.length === 0 &&
      liveAfterWrites[0]!.score_a === 11 &&
      liveAfterWrites[0]!.status === 'live',
    callable.length
      ? `⚠ 뚫린 RPC: ${callable.join(', ')}`
      : `4종 전부 차단 · 경기는 ${liveAfterWrites[0]!.status} ${liveAfterWrites[0]!.score_a}점 그대로`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 31. [84~85절] 회귀 — 있던 것이 그대로다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 로그인 사용자 경로는 match_overview + RLS 그대로여야 한다. 게스트에게
  // 안 나가기로 한 필드(referees · target_a · scored · label · source)가
  // **여기서는 여전히 나오는 것**이 무변경의 증거다 — 뷰를 줄이는 방식으로
  // 게스트 노출을 막았다면 여기서 걸린다.
  const ownerOverview = await api(
    ownerA.token,
    `match_overview?tournament_id=eq.${sessionBoard.id}&select=id,status,court_name,label,source,scored,target_a,referees,players_a,winner_side&order=queue_order`,
  )
  const ownerRows = rows(ownerOverview)
  const ownerLive = ownerRows.find((r) => r['id'] === matchLive) ?? {}
  check(
    '로그인 사용자의 현황판(match_overview)은 한 글자도 안 바뀌었다 — 끝난 경기까지 넷 다 보이고 게스트에 안 나가는 필드도 그대로다',
    ownerOverview.status === 200 &&
      ownerRows.length === 4 &&
      ownerRows.some((r) => r['id'] === matchDone) &&
      ['label', 'source', 'scored', 'target_a', 'referees', 'winner_side'].every(
        (k) => k in ownerLive,
      ) &&
      ownerLive['target_a'] === 21,
    `status=${ownerOverview.status} ${ownerRows.length}행(기대 4) · 필드=${Object.keys(ownerLive).join(',')}`,
  )

  check(
    '마일스톤 3 등록 통로 1~67절이 여전히 전량 통과한다',
    milestone3Failed === 0 && milestone3Passed === 67,
    `${milestone3Passed}/${milestone3Passed + milestone3Failed} 통과 (기대 67/67) — 개수가 어긋나면 위쪽 절이 늘거나 줄었다는 뜻이고, 계획서·문서의 절 번호가 정본이 아니게 된다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 32. [86~93절] 즉석 모임(starts_at is null)의 시각 창 ──')
  // ══════════════════════════════════════════════════════════════════
  // 20260830000001 이전에는 starts_at 이 null 인 즉석 모임이 시각 창을
  // **무조건** 통과했다 — status='live' 로 남아 있는 한 게스트 링크가
  // 영원히 열려 있었다(프로덕션에 실제로 그런 모임이 있었다). 이제
  // 즉석 모임은 만든 때를 시각으로 본다: created_at > now() - 24시간.
  //
  // 24시간을 실제로 기다릴 수는 없으므로 created_at 을 손으로 과거로
  // 민다. create_session 에는 created_at 인자가 없고, 이 스크립트의 DB
  // 연결은 postgres 롤이라 is_direct_api_call() 이 거짓이 되어
  // guard_tournament_update 를 그대로 통과한다(위쪽 절이 status 를
  // 직접 UPDATE 하는 것과 같은 방식이다).
  const makeInstant = async (name: string, age: string | null): Promise<SessionRow> => {
    const s = obj(
      await rpc(ownerA.token, 'create_session', {
        p_name: name,
        p_display_name: '동아리A주인',
        p_court_count: 2,
        p_club_id: clubA.id,
      }),
    ) as unknown as SessionRow
    if (age) {
      await db.query(
        `update tournaments set created_at = now() - ($2::text)::interval where id=$1`,
        [s.id, age],
      )
    }
    return s
  }
  const instantOld = await makeInstant('오래된 즉석 모임', '30 hours')
  const instantEdge = await makeInstant('아침에 연 즉석 모임', '23 hours')
  const instantFresh = await makeInstant('방금 연 즉석 모임', null)

  // 이 절이 거짓이면 아래 일곱 절은 아무것도 증명하지 않는다 —
  // create_session 이 p_starts_at 없이도 시각을 채우기 시작하면
  // "즉석 모임" 자체가 사라지고 검사가 조용히 무의미해진다.
  const { rows: instantRows } = await db.query<{ starts_at: string | null; status: string }>(
    `select starts_at, status::text as status from tournaments where id = any($1::uuid[])`,
    [[instantOld.id, instantEdge.id, instantFresh.id]],
  )
  check(
    '셋 다 starts_at is null · status=live 인 즉석 모임이다 (아래 절들의 전제)',
    instantRows.length === 3 &&
      instantRows.every((r) => r.starts_at === null && r.status === 'live'),
    instantRows.map((r) => `starts_at=${String(r.starts_at)}/${r.status}`).join(' · '),
  )

  const candLate = obj(await anonRpc('guest_sessions', { p_code: clubA.guest_code }))
  const candLateIds = (
    Array.isArray(candLate['sessions']) ? (candLate['sessions'] as Record<string, unknown>[]) : []
  ).map((s) => String(s['id']))
  check(
    '만든 지 30시간 된 즉석 모임은 등록 후보에서 빠진다 (예전에는 영원히 후보였다)',
    candLate['ok'] === true && !candLateIds.includes(instantOld.id),
    `후보 ${candLateIds.length}건 · 오래된 즉석 모임 포함=${candLateIds.includes(instantOld.id)}`,
  )

  const joinOldInstant = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: instantOld.id,
    p_name: '오래된즉석게스트',
  })
  // is_guest 로 좁힌다 — create_session 이 주최자와 동아리 회원을 명단에
  // 미리 심어 두므로 "행이 0개" 로는 셀 수 없다.
  const { rows: oldInstantLeak } = await db.query(
    `select 1 from tournament_members where tournament_id=$1 and is_guest`,
    [instantOld.id],
  )
  check(
    '그 모임에 직접 등록을 시도해도 session_closed 이고 행이 안 생긴다',
    obj(joinOldInstant)['ok'] === false &&
      obj(joinOldInstant)['error'] === 'session_closed' &&
      oldInstantLeak.length === 0,
    `${msg(joinOldInstant)} · 남은 행 ${oldInstantLeak.length}개 — 후보에서 빼는 것만으로는 부족하다, 등록 쪽이 스스로 다시 막아야 한다`,
  )

  const boardOldInstant = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: instantOld.id,
  })
  check(
    '그 모임은 현황판도 board_closed 다 — 읽기 창이 등록 창과 같이 닫혔다',
    obj(boardOldInstant)['ok'] === false && obj(boardOldInstant)['error'] === 'board_closed',
    msg(boardOldInstant),
  )

  const joinEdge = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: instantEdge.id,
    p_name: '아침게스트',
  })
  const boardEdge = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: instantEdge.id,
  })
  check(
    '23시간 전에 연 즉석 모임은 등록도 현황판도 된다 (아침에 연 모임이 밤까지 살아 있다)',
    obj(joinEdge)['ok'] === true && obj(boardEdge)['ok'] === true,
    `등록=${msg(joinEdge)} 현황판ok=${String(obj(boardEdge)['ok'])} — 좁히다 여기가 깨지면 코트 앞 게스트가 막힌다, 가장 나쁜 실패 모드다`,
  )

  const joinFresh = await anonRpc('join_as_guest', {
    p_code: clubA.guest_code,
    p_session_id: instantFresh.id,
    p_name: '방금게스트',
  })
  const boardFresh = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: instantFresh.id,
  })
  check(
    '방금 연 즉석 모임은 후보로도 오고 등록도 현황판도 된다',
    candLateIds.includes(instantFresh.id) &&
      obj(joinFresh)['ok'] === true &&
      obj(boardFresh)['ok'] === true,
    `후보포함=${candLateIds.includes(instantFresh.id)} 등록=${msg(joinFresh)} 현황판ok=${String(obj(boardFresh)['ok'])}`,
  )

  // ── 이 절이 이 블록의 핵심이다 ──────────────────────────────────────
  // 읽기 필터(guest_board)는 등록 필터(guest_sessions·join_as_guest)의
  // **정확한 상위집합**이어야 한다. 어긋나면 "등록은 됐는데 현황판이
  // 안 보인다" 가 되고, 그것이 코트 앞에 선 게스트를 실제로 막는 가장
  // 나쁜 실패 모드다. 후보로 나온 모임 전부를 현황판으로 열어 본다.
  const notOnBoard: string[] = []
  for (const id of candLateIds) {
    const b = await anonRpc('guest_board', { p_code: clubA.guest_code, p_session_id: id })
    if (obj(b)['ok'] !== true) notOnBoard.push(`${id}(${String(obj(b)['error'])})`)
  }
  check(
    '상위집합 — 등록 후보로 나온 모임은 하나도 빠짐없이 현황판도 열린다',
    candLateIds.length >= 3 && notOnBoard.length === 0,
    notOnBoard.length
      ? `⚠ 등록은 되는데 현황판이 안 열리는 모임 ${notOnBoard.length}건: ${notOnBoard.join(', ')}`
      : `후보 ${candLateIds.length}건 전부 현황판 열림 — 시각 창 문자열이 세 함수에서 같다는 증거다`,
  )

  // 상위집합이 '우연히 같은 집합' 이 아니라 **진짜로 더 넓은지** 도 같이
  // 본다. 끝난 모임은 등록은 막히고 현황판만 열리는 유일한 차이다
  // (status 하나만 넓힌 것이 그 차이의 전부여야 한다).
  const boardFinished = await anonRpc('guest_board', {
    p_code: clubA.guest_code,
    p_session_id: sessionFinished.id,
  })
  check(
    '상위집합이 동치가 아니다 — 끝난 모임은 등록에서 빠지고 현황판에서만 열린다 (넓은 것은 status 하나뿐)',
    !candLateIds.includes(sessionFinished.id) && obj(boardFinished)['ok'] === true,
    `후보포함=${candLateIds.includes(sessionFinished.id)} 현황판ok=${String(obj(boardFinished)['ok'])}`,
  )
} finally {
  // ── 정리 ────────────────────────────────────────────────────────────
  // **프로덕션 DB 다.** 예전에 정리가 통째로 실패해 계정 8개 · 동아리 1개 ·
  // 모임 2개가 프로덕션에 남은 사고가 있었다. 원인은 한 문장이 실패하면
  // 뒤 문장이 전부 안 돌았다는 것이다. 그래서
  //   (1) 단계마다 try/catch 로 끊어 한 단계가 실패해도 나머지가 돌고
  //   (2) pooler 의 간헐적 `Connection timed out` 은 재시도로 넘기고
  //   (3) 마지막에 **잔여를 다시 조회해** 눈으로 확인한다.
  // 삭제 전에 id 를 먼저 확보하는 것이 핵심이다 — 계정을 지우고 나면
  // "owner_id in (select ... from auth.users)" 로는 남은 것을 못 찾는다.
  const sweep = async (label: string, sql: string, params: unknown[]): Promise<number> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await db.query(sql, params)
        return r.rowCount ?? 0
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        if (attempt === 3) {
          console.log(`⚠️ 정리 실패(${label}): ${detail}`)
          return -1
        }
        console.log(`   정리 재시도 ${attempt}/2 (${label}): ${detail}`)
        await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
    return -1
  }
  const idsOf = async (label: string, sql: string): Promise<string[]> => {
    try {
      const { rows: r } = await db.query<{ id: string }>(sql, [emails])
      return r.map((x) => x.id)
    } catch (err) {
      console.log(
        `⚠️ 잔여 확인용 id 수집 실패(${label}): ${err instanceof Error ? err.message : String(err)}`,
      )
      return []
    }
  }

  const tourIds = await idsOf(
    'tournaments',
    `select id from tournaments where owner_id in (select id from auth.users where email = any($1))`,
  )
  const clubIds = await idsOf(
    'clubs',
    `select id from clubs where owner_id in (select id from auth.users where email = any($1))`,
  )

  // tournaments.owner_id · clubs.owner_id 는 둘 다 on delete restrict 다.
  // 계정보다 먼저 지우지 않으면 정리가 통째로 실패한다.
  const delTours = await sweep(
    'tournaments',
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  const delClubs = await sweep(
    'clubs',
    `delete from clubs where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  const delUsers = await sweep('auth.users', `delete from auth.users where email = any($1)`, [
    emails,
  ])
  console.log(
    `\n🧹 정리 — 모임·대회 ${delTours}건 · 동아리 ${delClubs}건 · 계정 ${delUsers}건 (계정 ${emails.length}개 생성)`,
  )

  // 잔여 재조회 — "지웠다" 와 "안 남았다" 는 다른 이야기다.
  try {
    const { rows: left } = await db.query<{ users: number; clubs: number; tours: number }>(
      `select (select count(*) from auth.users   where email = any($1))::int as users,
              (select count(*) from clubs        where id    = any($2::uuid[]))::int as clubs,
              (select count(*) from tournaments  where id    = any($3::uuid[]))::int as tours`,
      [emails, clubIds, tourIds],
    )
    const rest = left[0]!
    const clean = rest.users === 0 && rest.clubs === 0 && rest.tours === 0
    console.log(
      clean
        ? '🧹 잔여 확인: 계정 0 · 동아리 0 · 모임 0 — 프로덕션에 남은 것이 없다'
        : `🚨 잔여 확인 실패: 계정 ${rest.users} · 동아리 ${rest.clubs} · 모임 ${rest.tours} 이 남았다. 손으로 지워야 한다`,
    )
    if (!clean) process.exitCode = 1
  } catch (err) {
    console.log(
      `🚨 잔여 확인 자체가 실패했다 — 남았는지 알 수 없다: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exitCode = 1
  }

  try {
    await db.end()
  } catch {
    // 연결 종료 실패는 정리 결과를 바꾸지 않는다. 여기서 던지면 위에서
    // 찍은 잔여 보고가 예외에 묻힌다.
  }
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
