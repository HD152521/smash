/**
 * 월 회비 장부(20260903000002)가 실제 DB 에서 도는지 확인한다.
 *
 * 이 기능의 유일한 진짜 위험은 **미납자 명단 유출**이다. 동아리에서
 * "누가 회비 안 냈다" 가 공개되면 실제로 사람이 나간다. 그래서 club_dues 의
 * RLS 는 select 정책 `is_club_admin(club_id)` **하나뿐**이고, insert/update/
 * delete 정책은 아예 없다. 회원용 창구는 club_dues_summary() 하나이며
 * 거기서도 합계 두 개와 **본인 행**만 나간다.
 *
 * 🔴 이 파일이 존재하는 이유는 그 한 줄이 실제로 지켜지는지 확인하는 것이다.
 *    프론트만 봐서는 절대 알 수 없다 — 회귀는 조용히 "남의 미납이 보이는"
 *    형태로 나고, 화면은 아무 에러도 띄우지 않는다.
 *
 * ⚠ PostgREST 는 RLS 가 행을 전부 걸러도 200/204 를 준다. 그래서 여기서는
 *   막힘을 **상태 코드로 판단하지 않는다.** 돌아온 행 수를 세거나 pg 직결로
 *   실제 값을 되읽는다. 이 저장소가 이미 한 번 밟은 함정이다.
 *
 * ⚠ 막히는 것만 보면 가드가 정상 동작까지 죽여도 통과한다. 그래서 모든
 *   "막혀야 한다" 검사에는 "제 역할에게는 여전히 된다" 검사를 짝지어 둔다.
 *
 *   npm run db:smoke:dues
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
  const email = `dues-${tag}-${Date.now()}@smashtest.local`
  const password = 'DuesTest12345!'
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

// ── 이번 달을 대상으로 한다. 화면이 보내는 것은 '오늘' 이지 '1일' 이 아니므로
//    RPC 에는 일부러 달 중간 날짜를 보내고, 장부는 1일로 접혔는지 확인한다.
const TODAY = new Date()
const YM = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`
const PERIOD_FIRST = `${YM}-01`
const PERIOD_MID = `${YM}-14`
const PAID_DAY = `${YM}-05`

// 지난 달. "사람이 나가고 다시 들어와도 **지난 달** 합계는 안 흔들린다" 를
// 증명하려면 지난 달 장부가 실제로 있어야 한다.
const PREV = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)
const PREV_YM = `${PREV.getFullYear()}-${String(PREV.getMonth() + 1).padStart(2, '0')}`
const PERIOD_PREV = `${PREV_YM}-01`
const PREV_PAID_DAY = `${PREV_YM}-03`
const PREV_AMOUNT = 20000

const DEFAULT_AMOUNT = 30000 // 총무가 달을 열 때 적는 기본 회비
const GHOST_AMOUNT = 10000 // 신입 할인처럼 총무가 손으로 고친 금액

// 🔴 회원의 summary 응답에 이 문자열들이 하나라도 섞이면 명단이 새는 것이다.
const NAME_OWNER = '총무주인'
const NAME_ADMIN2 = '부총무'
const NAME_MEMBER = '일반회원'
const NAME_GHOST = '계정없는회원'
const SECRET_NOTE = '아내계좌 김영희 - 총무만 보는 메모'
const INTRUDER_NAME = '몰래끼운행'

type ClubRow = { id: string; invite_code: string; name: string }
type DuesRow = {
  id: string
  member_id: string | null
  member_user_id: string | null
  member_name: string
  amount: number
  paid_on: string | null
  note: string | null
  removed_at: string | null
}

const SELECT_DUES = `select id, member_id, member_user_id, member_name, amount,
                            paid_on::text as paid_on, note, removed_at::text as removed_at
                       from club_dues`

const duesOf = async (clubId: string, memberName: string) => {
  const { rows: r } = await db.query<DuesRow>(
    `${SELECT_DUES} where club_id=$1 and member_name=$2 and period_month=$3`,
    [clubId, memberName, PERIOD_FIRST],
  )
  return r[0]
}
const duesById = async (id: string) => {
  const { rows: r } = await db.query<DuesRow>(`${SELECT_DUES} where id=$1`, [id])
  return r[0]
}
/**
 * **살아 있는** 행 수. 「빼기」는 지우기가 아니라 표시라서(20260904000002),
 * 뺀 행은 표에 남아 있고 합계에만 안 든다. 여기서 전부를 세면 "뺐는데 왜
 * 그대로냐" 를 못 잡는다 — 전부를 세는 것은 duesCountAll 이다.
 */
const duesCount = async (clubId: string) => {
  const { rows: r } = await db.query<{ n: string }>(
    `select count(*)::int as n from club_dues where club_id=$1 and removed_at is null`,
    [clubId],
  )
  return Number(r[0]!.n)
}
/** 뺀 행까지 포함한 전부. "행이 안 지워졌다" 의 증거다 */
const duesCountAll = async (clubId: string) => {
  const { rows: r } = await db.query<{ n: string }>(
    `select count(*)::int as n from club_dues where club_id=$1`,
    [clubId],
  )
  return Number(r[0]!.n)
}
/** 합계를 pg 로 직접 계산한다 — summary 가 스스로를 채점하지 못하게 한다. */
const truthTotalsAt = async (clubId: string, period: string) => {
  const { rows: r } = await db.query<{ expected: string; collected: string }>(
    `select coalesce(sum(amount),0)::int as expected,
            coalesce(sum(amount) filter (where paid_on is not null),0)::int as collected
       from club_dues
      where club_id=$1 and period_month=$2 and removed_at is null`,
    [clubId, period],
  )
  return { expected: Number(r[0]!.expected), collected: Number(r[0]!.collected) }
}
const truthTotals = async (clubId: string) => truthTotalsAt(clubId, PERIOD_FIRST)

let testClubId: string | null = null

