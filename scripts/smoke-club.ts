/**
 * 동아리 계층(마일스톤 1b)이 실제 DB 에서 도는지 확인한다.
 *
 * 이 마이그레이션은 **아무것도 안 깨지는 것**이 가장 중요한 성질이다.
 * 동아리는 선택 계층이고, 권한 축이 아니라 명단의 원천이며, 동아리 운영진이
 * 산하 대회를 만지는 근거는 동아리 소속이 아니라 **생성 시점에 심어진 멤버 행**이다.
 * 이 세 문장이 실제로 지켜지는지는 프론트만 봐서는 알 수 없다 — RLS 정책과
 * BEFORE 트리거가 유일한 보안벽이라, 회귀는 조용히 "남의 것이 보이는" 형태로 난다.
 *
 * 그래서 여기서는 세 종류를 함께 본다.
 *   · 새로 열린 것   — 동아리를 만들고, 들어오고, 운영진을 지정한다
 *   · 막혀야 하는 것 — 관리자가 스스로 주인이 되거나, 대회를 동아리에서 떼어낸다
 *   · 그대로여야 하는 것 — 동아리 없이 대회·모임을 만드는 기존 경로 (회귀)
 *
 *   npm run db:smoke:club
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

function rows(r: ApiResult): Record<string, unknown>[] {
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []
}
function obj(r: ApiResult): Record<string, unknown> {
  return (r.body ?? {}) as Record<string, unknown>
}
function msg(r: ApiResult): string {
  return String(obj(r)['message'] ?? obj(r)['error'] ?? '(없음)')
}

const emails: string[] = []

async function makeUser(db: Client, tag: string, name: string) {
  const email = `club-${tag}-${Date.now()}@smashtest.local`
  const password = 'ClubTest12345!'
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
// 자르지 않고 붙이면 display_name 의 20자 제약에 걸려 대회 생성이 통째로 실패한다.
const NAME20 = '가나다라마바사아자차카타파하거너더러머버'
const NAME19 = NAME20.slice(0, 19)

type ClubRow = { id: string; invite_code: string; name: string }
type MemberRow = { id: string; user_id: string | null; role: string; display_name: string }

const clubMemberRow = async (clubId: string, uid: string) => {
  const { rows: r } = await db.query<MemberRow>(
    `select id, user_id, role, display_name from club_members where club_id=$1 and user_id=$2`,
    [clubId, uid],
  )
  return r[0]
}
const tmRole = async (tid: string, uid: string) => {
  const { rows: r } = await db.query<{ role: string }>(
    `select role from tournament_members where tournament_id=$1 and user_id=$2`,
    [tid, uid],
  )
  return r[0]?.role ?? null
}

try {
  const owner = await makeUser(db, 'owner', '동아리주인')
  const staff = await makeUser(db, 'staff', '부운영진')
  const member = await makeUser(db, 'member', '일반회원')
  const late = await makeUser(db, 'late', '늦은운영진')
  const outsider = await makeUser(db, 'out', '남의사람')
  const brute = await makeUser(db, 'brute', '코드난사')
  const twin1 = await makeUser(db, 'twin1', '동명이인하나')
  const twin2 = await makeUser(db, 'twin2', '동명이인둘')

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 1. 동아리를 만들면 만든 사람이 owner 로 들어간다 ──')
  // ══════════════════════════════════════════════════════════════════
  const createdClub = await rpc(owner.token, 'create_club', {
    p_name: '스모크 동아리',
    p_display_name: '동아리주인',
    p_description: '실DB 검증용',
  })
  check('동아리 생성 RPC', createdClub.status === 200, `status=${createdClub.status} ${msg(createdClub)}`)
  const club = obj(createdClub) as unknown as ClubRow

  const ownerRow = await clubMemberRow(club.id, owner.uid)
  check(
    "만든 사람이 owner 멤버 행으로 함께 들어간다",
    ownerRow?.role === 'owner',
    `role=${ownerRow?.role ?? '(행 없음)'} — 멤버 행이 없으면 만든 사람도 자기 동아리를 못 본다`,
  )
  check(
    '초대 코드가 6자리로 발급된다',
    /^[A-Z0-9]{6}$/.test(club.invite_code ?? ''),
    String(club.invite_code),
  )

  // 뒤에서 쓸 동아리들을 미리 만들어 둔다
  const clubB = obj(
    await rpc(owner.token, 'create_club', { p_name: '옮겨갈 동아리', p_display_name: '동아리주인' }),
  ) as unknown as ClubRow
  const clubDel = obj(
    await rpc(owner.token, 'create_club', { p_name: '지울 동아리', p_display_name: '동아리주인' }),
  ) as unknown as ClubRow
  const clubTwin = obj(
    await rpc(owner.token, 'create_club', { p_name: '동명이인 동아리', p_display_name: NAME20 }),
  ) as unknown as ClubRow

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 2. 관리자는 동아리 이름을 바꾸고, 일반 회원은 못 바꾼다 ──')
  // ══════════════════════════════════════════════════════════════════
  for (const u of [staff, member, late]) {
    const joined = await rpc(u.token, 'join_club', { p_code: club.invite_code, p_display_name: u.name })
    check(`${u.name} 이 코드로 들어온다`, obj(joined)['ok'] === true, msg(joined))
  }
  const staffRow = (await clubMemberRow(club.id, staff.uid))!
  const memberRow = (await clubMemberRow(club.id, member.uid))!
  const lateRow = (await clubMemberRow(club.id, late.uid))!

  const promoteStaff = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: staffRow.id,
    p_role: 'admin',
  })
  check('주인이 회원을 운영진으로 올린다', promoteStaff.status === 200, `status=${promoteStaff.status} ${msg(promoteStaff)}`)

  const renameByAdmin = await api(staff.token, `clubs?id=eq.${club.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '이름 바꾼 동아리' }),
  })
  const { rows: afterAdminRename } = await db.query<{ name: string }>(
    `select name from clubs where id=$1`,
    [club.id],
  )
  check(
    '운영진은 동아리 이름을 바꿀 수 있다 (과잉 차단 아님)',
    afterAdminRename[0]!.name === '이름 바꾼 동아리',
    `${afterAdminRename[0]!.name} (응답 ${renameByAdmin.status})`,
  )

  const renameByMember = await api(member.token, `clubs?id=eq.${club.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '회원이 바꾼 이름' }),
  })
  const { rows: afterMemberRename } = await db.query<{ name: string }>(
    `select name from clubs where id=$1`,
    [club.id],
  )
  check(
    '일반 회원은 동아리 이름을 바꿀 수 없다',
    afterMemberRename[0]!.name === '이름 바꾼 동아리',
    `${afterMemberRename[0]!.name} (응답 ${renameByMember.status}) — PostgREST 는 0행이어도 200 을 준다`,
  )

  const codeByAdmin = await api(staff.token, `clubs?id=eq.${club.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ invite_code: 'HACKED' }),
  })
  check(
    '운영진도 초대 코드를 직접 바꿀 수 없다',
    codeByAdmin.status >= 400,
    `status=${codeByAdmin.status} — 코드를 갈아 끼우면 감사 없이 명단 출입을 바꿀 수 있다`,
  )
  const ownerIdByAdmin = await api(staff.token, `clubs?id=eq.${club.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ owner_id: staff.uid }),
  })
  check(
    '운영진이 동아리 주인을 자기로 바꿔치기할 수 없다',
    ownerIdByAdmin.status >= 400,
    `status=${ownerIdByAdmin.status} — 주인이 되면 clubs_delete_owner 로 동아리를 통째로 지울 수 있다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 3. 남의 동아리는 목록에 아예 안 보인다 ──')
  // ══════════════════════════════════════════════════════════════════
  const outClubs = await api(outsider.token, 'clubs?select=id,name')
  check(
    '소속 없는 사람에게 동아리 목록이 0행이다',
    outClubs.status === 200 && rows(outClubs).length === 0,
    `status=${outClubs.status} / ${rows(outClubs).length}행 — 이름만 새어도 어디 사람인지가 드러난다`,
  )
  const outMembers = await api(outsider.token, 'club_members?select=id,display_name')
  check(
    '남의 동아리 명단도 0행이다',
    outMembers.status === 200 && rows(outMembers).length === 0,
    `${rows(outMembers).length}행 — 명단이 새면 실명·소속이 함께 샌다`,
  )
  const outDirect = await api(outsider.token, `clubs?id=eq.${club.id}&select=id`)
  check(
    'id 를 알아도 남의 동아리는 못 읽는다',
    rows(outDirect).length === 0,
    `${rows(outDirect).length}행`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 4. 동아리와 멤버십을 읽어도 무한재귀가 나지 않는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // clubs 정책이 club_members 를 보고, club_members 정책도 club_members 를 본다.
  // SECURITY DEFINER 헬퍼로 고리를 끊지 못했으면 여기서 42P17 이 난다.
  const myClubs = await api(owner.token, 'clubs?select=id,name')
  check(
    '내 동아리 목록이 재귀 에러 없이 읽힌다',
    myClubs.status === 200 && rows(myClubs).length >= 4,
    `status=${myClubs.status} ${rows(myClubs).length}행 ${myClubs.status === 200 ? '' : msg(myClubs)}`,
  )
  const myMembers = await api(owner.token, `club_members?club_id=eq.${club.id}&select=id,role`)
  check(
    '동아리 명단이 재귀 에러 없이 읽힌다',
    myMembers.status === 200 && rows(myMembers).length === 4,
    `status=${myMembers.status} ${rows(myMembers).length}행 ${myMembers.status === 200 ? '' : msg(myMembers)}`,
  )
  const embedded = await api(owner.token, `clubs?id=eq.${club.id}&select=id,club_members(id,role)`)
  check(
    '두 정책을 한 번에 지나는 중첩 조회도 돈다',
    embedded.status === 200 && rows(embedded).length === 1,
    `status=${embedded.status} ${msg(embedded)} — 여기서 42P17 이 나면 화면 전체가 죽는다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 5. 관리자가 자기 행을 PATCH 로 owner 승격하지 못한다 ──')
  // ══════════════════════════════════════════════════════════════════
  // tournament_members 에서 막았던 구멍이 club_members 에 그대로 복사된 자리다.
  const selfPromote = await api(staff.token, `club_members?id=eq.${staffRow.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'owner' }),
  })
  check(
    '운영진이 스스로 owner 가 될 수 없다',
    selfPromote.status >= 400 && (await clubMemberRow(club.id, staff.uid))?.role === 'admin',
    `status=${selfPromote.status} — owner 가 되면 진짜 주인을 내치고 동아리를 잠글 수 있다`,
  )
  const demoteOwner = await api(staff.token, `club_members?id=eq.${ownerRow!.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'member' }),
  })
  check(
    '운영진이 동아리 주인을 강등시킬 수 없다',
    demoteOwner.status >= 400 && (await clubMemberRow(club.id, owner.uid))?.role === 'owner',
    `status=${demoteOwner.status}`,
  )
  const stealSeat = await api(staff.token, `club_members?id=eq.${ownerRow!.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ user_id: staff.uid }),
  })
  check(
    '남의 멤버 행 계정을 자기 것으로 갈아 끼울 수 없다',
    stealSeat.status >= 400,
    `status=${stealSeat.status} — 계정을 바꾸면 역할을 안 건드리고도 주인 자리를 가져간다`,
  )
  const moveClub = await api(staff.token, `club_members?id=eq.${memberRow.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ club_id: clubB.id }),
  })
  check(
    '멤버를 다른 동아리로 옮길 수 없다',
    moveClub.status >= 400,
    `status=${moveClub.status} — 옮기면 남의 동아리 명단에 사람을 심을 수 있다`,
  )
  const okRename = await api(staff.token, `club_members?id=eq.${memberRow.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ display_name: '이름바꾼회원' }),
  })
  check(
    '운영진이 회원 표시명을 바꾸는 건 여전히 된다 (과잉 차단 아님)',
    okRename.status === 200 && rows(okRename).length === 1,
    `status=${okRename.status} — 막히는 것만 보면 가드가 정상 동작까지 죽여도 통과한다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 6. RPC 로도 owner 를 만들 수 없고, owner 행은 못 바꾼다 ──')
  // ══════════════════════════════════════════════════════════════════
  const rpcOwner = await rpc(staff.token, 'set_club_member_role', {
    p_member_id: staffRow.id,
    p_role: 'owner',
  })
  check('RPC 로도 owner 를 부여할 수 없다', rpcOwner.status >= 400, `status=${rpcOwner.status} ${msg(rpcOwner)}`)

  const rpcDemoteOwner = await rpc(staff.token, 'set_club_member_role', {
    p_member_id: ownerRow!.id,
    p_role: 'member',
  })
  check(
    'RPC 로도 동아리 주인을 강등할 수 없다',
    rpcDemoteOwner.status >= 400,
    `status=${rpcDemoteOwner.status} ${msg(rpcDemoteOwner)}`,
  )

  const rpcByMember = await rpc(member.token, 'set_club_member_role', {
    p_member_id: lateRow.id,
    p_role: 'admin',
  })
  check(
    '일반 회원은 남을 운영진으로 올릴 수 없다',
    rpcByMember.status >= 400,
    `status=${rpcByMember.status} ${msg(rpcByMember)}`,
  )

  const rpcLegit = await rpc(staff.token, 'set_club_member_role', {
    p_member_id: memberRow.id,
    p_role: 'admin',
  })
  check(
    '운영진의 정상 임명은 된다 (과잉 차단 아님)',
    rpcLegit.status === 200,
    `status=${rpcLegit.status} ${msg(rpcLegit)}`,
  )
  await rpc(staff.token, 'set_club_member_role', { p_member_id: memberRow.id, p_role: 'member' })
  check(
    '되돌리기(강등)도 된다',
    (await clubMemberRow(club.id, member.uid))?.role === 'member',
    String((await clubMemberRow(club.id, member.uid))?.role),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 7. 동아리 밑에 대회를 만들면 그 시점 운영진이 함께 들어간다 ──')
  // ══════════════════════════════════════════════════════════════════
  const createdEarly = await rpc(owner.token, 'create_tournament', {
    p_name: '동아리 산하 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '동아리주인',
    p_club_id: club.id,
  })
  check('소속 대회 생성 RPC', createdEarly.status === 200, `status=${createdEarly.status} ${msg(createdEarly)}`)
  const tEarly = obj(createdEarly) as unknown as { id: string; invite_code: string; club_id: string }

  check('대회에 소속 동아리가 기록된다', tEarly.club_id === club.id, String(tEarly.club_id))
  check(
    '그 시점 운영진이 admin 멤버 행으로 심긴다',
    (await tmRole(tEarly.id, staff.uid)) === 'admin',
    `${String(await tmRole(tEarly.id, staff.uid))} — 심어진 멤버 행이 없으면 운영진이 산하 대회를 못 만진다`,
  )
  check(
    '운영진이 아닌 회원은 심기지 않는다',
    (await tmRole(tEarly.id, member.uid)) === null,
    `${String(await tmRole(tEarly.id, member.uid))} — 명단에 없던 사람이 들어오면 유령 참가자가 된다`,
  )
  const { rows: earlyNames } = await db.query<{ display_name: string; role: string }>(
    `select display_name, role from tournament_members where tournament_id=$1 order by role`,
    [tEarly.id],
  )
  check(
    '이름은 동아리 명단의 복사본이다 (참조가 아니다)',
    earlyNames.some((r) => r.display_name === '부운영진'),
    earlyNames.map((r) => `${r.display_name}(${r.role})`).join(', '),
  )

  const createdFinished = await rpc(owner.token, 'create_tournament', {
    p_name: '이미 끝난 산하 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '동아리주인',
    p_club_id: club.id,
  })
  const tFin = obj(createdFinished) as unknown as { id: string }
  await db.query(`update tournaments set status='finished' where id=$1`, [tFin.id])

  const createdClubSession = await rpc(owner.token, 'create_session', {
    p_name: '동아리 산하 모임',
    p_display_name: '동아리주인',
    p_court_count: 2,
    p_club_id: club.id,
  })
  check(
    '모임도 같은 방식으로 소속을 받는다',
    createdClubSession.status === 200 &&
      (obj(createdClubSession)['club_id'] as string) === club.id &&
      (await tmRole((obj(createdClubSession)['id'] as string) ?? '', staff.uid)) === 'admin',
    `status=${createdClubSession.status} ${msg(createdClubSession)}`,
  )

  const byOutsider = await rpc(outsider.token, 'create_tournament', {
    p_name: '남의 동아리 사칭',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '남의사람',
    p_club_id: club.id,
  })
  check(
    '동아리 운영진이 아니면 그 동아리 소속 대회를 못 만든다',
    byOutsider.status >= 400,
    `status=${byOutsider.status} — 소속을 사칭하면 그 동아리 운영진 전원이 남의 대회 관리자가 된다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 8. 동아리 없이 만드는 기존 경로가 그대로 동작한다 (회귀) ──')
  // ══════════════════════════════════════════════════════════════════
  // p_club_id 를 아예 안 보낸다 = 1b 이전 프론트가 보내던 payload 그대로.
  // 시그니처를 drop 후 재생성했으므로 default null 이 살아 있는지가 관문이다.
  const plainT = await rpc(owner.token, 'create_tournament', {
    p_name: '동아리 없는 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 1,
    p_display_name: '주최자',
  })
  check(
    '소속 인자 없이 대회를 만들 수 있다',
    plainT.status === 200,
    `status=${plainT.status} ${msg(plainT)} — 여기서 깨지면 기존 사용자 전원이 대회를 못 연다`,
  )
  const tPlain = obj(plainT) as unknown as { id: string; invite_code: string; club_id: string | null }
  check('소속이 NULL 로 남는다', tPlain.club_id === null, String(tPlain.club_id))

  const { rows: plainGroups } = await db.query<{ n: string }>(
    `select count(*)::int as n from groups where tournament_id=$1`,
    [tPlain.id],
  )
  check('조가 예전처럼 함께 만들어진다', Number(plainGroups[0]!.n) === 2, `${plainGroups[0]!.n}개`)
  const { rows: plainJoker } = await db.query<{ n: string }>(
    `select count(*)::int as n from groups where tournament_id=$1 and is_joker`,
    [tPlain.id],
  )
  check('조커조 지정도 그대로다', Number(plainJoker[0]!.n) === 1, `${plainJoker[0]!.n}개`)

  const plainJoin = await rpc(outsider.token, 'join_tournament', { p_code: tPlain.invite_code })
  check(
    '코드로 들어오는 경로가 그대로다',
    obj(plainJoin)['ok'] === true,
    msg(plainJoin),
  )
  const seenByJoiner = await api(outsider.token, `tournaments?id=eq.${tPlain.id}&select=id,club_id`)
  check(
    '들어온 사람에게 대회가 보인다',
    rows(seenByJoiner).length === 1,
    `${rows(seenByJoiner).length}행`,
  )

  const plainS = await rpc(owner.token, 'create_session', {
    p_name: '동아리 없는 모임',
    p_display_name: '모임장',
    p_court_count: 2,
  })
  check(
    '소속 인자 없이 모임을 만들 수 있다',
    plainS.status === 200,
    `status=${plainS.status} ${msg(plainS)}`,
  )
  const sPlain = obj(plainS) as unknown as { id: string; club_id: string | null; kind: string; status: string }
  check('모임 소속도 NULL 이다', sPlain.club_id === null, String(sPlain.club_id))
  check("모임은 여전히 kind='session' · status='live' 로 열린다",
    sPlain.kind === 'session' && sPlain.status === 'live',
    `${sPlain.kind} / ${sPlain.status}`)
  const { rows: plainCourts } = await db.query<{ n: string }>(
    `select count(*)::int as n from courts where tournament_id=$1`,
    [sPlain.id],
  )
  check('코트가 예전처럼 함께 만들어진다', Number(plainCourts[0]!.n) === 2, `${plainCourts[0]!.n}개`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 9. 만들어진 대회의 소속을 나중에 바꾸거나 지울 수 없다 ──')
  // ══════════════════════════════════════════════════════════════════
  const detach = await api(owner.token, `tournaments?id=eq.${tEarly.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ club_id: null }),
  })
  check(
    '주최자도 대회를 동아리에서 떼어낼 수 없다',
    detach.status >= 400 && (await tmRole(tEarly.id, staff.uid)) !== null,
    `status=${detach.status} — 떼어내면 동아리 운영진 모르게 대회를 사유화할 수 있다`,
  )
  const reattach = await api(owner.token, `tournaments?id=eq.${tEarly.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ club_id: clubB.id }),
  })
  check(
    '다른 동아리로 옮길 수도 없다',
    reattach.status >= 400,
    `status=${reattach.status} — 소속은 생성 후 불변이다`,
  )
  const attachPlain = await api(owner.token, `tournaments?id=eq.${tPlain.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ club_id: club.id }),
  })
  check(
    '소속 없던 대회를 나중에 동아리에 붙일 수도 없다',
    attachPlain.status >= 400,
    `status=${attachPlain.status} — 붙이는 순간 그 동아리 운영진이 관리자가 아닌 채로 소속만 생긴다`,
  )
  const { rows: stillAttached } = await db.query<{ club_id: string | null }>(
    `select club_id from tournaments where id=$1`,
    [tEarly.id],
  )
  check('소속이 그대로다', stillAttached[0]!.club_id === club.id, String(stillAttached[0]!.club_id))

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 10~12. 강등은 전파하고, 승격은 명단에 있는 사람만 ──')
  // ══════════════════════════════════════════════════════════════════
  // 늦게 들어온 사람을 운영진으로 올린다. 대회는 이미 열려 있고 그 사람은
  // 명단에 없다 — 새로 심으면 뛴 적 없는 유령 참가자가 생긴다.
  const promoteLate = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: lateRow.id,
    p_role: 'admin',
  })
  check('늦게 들어온 회원을 운영진으로 올린다', promoteLate.status === 200, `status=${promoteLate.status}`)
  check(
    '12) 명단에 없는 사람은 승격해도 새로 심지 않는다',
    (await tmRole(tEarly.id, late.uid)) === null,
    `${String(await tmRole(tEarly.id, late.uid))} — 심으면 대진표·순위에 유령 참가자가 생긴다`,
  )

  const demoteStaff = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: staffRow.id,
    p_role: 'member',
  })
  check('운영진에서 내린다', demoteStaff.status === 200, `status=${demoteStaff.status} ${msg(demoteStaff)}`)
  check(
    '10) 안 끝난 산하 대회의 관리자 권한이 사라진다',
    (await tmRole(tEarly.id, staff.uid)) === 'member',
    `${String(await tmRole(tEarly.id, staff.uid))} — 내렸는데 이번 주 모임을 계속 관리하면 내린 게 아니다`,
  )
  check(
    '10) 이미 끝난 대회는 건드리지 않는다',
    (await tmRole(tFin.id, staff.uid)) === 'admin',
    `${String(await tmRole(tFin.id, staff.uid))} — 지난 기록을 소급 변조하지 않는다`,
  )
  const { rows: keptRows } = await db.query<{ n: string }>(
    `select count(*)::int as n from tournament_members where user_id=$1 and tournament_id = any($2)`,
    [staff.uid, [tEarly.id, tFin.id]],
  )
  check(
    '11) 내려도 멤버 행 자체는 남는다 (출전 기록 보존)',
    Number(keptRows[0]!.n) === 2,
    `${keptRows[0]!.n}행 — 행이 사라지면 이미 편성된 경기의 사람이 없어진다`,
  )
  check(
    '주최자 행은 강등 전파에서 제외된다',
    (await tmRole(tEarly.id, owner.uid)) === 'owner',
    `${String(await tmRole(tEarly.id, owner.uid))} — 강등하면 그 대회를 아무도 못 여는 상태로 잠긴다`,
  )

  const repromote = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: staffRow.id,
    p_role: 'admin',
  })
  check('다시 운영진으로 올린다', repromote.status === 200, `status=${repromote.status}`)
  check(
    '12) 명단에 이미 있는 사람은 승격이 전파된다',
    (await tmRole(tEarly.id, staff.uid)) === 'admin',
    String(await tmRole(tEarly.id, staff.uid)),
  )
  check(
    '12) 끝난 대회는 승격에서도 그대로다',
    (await tmRole(tFin.id, staff.uid)) === 'admin',
    String(await tmRole(tFin.id, staff.uid)),
  )
  const { rows: propagationLog } = await db.query<{ action: string }>(
    `select action from audit_logs where tournament_id=$1 and action like 'member.role.club_%'`,
    [tEarly.id],
  )
  check(
    '전파가 감사 로그에 남는다',
    propagationLog.length >= 2,
    `${propagationLog.length}건 — 흔적 없이 권한이 바뀌면 나중에 추적할 수 없다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 추가. 동아리 소속만으로는 산하 대회가 보이지 않는다 (의도) ──')
  // ══════════════════════════════════════════════════════════════════
  // tournaments_select 는 지금도 is_tournament_member(id) 하나뿐이다.
  // "동아리는 명단의 원천이지 권한 축이 아니다" 의 직접적 귀결이라 버그가 아니다.
  // 나중에 들어온 운영진에게 그 전에 열린 대회가 안 보이는 건 감수한 값이고,
  // 이 검사가 그걸 못 박는다 — 정책을 is_club_admin 으로 넓히려 하면 여기서 걸린다.
  const lateSees = await api(late.token, `tournaments?id=eq.${tEarly.id}&select=id`)
  check(
    '나중에 운영진이 된 사람에게 그 전에 열린 산하 대회는 안 보인다',
    rows(lateSees).length === 0,
    `${rows(lateSees).length}행 — 보이기 시작했다면 tournaments_select 가 동아리로 넓혀진 것이다.` +
      ' 권한 축을 동아리로 옮기면 소속 없는 기존 대회의 모든 판단이 새 경로를 지나게 된다',
  )
  const lateTouches = await api(late.token, `tournaments?id=eq.${tEarly.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '늦은운영진이 바꾼 이름' }),
  })
  const { rows: earlyName } = await db.query<{ name: string }>(
    `select name from tournaments where id=$1`,
    [tEarly.id],
  )
  check(
    '보이지 않으니 만질 수도 없다',
    earlyName[0]!.name === '동아리 산하 대회',
    `${earlyName[0]!.name} (응답 ${lateTouches.status})`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 13. 동아리를 지워도 산하 대회·경기·점수 원장이 남는다 ──')
  // ══════════════════════════════════════════════════════════════════
  const createdDel = await rpc(owner.token, 'create_tournament', {
    p_name: '지울 동아리의 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '동아리주인',
    p_club_id: clubDel.id,
  })
  const tDel = obj(createdDel) as unknown as { id: string }
  const { rows: delGroups } = await db.query<{ id: string }>(
    `select id from groups where tournament_id=$1 order by sort_order`,
    [tDel.id],
  )
  const { rows: delMatch } = await db.query<{ id: string }>(
    `insert into matches (tournament_id, status, created_by) values ($1,'live',$2) returning id`,
    [tDel.id, owner.uid],
  )
  await db.query(
    `insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
     values ($1,'A',$2,21,1.0,false), ($1,'B',$3,21,1.0,false)`,
    [delMatch[0]!.id, delGroups[0]!.id, delGroups[1]!.id],
  )
  await db.query(
    `insert into score_events (match_id, side, delta, client_event_id, created_by)
     values ($1,'A',1,'club-smoke-ledger-0001',$2)`,
    [delMatch[0]!.id, owner.uid],
  )

  const deleted = await api(owner.token, `clubs?id=eq.${clubDel.id}`, { method: 'DELETE' })
  const { rowCount: clubGone } = await db.query(`select 1 from clubs where id=$1`, [clubDel.id])
  check('동아리 주인은 동아리를 지울 수 있다', clubGone === 0, `응답 ${deleted.status}`)

  const { rows: survived } = await db.query<{ club_id: string | null }>(
    `select club_id from tournaments where id=$1`,
    [tDel.id],
  )
  check(
    '산하 대회는 남고 소속만 NULL 이 된다',
    survived.length === 1 && survived[0]!.club_id === null,
    `${survived.length}행 / club_id=${String(survived[0]?.club_id)} — cascade 였으면 대회가 통째로 사라진다`,
  )
  const { rowCount: matchLeft } = await db.query(`select 1 from matches where id=$1`, [
    delMatch[0]!.id,
  ])
  const { rowCount: ledgerLeft } = await db.query(`select 1 from score_events where match_id=$1`, [
    delMatch[0]!.id,
  ])
  check(
    '경기와 점수 원장이 그대로 남는다',
    matchLeft === 1 && ledgerLeft === 1,
    `경기 ${matchLeft}건 / 점수 ${ledgerLeft}건 — 동아리 하나 지우는 것으로 원장이 날아가면 복구할 방법이 없다`,
  )
  const { rowCount: cmGone } = await db.query(`select 1 from club_members where club_id=$1`, [
    clubDel.id,
  ])
  check(
    '동아리 명단은 함께 지워진다 (cascade 는 여기까지)',
    cmGone === 0,
    `${cmGone}행`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 14. 동명이인 운영진이어도 대회 생성이 실패하지 않는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 20자는 표시명 제약의 상한이다. 자르지 않고 접미사를 붙이면 제약 위반으로
  // 대회 생성 트랜잭션 전체가 롤백되어 "동아리 밑에서는 대회를 못 만드는" 상태가 된다.
  for (const t of [twin1, twin2]) {
    const joined = await rpc(t.token, 'join_club', {
      p_code: clubTwin.invite_code,
      p_display_name: NAME20,
    })
    check(`${t.name} 이 같은 이름으로 동아리에 들어온다`, obj(joined)['ok'] === true, msg(joined))
    const row = (await clubMemberRow(clubTwin.id, t.uid))!
    const up = await rpc(owner.token, 'set_club_member_role', { p_member_id: row.id, p_role: 'admin' })
    check(`${t.name} 을 운영진으로 올린다`, up.status === 200, `status=${up.status} ${msg(up)}`)
  }

  const twinT = await rpc(owner.token, 'create_tournament', {
    p_name: '동명이인 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: NAME20,
    p_club_id: clubTwin.id,
  })
  check(
    '운영진 셋이 모두 같은 20자 이름이어도 대회 생성이 성공한다',
    twinT.status === 200,
    `status=${twinT.status} ${msg(twinT)} — 여기서 실패하면 그 동아리는 대회를 영영 못 연다`,
  )
  const { rows: twinMembers } = await db.query<{ display_name: string; role: string }>(
    `select display_name, role from tournament_members where tournament_id=$1`,
    [(obj(twinT)['id'] as string) ?? '00000000-0000-0000-0000-000000000000'],
  )
  check(
    '운영진 셋이 모두 명단에 들어간다',
    twinMembers.length === 3,
    `${twinMembers.length}명: ${twinMembers.map((r) => r.display_name).join(' / ')}`,
  )
  check(
    '이름이 서로 겹치지 않게 접미사가 붙는다',
    new Set(twinMembers.map((r) => r.display_name)).size === 3,
    twinMembers.map((r) => r.display_name).join(' / '),
  )
  check(
    '먼저 들어간 이름은 바뀌지 않는다 (대진표·심판 배지의 열쇠다)',
    twinMembers.some((r) => r.display_name === NAME20),
    `원래 이름 ${NAME20} 이 그대로 있는가`,
  )
  check(
    '접미사는 19자로 자른 뒤 붙어 20자 제약을 넘지 않는다',
    twinMembers.every((r) => [...r.display_name].length <= 20) &&
      twinMembers.filter((r) => r.display_name.startsWith(NAME19) && r.display_name !== NAME20)
        .length === 2,
    twinMembers.map((r) => `${r.display_name}(${[...r.display_name].length}자)`).join(' / '),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 15. 동아리 운영진이라는 사실만으로 동아리 밖 대회 권한은 없다 ──')
  // ══════════════════════════════════════════════════════════════════
  const outT = await rpc(outsider.token, 'create_tournament', {
    p_name: '동아리 밖 대회',
    p_description: null,
    p_group_count: 2,
    p_joker_group_count: 0,
    p_display_name: '남의사람',
  })
  const tOut = obj(outT) as unknown as { id: string }
  const staffSeesOut = await api(staff.token, `tournaments?id=eq.${tOut.id}&select=id`)
  check(
    '동아리 운영진에게 동아리 밖 대회는 아예 안 보인다',
    rows(staffSeesOut).length === 0,
    `${rows(staffSeesOut).length}행 — 기존 헬퍼에 or is_club_admin 을 한 줄 얹으면 여기서 새어 나온다`,
  )
  const staffTouchesOut = await api(staff.token, `tournaments?id=eq.${tOut.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: '가로챈 대회' }),
  })
  const { rows: outName } = await db.query<{ name: string }>(
    `select name from tournaments where id=$1`,
    [tOut.id],
  )
  check(
    '이름도 못 바꾼다',
    outName[0]!.name === '동아리 밖 대회',
    `${outName[0]!.name} (응답 ${staffTouchesOut.status})`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 16. 브루트포스가 막히고, 차단된 뒤에도 기록이 남는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 실패를 기록한 뒤 raise exception 을 던지면 같은 트랜잭션의 기록까지
  // 롤백되어 카운터가 영원히 0 이 된다. 이 저장소가 이미 한 번 밟은 함정이라,
  // 상태 코드가 아니라 DB 에서 직접 센다.
  const countFails = async () => {
    const { rows: r } = await db.query<{ n: string }>(
      `select count(*)::int as n from join_attempts where user_id=$1 and not succeeded`,
      [brute.uid],
    )
    return Number(r[0]!.n)
  }
  const before = await countFails()
  const firstBad = await rpc(brute.token, 'join_club', { p_code: 'ZZZZZZ' })
  const afterFirst = await countFails()
  check(
    '없는 코드는 예외가 아니라 결과로 거절된다',
    firstBad.status === 200 && obj(firstBad)['ok'] === false,
    `status=${firstBad.status} error=${String(obj(firstBad)['error'])}`,
  )
  check(
    '실패한 코드 입력이 기록으로 남는다',
    afterFirst > before,
    `실패 기록 ${before} → ${afterFirst} — 예외로 롤백되면 여기가 안 늘고 차단이 영영 안 걸린다`,
  )
  const badFormat = await rpc(brute.token, 'join_club', { p_code: '짧음' })
  check(
    '형식이 틀린 코드도 기록된다 (형식만 바꿔 무한 시도하는 걸 막는다)',
    (await countFails()) > afterFirst && obj(badFormat)['error'] === 'bad_format',
    `error=${String(obj(badFormat)['error'])}`,
  )

  for (let i = 0; i < 10; i++) {
    await rpc(brute.token, 'join_club', { p_code: `ZZZZ${String(i).padStart(2, '0')}` })
  }
  const limited = await rpc(brute.token, 'join_club', { p_code: club.invite_code })
  check(
    '10회 실패하면 정상 코드로도 차단된다',
    obj(limited)['ok'] === false && obj(limited)['error'] === 'rate_limited',
    `error=${String(obj(limited)['error'])} — 6자리는 36^6 이라 차단이 없으면 며칠이면 뚫린다`,
  )
  const afterBlock = await countFails()
  // 차단된 시도는 일부러 기록하지 않는다 — 기록하면 재시도할 때마다 10분
  // 창이 스스로 연장되어 영구 차단이 된다. 그래서 카운터는 임계치 10 에서 멈춘다.
  check(
    '차단된 뒤에도 실패 기록이 그대로 남아 있다',
    afterBlock >= 10,
    `${afterBlock}건 — 0 이나 1 로 돌아갔다면 예외 롤백으로 카운터가 리셋된 것이다.` +
      ' 임계치 10 에서 더 안 늘어나는 건 정상(차단된 시도는 기록하지 않아 차단이 스스로 연장되지 않는다)',
  )
  const { rowCount: bruteJoined } = await db.query(
    `select 1 from club_members where club_id=$1 and user_id=$2`,
    [club.id, brute.uid],
  )
  check(
    '차단된 시도로는 동아리에 들어가지지 않는다',
    bruteJoined === 0,
    `${bruteJoined}행 — 차단 응답을 주면서 가입은 시켜 주면 차단이 아니다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 17. 동아리에서 빼기 · 스스로 나가기 ──')
  // ══════════════════════════════════════════════════════════════════
  // 명단에서 사람이 사라지는 것과 지난 기록이 지워지는 것은 다르다.
  await rpc(member.token, 'join_tournament', { p_code: tEarly.invite_code })
  check(
    '뺄 사람이 산하 대회 명단에 들어가 있다 (전제)',
    (await tmRole(tEarly.id, member.uid)) !== null,
    String(await tmRole(tEarly.id, member.uid)),
  )

  const removeOwner = await rpc(staff.token, 'remove_club_member', { p_member_id: ownerRow!.id })
  check(
    '동아리 주인은 뺄 수 없다',
    removeOwner.status >= 400,
    `status=${removeOwner.status} — 빼면 아무도 못 여는 동아리가 된다`,
  )
  const removeByMember = await rpc(member.token, 'remove_club_member', { p_member_id: lateRow.id })
  check(
    '일반 회원은 남을 뺄 수 없다',
    removeByMember.status >= 400,
    `status=${removeByMember.status} ${msg(removeByMember)}`,
  )

  const removeByAdmin = await rpc(staff.token, 'remove_club_member', { p_member_id: memberRow.id })
  const { rowCount: memberLeft } = await db.query(`select 1 from club_members where id=$1`, [
    memberRow.id,
  ])
  check(
    '운영진은 회원을 뺄 수 있다',
    removeByAdmin.status < 400 && memberLeft === 0,
    `status=${removeByAdmin.status} / 남은 행 ${memberLeft}`,
  )
  check(
    '뺐어도 산하 대회의 출전 기록은 남는다',
    (await tmRole(tEarly.id, member.uid)) !== null,
    `${String(await tmRole(tEarly.id, member.uid))} — 명단에서 사라지는 것과 기록이 지워지는 것은 다르다`,
  )
  const { rows: removeLog } = await db.query<{ n: string }>(
    `select count(*)::int as n from audit_logs where club_id=$1 and action='club_member.remove'`,
    [club.id],
  )
  check(
    '뺀 것이 감사 로그에 남는다',
    Number(removeLog[0]!.n) >= 1,
    `${removeLog[0]!.n}건`,
  )

  const leaveSelf = await rpc(late.token, 'remove_club_member', { p_member_id: lateRow.id })
  const { rowCount: lateLeft } = await db.query(`select 1 from club_members where id=$1`, [
    lateRow.id,
  ])
  check(
    '본인은 스스로 나갈 수 있다',
    leaveSelf.status < 400 && lateLeft === 0,
    `status=${leaveSelf.status} / 남은 행 ${lateLeft}`,
  )
} finally {
  // clubs.owner_id 와 tournaments.owner_id 는 둘 다 on delete restrict 다.
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
