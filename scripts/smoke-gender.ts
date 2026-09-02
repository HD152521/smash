/**
 * 성별(20260902000001_player_gender.sql)이 실제 DB 에서 도는지 확인한다.
 *
 * `smoke-grade.ts` 가 본보기다 — 성별은 급수와 구조가 같아서 시험할 것도
 * 거의 같다. 다만 급수에는 없던 축이 둘 더 있다:
 *
 *   1. 가입할 때 고른 성별이 profiles 에 들어간다 (handle_new_user)
 *   2. 명단에 들어올 때 그 값이 **스냅샷**된다
 *   3. 게스트가 입력한 성별이 그 명단 행에 남는다
 *   4. **성별 없이 들어오는 옛 경로가 그대로 동작한다** — join_as_guest 의
 *      시그니처가 또 바뀌었으므로 3인자·4인자 호출이 가장 중요한 회귀 관문이다
 *   5. **명단에서 남의 급수·성별을 고치는 두 RPC** — 누가 되고 누가 안 되나,
 *      그리고 남의 값을 바꾼 것이 감사로그에 남는가
 *   6. **마이페이지 경로** — 본인은 자기 profiles 를 고칠 수 있고 남의 것은
 *      RLS 가 0행으로 막는다 (PostgREST 는 0행이어도 200 이라 행 수로 본다)
 *
 * 절반은 **로그인하지 않은** anon 클라이언트로 돈다 — 게스트 등록은 anon
 * 경로이고, 3인자 호출이 새 5인자 함수를 그대로 찾는지는 PostgREST 를 실제로
 * 통과시켜 봐야만 알 수 있다(인자 이름 집합으로 함수를 찾는다).
 *
 *   npm run db:smoke:gender
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
// anon(비로그인) — 세션 토큰이 없으니 anon 키를 Authorization 에도 싣는다
async function anonRpc(fn: string, args: unknown): Promise<ApiResult> {
  return api(ANON, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
}
/** 마이페이지가 지나는 길 그대로 — profiles 직접 PATCH (RPC 가 아니다) */
async function patchProfile(token: string, uid: string, patch: unknown): Promise<ApiResult> {
  return api(token, `profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
}
function obj(r: ApiResult): Record<string, unknown> {
  return (r.body ?? {}) as Record<string, unknown>
}
function rows(r: ApiResult): Record<string, unknown>[] {
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []
}
function msg(r: ApiResult): string {
  return String(obj(r)['message'] ?? obj(r)['error'] ?? '(없음)')
}

// 응답 전체(중첩까지)의 키를 재귀로 모은다 — 게스트 노출 표면 검사용
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

/**
 * 계정을 만든다. auth.users 에 직접 INSERT 해도 `on_auth_user_created`
 * 트리거가 그대로 발동하므로 **handle_new_user 를 있는 그대로 시험한다.**
 *
 * meta 를 통째로 받는 이유: 성별 키가 **아예 없는** 가입(소셜 로그인과
 * 옛 가입 폼이 만드는 모양)이 이 스모크의 회귀 축이라, "키가 없다" 와
 * "키가 빈 값이다" 를 부르는 쪽에서 정확히 지어낼 수 있어야 한다.
 */
async function makeUser(db: Client, tag: string, name: string, meta: Record<string, string> = {}) {
  const email = `gender-${tag}-${Date.now()}@smashtest.local`
  const password = 'GenderTest12345!'
  const { rows: created } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,
       email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,
       confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1,crypt($2,gen_salt('bf')),now(),now(),now(),
       '{"provider":"email","providers":["email"]}'::jsonb,$3::jsonb,
       '','','','','') returning id`,
    [email, password, JSON.stringify({ name, ...meta })],
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
type TournamentRow = { id: string; name: string; invite_code: string }

const profileGender = async (uid: string): Promise<string | null> => {
  const { rows: r } = await db.query<{ gender: string | null }>(
    `select gender from profiles where id = $1`,
    [uid],
  )
  return r[0]?.gender ?? null
}
/** 명단 행의 성별. 없는 행이면 undefined 라 '행 자체가 없다' 와 'null 이다' 가 갈린다 */
const memberGender = async (tid: string, uid: string): Promise<string | null | undefined> => {
  const { rows: r } = await db.query<{ gender: string | null }>(
    `select gender from tournament_members where tournament_id = $1 and user_id = $2`,
    [tid, uid],
  )
  return r.length ? r[0]!.gender : undefined
}
const guestRow = async (
  tid: string,
  name: string,
): Promise<{ id: string; grade: string | null; gender: string | null } | undefined> => {
  const { rows: r } = await db.query<{ id: string; grade: string | null; gender: string | null }>(
    `select id, grade, gender from tournament_members
      where tournament_id = $1 and is_guest and display_name = $2`,
    [tid, name],
  )
  return r[0]
}
const memberRow = async (tid: string, uid: string): Promise<{ id: string } | undefined> => {
  const { rows: r } = await db.query<{ id: string }>(
    `select id from tournament_members where tournament_id = $1 and user_id = $2`,
    [tid, uid],
  )
  return r[0]
}
const auditCount = async (tid: string, action: string): Promise<number> => {
  const { rows: r } = await db.query<{ n: string }>(
    `select count(*)::int as n from audit_logs where tournament_id = $1 and action = $2`,
    [tid, action],
  )
  return Number(r[0]?.n ?? 0)
}

try {
  // ══════════════════════════════════════════════════════════════════
  // A. 가입 — handle_new_user 가 메타데이터의 성별을 profiles 로 옮기는가
  // ══════════════════════════════════════════════════════════════════
  const owner = await makeUser(db, 'owner', '성별주인', { grade: 'S', gender: 'male' })
  const woman = await makeUser(db, 'woman', '여자회원', { gender: 'female' })
  const silent = await makeUser(db, 'silent', '성별없는회원')
  const bogus = await makeUser(db, 'bogus', '이상한값회원', { gender: '남자' })
  emails.push(owner.email, woman.email, silent.email, bogus.email)

  check(
    '가입 때 고른 성별이 profiles 에 들어간다',
    (await profileGender(owner.uid)) === 'male',
    'male',
  )

  check(
    "'여' 가 DB 에는 female 로 들어간다 (한글이 DB 값이 아니다)",
    (await profileGender(woman.uid)) === 'female',
    String(await profileGender(woman.uid)),
  )

  // 회귀 축 — 소셜 로그인과 예전 가입 폼이 만드는 모양이다
  check(
    '⭐회귀 — 성별 키가 아예 없는 가입도 그대로 성공하고 profiles.gender 는 null 이다',
    (await profileGender(silent.uid)) === null,
    "null ('모른다'. '남자다' 가 아니다)",
  )

  check(
    "모르는 값('남자')으로 가입해도 가입이 막히지 않고 성별만 null 로 떨어진다",
    (await profileGender(bogus.uid)) === null,
    'parse_player_gender 가 예외 대신 null 을 돌려준다 — 여기서 던지면 계정 생성 전체가 롤백된다',
  )

  // 급수가 같은 트리거 안에서 여전히 도는지 — 한 컬럼을 더하면서 옆 컬럼을
  // 떨어뜨리는 것이 이런 마이그레이션의 가장 흔한 사고다
  const { rows: og } = await db.query<{ grade: string | null }>(
    `select grade from profiles where id = $1`,
    [owner.uid],
  )
  check(
    '⭐회귀 — 성별을 더해도 급수(20260901000001)가 그대로 들어간다',
    og[0]?.grade === 'S',
    `grade=${String(og[0]?.grade)} · 한 컬럼을 더하며 옆 컬럼을 떨어뜨리는 것이 흔한 사고다`,
  )

  // ══════════════════════════════════════════════════════════════════
  // B. 대회·모임 — 네 경로가 전부 스냅샷하는가
  // ══════════════════════════════════════════════════════════════════
  const tour = obj(
    await rpc(owner.token, 'create_tournament', {
      p_name: '성별 스모크 대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '성별주인',
    }),
  ) as unknown as TournamentRow

  check(
    'create_tournament — 주최자 명단 행에 프로필 성별이 스냅샷된다',
    (await memberGender(tour.id, owner.uid)) === 'male',
    `주최자 gender=${String(await memberGender(tour.id, owner.uid))}`,
  )

  const joined = await rpc(woman.token, 'join_tournament', {
    p_code: tour.invite_code,
    p_display_name: '여자회원',
  })
  check(
    'join_tournament — 들어온 사람 명단 행에 프로필 성별이 스냅샷된다',
    obj(joined)['ok'] === true && (await memberGender(tour.id, woman.uid)) === 'female',
    `${msg(joined)} · gender=${String(await memberGender(tour.id, woman.uid))}`,
  )

  const joinedSilent = await rpc(silent.token, 'join_tournament', {
    p_code: tour.invite_code,
    p_display_name: '성별없는회원',
  })
  check(
    '⭐회귀 — 성별 없는 사람도 대회에 그대로 들어오고 명단 행 성별만 null 이다',
    obj(joinedSilent)['ok'] === true && (await memberGender(tour.id, silent.uid)) === null,
    `${msg(joinedSilent)} · 행은 존재한다(${(await memberGender(tour.id, silent.uid)) !== undefined})`,
  )

  // 동아리 — club_members 에는 성별이 없다. profiles 를 직접 봐야 한다
  const club = obj(
    await rpc(owner.token, 'create_club', {
      p_name: '성별 스모크 동아리',
      p_display_name: '성별주인',
    }),
  ) as unknown as ClubRow

  for (const u of [woman, silent, bogus]) {
    await rpc(u.token, 'join_club', { p_code: club.invite_code, p_display_name: u.name })
  }

  const { rows: cm } = await db.query<{ id: string }>(
    `select id from club_members where club_id = $1 and user_id = $2`,
    [club.id, woman.uid],
  )
  await rpc(owner.token, 'set_club_member_role', { p_member_id: cm[0]!.id, p_role: 'admin' })

  const clubTour = obj(
    await rpc(owner.token, 'create_tournament', {
      p_name: '성별 스모크 동아리대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '성별주인',
      p_club_id: club.id,
    }),
  ) as unknown as TournamentRow

  check(
    'create_tournament(동아리) — 함께 심어지는 운영진도 profiles 성별이 스냅샷된다',
    (await memberGender(clubTour.id, woman.uid)) === 'female',
    `club_members 에는 성별 컬럼이 없다 — 정본인 profiles 를 봤다는 증거다 (gender=${String(await memberGender(clubTour.id, woman.uid))})`,
  )

  const session = obj(
    await rpc(owner.token, 'create_session', {
      p_name: '성별 스모크 모임',
      p_display_name: '성별주인',
      p_court_count: 2,
      p_club_id: club.id,
    }),
  ) as unknown as TournamentRow

  check(
    'create_session(동아리) — 심어지는 회원 전원이 각자 프로필 성별을 갖는다',
    (await memberGender(session.id, owner.uid)) === 'male' &&
      (await memberGender(session.id, woman.uid)) === 'female' &&
      (await memberGender(session.id, silent.uid)) === null &&
      (await memberGender(session.id, silent.uid)) !== undefined,
    `주인=male · 여자회원=female · 성별없음=null(행은 있다) · 모르는값=${String(await memberGender(session.id, bogus.uid))}`,
  )

  // ══════════════════════════════════════════════════════════════════
  // C. 스냅샷이 진짜 스냅샷인가 — 프로필을 바꿔도 지난 명단은 안 바뀐다
  // ══════════════════════════════════════════════════════════════════
  await db.query(`update profiles set gender = 'female' where id = $1`, [owner.uid])
  const afterA = await memberGender(tour.id, owner.uid)
  const afterB = await memberGender(session.id, owner.uid)
  check(
    '⭐스냅샷 — 프로필 성별을 바꿔도 이미 들어간 명단 두 곳은 그대로다',
    afterA === 'male' && afterB === 'male' && (await profileGender(owner.uid)) === 'female',
    `대회=${String(afterA)} · 모임=${String(afterB)} · 프로필=${String(await profileGender(owner.uid))} — 참조였다면 셋이 같이 바뀌었을 것이다`,
  )
  await db.query(`update profiles set gender = 'male' where id = $1`, [owner.uid])

  // ══════════════════════════════════════════════════════════════════
  // D. 명단 직접 추가 — 복사할 프로필이 없으면 null 이 맞다
  // ══════════════════════════════════════════════════════════════════
  const added = obj(
    await rpc(owner.token, 'add_roster_member', {
      p_tournament_id: tour.id,
      p_name: '손으로적은사람',
    }),
  )
  check(
    'add_roster_member — 계정이 없는 사람은 성별이 null 이다 (모르는 채로 둔다)',
    added['gender'] === null && added['user_id'] === null,
    `gender=${String(added['gender'])} — 억지 기본값('male')을 넣지 않는다. 이 값은 명단에서 채운다`,
  )

  // ══════════════════════════════════════════════════════════════════
  // E. 게스트 — anon 경로. **시그니처가 또 바뀐 유일한 함수다**
  // ══════════════════════════════════════════════════════════════════
  const g5 = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '성별있는게스트',
    p_grade: 'C',
    p_gender: 'female',
  })
  const g5row = await guestRow(session.id, '성별있는게스트')
  check(
    '게스트가 고른 성별이 그 명단 행에 남는다 (5인자 호출, 급수와 함께)',
    obj(g5)['ok'] === true && g5row?.gender === 'female' && g5row.grade === 'C',
    `${msg(g5)} · gender=${String(g5row?.gender)} · grade=${String(g5row?.grade)}`,
  )

  // ★ 이 절이 이 스크립트의 핵심이다 ★
  // PostgREST 는 함수를 인자 이름 집합으로 찾는다. 옛 4인자 함수를 drop 하지
  // 않았다면 아래 4인자 호출이 `function is not unique` 로 떨어지고, 새 인자를
  // 맨 뒤 default null 로 붙이지 않았다면 3인자 호출이
  // `function does not exist` 로 떨어진다.
  const g4 = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '급수만게스트',
    p_grade: 'B',
  })
  const g4row = await guestRow(session.id, '급수만게스트')
  check(
    '⭐⭐회귀 — 성별을 안 보내는 옛 4인자 호출이 그대로 동작한다 (gender=null)',
    obj(g4)['ok'] === true && g4row?.grade === 'B' && g4row.gender === null,
    `${msg(g4)} · grade=${String(g4row?.grade)} · gender=${String(g4row?.gender)} — 여기가 깨지면 급수만 보내던 클라이언트의 게스트 등록이 통째로 막힌다`,
  )

  const g3 = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '옛경로게스트',
  })
  const g3row = await guestRow(session.id, '옛경로게스트')
  check(
    '⭐⭐회귀 — 급수도 성별도 안 보내는 옛 3인자 호출도 그대로 동작한다',
    obj(g3)['ok'] === true && g3row?.grade === null && g3row.gender === null,
    `${msg(g3)} · 둘 다 null — 이 경로가 곧 배포 시차 동안의 옛 클라이언트다`,
  )

  const gBogus = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '이상한성별게스트',
    p_gender: '남자',
  })
  check(
    '모르는 성별을 보내도 봉투가 깨지지 않는다 — 등록은 되고 성별만 null 이다',
    obj(gBogus)['ok'] === true && (await guestRow(session.id, '이상한성별게스트'))?.gender === null,
    `${msg(gBogus)} · p_gender 를 enum 이 아니라 text 로 받는 이유다 — enum 이면 함수에 들어오기도 전에 22P02 로 터진다`,
  )

  const gEmpty = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '빈성별게스트',
    p_gender: '',
  })
  check(
    '빈 문자열도 null 로 떨어진다 (안 보낸 것과 같은 결과)',
    obj(gEmpty)['ok'] === true && (await guestRow(session.id, '빈성별게스트'))?.gender === null,
    msg(gEmpty),
  )

  // ══════════════════════════════════════════════════════════════════
  // F. 비로그인 노출 표면이 안 넓어졌는가 — 성별은 급수보다 민감하다
  // ══════════════════════════════════════════════════════════════════
  const board = await anonRpc('guest_board', {
    p_code: club.guest_code,
    p_session_id: session.id,
  })
  const boardKeys = new Set<string>()
  collectKeys(board.body, boardKeys)
  check(
    '게스트 현황판 응답에 성별이 실리지 않는다 (노출 표면 불변)',
    obj(board)['ok'] === true && !boardKeys.has('gender') && !boardKeys.has('grade'),
    `키 ${boardKeys.size}개 · gender=${boardKeys.has('gender')} · grade=${boardKeys.has('grade')} — 필드 하나가 곧 비로그인 노출 표면이다(20260829000001)`,
  )

  const cand = await anonRpc('guest_sessions', { p_code: club.guest_code })
  const candKeys = new Set<string>()
  collectKeys(cand.body, candKeys)
  check(
    '게스트 등록 후보 응답에도 성별이 없다',
    obj(cand)['ok'] === true && !candKeys.has('gender'),
    `키: ${[...candKeys].join(', ')}`,
  )

  const gJoinKeys = new Set<string>()
  collectKeys(g5.body, gJoinKeys)
  check(
    'join_as_guest 반환 봉투에도 성별이 없다 (ok · display_name · session_name 뿐)',
    !gJoinKeys.has('gender') && gJoinKeys.has('display_name') && gJoinKeys.has('session_name'),
    `키: ${[...gJoinKeys].join(', ')}`,
  )

  // ══════════════════════════════════════════════════════════════════
  // G. 명단에서 고치기 — set_member_grade · set_member_gender
  //
  // 이 절이 "총무가 채운다" 를 실제로 지키는 곳이다.
  // ══════════════════════════════════════════════════════════════════
  const silentMember = (await memberRow(session.id, silent.uid))!
  const guestMember = (await guestRow(session.id, '옛경로게스트'))!

  const filled = await rpc(owner.token, 'set_member_gender', {
    p_member_id: silentMember.id,
    p_gender: 'male',
  })
  check(
    '운영진이 남의 빈 성별을 채운다',
    obj(filled)['gender'] === 'male' && (await memberGender(session.id, silent.uid)) === 'male',
    `gender=${String(obj(filled)['gender'])} — 총무는 회원들의 성별을 이미 안다`,
  )

  check(
    '⭐남의 값을 바꾼 것은 감사로그에 남는다',
    (await auditCount(session.id, 'member.set_gender')) === 1,
    `member.set_gender ${await auditCount(session.id, 'member.set_gender')}건 — RLS PATCH 대신 RPC 를 쓰는 이유 중 하나다`,
  )

  const filledGrade = await rpc(owner.token, 'set_member_grade', {
    p_member_id: guestMember.id,
    p_grade: 'D',
  })
  check(
    '운영진이 계정 없는 게스트 행의 급수도 채운다',
    obj(filledGrade)['grade'] === 'D' && (await auditCount(session.id, 'member.set_grade')) === 1,
    `grade=${String(obj(filledGrade)['grade'])} · 감사 ${await auditCount(session.id, 'member.set_grade')}건`,
  )

  const cleared = await rpc(owner.token, 'set_member_grade', {
    p_member_id: guestMember.id,
    p_grade: null,
  })
  check(
    "null 로 '모른다' 로 되돌릴 수 있다 — 잘못 누른 것을 되돌리는 유일한 경로다",
    obj(cleared)['grade'] === null,
    `grade=${String(obj(cleared)['grade'])} — null 은 "안 바꾼다" 가 아니라 "비워라" 다`,
  )

  const badValue = await rpc(owner.token, 'set_member_gender', {
    p_member_id: guestMember.id,
    p_gender: '여자',
  })
  check(
    '모르는 값을 보내면 예외가 아니라 null 로 떨어진다',
    badValue.status < 400 && obj(badValue)['gender'] === null,
    `status=${badValue.status} · gender=${String(obj(badValue)['gender'])} — text 로 받아 파서에 맡기는 이유다`,
  )

  const selfMember = (await memberRow(session.id, woman.uid))!
  const selfSet = await rpc(woman.token, 'set_member_gender', {
    p_member_id: selfMember.id,
    p_gender: 'female',
  })
  const auditAfterSelf = await auditCount(session.id, 'member.set_gender')
  check(
    '본인은 자기 행을 고칠 수 있고, 본인 변경은 감사로그를 안 남긴다',
    selfSet.status < 400 && auditAfterSelf === 1,
    `status=${selfSet.status} · member.set_gender 누적 ${auditAfterSelf}건 (운영진이 남긴 1건 그대로) — 마이페이지에서 프로필을 고쳐도 스냅샷은 안 따라오므로 이 경로가 필요하다`,
  )

  const stranger = await rpc(silent.token, 'set_member_gender', {
    p_member_id: selfMember.id,
    p_gender: 'male',
  })
  check(
    '운영진도 본인도 아니면 42501 로 막힌다',
    stranger.status >= 400 && (await memberGender(session.id, woman.uid)) === 'female',
    `status=${stranger.status} · ${msg(stranger)} — 값도 안 바뀌었다`,
  )

  /*
   * ⭐ NULL 삼치 논리 회귀 (20260902000001 7/6 절).
   *
   * `v_member.user_id = auth.uid()` 는 user_id 가 null 이면 NULL 이다.
   * coalesce 를 안 씌우면 `not (NULL or false)` = NULL 이라 if 가 안 타고
   * **예외 없이 통과한다** — 즉 아무 로그인 사용자나 남의 대회 게스트 행을
   * 고칠 수 있게 된다. 여기가 그 구멍을 지킨다.
   */
  const guestBefore = (await guestRow(session.id, '옛경로게스트'))!.gender
  const strangerOnGuest = await rpc(silent.token, 'set_member_gender', {
    p_member_id: guestMember.id,
    p_gender: 'male',
  })
  check(
    '⭐⭐계정 없는 게스트 행도 남이 못 고친다 (NULL 삼치 논리 구멍)',
    strangerOnGuest.status >= 400 &&
      (await guestRow(session.id, '옛경로게스트'))?.gender === guestBefore,
    `status=${strangerOnGuest.status} · ${msg(strangerOnGuest)} — coalesce(user_id = auth.uid(), false) 가 없으면 여기가 통과한다`,
  )

  const strangerName = await rpc(silent.token, 'set_display_name', {
    p_member_id: guestMember.id,
    p_name: '탈취된이름',
  })
  check(
    '⭐같은 구멍을 set_display_name 에서도 막았다 (본보기 함수의 결함)',
    strangerName.status >= 400,
    `status=${strangerName.status} · ${msg(strangerName)} — 20260902000001 7/6 절이 고친 한 줄이다`,
  )

  check(
    '명단을 고쳐도 그 사람의 profiles 는 안 바뀐다 (명단의 값은 그 명단에서의 값)',
    (await profileGender(silent.uid)) === null,
    `프로필=${String(await profileGender(silent.uid))} · 명단=${String(await memberGender(session.id, silent.uid))} — 둘이 갈려 있는 것이 맞다`,
  )

  check(
    'set_member_gender 는 anon 에게 막혀 있다 (게스트 링크만 아는 사람이 편성을 못 흔든다)',
    (await anonRpc('set_member_gender', { p_member_id: selfMember.id, p_gender: 'male' })).status >=
      400,
    '명단 값은 편성의 근거다 — 비로그인에 열면 그대로 편성 조작이 된다',
  )

  // ══════════════════════════════════════════════════════════════════
  // H. 마이페이지 경로 — profiles 직접 UPDATE (RPC 가 아니다)
  // ══════════════════════════════════════════════════════════════════
  const mine = await patchProfile(silent.token, silent.uid, { gender: 'female', grade: 'A' })
  check(
    '마이페이지 — 본인은 자기 프로필의 성별·급수를 고칠 수 있다',
    rows(mine).length === 1 && (await profileGender(silent.uid)) === 'female',
    `${rows(mine).length}행 · gender=${String(await profileGender(silent.uid))} — RPC 없이 profiles_update_own 정책만으로 된다`,
  )

  /*
   * ⚠ PostgREST 는 RLS 로 0행이 걸러져도 200 이다. 상태 코드로 판정하면
   *   "남의 프로필도 고쳐진다" 를 못 잡는다 — **행 수로 본다.**
   */
  const others = await patchProfile(silent.token, woman.uid, { gender: 'male' })
  check(
    '⭐남의 프로필은 0행이다 (200 이지만 아무것도 안 바뀐다)',
    rows(others).length === 0 && (await profileGender(woman.uid)) === 'female',
    `status=${others.status} · ${rows(others).length}행 · 상대 프로필=${String(await profileGender(woman.uid))} — 상태 코드가 아니라 행 수로 판정해야 한다`,
  )

  // ══════════════════════════════════════════════════════════════════
  // I. 파서는 내부 전용인가
  // ══════════════════════════════════════════════════════════════════
  const direct = await anonRpc('parse_player_gender', { p_raw: 'male' })
  const directAuth = await rpc(owner.token, 'parse_player_gender', { p_raw: 'male' })
  check(
    'parse_player_gender 는 anon 에게도 로그인 사용자에게도 막혀 있다 (내부 전용)',
    direct.status >= 400 && directAuth.status >= 400,
    `anon=${direct.status} · authenticated=${directAuth.status}`,
  )
} finally {
  // ── 정리 ────────────────────────────────────────────────────────────
  // **프로덕션 DB 다.** smoke-grade.ts 의 정리 절을 글자 그대로 따른다:
  //   (1) 단계마다 try/catch 로 끊어 한 단계가 실패해도 나머지가 돌고
  //   (2) pooler 의 간헐적 `Connection timed out` 은 재시도로 넘기고
  //   (3) 마지막에 **잔여를 다시 조회해** 눈으로 확인한다.
  //
  // ⚠ 지우는 기준은 **이 실행이 만든 이메일 목록**뿐이다. 도메인
  //   (@smashtest.local)으로 지우면 db:seed 가 심은 실제 대회 명단
  //   (seed-N@smashtest.local)까지 날아간다 — 이름만 보고 지우지 않는다.
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
    `\n🧹 정리 — 대회·모임 ${delTours}건 · 동아리 ${delClubs}건 · 계정 ${delUsers}건 (계정 ${emails.length}개 생성)`,
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
        ? '🧹 잔여 확인: 계정 0 · 동아리 0 · 대회 0 — 프로덕션에 남은 것이 없다'
        : `🚨 잔여 확인 실패: 계정 ${rest.users} · 동아리 ${rest.clubs} · 대회 ${rest.tours} 이 남았다. 손으로 지워야 한다`,
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