try {
  const owner = await makeUser(db, 'owner', NAME_OWNER)
  const admin2 = await makeUser(db, 'admin2', NAME_ADMIN2)
  const member = await makeUser(db, 'member', NAME_MEMBER)
  const outsider = await makeUser(db, 'out', '남의사람')

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 1. 시험용 동아리와 명단을 세운다 (계정 없는 회원 포함) ──')
  // ══════════════════════════════════════════════════════════════════
  // 실운영 동아리는 절대 건드리지 않는다. 이 실행이 만든 것만 쓰고 지운다.
  const createdClub = await rpc(owner.token, 'create_club', {
    p_name: '회비 스모크 동아리',
    p_display_name: NAME_OWNER,
    p_description: '실DB 검증용 — 이 실행이 만들고 이 실행이 지운다',
  })
  check(
    '동아리 생성 RPC',
    createdClub.status === 200,
    `status=${createdClub.status} ${msg(createdClub)}`,
  )
  const club = obj(createdClub) as unknown as ClubRow
  testClubId = club.id

  for (const u of [admin2, member]) {
    const joined = await rpc(u.token, 'join_club', {
      p_code: club.invite_code,
      p_display_name: u.name,
    })
    check(`${u.name} 이 코드로 들어온다`, obj(joined)['ok'] === true, msg(joined))
  }
  const { rows: a2 } = await db.query<{ id: string }>(
    `select id from club_members where club_id=$1 and user_id=$2`,
    [club.id, admin2.uid],
  )
  const admin2Row = a2[0]!

  const promote = await rpc(owner.token, 'set_club_member_role', {
    p_member_id: admin2Row.id,
    p_role: 'admin',
  })
  check(
    '두 번째 사람을 운영진으로 올린다',
    promote.status === 200,
    `status=${promote.status} ${msg(promote)} — 뒤에서 "주인만"이 아니라 "운영진이면" 되는지 볼 때 쓴다`,
  )

  // 계정 없는 회원(현실의 명단에 실제로 있는 사람들). user_id 가 null 이라
  // 로그인 경로로는 만들 수 없어 pg 로 직접 넣는다. 회비는 계정이 아니라
  // **사람**에게 붙는다는 설계 판단(3)의 시험 대상이다.
  const { rows: gm } = await db.query<{ id: string }>(
    `insert into club_members (club_id, user_id, role, display_name)
     values ($1, null, 'member', $2) returning id`,
    [club.id, NAME_GHOST],
  )
  const ghostRow = gm[0]!
  check(
    '계정 없는 회원이 명단에 있다 (전제)',
    ghostRow.id.length === 36,
    `${NAME_GHOST} — 현실 명단의 "계정 없는 3명" 을 모사한다`,
  )

  const { rows: memberCount } = await db.query<{ n: string }>(
    `select count(*)::int as n from club_members where club_id=$1`,
    [club.id],
  )
  check('명단이 4명이다 (주인·부운영진·회원·계정없는회원)', Number(memberCount[0]!.n) === 4, `${memberCount[0]!.n}명`)

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 2. 달을 열면 회원 전원에게 행이 생긴다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 미납을 "행이 없음" 으로 두면 아직 안 낸 사람의 금액이 어디에도 없어
  // "48만원 중 39만원" 을 말할 수 없다. 그래서 먼저 행을 만든다.
  const opened = await rpc(owner.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_MID, // 일부러 달 중간 날짜를 보낸다
    p_amount: DEFAULT_AMOUNT,
  })
  check(
    '운영진이 달을 연다 — 회원 수만큼 행이 만들어진다',
    opened.status === 200 && Number(opened.body) === 4,
    `status=${opened.status} 생성=${String(opened.body)} ${msg(opened)}`,
  )
  const { rows: folded } = await db.query<{ p: string }>(
    `select distinct period_month::text as p from club_dues where club_id=$1`,
    [club.id],
  )
  check(
    '달 중간 날짜를 보내도 장부는 그 달 1일로 접힌다',
    folded.length === 1 && folded[0]!.p === PERIOD_FIRST,
    `보낸 값 ${PERIOD_MID} → 저장 ${folded.map((r) => r.p).join(',')} — 안 접히면 같은 달 장부가 날짜마다 쪼개진다`,
  )

  const ownerDues = (await duesOf(club.id, NAME_OWNER))!
  const admin2Dues = (await duesOf(club.id, NAME_ADMIN2))!
  const memberDues = (await duesOf(club.id, NAME_MEMBER))!
  const ghostDues = (await duesOf(club.id, NAME_GHOST))!

  // 뒤의 유출 검사를 위해 미리 판을 깐다: 두 명은 납부, 회원 본인 행에는
  // 총무의 사적인 메모를 심는다. 이 메모가 회원에게 보이면 안 된다.
  await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: ownerDues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })
  await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: admin2Dues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })
  const noted = await rpc(owner.token, 'set_dues_note', {
    p_dues_id: memberDues.id,
    p_note: SECRET_NOTE,
  })
  check(
    '총무가 회원 행에 메모를 남긴다 (전제)',
    noted.status === 200 && (await duesById(memberDues.id))?.note === SECRET_NOTE,
    `status=${noted.status} — 입금자명이 회원 이름과 다를 때의 실마리다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 3. 🔴 회원에게는 회비 장부가 한 행도 안 보인다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 이 절이 이 파일의 이유다. 회원에게 행을 한 줄이라도 열면
  // "행이 없는 사람 = 미납" 또는 "paid_on 이 null 인 사람 = 미납" 이
  // 그대로 명단이 된다. 합계를 보여주는 요구와 미납을 감추는 요구는
  // 정면으로 충돌하고, 이 저장소는 후자를 택했다.
  //
  // ⚠ 상태 코드로 판단하지 않는다 — PostgREST 는 RLS 가 전부 걸러도 200 이다.
  const memberByClub = await api(member.token, `club_dues?club_id=eq.${club.id}&select=*`)
  check(
    '1) 회원이 자기 동아리 회비 장부를 조회하면 0행이다',
    rows(memberByClub).length === 0,
    `status=${memberByClub.status} / ${rows(memberByClub).length}행 — 403 이 아니라 200 에 0행인 것이 정상이다.` +
      ' 상태 코드로 판단했으면 이 검사는 통과하면서 실제로는 새고 있었을 것이다',
  )
  const memberAll = await api(member.token, 'club_dues?select=*')
  check(
    '2) 필터 없이 통째로 긁어도 0행이다',
    rows(memberAll).length === 0,
    `status=${memberAll.status} / ${rows(memberAll).length}행 — club_id 필터는 클라이언트가 붙이는 것이라 가드가 아니다`,
  )
  const memberOwnRow = await api(member.token, `club_dues?id=eq.${memberDues.id}&select=*`)
  check(
    '3) 자기 자신의 회비 행조차 테이블로는 못 읽는다',
    rows(memberOwnRow).length === 0,
    `status=${memberOwnRow.status} / ${rows(memberOwnRow).length}행 — 본인 행을 열어 주면 note(총무의 사적 메모)가 함께 나간다.` +
      ' 회원의 유일한 창구는 club_dues_summary 다',
  )
  const outsiderRead = await api(outsider.token, `club_dues?club_id=eq.${club.id}&select=*`)
  check(
    '4) 아무 동아리에도 없는 사람에게도 0행이다',
    rows(outsiderRead).length === 0,
    `status=${outsiderRead.status} / ${rows(outsiderRead).length}행`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 4. 🔴 회원용 창구는 숫자와 본인 행만 내보낸다 ──')
  // ══════════════════════════════════════════════════════════════════
  const memberSummary = await rpc(member.token, 'club_dues_summary', {
    p_club_id: club.id,
    p_period: PERIOD_MID,
  })
  const sum = obj(memberSummary)
  const mine = (sum['mine'] ?? null) as Record<string, unknown> | null
  check(
    '5) 회원이 합계를 볼 수 있다 (과잉 차단 아님)',
    memberSummary.status === 200 &&
      typeof sum['expected_total'] === 'number' &&
      typeof sum['collected_total'] === 'number',
    `status=${memberSummary.status} 걷을돈=${String(sum['expected_total'])} 걷힌돈=${String(sum['collected_total'])} ${msg(memberSummary)}`,
  )
  check(
    '5) 본인 행이 함께 온다',
    mine !== null && mine['id'] === memberDues.id,
    `mine=${JSON.stringify(mine)} — 본인 회비를 못 보면 회원 화면이 성립하지 않는다`,
  )
  check(
    '5) 본인 행의 필드는 정확히 id·amount·paid_on 셋뿐이다',
    JSON.stringify(Object.keys(mine ?? {}).sort()) === JSON.stringify(['amount', 'id', 'paid_on']),
    `키=${Object.keys(mine ?? {}).join(',')} — 필드를 하나 늘리는 것이 곧 노출 표면을 넓히는 것이다.` +
      ' member_name·note·member_id 가 섞이면 여기서 걸린다',
  )
  const payload = JSON.stringify(memberSummary.body)
  check(
    '5) 🔴 응답 어디에도 남의 이름이 없다',
    !payload.includes(NAME_OWNER) && !payload.includes(NAME_ADMIN2) && !payload.includes(NAME_GHOST),
    `payload=${payload} — 이름이 새면 "누가 안 냈다" 가 곧바로 따라 샌다`,
  )
  check(
    '5) 🔴 응답 어디에도 총무의 메모가 없다',
    !payload.includes(SECRET_NOTE) && !payload.includes('note'),
    `note 키/값 없음 여부 — 메모는 운영진 전용이다. 본인 행에 붙은 메모여도 본인에게 보이면 안 된다`,
  )
  check(
    '5) 인원 수(납부 n명 / 미납 n명)도 안 나간다',
    !/"(count|paid_count|unpaid_count|members?)"/.test(payload),
    `payload 키=${Object.keys(sum).join(',')} — 작은 동아리에서 사람 수가 나가면 한 명씩 좁혀지는 추론이 열린다`,
  )
  const outsiderSummary = await rpc(outsider.token, 'club_dues_summary', {
    p_club_id: club.id,
    p_period: PERIOD_MID,
  })
  check(
    '6) 남의 동아리 사람은 창구 자체가 거절된다',
    outsiderSummary.status >= 400,
    `status=${outsiderSummary.status} ${msg(outsiderSummary)} — RPC 는 예외를 던지므로 여기서는 상태 코드가 근거가 된다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 5. 🔴 회원은 장부에 쓸 수 없다 (직접 쓰기) ──')
  // ══════════════════════════════════════════════════════════════════
  // insert/update/delete 정책이 아예 없다. 다시 말하지만 PostgREST 는
  // 0행을 바꿔도 204 를 준다 — 그래서 전부 pg 로 되읽어 확인한다.
  const memberPatch = await api(member.token, `club_dues?id=eq.${memberDues.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ paid_on: PAID_DAY }),
  })
  check(
    '7) 회원이 자기 행을 납부로 바꿀 수 없다',
    (await duesById(memberDues.id))?.paid_on === null,
    `paid_on=${String((await duesById(memberDues.id))?.paid_on)} (응답 ${memberPatch.status}) —` +
      ' 스스로 납부 체크가 되면 장부가 통장과 어긋나고 총무가 앱을 안 믿는다',
  )
  const memberDelete = await api(member.token, `club_dues?id=eq.${memberDues.id}`, {
    method: 'DELETE',
  })
  check(
    '7) 회원이 자기 행을 지울 수 없다',
    (await duesById(memberDues.id)) !== undefined,
    `행 존재 여부 (응답 ${memberDelete.status}) — 지워지면 "걷을 돈" 에서 조용히 빠져나간다`,
  )
  const memberInsert = await api(member.token, 'club_dues', {
    method: 'POST',
    body: JSON.stringify({
      club_id: club.id,
      member_id: null,
      member_name: INTRUDER_NAME,
      period_month: PERIOD_FIRST,
      amount: 1,
    }),
  })
  const { rows: intruder } = await db.query<{ n: string }>(
    `select count(*)::int as n from club_dues where club_id=$1 and member_name=$2`,
    [club.id, INTRUDER_NAME],
  )
  check(
    '7) 회원이 장부에 행을 끼워 넣을 수 없다',
    Number(intruder[0]!.n) === 0,
    `끼워진 행 ${intruder[0]!.n}개 (응답 ${memberInsert.status}) — 끼워 넣으면 합계를 마음대로 흔들 수 있다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 6. 🔴 회원은 운영진 RPC 를 부를 수 없다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 테이블을 잠가도 SECURITY DEFINER 함수가 열려 있으면 우회로가 된다.
  // 이 함수들은 전부 RLS 를 우회하므로, 안쪽의 is_club_admin 검사가
  // 유일한 벽이다.
  const beforeAdminRpc = await duesById(memberDues.id)
  const rpcOpen = await rpc(member.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_FIRST,
    p_amount: 99000,
  })
  check(
    '8) 회원은 달을 열 수 없다 (open_dues_month)',
    rpcOpen.status >= 400,
    `status=${rpcOpen.status} ${msg(rpcOpen)}`,
  )
  const rpcPaid = await rpc(member.token, 'set_dues_paid', {
    p_dues_id: memberDues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })
  check(
    '8) 회원은 납부를 체크할 수 없다 (set_dues_paid)',
    rpcPaid.status >= 400 && (await duesById(memberDues.id))?.paid_on === null,
    `status=${rpcPaid.status} paid_on=${String((await duesById(memberDues.id))?.paid_on)} ${msg(rpcPaid)}`,
  )
  const rpcAmount = await rpc(member.token, 'set_dues_amount', {
    p_dues_id: memberDues.id,
    p_amount: 1,
  })
  check(
    '8) 회원은 금액을 고칠 수 없다 (set_dues_amount)',
    rpcAmount.status >= 400 &&
      (await duesById(memberDues.id))?.amount === beforeAdminRpc?.amount,
    `status=${rpcAmount.status} 금액=${String((await duesById(memberDues.id))?.amount)} ${msg(rpcAmount)}`,
  )
  const rpcNote = await rpc(member.token, 'set_dues_note', {
    p_dues_id: memberDues.id,
    p_note: '내가 고친 메모',
  })
  check(
    '8) 회원은 메모를 고칠 수 없다 (set_dues_note)',
    rpcNote.status >= 400 && (await duesById(memberDues.id))?.note === SECRET_NOTE,
    `status=${rpcNote.status} note=${String((await duesById(memberDues.id))?.note)} ${msg(rpcNote)}` +
      ' — 못 읽는 값을 덮어쓸 수 있으면 증거를 지울 수 있다',
  )
  const rpcRemove = await rpc(member.token, 'remove_dues_entry', { p_dues_id: memberDues.id })
  check(
    '8) 회원은 항목을 뺄 수 없다 (remove_dues_entry)',
    rpcRemove.status >= 400 && (await duesById(memberDues.id)) !== undefined,
    `status=${rpcRemove.status} ${msg(rpcRemove)}`,
  )
  check(
    '8) 다섯 번 두드린 뒤에도 장부가 그대로다',
    (await duesCount(club.id)) === 4,
    `${await duesCount(club.id)}행 — 개별 응답이 아니라 원장 전체가 안 움직였는지가 진짜 근거다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 7. 운영진에게는 다 보인다 (과잉 차단이 아니다) ──')
  // ══════════════════════════════════════════════════════════════════
  const adminRead = await api(owner.token, `club_dues?club_id=eq.${club.id}&select=*`)
  check(
    '9) 운영진은 명단 전원의 행을 본다',
    adminRead.status === 200 && rows(adminRead).length === 4,
    `status=${adminRead.status} ${rows(adminRead).length}행 — 0행이면 총무가 아무것도 못 하는 상태다.` +
      ' 막힘만 검사하면 이 회귀를 못 잡는다',
  )
  const adminNames = rows(adminRead).map((r) => String(r['member_name']))
  check(
    '9) 운영진에게는 note 도 보인다',
    rows(adminRead).some((r) => r['note'] === SECRET_NOTE),
    `메모가 운영진에게도 안 보이면 통장에서 입금자를 찾을 실마리가 사라진다`,
  )
  check(
    '10) 계정 없는 회원에게도 회비 행이 있다',
    adminNames.includes(NAME_GHOST) && ghostDues !== undefined,
    `${adminNames.join(' / ')} — 회비를 user_id 가 아니라 club_members 기준으로 만든 이유가 이것이다.` +
      ' user_id 기준이면 계정 없는 회원 3명이 장부에서 통째로 사라지고 합계가 조용히 틀린다',
  )
  const memberSeesNothing = await api(member.token, `club_dues?club_id=eq.${club.id}&select=id`)
  check(
    '9/10) 같은 순간 회원에게는 여전히 0행이다',
    rows(memberSeesNothing).length === 0,
    `${rows(memberSeesNothing).length}행 — 운영진에게 열린 것이 회원에게도 열린 게 아닌지 같은 시점에 확인한다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 8. 달 열기는 재실행 안전하고, 손으로 고친 금액을 안 덮는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 신입 할인·반년 선납은 앱이 모른다. 총무가 손으로 고친다. 달을 다시
  // 열 때(= 중간 합류자 채우기) 그 값이 날아가면 총무는 매번 다시 고쳐야 한다.
  const amended = await rpc(owner.token, 'set_dues_amount', {
    p_dues_id: ghostDues.id,
    p_amount: GHOST_AMOUNT,
  })
  check(
    '총무가 한 사람의 금액을 손으로 고친다 (신입 할인)',
    amended.status === 200 && (await duesById(ghostDues.id))?.amount === GHOST_AMOUNT,
    `status=${amended.status} 금액=${String((await duesById(ghostDues.id))?.amount)} ${msg(amended)}`,
  )
  const reopened = await rpc(owner.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_FIRST,
    p_amount: DEFAULT_AMOUNT,
  })
  check(
    '11) 같은 달을 다시 열면 0행이 만들어진다 (재실행 안전)',
    reopened.status === 200 && Number(reopened.body) === 0,
    `status=${reopened.status} 생성=${String(reopened.body)} — 늘어나면 같은 사람에게 회비가 두 번 청구된다`,
  )
  check(
    '11) 다시 열어도 손으로 고친 금액이 살아남는다',
    (await duesById(ghostDues.id))?.amount === GHOST_AMOUNT,
    `금액=${String((await duesById(ghostDues.id))?.amount)} (기본값 ${DEFAULT_AMOUNT}) —` +
      ' 덮어쓰면 총무가 달을 다시 열 때마다 할인이 날아가고, 그걸 알아채는 사람은 회원뿐이다',
  )
  check(
    '11) 행 수도 그대로다',
    (await duesCount(club.id)) === 4,
    `${await duesCount(club.id)}행`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 9. 납부 체크는 되돌릴 수 있다 (양방향) ──')
  // ══════════════════════════════════════════════════════════════════
  // 돈 기록은 반드시 틀린다 — 잘못 누르고, 이체가 늦게 들어온다.
  // 되돌릴 수 없으면 총무는 앱을 안 믿고 엑셀로 돌아간다.
  const markPaid = await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: memberDues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })
  check(
    '12) 납부로 체크하면 paid_on 에 입금일이 들어간다',
    markPaid.status === 200 && (await duesById(memberDues.id))?.paid_on === PAID_DAY,
    `status=${markPaid.status} paid_on=${String((await duesById(memberDues.id))?.paid_on)} —` +
      ' 체크한 날이 아니라 통장에 들어온 날이다',
  )
  const markUnpaid = await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: memberDues.id,
    p_paid: false,
  })
  check(
    '12) 되돌리면 paid_on 이 다시 null 이 된다',
    markUnpaid.status === 200 && (await duesById(memberDues.id))?.paid_on === null,
    `status=${markUnpaid.status} paid_on=${String((await duesById(memberDues.id))?.paid_on)} —` +
      ' 편도면 잘못 누른 체크를 고칠 방법이 없다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 10. 합계가 실제 원장과 일치한다 ──')
  // ══════════════════════════════════════════════════════════════════
  // summary 가 스스로를 채점하지 못하게, 기대값은 pg 에서 따로 센다.
  const truth = await truthTotals(club.id)
  const sum2 = obj(
    await rpc(owner.token, 'club_dues_summary', { p_club_id: club.id, p_period: PERIOD_MID }),
  )
  check(
    '13) 걷을 돈이 원장 합계와 같다',
    Number(sum2['expected_total']) === truth.expected,
    `창구 ${String(sum2['expected_total'])} / 원장 ${truth.expected}`,
  )
  check(
    '13) 걷힌 돈이 납부된 행의 합과 같다',
    Number(sum2['collected_total']) === truth.collected,
    `창구 ${String(sum2['collected_total'])} / 원장 ${truth.collected} —` +
      ` 지금 납부는 ${NAME_OWNER}·${NAME_ADMIN2} 둘뿐이다`,
  )
  check(
    '13) 회원이 보는 합계도 같은 값이다',
    Number(
      obj(await rpc(member.token, 'club_dues_summary', { p_club_id: club.id, p_period: PERIOD_MID }))[
        'collected_total'
      ],
    ) === truth.collected,
    `회원용 창구와 운영진용 합계가 어긋나면 둘 중 하나는 거짓말이다`,
  )
  check(
    '13) 장부의 달이 1일로 응답된다',
    String(sum2['period_month']) === PERIOD_FIRST,
    String(sum2['period_month']),
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 11. 메모는 빈 문자열로 지운다 ──')
  // ══════════════════════════════════════════════════════════════════
  const clearNote = await rpc(owner.token, 'set_dues_note', {
    p_dues_id: memberDues.id,
    p_note: '',
  })
  check(
    "14) 빈 문자열을 보내면 메모가 NULL 로 떨어진다",
    clearNote.status === 200 && (await duesById(memberDues.id))?.note === null,
    `note=${JSON.stringify((await duesById(memberDues.id))?.note)} —` +
      " 빈 문자열이 그대로 남으면 '메모 있음' 과 '메모 없음' 을 화면이 구분하지 못한다",
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 12. 두 번째 운영진도 체크할 수 있다 (주인 전용이 아니다) ──')
  // ══════════════════════════════════════════════════════════════════
  // 가드는 is_club_admin 이지 "주인인가" 가 아니다. 주인만 되면 총무가
  // 따로 있는 동아리에서 이 기능을 아무도 못 쓴다.
  const byAdmin2 = await rpc(admin2.token, 'set_dues_paid', {
    p_dues_id: ghostDues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })
  check(
    '17) 승격된 운영진도 납부를 체크할 수 있다',
    byAdmin2.status === 200 && (await duesById(ghostDues.id))?.paid_on === PAID_DAY,
    `status=${byAdmin2.status} paid_on=${String((await duesById(ghostDues.id))?.paid_on)} ${msg(byAdmin2)} —` +
      ' 주인 전용으로 좁아지면 총무가 따로 있는 동아리에서 아무도 장부를 못 쓴다',
  )
  const admin2Read = await api(admin2.token, `club_dues?club_id=eq.${club.id}&select=id`)
  check(
    '17) 승격된 운영진에게 장부가 보인다',
    rows(admin2Read).length === 4,
    `${rows(admin2Read).length}행`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 13. 🟠 항목 빼기 — 낸 사람은 못 뺀다, 뺀 사람은 되돌아온다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 「빼기」와 「납부 되돌리기」는 다른 일이다.
  //   · 빼기       = 이 달에 받을 것이 없다 (휴회·중간 탈퇴). 돈은 안 오갔다.
  //   · 납부 되돌리기 = 통장에 들어온 사실을 지운다.
  // 옛 remove_dues_entry 는 paid_on 을 안 보고 행을 지웠다. 그래서 낸 사람을
  // 빼면 **걷힌 돈까지** 조용히 줄었고, 확인창은 걷을 돈만 말했다.
  const paidBeforeBlock = await truthTotals(club.id)
  const blocked = await rpc(owner.token, 'remove_dues_entry', { p_dues_id: ghostDues.id })
  check(
    '15) 🟠 낸 사람을 빼려고 하면 거절한다',
    blocked.status >= 400,
    `status=${blocked.status} ${msg(blocked)} —` +
      ' 통과하면 걷힌 돈이 그 사람 금액만큼 조용히 줄고, 아무도 그걸 못 본다',
  )
  check(
    '15) 🟠 거절당한 뒤 걷힌 돈이 그대로다',
    (await truthTotals(club.id)).collected === paidBeforeBlock.collected &&
      (await duesById(ghostDues.id))?.removed_at === null,
    `걷힌돈 ${paidBeforeBlock.collected} → ${(await truthTotals(club.id)).collected} /` +
      ` removed_at=${String((await duesById(ghostDues.id))?.removed_at)}`,
  )
  check(
    '15) 🟠 거절 문구가 무엇을 먼저 하라고 말한다',
    /납부/.test(msg(blocked)),
    `"${msg(blocked)}" — "권한이 없습니다" 류로 뭉뚱그리면 총무는 다음 동작을 모른다`,
  )

  // 납부를 먼저 되돌리면 뺄 수 있다 — 두 번의 동작이지만 각각 무엇을
  // 지우는지 총무가 안다.
  await rpc(owner.token, 'set_dues_paid', { p_dues_id: ghostDues.id, p_paid: false })
  const beforeRemove = await truthTotals(club.id)
  const rowsBeforeRemove = await duesCountAll(club.id)
  const removed = await rpc(owner.token, 'remove_dues_entry', { p_dues_id: ghostDues.id })
  check(
    '15) 납부를 되돌린 뒤에는 뺄 수 있다 (과잉 차단이 아니다)',
    removed.status < 400 && (await duesById(ghostDues.id))?.removed_at !== null,
    `status=${removed.status} ${msg(removed)}`,
  )
  const afterRemove = await truthTotals(club.id)
  const sum3 = obj(
    await rpc(owner.token, 'club_dues_summary', { p_club_id: club.id, p_period: PERIOD_MID }),
  )
  check(
    '15) 걷을 돈이 뺀 금액만큼 줄어든다',
    beforeRemove.expected - afterRemove.expected === GHOST_AMOUNT &&
      Number(sum3['expected_total']) === afterRemove.expected,
    `${beforeRemove.expected} → ${afterRemove.expected} (뺀 금액 ${GHOST_AMOUNT}) / 창구 ${String(sum3['expected_total'])}`,
  )
  check(
    '15) 살아 있는 행은 3행이다',
    (await duesCount(club.id)) === 3,
    `${await duesCount(club.id)}행`,
  )
  /*
   * 🟠 여기가 이 절의 핵심이다. 옛 구현은 행을 지웠고, 화면이 안내한 복구
   * («빠진 사람 채우기» = open_dues_month)는 club_members 를 돌며 **새 행을**
   * 만들었다. 총무가 손으로 고친 10,000원은 그 달 최빈값 30,000원으로
   * 덮이고, 입금일도 사라졌다.
   */
  check(
    '15) 🟠 뺀 행이 지워지지 않고 남아 있다',
    (await duesCountAll(club.id)) === rowsBeforeRemove,
    `${rowsBeforeRemove}행 → ${await duesCountAll(club.id)}행 —` +
      ' 지우면 되돌릴 근거가 감사로그밖에 안 남고, 총무는 SQL 을 안 친다',
  )
  const fillBack = await rpc(owner.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_FIRST,
    p_amount: DEFAULT_AMOUNT,
  })
  check(
    '15) 🟠 «빠진 사람 채우기» 가 뺀 사람을 최빈값으로 되살리지 않는다',
    Number(fillBack.body) === 0 && (await duesById(ghostDues.id))?.removed_at !== null,
    `생성=${String(fillBack.body)} removed_at=${String((await duesById(ghostDues.id))?.removed_at)} —` +
      ' 여기서 되살아나면 휴회로 뺀 사람이 달을 열 때마다 돌아온다',
  )
  const restored = await rpc(owner.token, 'restore_dues_entry', { p_dues_id: ghostDues.id })
  const back = await duesById(ghostDues.id)
  check(
    '15) 🟠 다시 넣기가 **원상복구**다 — 손으로 고친 금액이 그대로다',
    restored.status < 400 && back?.removed_at === null && back?.amount === GHOST_AMOUNT,
    `status=${restored.status} 금액=${String(back?.amount)} (기대 ${GHOST_AMOUNT}, 최빈값은 ${DEFAULT_AMOUNT}) ${msg(restored)}`,
  )
  check(
    '15) 다시 넣으면 걷을 돈도 원래대로 돌아온다',
    (await truthTotals(club.id)).expected === beforeRemove.expected,
    `${afterRemove.expected} → ${(await truthTotals(club.id)).expected} (원래 ${beforeRemove.expected})`,
  )
  check(
    '15) 회원은 되돌리지 못한다 (운영진 전용)',
    (await rpc(member.token, 'restore_dues_entry', { p_dues_id: ghostDues.id })).status >= 400,
    '되돌리기가 열려 있으면 빼기를 막은 의미가 없다',
  )
  // 뒤 절(합계 불변 증명)을 위해 다시 뺀 상태로 되돌려 둔다
  await rpc(owner.token, 'remove_dues_entry', { p_dues_id: ghostDues.id })

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 14. 모든 변경이 감사 로그에 남는다 ──')
  // ══════════════════════════════════════════════════════════════════
  // "누가 언제 이 사람을 납부로 바꿨나" 는 컬럼이 아니라 감사로그가 답한다
  // (그래서 paid_by 컬럼을 안 만들었다). 로그가 안 남으면 되돌리기가
  // 가능하다는 사실 자체가 위험이 된다 — 흔적 없이 지울 수 있으니까.
  const { rows: logs } = await db.query<{ action: string; actor_id: string; n: string }>(
    `select action, actor_id, count(*)::int as n from audit_logs
      where club_id=$1 and action like 'club_dues.%'
      group by action, actor_id order by action`,
    [club.id],
  )
  const actionsOf = (a: string) => logs.filter((r) => r.action === a)
  for (const a of ['club_dues.open', 'club_dues.paid', 'club_dues.unpaid', 'club_dues.set_amount']) {
    check(
      `16) ${a} 이 감사 로그에 남는다`,
      actionsOf(a).length > 0,
      logs.map((r) => `${r.action}×${r.n}`).join(' / '),
    )
  }
  check(
    '16) 되돌리기를 한 사람이 그 운영진으로 기록된다',
    actionsOf('club_dues.unpaid').every((r) => r.actor_id === owner.uid),
    `actor=${actionsOf('club_dues.unpaid')
      .map((r) => r.actor_id)
      .join(',')} / 기대 ${owner.uid} — actor 가 null 이면 로그가 있어도 추적이 안 된다`,
  )
  check(
    '16) 승격된 운영진의 체크도 그 사람 이름으로 남는다',
    actionsOf('club_dues.paid').some((r) => r.actor_id === admin2.uid),
    `paid actor=${actionsOf('club_dues.paid')
      .map((r) => r.actor_id)
      .join(',')} — 주인 하나로 뭉뚱그려지면 누가 했는지 알 수 없다`,
  )
  const { rows: unpaidLog } = await db.query<{ before_paid: string | null; after_paid: string | null }>(
    `select before->>'paid_on' as before_paid, after->>'paid_on' as after_paid
       from audit_logs
      where club_id=$1 and action='club_dues.unpaid' and target_id=$2
      order by created_at desc limit 1`,
    [club.id, memberDues.id],
  )
  check(
    '16) 되돌리기 로그의 before/after 가 날짜 → null 을 실제로 보여 준다',
    unpaidLog.length === 1 &&
      unpaidLog[0]!.before_paid === PAID_DAY &&
      unpaidLog[0]!.after_paid === null,
    `before=${String(unpaidLog[0]?.before_paid)} → after=${String(unpaidLog[0]?.after_paid)} —` +
      ' 값이 안 담기면 "무엇이 바뀌었나" 를 로그가 답하지 못한다',
  )
  const { rows: amountLog } = await db.query<{ b: string; a: string }>(
    `select before->>'amount' as b, after->>'amount' as a from audit_logs
      where club_id=$1 and action='club_dues.set_amount' and target_id=$2 limit 1`,
    [club.id, ghostDues.id],
  )
  check(
    '16) 금액 변경 로그도 이전·이후 금액을 담는다',
    amountLog.length === 1 &&
      Number(amountLog[0]!.b) === DEFAULT_AMOUNT &&
      Number(amountLog[0]!.a) === GHOST_AMOUNT,
    `${String(amountLog[0]?.b)} → ${String(amountLog[0]?.a)}`,
  )
  const { rows: noopLog } = await db.query<{ n: string }>(
    `select count(*)::int as n from audit_logs where club_id=$1 and action='club_dues.open'`,
    [club.id],
  )
  check(
    '16) 아무것도 안 만든 재실행은 로그를 안 남긴다',
    Number(noopLog[0]!.n) === 1,
    `open 로그 ${noopLog[0]!.n}건 (달 열기는 2번 호출, 실제 생성은 1번) —` +
      ' "안 바뀐 변경" 이 쌓이면 나중에 진짜 변경을 못 찾는다',
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 15. 사람이 나가도 원장은 그대로 남는다 (설계 판단 5) ──')
  // ══════════════════════════════════════════════════════════════════
  // member_id 를 on delete cascade 로 뒀다면, 회원 한 명을 명단에서 빼는
  // 순간 지난 달의 "얼마 걷혔다" 가 조용히 줄어든다. 오류도 안 뜨고 근거만
  // 어긋나므로 아무도 못 알아챈다. set null + 이름 스냅샷이 그것을 막는다.
  await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: memberDues.id,
    p_paid: true,
    p_paid_on: PAID_DAY,
  })

  // 지난 달 장부를 실제로 만든다. "지난 9월의 39만원이 사람이 나갔다고
  // 36만원으로 바뀌지 않는다" 는 지난 달이 있어야 증명할 수 있다.
  const openedPrev = await rpc(owner.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_PREV,
    p_amount: PREV_AMOUNT,
  })
  check(
    '지난 달 장부를 연다 (전제)',
    openedPrev.status === 200 && Number(openedPrev.body) === 4,
    `status=${openedPrev.status} 생성=${String(openedPrev.body)} ${msg(openedPrev)}`,
  )
  const { rows: prevMine } = await db.query<{ id: string }>(
    `select id from club_dues where club_id=$1 and period_month=$2 and member_name=$3`,
    [club.id, PERIOD_PREV, NAME_MEMBER],
  )
  await rpc(owner.token, 'set_dues_paid', {
    p_dues_id: prevMine[0]!.id,
    p_paid: true,
    p_paid_on: PREV_PAID_DAY,
  })
  const prevBefore = await truthTotalsAt(club.id, PERIOD_PREV)
  check(
    '지난 달에 걷힌 돈이 있다 (전제)',
    prevBefore.collected === PREV_AMOUNT && prevBefore.expected === PREV_AMOUNT * 4,
    `걷을돈 ${prevBefore.expected} / 걷힌돈 ${prevBefore.collected}`,
  )

  const beforeLeave = await truthTotals(club.id)
  const rowsBeforeLeave = await duesCount(club.id)

  const { rows: leaverRow } = await db.query<{ id: string }>(
    `select id from club_members where club_id=$1 and user_id=$2`,
    [club.id, member.uid],
  )
  const kicked = await rpc(owner.token, 'remove_club_member', {
    p_member_id: leaverRow[0]!.id,
  })
  check(
    '회원을 명단에서 뺀다 (전제)',
    kicked.status < 400,
    `status=${kicked.status} ${msg(kicked)}`,
  )

  const survivor = await duesById(memberDues.id)
  check(
    '나간 사람의 회비 행이 안 지워진다',
    survivor !== undefined,
    `행 ${survivor === undefined ? '사라짐' : '남음'} — cascade 였으면 여기서 사라진다`,
  )
  check(
    '나간 사람의 member_id 는 null 로 풀리고 이름은 스냅샷으로 남는다',
    survivor?.member_id === null && survivor?.member_name === NAME_MEMBER,
    `member_id=${String(survivor?.member_id)} member_name=${String(survivor?.member_name)} —` +
      ' 이름이 없으면 원장에 "누구인지 모르는 3만원" 이 남는다',
  )

  const afterLeave = await truthTotals(club.id)
  check(
    '걷은 돈 합계가 안 흔들린다',
    afterLeave.expected === beforeLeave.expected && afterLeave.collected === beforeLeave.collected,
    `걷을돈 ${beforeLeave.expected}→${afterLeave.expected} / 걷힌돈 ${beforeLeave.collected}→${afterLeave.collected} —` +
      ' 지난 달 합계가 사람이 나갈 때마다 바뀌면 그 장부는 근거가 못 된다',
  )
  check(
    '행 수도 그대로다',
    (await duesCount(club.id)) === rowsBeforeLeave,
    `${rowsBeforeLeave}행 → ${await duesCount(club.id)}행`,
  )

  // 나간 사람은 이제 창구도 못 쓴다 — 회원이 아니기 때문이다
  const leftSummary = await rpc(member.token, 'club_dues_summary', {
    p_club_id: club.id,
    p_period: PERIOD_MID,
  })
  check(
    '나간 사람은 창구가 막힌다',
    leftSummary.status >= 400,
    `status=${leftSummary.status} ${msg(leftSummary)} — 나간 뒤에도 합계가 보이면 탈퇴가 탈퇴가 아니다`,
  )

  check(
    '지난 달 합계는 이번 달 소동과 무관하게 그대로다',
    JSON.stringify(await truthTotalsAt(club.id, PERIOD_PREV)) === JSON.stringify(prevBefore),
    `${JSON.stringify(prevBefore)} → ${JSON.stringify(await truthTotalsAt(club.id, PERIOD_PREV))}`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 16. 🟠 탈퇴 후 재가입해도 같은 달에 두 줄이 안 생긴다 ──')
  // ══════════════════════════════════════════════════════════════════
  // member_id 는 on delete set null 이고 unique(member_id, period_month) 는
  // null 끼리 안 부딪힌다. 그 성질은 나간 사람들의 고아 행을 위해 **일부러**
  // 고른 것이지만, 같은 성질이 "나간 사람의 고아 행" 과 "재가입해서 새로
  // 생긴 행" 도 안 부딪히게 만든다. 그러면 12명인데 걷을 돈이 13명분이고,
  // 한쪽을 납부 처리해도 다른 쪽은 영원히 미납으로 남는다.
  //
  // ⚠ 이름으로 맞추면 동명이인에서 깨진다. 열쇠는 member_user_id 스냅샷이다.
  const orphan = await duesById(memberDues.id)
  check(
    '나간 사람의 행에 재가입용 열쇠가 남아 있다 (전제)',
    orphan?.member_id === null && orphan?.member_user_id === member.uid,
    `member_id=${String(orphan?.member_id)} member_user_id=${String(orphan?.member_user_id)} —` +
      ' 열쇠가 없으면 재가입한 사람을 이름 말고는 못 잇는다',
  )

  const rejoined = await rpc(member.token, 'join_club', {
    p_code: club.invite_code,
    p_display_name: NAME_MEMBER,
  })
  check('나갔던 사람이 다시 들어온다 (전제)', obj(rejoined)['ok'] === true, msg(rejoined))
  const { rows: newRow } = await db.query<{ id: string }>(
    `select id from club_members where club_id=$1 and user_id=$2`,
    [club.id, member.uid],
  )
  check(
    '재가입하면 명단 행 id 가 새로 난다 (전제)',
    newRow[0]!.id !== leaverRow[0]!.id,
    `${leaverRow[0]!.id} → ${newRow[0]!.id} — 그래서 on conflict do nothing 이 안 걸린다`,
  )

  const beforeFill = await truthTotals(club.id)
  const liveBeforeFill = await duesCount(club.id)
  const fillAfterRejoin = await rpc(owner.token, 'open_dues_month', {
    p_club_id: club.id,
    p_period: PERIOD_FIRST,
    p_amount: DEFAULT_AMOUNT,
  })
  check(
    '16) 🟠 «빠진 사람 채우기» 가 두 번째 줄을 안 만든다',
    fillAfterRejoin.status === 200 && Number(fillAfterRejoin.body) === 0,
    `생성=${String(fillAfterRejoin.body)} ${msg(fillAfterRejoin)} —` +
      ' 1이 나오면 같은 사람이 같은 달에 두 번 청구된다',
  )
  check(
    '16) 🟠 살아 있는 행 수가 안 늘어난다',
    (await duesCount(club.id)) === liveBeforeFill,
    `${liveBeforeFill}행 → ${await duesCount(club.id)}행`,
  )
  check(
    '16) 🟠 걷을 돈이 한 사람분 더 늘지 않는다',
    (await truthTotals(club.id)).expected === beforeFill.expected,
    `${beforeFill.expected} → ${(await truthTotals(club.id)).expected}`,
  )

  // 두 줄을 막는 것만으로는 부족하다. 고아 행이 그대로면 그 사람은 자기
  // 회비 줄을 영영 못 본다 — club_dues_summary 의 '본인 행' 이 member_id 로
  // club_members 를 조인하기 때문이다.
  const readopted = await duesById(memberDues.id)
  check(
    '16) 🟠 고아 행이 새 명단 행에 다시 붙는다 (재입양)',
    readopted?.member_id === newRow[0]!.id,
    `member_id=${String(readopted?.member_id)} (기대 ${newRow[0]!.id})`,
  )
  check(
    '16) 🟠 재입양이 금액과 입금일을 안 건드린다',
    readopted?.amount === orphan?.amount && readopted?.paid_on === orphan?.paid_on,
    `금액 ${String(orphan?.amount)}→${String(readopted?.amount)} /` +
      ` 입금일 ${String(orphan?.paid_on)}→${String(readopted?.paid_on)} —` +
      ' 여기서 값이 바뀌면 재가입만으로 장부가 바뀐다',
  )
  const mineAgain = obj(
    await rpc(member.token, 'club_dues_summary', { p_club_id: club.id, p_period: PERIOD_MID }),
  )
  const mineRow = (mineAgain['mine'] ?? null) as Record<string, unknown> | null
  check(
    '16) 재가입한 사람이 자기 회비 줄을 다시 본다',
    mineRow !== null && String(mineRow['id']) === memberDues.id,
    `mine=${JSON.stringify(mineAgain['mine'])} — null 이면 본인에게 "회비가 아직 안 정해졌다" 로 보인다`,
  )

  // 표가 지킨다 — 코드를 안 거치고 직접 넣어도 두 줄이 못 된다.
  let dupBlocked = false
  try {
    await db.query(
      `insert into club_dues (club_id, member_id, member_user_id, member_name, period_month, amount)
       values ($1, null, $2, $3, $4, 30000)`,
      [club.id, member.uid, INTRUDER_NAME, PERIOD_FIRST],
    )
  } catch {
    dupBlocked = true
  }
  check(
    '16) 🟠 표(부분 unique 인덱스)가 두 번째 줄을 직접 막는다',
    dupBlocked,
    'RPC 만 고치면 나중에 insert 경로가 하나 더 생길 때 같은 버그가 다시 난다',
  )

  check(
    '16) 🔴 재가입 소동이 지난 달 합계를 안 흔든다',
    JSON.stringify(await truthTotalsAt(club.id, PERIOD_PREV)) === JSON.stringify(prevBefore),
    `${JSON.stringify(prevBefore)} → ${JSON.stringify(await truthTotalsAt(club.id, PERIOD_PREV))} —` +
      ' 지난 달이 흔들리면 설계 판단 5 가 깨진 것이다',
  )
  const { rows: prevOrphan } = await db.query<{ member_id: string | null; member_name: string }>(
    `select member_id, member_name from club_dues
      where club_id=$1 and period_month=$2 and member_user_id=$3`,
    [club.id, PERIOD_PREV, member.uid],
  )
  check(
    '16) 🔴 지난 달의 이름 스냅샷은 안 덮인다',
    prevOrphan.length === 1 && prevOrphan[0]!.member_name === NAME_MEMBER,
    `${JSON.stringify(prevOrphan)} — 지난 달 원장의 이름은 그때의 사실이다`,
  )

  // ══════════════════════════════════════════════════════════════════
  console.log('\n── 17. 🔴 고친 뒤에도 회원에게는 여전히 한 행도 안 보인다 ──')
  // ══════════════════════════════════════════════════════════════════
  // 이 기능의 유일한 진짜 위험이다. 위에서 컬럼 둘과 함수 하나를 더했으므로,
  // 그 위험이 그대로 막혀 있는지 **행 수로** 다시 증명한다 (RLS 가 전부
  // 걸러도 PostgREST 는 200 을 준다 — 상태 코드로 판단하면 안 된다).
  const memberSeesAgain = await api(member.token, `club_dues?club_id=eq.${club.id}&select=*`)
  check(
    '17) 🔴 회원이 장부를 조회하면 0행이다 (200 이지 403 이 아니다)',
    memberSeesAgain.status === 200 && rows(memberSeesAgain).length === 0,
    `status=${memberSeesAgain.status} 행수=${rows(memberSeesAgain).length}`,
  )
  const removedPeek = await api(
    member.token,
    `club_dues?club_id=eq.${club.id}&removed_at=not.is.null&select=id,member_name`,
  )
  check(
    '17) 🔴 새로 생긴 removed_at 으로 걸러도 0행이다',
    removedPeek.status === 200 && rows(removedPeek).length === 0,
    `status=${removedPeek.status} 행수=${rows(removedPeek).length} —` +
      ' 컬럼이 늘면 필터도 늘어난다. 새 컬럼으로 명단을 좁힐 수 있으면 안 된다',
  )
  const userIdPeek = await api(
    member.token,
    `club_dues?member_user_id=eq.${member.uid}&select=id,amount,paid_on`,
  )
  check(
    '17) 🔴 자기 user_id 로 직접 찍어도 0행이다',
    userIdPeek.status === 200 && rows(userIdPeek).length === 0,
    `status=${userIdPeek.status} 행수=${rows(userIdPeek).length} —` +
      ' 본인 행을 여는 순간 "행이 없는 사람 = 미납자" 로 좁히는 길이 열린다',
  )
  const restoreByMember = await rpc(member.token, 'restore_dues_entry', {
    p_dues_id: memberDues.id,
  })
  check(
    '17) 🔴 회원은 새 RPC 도 못 부른다',
    restoreByMember.status >= 400,
    `status=${restoreByMember.status} ${msg(restoreByMember)}`,
  )

} finally {
  // ── 정리 ──────────────────────────────────────────────────────────
  // clubs.owner_id / tournaments.owner_id 는 둘 다 on delete restrict 다.
  // 계정보다 먼저 지우지 않으면 정리가 통째로 실패한다.
  // club_dues 와 audit_logs 는 clubs 에서 cascade 로 따라 지워진다 —
  // 그래도 "따라 지워졌겠지" 로 두지 않고 아래에서 직접 세어 확인한다.
  await db.query(
    `delete from tournaments where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  await db.query(
    `delete from clubs where owner_id in (select id from auth.users where email = any($1))`,
    [emails],
  )
  await db.query(`delete from auth.users where email = any($1)`, [emails])

  if (testClubId) {
    const { rows: left } = await db.query<{ n: string }>(
      `select count(*)::int as n from club_dues where club_id=$1`,
      [testClubId],
    )
    const { rows: clubLeft } = await db.query<{ n: string }>(
      `select count(*)::int as n from clubs where id=$1`,
      [testClubId],
    )
    console.log(
      `\n🧹 시험 동아리 ${testClubId} — 동아리 ${clubLeft[0]!.n}행 / 회비 ${left[0]!.n}행 남음 (둘 다 0 이어야 한다)`,
    )
  }
  console.log(`🧹 테스트 계정 ${emails.length}개 정리 완료`)
  await db.end()
}

console.log(`\n${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
