/**
 * 급수(20260901000001_player_grade.sql)가 실제 DB 에서 도는지 확인한다.
 *
 * 이 마이그레이션의 주장은 넷이다. 넷 다 코드를 읽어서는 확인할 수 없다:
 *
 *   1. 가입할 때 고른 급수가 profiles 에 들어간다 (handle_new_user 트리거)
 *   2. 명단에 들어올 때 그 값이 **스냅샷**된다 (프로필을 나중에 바꿔도
 *      지난 명단은 안 바뀐다)
 *   3. 게스트가 입력한 급수가 그 명단 행에 남는다
 *   4. **급수 없이 들어오는 옛 경로가 그대로 동작한다** — join_as_guest 의
 *      시그니처가 바뀌었기 때문에 이게 가장 중요한 회귀 관문이다
 *
 * 절반은 **로그인하지 않은** anon 클라이언트로 돈다 — 게스트 등록은
 * anon 경로이고, 3인자 호출이 새 4인자 함수를 그대로 찾는지는 PostgREST 를
 * 실제로 통과시켜 봐야만 알 수 있다(인자 이름 집합으로 함수를 찾는다).
 *
 *   npm run db:smoke:grade
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
function obj(r: ApiResult): Record<string, unknown> {
  return (r.body ?? {}) as Record<string, unknown>
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
 * `grade` 를 넘기지 않으면 메타데이터에 키 자체를 안 싣는다 — 그것이
 * 소셜 로그인과 예전 가입 폼이 만드는 모양이고, 이 스모크의 회귀 축이다.
 */
async function makeUser(db: Client, tag: string, name: string, grade?: string) {
  const email = `grade-${tag}-${Date.now()}@smashtest.local`
  const password = 'GradeTest12345!'
  const meta =
    grade === undefined
      ? { name }
      : {
          name,
          grade,
        }
  const { rows: created } = await db.query<{ id: string }>(
    `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,
       email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,
       confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1,crypt($2,gen_salt('bf')),now(),now(),now(),
       '{"provider":"email","providers":["email"]}'::jsonb,$3::jsonb,
       '','','','','') returning id`,
    [email, password, JSON.stringify(meta)],
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

const profileGrade = async (uid: string): Promise<string | null> => {
  const { rows } = await db.query<{ grade: string | null }>(
    `select grade from profiles where id = $1`,
    [uid],
  )
  return rows[0]?.grade ?? null
}
/** 명단 행의 급수. 없는 행이면 undefined 라 '행 자체가 없다' 와 'null 이다' 가 갈린다 */
const memberGrade = async (tid: string, uid: string): Promise<string | null | undefined> => {
  const { rows } = await db.query<{ grade: string | null }>(
    `select grade from tournament_members where tournament_id = $1 and user_id = $2`,
    [tid, uid],
  )
  return rows.length ? rows[0]!.grade : undefined
}
const guestGrade = async (tid: string, name: string): Promise<string | null | undefined> => {
  const { rows } = await db.query<{ grade: string | null }>(
    `select grade from tournament_members
      where tournament_id = $1 and is_guest and display_name = $2`,
    [tid, name],
  )
  return rows.length ? rows[0]!.grade : undefined
}

try {
  // ══════════════════════════════════════════════════════════════════
  // A. 가입 — handle_new_user 가 메타데이터의 급수를 profiles 로 옮기는가
  // ══════════════════════════════════════════════════════════════════
  const owner = await makeUser(db, 'owner', '급수주인', 'S')
  const beginner = await makeUser(db, 'beginner', '초심회원', 'beginner')
  const silent = await makeUser(db, 'silent', '급수없는회원')
  const bogus = await makeUser(db, 'bogus', '이상한값회원', 'Z조')
  emails.push(owner.email, beginner.email, silent.email, bogus.email)

  check('가입 때 고른 급수가 profiles 에 들어간다', (await profileGrade(owner.uid)) === 'S', 'S')

  check(
    "'초심' 이 DB 에는 beginner 로 들어간다 (한글이 DB 값이 아니다)",
    (await profileGrade(beginner.uid)) === 'beginner',
    String(await profileGrade(beginner.uid)),
  )

  // 회귀 축 — 소셜 로그인과 예전 가입 폼이 만드는 모양이다
  check(
    '⭐회귀 — 급수 키가 아예 없는 가입도 그대로 성공하고 profiles.grade 는 null 이다',
    (await profileGrade(silent.uid)) === null,
    'null (모른다. 초심이 아니다)',
  )

  check(
    "모르는 값('Z조')으로 가입해도 가입이 막히지 않고 급수만 null 로 떨어진다",
    (await profileGrade(bogus.uid)) === null,
    'parse_player_grade 가 예외 대신 null 을 돌려준다 — 여기서 던지면 계정 생성 전체가 롤백된다',
  )

  // ══════════════════════════════════════════════════════════════════
  // B. 대회 — create_tournament · join_tournament 스냅샷
  // ══════════════════════════════════════════════════════════════════
  const tour = obj(
    await rpc(owner.token, 'create_tournament', {
      p_name: '급수 스모크 대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '급수주인',
    }),
  ) as unknown as TournamentRow

  check(
    'create_tournament — 주최자 명단 행에 프로필 급수가 스냅샷된다',
    (await memberGrade(tour.id, owner.uid)) === 'S',
    `주최자 grade=${String(await memberGrade(tour.id, owner.uid))}`,
  )

  const joined = await rpc(beginner.token, 'join_tournament', {
    p_code: tour.invite_code,
    p_display_name: '초심회원',
  })
  check(
    'join_tournament — 들어온 사람 명단 행에 프로필 급수가 스냅샷된다',
    obj(joined)['ok'] === true && (await memberGrade(tour.id, beginner.uid)) === 'beginner',
    `${msg(joined)} · grade=${String(await memberGrade(tour.id, beginner.uid))}`,
  )

  const joinedSilent = await rpc(silent.token, 'join_tournament', {
    p_code: tour.invite_code,
    p_display_name: '급수없는회원',
  })
  check(
    '⭐회귀 — 급수 없는 사람도 대회에 그대로 들어오고 명단 행 급수만 null 이다',
    obj(joinedSilent)['ok'] === true && (await memberGrade(tour.id, silent.uid)) === null,
    `${msg(joinedSilent)} · grade=${String(await memberGrade(tour.id, silent.uid))} · 행은 존재한다(${(await memberGrade(tour.id, silent.uid)) !== undefined})`,
  )

  // ══════════════════════════════════════════════════════════════════
  // C. 동아리 — club_members 에는 급수가 없다. profiles 를 직접 봐야 한다
  // ══════════════════════════════════════════════════════════════════
  const club = obj(
    await rpc(owner.token, 'create_club', {
      p_name: '급수 스모크 동아리',
      p_display_name: '급수주인',
    }),
  ) as unknown as ClubRow

  for (const u of [beginner, silent, bogus]) {
    await rpc(u.token, 'join_club', { p_code: club.invite_code, p_display_name: u.name })
  }

  // 한 명을 동아리 운영진으로 올린다 — create_tournament 의 '운영진 심기'
  // 경로(profiles 서브쿼리)를 따로 시험하기 위해서다
  const { rows: cm } = await db.query<{ id: string }>(
    `select id from club_members where club_id = $1 and user_id = $2`,
    [club.id, beginner.uid],
  )
  await rpc(owner.token, 'set_club_member_role', { p_member_id: cm[0]!.id, p_role: 'admin' })

  const clubTour = obj(
    await rpc(owner.token, 'create_tournament', {
      p_name: '급수 스모크 동아리대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '급수주인',
      p_club_id: club.id,
    }),
  ) as unknown as TournamentRow

  check(
    'create_tournament(동아리) — 함께 심어지는 운영진도 profiles 급수가 스냅샷된다',
    (await memberGrade(clubTour.id, beginner.uid)) === 'beginner',
    `club_members 에는 급수 컬럼이 없다 — 정본인 profiles 를 봤다는 증거다 (grade=${String(await memberGrade(clubTour.id, beginner.uid))})`,
  )

  const session = obj(
    await rpc(owner.token, 'create_session', {
      p_name: '급수 스모크 모임',
      p_display_name: '급수주인',
      p_court_count: 2,
      p_club_id: club.id,
    }),
  ) as unknown as TournamentRow

  check(
    'create_session(동아리) — 심어지는 회원 전원이 각자 프로필 급수를 갖는다',
    (await memberGrade(session.id, owner.uid)) === 'S' &&
      (await memberGrade(session.id, beginner.uid)) === 'beginner' &&
      (await memberGrade(session.id, silent.uid)) === null &&
      (await memberGrade(session.id, silent.uid)) !== undefined,
    `주인=S · 초심=beginner · 급수없음=null(행은 있다) · 모르는값=${String(await memberGrade(session.id, bogus.uid))}`,
  )

  // ══════════════════════════════════════════════════════════════════
  // D. 스냅샷이 진짜 스냅샷인가 — 프로필을 바꿔도 지난 명단은 안 바뀐다
  // ══════════════════════════════════════════════════════════════════
  await db.query(`update profiles set grade = 'D' where id = $1`, [owner.uid])
  const afterA = await memberGrade(tour.id, owner.uid)
  const afterB = await memberGrade(session.id, owner.uid)
  check(
    '⭐스냅샷 — 프로필 급수를 S→D 로 바꿔도 이미 들어간 명단 두 곳은 S 그대로다',
    afterA === 'S' && afterB === 'S' && (await profileGrade(owner.uid)) === 'D',
    `대회=${String(afterA)} · 모임=${String(afterB)} · 프로필=${String(await profileGrade(owner.uid))} — 참조였다면 셋이 같이 D 가 됐을 것이다`,
  )

  // 바꾼 뒤에 들어가는 명단은 **새 값**을 가져간다 (스냅샷은 '들어올 때' 다)
  const tourLate = obj(
    await rpc(owner.token, 'create_tournament', {
      p_name: '급수 스모크 이후대회',
      p_description: null,
      p_group_count: 2,
      p_joker_group_count: 0,
      p_display_name: '급수주인',
    }),
  ) as unknown as TournamentRow
  check(
    '바꾼 뒤에 새로 들어간 명단은 새 급수(D)를 가져간다 — 스냅샷 시점이 "들어올 때" 다',
    (await memberGrade(tourLate.id, owner.uid)) === 'D',
    String(await memberGrade(tourLate.id, owner.uid)),
  )

  // ══════════════════════════════════════════════════════════════════
  // E. 명단 직접 추가 — 복사할 프로필이 없으면 null 이 맞다
  // ══════════════════════════════════════════════════════════════════
  const added = obj(
    await rpc(owner.token, 'add_roster_member', {
      p_tournament_id: tour.id,
      p_name: '손으로적은사람',
    }),
  )
  check(
    'add_roster_member — 계정이 없는 사람은 급수가 null 이다 (모르는 채로 둔다)',
    added['grade'] === null && added['user_id'] === null,
    `grade=${String(added['grade'])} — 억지 기본값('초심')을 넣지 않는다`,
  )

  // ══════════════════════════════════════════════════════════════════
  // F. 게스트 — anon 경로. **시그니처가 바뀐 유일한 함수다**
  // ══════════════════════════════════════════════════════════════════
  const g4 = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '급수있는게스트',
    p_grade: 'C',
  })
  check(
    '게스트가 고른 급수가 그 명단 행에 남는다 (4인자 호출)',
    obj(g4)['ok'] === true && (await guestGrade(session.id, '급수있는게스트')) === 'C',
    `${msg(g4)} · grade=${String(await guestGrade(session.id, '급수있는게스트'))}`,
  )

  // ★ 이 절이 이 스크립트의 핵심이다 ★
  // p_grade 를 **아예 안 보내는** 옛 3인자 호출. PostgREST 는 함수를 인자
  // 이름 집합으로 찾으므로, 옛 함수를 drop 하지 않았다면 여기서
  // `function is not unique` 로 떨어진다. 새 인자를 맨 뒤 default null 로
  // 붙이지 않았다면 `function does not exist` 로 떨어진다.
  const g3 = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '옛경로게스트',
  })
  check(
    '⭐⭐회귀 — 급수를 안 보내는 옛 3인자 호출이 그대로 동작한다 (grade=null)',
    obj(g3)['ok'] === true && (await guestGrade(session.id, '옛경로게스트')) === null,
    `${msg(g3)} · grade=${String(await guestGrade(session.id, '옛경로게스트'))} — 여기가 깨지면 옛 클라이언트의 게스트 등록이 통째로 막힌다`,
  )

  const gBogus = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '이상한급수게스트',
    p_grade: 'Z조',
  })
  check(
    '모르는 급수를 보내도 봉투가 깨지지 않는다 — 등록은 되고 급수만 null 이다',
    obj(gBogus)['ok'] === true && (await guestGrade(session.id, '이상한급수게스트')) === null,
    `${msg(gBogus)} · p_grade 를 enum 이 아니라 text 로 받는 이유다 — enum 이면 함수에 들어오기도 전에 22P02 로 터진다`,
  )

  const gEmpty = await anonRpc('join_as_guest', {
    p_code: club.guest_code,
    p_session_id: session.id,
    p_name: '빈급수게스트',
    p_grade: '',
  })
  check(
    '빈 문자열도 null 로 떨어진다 (안 보낸 것과 같은 결과)',
    obj(gEmpty)['ok'] === true && (await guestGrade(session.id, '빈급수게스트')) === null,
    msg(gEmpty),
  )

  // ══════════════════════════════════════════════════════════════════
  // G. 비로그인 노출 표면이 안 넓어졌는가
  // ══════════════════════════════════════════════════════════════════
  const board = await anonRpc('guest_board', {
    p_code: club.guest_code,
    p_session_id: session.id,
  })
  const boardKeys = new Set<string>()
  collectKeys(board.body, boardKeys)
  check(
    '게스트 현황판 응답에 급수가 실리지 않는다 (노출 표면 불변)',
    obj(board)['ok'] === true && !boardKeys.has('grade'),
    `키 ${boardKeys.size}개 · grade 포함=${boardKeys.has('grade')} — 필드 하나가 곧 비로그인 노출 표면이다(20260829000001)`,
  )

  const cand = await anonRpc('guest_sessions', { p_code: club.guest_code })
  const candKeys = new Set<string>()
  collectKeys(cand.body, candKeys)
  check(
    '게스트 등록 후보 응답에도 급수가 없다',
    obj(cand)['ok'] === true && !candKeys.has('grade'),
    `키: ${[...candKeys].join(', ')}`,
  )

  const gJoinKeys = new Set<string>()
  collectKeys(g4.body, gJoinKeys)
  check(
    'join_as_guest 반환 봉투에도 급수가 없다 (ok · display_name · session_name 뿐)',
    !gJoinKeys.has('grade') && gJoinKeys.has('display_name') && gJoinKeys.has('session_name'),
    `키: ${[...gJoinKeys].join(', ')}`,
  )

  // ══════════════════════════════════════════════════════════════════
  // H. 파서는 내부 전용인가
  // ══════════════════════════════════════════════════════════════════
  const direct = await anonRpc('parse_player_grade', { p_raw: 'S' })
  const directAuth = await rpc(owner.token, 'parse_player_grade', { p_raw: 'S' })
  check(
    'parse_player_grade 는 anon 에게도 로그인 사용자에게도 막혀 있다 (내부 전용)',
    direct.status >= 400 && directAuth.status >= 400,
    `anon=${direct.status} · authenticated=${directAuth.status}`,
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
