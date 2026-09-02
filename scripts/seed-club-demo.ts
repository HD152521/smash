/**
 * 사용자의 **실제 동아리**에 둘러볼 거리를 채워 넣는다.
 *
 * 앱은 다 만들었는데 화면 대부분이 비어 있다 — 지난 모임도, 경기 기록도,
 * 순위표도 볼 것이 없다. 만든 사람이 자기 앱을 실제처럼 써 보려면 "지난
 * 몇 주 동안 이렇게 쳤다" 는 데이터가 있어야 한다.
 *
 *   npx tsx scripts/seed-club-demo.ts                    채운다
 *   npx tsx scripts/seed-club-demo.ts --clean            이번에 만든 것만 지운다
 *   npx tsx scripts/seed-club-demo.ts --clean --reset-profiles
 *                                       급수·성별까지 원래(비어 있음)로 되돌린다
 *
 * ── ⚠ 프로덕션 DB 다. 그것도 진짜 사람들의 동아리다 ─────────────────
 *
 * `scripts/demo-session.ts` 는 자기가 만든 동아리 안에서만 놀았다. 여기는
 * 다르다 — **이미 있는 동아리·회원·모임 옆에** 데이터를 붙인다. 그래서
 * 규율을 하나 더 얹는다.
 *
 *   1. **동아리를 id 로만 찾지 않는다.** 같은 DB 에 이름이 '스매시' 인
 *      테스트 잔여물이 셋 더 있다. 이름 + 회원 수 + id 가 전부 맞아야
 *      진행한다 (`resolveClub`). 하나라도 어긋나면 아무것도 안 하고 멈춘다.
 *   2. **만든 것을 적어 두고 그것만 지운다.** `scripts/_seed-club-demo.json`
 *      에 이번 실행이 만든 대회·모임 id 를 남긴다. 사용자가 이미 만들어 둔
 *      모임 둘(live·finished)은 이 파일에 없으므로 `--clean` 이 건드릴 수
 *      없다. **이름으로 지우는 경로를 아예 만들지 않는다** — `seed-N@`
 *      계정처럼 이름만 보고 지우면 진짜가 날아가는 함정이 이 DB 에 있다.
 *   3. **계정을 만들지도 지우지도 않는다.** 회원 열여섯은 이미 있다.
 *
 * ── 왜 RPC 로 만드는가 ──────────────────────────────────────────────
 *
 * `create_session` · `create_session_match` · `start_match` · `record_score`
 * · `finish_match` · `create_tournament` · `create_match` · `void_match` 를
 * 앱과 똑같이 부른다. 직접 INSERT 로 만들면 match_teams · 스냅샷 급수 ·
 * scored 플래그 같은 것이 앱이 만드는 모양과 미묘하게 달라지고, 그러면
 * **테스트용으로 쓸모가 없어진다** (화면에서는 되는데 실제로는 안 되거나,
 * 그 반대가 된다).
 *
 * 로그인은 못 한다(비밀번호를 모른다). 대신 PostgREST 가 하는 것과 똑같이
 * `request.jwt.claims` 를 심고 `role authenticated` 로 내려간다 —
 * `auth.uid()` 도, RLS 도, `is_direct_api_call()` 로 갈리는 트리거 가드도
 * 전부 앱과 같은 값을 본다. 계정의 비밀번호·토큰은 건드리지 않는다.
 *
 * 직접 SQL 은 **딱 하나에만** 쓴다: 시각을 과거로 미는 일. RPC 는 언제나
 * `now()` 를 쓰므로 "지난 몇 주 동안" 을 만들 방법이 그것뿐이다.
 */
import { Client } from 'pg'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

// ── 환경 ────────────────────────────────────────────────────────────
const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}

const MANIFEST = 'scripts/_seed-club-demo.json'

/** 이 동아리가 맞는지 세 가지로 확인한다 — 하나라도 어긋나면 멈춘다 */
const EXPECT = {
  id: '8521c565-20c3-4990-ad9b-5498d74ececd',
  name: '스매시',
  memberCount: 16,
} as const

type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'beginner'
type Gender = 'male' | 'female'

interface Manifest {
  clubId: string
  clubName: string
  createdAt: string
  /** 이번에 만든 모임·대회. `--clean` 이 지우는 것은 여기 적힌 것뿐이다 */
  tournamentIds: string[]
  /**
   * 급수·성별을 채우기 **전** 값. `--reset-profiles` 가 이걸로 되돌린다.
   *
   * ⚠ 한 번 채운 뒤 `--clean` 만 하면 급수는 프로필에 남는다. 그 상태에서
   * 다시 채우면 "채우기 전 값" 이 **이미 채워진 값**이 되어 되돌릴 방법이
   * 사라진다. 그래서 `clean` 은 프로필을 남길 때 기록 파일을 지우지 않고
   * `tournamentIds` 만 비워 두고, `create` 는 그 값을 그대로 물려받는다.
   */
  profilesBefore: { userId: string; name: string; grade: Grade | null; gender: Gender | null }[]
}

function saveManifest(m: Manifest): void {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2), 'utf8')
}

function loadManifest(): Manifest | null {
  if (!existsSync(MANIFEST)) return null
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
}

// ── 회원의 급수·성별 ────────────────────────────────────────────────
/**
 * 열여섯 명 전원이 지금 급수도 성별도 비어 있다. 그래서 자동 편성도,
 * 종목(남복/여복/혼복)도 화면에서 아무것도 안 보인다.
 *
 * **골고루 흩뿌리되 일부러 비워 두는 사람을 남긴다.** 급수는 선택 입력이라
 * 실제 동아리에도 안 적은 사람이 늘 있고, 그 사람이 편성에서 조용히 빠지면
 * 앱을 안 쓰게 된다 — 그 화면이 어떻게 되는지가 봐야 할 부분이다.
 *
 *   급수  S 2 · A 3 · B 4 · C 2 · D 1 · 초심 1 · **비움 3**
 *   성별  남 8 · 여 6 · **미상 2**  (사용자가 말한 실제 상황: 남자가 더 많다)
 *
 * 성별이 치우쳐 있어야 종목 칩이 각각 다르게 나온다 — 여복은 넷을 겨우
 * 채우고, 혼복은 여자 둘이 먼저 정해진다. 성별 미상 둘은 종목을 고르는
 * 순간 후보에서 빠진다.
 */
const TRAITS: Readonly<Record<string, { grade: Grade | null; gender: Gender | null }>> = {
  안용식: { grade: 'A', gender: 'male' },
  김민준: { grade: 'S', gender: 'male' },
  서동현: { grade: 'S', gender: 'male' },
  이서연: { grade: 'A', gender: 'female' },
  박지훈: { grade: 'A', gender: 'male' },
  최수아: { grade: 'B', gender: 'female' },
  오세훈: { grade: 'B', gender: 'male' },
  배준호: { grade: 'B', gender: 'male' },
  권태영: { grade: 'B', gender: 'male' },
  신유진: { grade: 'C', gender: 'female' },
  홍서윤: { grade: 'C', gender: 'female' },
  고은비: { grade: 'D', gender: 'female' },
  노태윤: { grade: 'beginner', gender: null },
  // ── 일부러 비워 두는 사람들 ──────────────────────────────────────
  문가영: { grade: null, gender: null }, // 아무것도 안 적은 사람
  남지민: { grade: null, gender: 'female' }, // 성별만 적은 사람
  장서준: { grade: null, gender: 'male' }, // 계정이 없어 본인이 적을 수 없는 사람
}

/** 강한 순. 조를 짤 때와 팀을 가를 때 쓴다 */
const GRADE_RANK: Readonly<Record<string, number>> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  beginner: 5,
}

function rankOf(name: string): number {
  const g = TRAITS[name]?.grade
  // 급수를 모르는 사람은 가운데에 둔다. 맨 뒤로 밀면 '안 적으면 손해' 가 된다
  return g ? (GRADE_RANK[g] ?? 3) : 3
}

// ── 모임 일정 ───────────────────────────────────────────────────────
/**
 * 지난 모임을 **몇 주에 걸쳐 흩뿌린다.** 한 날에 몰아 넣으면 홈의
 * '이번 달 몇 번 나왔다' 도, 목록의 시간 흐름도 안 생긴다.
 *
 * `absent` 는 그날 안 온 사람이다. 매번 전원 출석이면 사람별 판수가 똑같이
 * 나와서 "누가 많이 쳤나" 를 볼 수 없다.
 *
 * `scoredAt` 은 **점수를 센 경기의 순번**이다. 모임은 점수가 선택이라
 * (`finish_match` 의 scored=false 경로) 기록 화면에는 '점수 없음' 과 점수가
 * 섞여 있어야 한다. 전부 점수를 세면 그건 대회지 모임이 아니다.
 */
interface SessionSpec {
  name: string
  /** KST 로 적는다. 아래 `kst()` 가 UTC 로 옮긴다 */
  startsAtKst: string
  courts: number
  matchCount: number
  /** 몇 시간짜리 모임이었나 — 경기 시각을 이 안에 펼친다 */
  hours: number
  absent: readonly string[]
  /** 계정이 있으면서 '불참' 을 눌러 준 사람 */
  declined: readonly string[]
  scoredAt: readonly number[]
  /** 무효 처리할 경기 순번 */
  voidAt: readonly number[]
}

const PAST_SESSIONS: readonly SessionSpec[] = [
  {
    name: '8월 20일 목요일 정기모임',
    startsAtKst: '2026-08-20T20:00',
    courts: 4,
    matchCount: 8,
    hours: 2.5,
    absent: ['문가영', '남지민', '노태윤'],
    declined: ['문가영', '남지민'],
    scoredAt: [0, 2, 3, 5, 7],
    // 점수를 센 판을 무효로 만든다 — 기록 화면에서 점수에 줄이 그어진 모양이 보인다.
    // 9월 1일 모임에서는 점수 없는 판을 무효로 만든다 (두 모양이 다르다)
    voidAt: [5],
  },
  {
    name: '8월 27일 목요일 정기모임',
    startsAtKst: '2026-08-27T20:00',
    courts: 4,
    matchCount: 9,
    hours: 2.5,
    absent: ['고은비', '장서준'],
    declined: ['고은비'],
    scoredAt: [0, 1, 3, 4, 6, 8],
    voidAt: [],
  },
  {
    name: '9월 1일 화요일 정기모임',
    startsAtKst: '2026-09-01T20:00',
    courts: 4,
    matchCount: 10,
    hours: 3,
    absent: ['홍서윤', '권태영', '노태윤', '문가영'],
    declined: ['홍서윤', '권태영'],
    scoredAt: [0, 1, 2, 4, 5, 7, 8],
    voidAt: [9],
  },
  {
    name: '9월 2일 아침 모임',
    startsAtKst: '2026-09-02T06:00',
    courts: 3,
    matchCount: 6,
    hours: 2,
    absent: ['이서연', '최수아', '신유진', '고은비', '남지민', '문가영'],
    declined: ['이서연', '신유진'],
    // 아침 모임은 가볍게 친다 — 점수를 거의 안 센다
    scoredAt: [1, 3],
    voidAt: [],
  },
]

/**
 * 아직 시작 안 한 모임 둘. **참가/미정/불참이 섞여야** 참가 신청 화면이
 * 무엇을 하는 곳인지 보인다 — 전원 미정이면 빈 목록과 구별이 안 된다.
 *
 * 가까운 모임일수록 답을 많이 한 상태로 둔다. 일주일 뒤 모임에 벌써 전원이
 * 답했다면 그건 실제 동아리가 아니다.
 */
interface UpcomingSpec {
  name: string
  startsAtKst: string
  courts: number
  going: readonly string[]
  declined: readonly string[]
}

const UPCOMING_SESSIONS: readonly UpcomingSpec[] = [
  {
    name: '9월 3일 목요일 정기모임',
    startsAtKst: '2026-09-03T20:00',
    courts: 4,
    going: [
      '안용식',
      '김민준',
      '박지훈',
      '오세훈',
      '배준호',
      '서동현',
      '권태영',
      '홍서윤',
      '이서연',
    ],
    declined: ['최수아', '신유진'],
  },
  {
    name: '9월 8일 화요일 정기모임',
    startsAtKst: '2026-09-08T20:00',
    courts: 4,
    going: ['안용식', '서동현', '이서연', '오세훈'],
    declined: ['김민준'],
  },
]

const TOURNAMENT = {
  name: '2026 가을 스매시 자체대회',
  description: '조별 리그 · 4개 조 · 21점 복식',
  startsAtKst: '2026-08-30T10:00',
  groupCount: 4,
  courts: 3,
  hours: 5,
} as const

/** KST 로 적은 시각을 timestamptz 로. 서버는 UTC 라 오프셋을 명시해야 한다 */
function kst(local: string): string {
  return new Date(`${local}:00+09:00`).toISOString()
}

function shift(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

// ── DB · 신분 ───────────────────────────────────────────────────────
const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})

/**
 * 이 사람으로 앱을 쓰는 것과 같은 상태를 만든다.
 *
 * PostgREST 가 요청마다 하는 것이 정확히 이것이다 — JWT 클레임을 GUC 에
 * 심고 `authenticated` 롤로 내려간다. 그래야 `auth.uid()` 가 이 사람이 되고,
 * RLS 정책도, `is_direct_api_call()` 로 갈리는 트리거 가드도 앱과 같은
 * 길을 탄다. 비밀번호도 토큰도 만들지 않는다.
 */
async function asUser(userId: string): Promise<void> {
  await db.query('reset role')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  await db.query('set role authenticated')
}

/** 시각을 과거로 미는 직접 SQL 전용. 여기서는 RLS 도 가드도 안 본다 */
async function asDbOwner(): Promise<void> {
  await db.query('reset role')
  await db.query(`select set_config('request.jwt.claims', '', false)`)
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params)
  if (!r.rows[0]) throw new Error(`행이 없다: ${sql.slice(0, 60)}`)
  return r.rows[0]
}

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

// ── 흐름 ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await db.connect()
  try {
    if (process.argv.includes('--clean')) await clean()
    else await create()
  } finally {
    try {
      await db.end()
    } catch {
      // 연결 종료 실패가 위에서 찍은 결과 보고를 덮지 않게 한다
    }
  }
}

interface Member {
  id: string
  userId: string | null
  name: string
}

interface Club {
  id: string
  ownerId: string
  members: Member[]
}

/**
 * **id 를 그대로 믿지 않는다.**
 *
 * 같은 DB 에 이름이 '스매시' 인 동아리가 넷 있다 — 셋은 회원 1명짜리 테스트
 * 잔여물이다. id 하나만 보고 진행하면, 그 id 가 언젠가 바뀌었을 때 남의
 * 동아리에 데이터를 쏟아붓는다. 이름·회원 수·id 가 전부 맞을 때만 진행한다.
 *
 * 명단에 모르는 이름이 있어도 멈춘다. `TRAITS` 에 없는 사람이 있다는 것은
 * 내가 보고 있는 명단이 지금 명단과 다르다는 뜻이다.
 */
async function resolveClub(): Promise<Club> {
  const candidates = await all<{ id: string; name: string; owner_id: string; members: string }>(
    `select c.id, c.name, c.owner_id,
            (select count(*) from club_members m where m.club_id = c.id)::text as members
       from clubs c where c.name = $1 order by c.created_at`,
    [EXPECT.name],
  )
  console.log(`'${EXPECT.name}' 이름의 동아리 ${candidates.length}개:`)
  for (const c of candidates) console.log(`   ${c.id}  회원 ${c.members}명`)

  const hit = candidates.filter((c) => Number(c.members) === EXPECT.memberCount)
  if (hit.length !== 1 || hit[0]!.id !== EXPECT.id) {
    throw new Error(
      `회원 ${EXPECT.memberCount}명짜리 '${EXPECT.name}' 을 하나로 좁히지 못했다 ` +
        `(${hit.length}개, 기대 id ${EXPECT.id}). 아무것도 만들지 않았다.`,
    )
  }
  const club = hit[0]!

  const rows = await all<{ id: string; user_id: string | null; display_name: string }>(
    `select id, user_id, display_name from club_members where club_id = $1 order by joined_at, id`,
    [club.id],
  )
  const unknown = rows.filter((m) => !TRAITS[m.display_name])
  if (unknown.length > 0) {
    throw new Error(`명단에 모르는 이름이 있다: ${unknown.map((m) => m.display_name).join(', ')}`)
  }

  const accounts = rows.filter((m) => m.user_id).length
  console.log(
    `✅ 확인: ${club.name} (${club.id}) · 회원 ${rows.length}명 (계정 ${accounts} · 명단만 ${rows.length - accounts})`,
  )
  return {
    id: club.id,
    ownerId: club.owner_id,
    members: rows.map((m) => ({ id: m.id, userId: m.user_id, name: m.display_name })),
  }
}

async function create(): Promise<void> {
  const existing = loadManifest()
  if (existing && existing.tournamentIds.length > 0) {
    console.log(`⚠️ 이미 채워 둔 것이 있습니다 (모임·대회 ${existing.tournamentIds.length}개).`)
    console.log('   먼저 지우세요:  npx tsx scripts/seed-club-demo.ts --clean')
    process.exitCode = 1
    return
  }

  const club = await resolveClub()
  const manifest: Manifest = {
    clubId: club.id,
    clubName: EXPECT.name,
    createdAt: new Date().toISOString(),
    tournamentIds: [],
    profilesBefore: [],
  }

  // ① 급수·성별부터. 이걸 먼저 해야 뒤에 만드는 모임이 스냅샷으로 받아 간다.
  //    지난번 정리가 프로필을 남겨 뒀다면 **그때 적어 둔 원래 값**을 이어받는다
  const patched = await patchProfiles(club.members)
  manifest.profilesBefore = existing?.profilesBefore.length ? existing.profilesBefore : patched
  saveManifest(manifest)

  // ② 지난 정기모임
  console.log('지난 정기모임 만드는 중…')
  for (const spec of PAST_SESSIONS) {
    manifest.tournamentIds.push(await seedPastSession(club, spec))
    saveManifest(manifest)
  }

  // ③ 다가오는 정기모임
  console.log('다가오는 모임 만드는 중…')
  for (const spec of UPCOMING_SESSIONS) {
    manifest.tournamentIds.push(await seedUpcomingSession(club, spec))
    saveManifest(manifest)
  }

  // ④ 대회
  console.log('대회 만드는 중…')
  manifest.tournamentIds.push(await seedTournament(club))
  saveManifest(manifest)

  await report(club, manifest)
}

/**
 * 계정이 있는 회원의 급수·성별을 **프로필에** 채운다.
 *
 * 명단(`tournament_members`)이 아니라 프로필인 이유: 앞으로 만드는 모임마다
 * `create_session` 이 프로필 값을 스냅샷으로 복사해 간다. 명단에만 넣으면
 * 그 모임 하나에서만 보이고 다음 모임은 다시 빈칸이 된다.
 *
 * 앱의 마이페이지와 같은 길로 쓴다 — 본인 신분으로 내려가서 `profiles` 를
 * 직접 UPDATE 한다 (`profiles_update_own` 정책이 `id = auth.uid()` 를 본다).
 *
 * ⚠ 계정이 없는 회원은 프로필 자체가 없다. 그 셋은 모임마다 명단 스냅샷에
 *   `set_member_grade` / `set_member_gender` 로 직접 넣는다.
 */
async function patchProfiles(members: readonly Member[]): Promise<Manifest['profilesBefore']> {
  const before: Manifest['profilesBefore'] = []
  let touched = 0

  /*
   * 되돌릴 값은 **한 번에, 신분을 내려가기 전에** 읽는다.
   * `profiles_select_own` 은 자기 행만 보여주므로, 한 사람으로 내려간 뒤에
   * 다음 사람 프로필을 읽으면 0행이 온다 (한 번 걸린 함정이다).
   */
  await asDbOwner()
  const prev = new Map<string, { grade: Grade | null; gender: Gender | null }>(
    (
      await all<{ id: string; grade: Grade | null; gender: Gender | null }>(
        `select id, grade, gender from profiles where id = any($1::uuid[])`,
        [members.filter((m) => m.userId).map((m) => m.userId)],
      )
    ).map((r) => [r.id, { grade: r.grade, gender: r.gender }]),
  )

  for (const m of members) {
    if (!m.userId) continue
    const trait = TRAITS[m.name]!
    const was = prev.get(m.userId) ?? { grade: null, gender: null }
    before.push({ userId: m.userId, name: m.name, grade: was.grade, gender: was.gender })

    // 비워 두기로 한 사람은 건드리지 않는다 — 그 빈칸이 봐야 할 화면이다
    if (trait.grade === null && trait.gender === null) continue

    await asUser(m.userId)
    await db.query(`update profiles set grade = $1, gender = $2 where id = $3`, [
      trait.grade,
      trait.gender,
      m.userId,
    ])
    touched++
  }
  await asDbOwner()
  console.log(`급수·성별: 프로필 ${touched}명 채움 (계정 없는 회원은 모임 명단에서 채운다)`)
  return before
}

interface SessionMember {
  id: string
  userId: string | null
  name: string
}

/** 계정이 없어 프로필이 없는 회원의 급수·성별을 그 모임 명단에만 찍는다 */
async function fillRosterTraits(
  ownerId: string,
  members: readonly SessionMember[],
): Promise<void> {
  await asUser(ownerId)
  for (const m of members) {
    if (m.userId) continue // 계정이 있으면 프로필에서 이미 따라왔다
    const trait = TRAITS[m.name]!
    if (trait.grade) await db.query(`select set_member_grade($1, $2)`, [m.id, trait.grade])
    if (trait.gender) await db.query(`select set_member_gender($1, $2)`, [m.id, trait.gender])
  }
}

async function sessionMembers(tournamentId: string): Promise<SessionMember[]> {
  const rows = await all<{ id: string; user_id: string | null; display_name: string }>(
    `select id, user_id, display_name from tournament_members
      where tournament_id = $1 order by joined_at, id`,
    [tournamentId],
  )
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.display_name }))
}

async function courtsOf(tournamentId: string): Promise<{ id: string; name: string }[]> {
  return all(`select id, name from courts where tournament_id = $1 order by sort_order`, [
    tournamentId,
  ])
}

// ── 지난 모임 ───────────────────────────────────────────────────────
async function seedPastSession(club: Club, spec: SessionSpec): Promise<string> {
  const startsAt = kst(spec.startsAtKst)
  await asUser(club.ownerId)
  const session = await one<{ id: string }>(
    `select * from create_session($1, $2, $3, $4, $5::timestamptz)`,
    [spec.name, null, spec.courts, club.id, startsAt],
  )

  const members = await sessionMembers(session.id)
  await fillRosterTraits(club.ownerId, members)

  const attending = members.filter((m) => !spec.absent.includes(m.name))
  await setRsvp(
    members,
    attending.map((m) => m.name),
    spec.declined,
    session.id,
  )

  const courts = await courtsOf(session.id)
  const played = await playSession(club.ownerId, session.id, courts, attending, spec)

  // 모임이 끝났다는 표시. RPC 는 status 만 바꾸므로 시각은 아래에서 민다
  await asUser(club.ownerId)
  await db.query(`select set_tournament_status($1, 'finished'::tournament_status)`, [session.id])

  await backdate(session.id, startsAt, spec.hours, played)
  console.log(`  ${spec.name} — 참석 ${attending.length}명 · 경기 ${played.length}판`)
  return session.id
}

/**
 * 참가 신청. **본인 신분으로 누른다** (`set_my_rsvp` 은 남의 것을 못 바꾼다).
 *
 * 계정이 없는 회원은 누를 주체가 없어 'invited'(미정) 로 남는다 — 실제로도
 * 그렇고, 그 사람들이 명단에서 어떻게 보이는지가 확인할 거리다.
 */
async function setRsvp(
  members: readonly SessionMember[],
  going: readonly string[],
  declined: readonly string[],
  tournamentId: string,
): Promise<void> {
  for (const m of members) {
    if (!m.userId) continue
    const next = declined.includes(m.name) ? 'declined' : going.includes(m.name) ? 'going' : null
    if (!next) continue
    await asUser(m.userId)
    await db.query(`select set_my_rsvp($1, $2::rsvp_status)`, [tournamentId, next])
  }
}

interface PlayedMatch {
  id: string
  /** 몇 번째 경기인가 — 시각을 미는 데 쓴다 */
  index: number
}

/**
 * 한 모임의 경기들.
 *
 * **한 번에 하나씩, 끝내고 다음을 만든다.** `start_match` 는 한 사람이 두
 * 코트에서 동시에 뛰는 것을 막는다 — 여러 판을 동시에 열어 두면 그 검사에
 * 걸린다. 실제 모임에서도 코트가 동시에 돌 뿐 한 사람은 한 판만 뛴다.
 *
 * 사람 고르기는 **덜 친 사람 먼저**다(자동 편성 `src/lib/autoQueue.ts` 와
 * 같은 기준). 같은 넷이 계속 뛰면 사람별 판수가 화면에서 볼 게 없어진다.
 */
async function playSession(
  ownerId: string,
  tournamentId: string,
  courts: readonly { id: string }[],
  attending: readonly SessionMember[],
  spec: SessionSpec,
): Promise<PlayedMatch[]> {
  await asUser(ownerId)
  const count = new Map<string, number>(attending.map((m) => [m.id, 0]))
  const played: PlayedMatch[] = []

  for (let i = 0; i < spec.matchCount; i++) {
    const four = pickFour(attending, count, i)
    for (const p of four) count.set(p.id, (count.get(p.id) ?? 0) + 1)

    const court = courts[i % courts.length]!
    const match = await one<{ id: string }>(
      `select * from create_session_match($1, $2, $3::uuid[], $4::uuid[], null)`,
      [tournamentId, court.id, [four[0]!.id, four[3]!.id], [four[1]!.id, four[2]!.id]],
    )
    await db.query(`select start_match($1)`, [match.id])

    if (spec.scoredAt.includes(i)) await scoreOut(match.id, i)
    else await db.query(`select finish_match($1)`, [match.id]) // 점수를 안 센 채로 끝낸다

    if (spec.voidAt.includes(i)) {
      await db.query(`select void_match($1, $2)`, [match.id, '인원 착오로 다시 침'])
    }
    played.push({ id: match.id, index: i })
  }
  return played
}

/**
 * 넷을 고른다 — 덜 친 사람 우선, 같으면 매번 다른 순서로.
 *
 * 고른 넷을 급수 순으로 세우고 `[0,3] vs [1,2]` 로 나눈다. 잘 치는 둘이
 * 한 팀이 되면 21:3 같은 기록만 쌓여 기록 화면이 심심해진다.
 */
function pickFour(
  pool: readonly SessionMember[],
  count: Map<string, number>,
  seed: number,
): SessionMember[] {
  const sorted = [...pool].sort((a, b) => {
    const d = (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0)
    if (d !== 0) return d
    // 판수가 같으면 매 경기 다른 순서로 — 늘 같은 넷이 붙는 것을 막는다
    return ((hash(a.id) + seed) % 97) - ((hash(b.id) + seed) % 97)
  })
  return sorted.slice(0, 4).sort((a, b) => rankOf(a.name) - rankOf(b.name))
}

/** 이름·id 에서 뽑는 고정 난수. 같은 입력이면 늘 같은 결과라 다시 돌려도 같다 */
function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 1_000_003
  return h
}

/**
 * 21점까지 실제로 눌러서 끝낸다.
 *
 * 진 쪽 점수를 먼저 다 넣고 이긴 쪽을 넣는다. `record_score` 는 목표 점수에
 * 닿는 순간 경기를 끝내 버리므로, 이긴 쪽을 먼저 넣으면 남은 입력이
 * '진행 중인 경기가 아닙니다' 로 막힌다.
 *
 * 한 점씩 왕복하면 30번 넘게 오간다. 한쪽씩 묶어 두 번에 넣는다 — 남는 것은
 * `score_events` 한 줄씩이라 앱이 만드는 것과 같다.
 */
async function scoreOut(matchId: string, seed: number): Promise<void> {
  const loser = 9 + ((hash(matchId) + seed * 7) % 11) // 9~19점
  const winnerIsA = (hash(matchId) + seed) % 2 === 0
  const [first, second]: ['A' | 'B', 'A' | 'B'] = winnerIsA ? ['B', 'A'] : ['A', 'B']

  await db.query(
    `select record_score($1, $2::team_side, 1, $3 || '-' || g) from generate_series(1, $4) g`,
    [matchId, first, `${matchId}-${first}`, loser],
  )
  await db.query(
    `select record_score($1, $2::team_side, 1, $3 || '-' || g) from generate_series(1, 21) g`,
    [matchId, second, `${matchId}-${second}`],
  )
}

// ── 다가오는 모임 ───────────────────────────────────────────────────
async function seedUpcomingSession(club: Club, spec: UpcomingSpec): Promise<string> {
  const startsAt = kst(spec.startsAtKst)
  await asUser(club.ownerId)
  const session = await one<{ id: string }>(
    `select * from create_session($1, $2, $3, $4, $5::timestamptz)`,
    [spec.name, null, spec.courts, club.id, startsAt],
  )
  const members = await sessionMembers(session.id)
  await fillRosterTraits(club.ownerId, members)
  await setRsvp(members, spec.going, spec.declined, session.id)

  // 모임을 연 것은 며칠 전이다. starts_at 만 미래고 만든 시각은 과거다.
  // 경기가 없으므로 backdate 는 모임·명단·코트 시각만 민다
  await backdate(session.id, shift(startsAt, -60 * 24 * 3), 0, [])
  const undecided = members.length - spec.going.length - spec.declined.length
  console.log(
    `  ${spec.name} — 참가 ${spec.going.length} · 불참 ${spec.declined.length} · 미정 ${undecided}`,
  )
  return session.id
}

// ── 대회 ────────────────────────────────────────────────────────────
/**
 * 조별 리그 하나. **순위가 실제로 나오게** 한다.
 *
 * 대회는 모임과 달리 점수를 반드시 센다 (`finish_match` 가 승자 없는 종료를
 * 대회에서는 막는다). 그래서 열두 판 전부 21점까지 친다.
 *
 * 조는 **스네이크 드래프트**로 짠다 — 급수 순으로 세워 1·2·3·4조에 한 명씩
 * 돌리고 다음 바퀴는 거꾸로. 한 조에 잘 치는 사람이 몰리면 순위표가 첫
 * 경기에 이미 결정돼 볼 게 없다.
 */
async function seedTournament(club: Club): Promise<string> {
  const startsAt = kst(TOURNAMENT.startsAtKst)
  await asUser(club.ownerId)
  const t = await one<{ id: string; invite_code: string }>(
    `select * from create_tournament($1, $2, $3, $4, $5, $6::jsonb, $7::uuid)`,
    [TOURNAMENT.name, TOURNAMENT.description, TOURNAMENT.groupCount, 0, null, '{}', club.id],
  )

  // 계정이 있는 회원은 초대 코드로 들어온다 — 앱에서 참가하는 그 길이다.
  // `create_tournament` 은 운영진만 자동으로 넣어 주기 때문에 필요하다.
  for (const m of club.members) {
    if (!m.userId || m.userId === club.ownerId) continue
    await asUser(m.userId)
    const r = await one<{ j: { ok: boolean; message?: string } }>(
      `select join_tournament($1, $2) as j`,
      [t.invite_code, null],
    )
    if (!r.j.ok) throw new Error(`${m.name} 참가 실패: ${r.j.message}`)
  }

  // 계정이 없는 회원은 운영진이 명단에 올린다
  await asUser(club.ownerId)
  for (const m of club.members) {
    if (m.userId) continue
    await db.query(`select add_roster_member($1, $2)`, [t.id, m.name])
  }

  // 대회는 코트를 자동으로 안 만든다 (모임과 다른 점). 앱과 같이 직접 넣는다
  await db.query(
    `insert into courts (tournament_id, name, sort_order)
     select $1, i || '번 코트', i from generate_series(1, $2) i`,
    [t.id, TOURNAMENT.courts],
  )

  const members = await sessionMembers(t.id)
  await fillRosterTraits(club.ownerId, members)
  const groups = await all<{ id: string; name: string }>(
    `select id, name from groups where tournament_id = $1 order by sort_order`,
    [t.id],
  )
  const squads = snakeDraft(members, groups.length)

  for (let g = 0; g < squads.length; g++) {
    for (const m of squads[g]!) {
      if (m.userId) {
        // 본인이 조를 고르는 길 (대회가 draft 일 때만 열려 있다)
        await asUser(m.userId)
        await db.query(`select set_my_group($1, $2)`, [t.id, groups[g]!.id])
      } else {
        // 계정이 없으면 운영진이 옮겨 준다 (tm_update_admin 정책)
        await asUser(club.ownerId)
        await db.query(`update tournament_members set group_id = $1 where id = $2`, [
          groups[g]!.id,
          m.id,
        ])
      }
    }
  }

  await asUser(club.ownerId)
  await db.query(`select set_tournament_status($1, 'live'::tournament_status)`, [t.id])

  // 조별 풀리그. 조마다 둘씩 짝을 지어 상대 조의 같은 번호 짝과 붙는다
  const courts = await courtsOf(t.id)
  const played: PlayedMatch[] = []
  for (let a = 0; a < squads.length; a++) {
    for (let b = a + 1; b < squads.length; b++) {
      for (const pair of [0, 1]) {
        const n = played.length
        const match = await one<{ id: string }>(
          `select * from create_match($1, $2, $3, $4, $5::uuid[], $6, $7::uuid[], $8::uuid[])`,
          [
            t.id,
            courts[n % courts.length]!.id,
            `${groups[a]!.name} vs ${groups[b]!.name}`,
            groups[a]!.id,
            squads[a]!.slice(pair * 2, pair * 2 + 2).map((m) => m.id),
            groups[b]!.id,
            squads[b]!.slice(pair * 2, pair * 2 + 2).map((m) => m.id),
            [],
          ],
        )
        await db.query(`select start_match($1)`, [match.id])
        await scoreOut(match.id, n)
        played.push({ id: match.id, index: n })
      }
    }
  }

  await db.query(`select set_tournament_status($1, 'finished'::tournament_status)`, [t.id])
  await backdate(t.id, startsAt, TOURNAMENT.hours, played)
  console.log(`  ${TOURNAMENT.name} — ${groups.length}개 조 · 경기 ${played.length}판`)
  return t.id
}

/** 급수 순으로 세워 1·2·3·4조에 한 명씩, 다음 바퀴는 거꾸로 */
function snakeDraft(members: readonly SessionMember[], groupCount: number): SessionMember[][] {
  const order = [...members].sort(
    (a, b) => rankOf(a.name) - rankOf(b.name) || hash(a.id) - hash(b.id),
  )
  const squads: SessionMember[][] = Array.from({ length: groupCount }, () => [])
  order.forEach((m, i) => {
    const round = Math.floor(i / groupCount)
    const slot = i % groupCount
    squads[round % 2 === 0 ? slot : groupCount - 1 - slot]!.push(m)
  })
  return squads
}

// ── 시각을 과거로 ───────────────────────────────────────────────────
/**
 * **RPC 로 못 하는 유일한 일.** `create_session` 도 `record_score` 도 언제나
 * `now()` 를 찍는다. "지난 몇 주 동안 이렇게 쳤다" 를 만들려면 만든 뒤에
 * 직접 미는 수밖에 없다.
 *
 * 미는 것은 시각뿐이다 — 상태·점수·승자·명단은 전부 RPC 가 만든 그대로다.
 * 가드 트리거는 `is_direct_api_call()` 로 갈리므로 여기(postgres 롤)서는
 * 통과한다. 그래서 이 함수는 **시각 컬럼만** 건드린다.
 */
async function backdate(
  tournamentId: string,
  startsAt: string,
  hours: number,
  played: readonly PlayedMatch[],
): Promise<void> {
  await asDbOwner()
  // 모임을 연 것은 시작 30분 전
  const createdAt = shift(startsAt, -30)
  await db.query(
    `update tournaments set created_at = $2::timestamptz, updated_at = $2::timestamptz where id = $1`,
    [tournamentId, createdAt],
  )
  await db.query(`update courts set created_at = $2::timestamptz where tournament_id = $1`, [
    tournamentId,
    createdAt,
  ])
  await db.query(
    `update tournament_members set joined_at = $2::timestamptz, updated_at = $2::timestamptz
      where tournament_id = $1`,
    [tournamentId, createdAt],
  )
  await db.query(`update audit_logs set created_at = $2::timestamptz where tournament_id = $1`, [
    tournamentId,
    createdAt,
  ])
  if (played.length === 0) return

  // 경기를 모임 시간 안에 고르게 편다
  const slot = (hours * 60) / played.length
  const ids = played.map((p) => p.id)
  const created = played.map((p) => shift(startsAt, Math.round(p.index * slot)))
  const starts = played.map((p) => shift(startsAt, Math.round(p.index * slot) + 5))
  const ends = played.map((p) =>
    shift(startsAt, Math.round(p.index * slot) + 5 + Math.round(Math.min(20, slot))),
  )

  await db.query(
    `update matches m set
       created_at  = v.created,
       updated_at  = v.finished,
       started_at  = v.started,
       finished_at = case when m.finished_at is null then null else v.finished end,
       edited_at   = case when m.edited_at   is null then null else v.finished end
     from unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[], $4::timestamptz[])
          as v(id, created, started, finished)
     where m.id = v.id`,
    [ids, created, starts, ends],
  )

  // 점수 한 줄 한 줄도 그 경기 시간 안으로. 기록 상세의 점수 흐름이 여기서 나온다
  await db.query(
    `with ordered as (
       select se.id,
              m.started_at,
              m.finished_at,
              row_number() over (partition by se.match_id order by se.id) as rn,
              count(*)     over (partition by se.match_id)                as n
         from score_events se
         join matches m on m.id = se.match_id
        where se.match_id = any($1::uuid[]) and m.finished_at is not null
     )
     update score_events se
        set created_at = o.started_at
                       + (o.finished_at - o.started_at) * (o.rn::numeric / (o.n + 1))
       from ordered o
      where o.id = se.id`,
    [ids],
  )
}

// ── 보고 ────────────────────────────────────────────────────────────
async function report(club: Club, m: Manifest): Promise<void> {
  await asDbOwner()
  const app = process.env['APP_URL'] ?? 'http://localhost:5174'
  const stat = await one<{ matches: string; scored: string; unscored: string; voided: string }>(
    `select count(*) filter (where status in ('finished','void'))::text as matches,
            count(*) filter (where status = 'finished' and scored)::text     as scored,
            count(*) filter (where status = 'finished' and not scored)::text as unscored,
            count(*) filter (where status = 'void')::text                    as voided
       from matches where tournament_id = any($1::uuid[])`,
    [m.tournamentIds],
  )
  console.log('\n════════════════════════════════════════════════')
  console.log(`  ${m.clubName} 에 채워 넣었습니다`)
  console.log('════════════════════════════════════════════════')
  console.log(`  주소     ${app}/clubs/${club.id}`)
  console.log(`  모임·대회 ${m.tournamentIds.length}개`)
  console.log(
    `  경기     ${stat.matches}판 (점수 있음 ${stat.scored} · 점수 없음 ${stat.unscored} · 무효 ${stat.voided})`,
  )
  console.log('')
  console.log('  다 보고 나면:  npx tsx scripts/seed-club-demo.ts --clean')
  console.log('════════════════════════════════════════════════\n')
}

// ── 지우기 ──────────────────────────────────────────────────────────
/**
 * **기록 파일에 적힌 것만** 지운다.
 *
 * 이름으로 지우는 경로는 만들지 않는다 — 사용자가 이미 만들어 둔 모임 둘도,
 * 다른 동아리도, `seed-N@smashtest.local` 계정도 전부 이름이 비슷하다.
 * 계정은 아예 지우지 않는다. 이 스크립트는 계정을 만들지 않았다.
 *
 * 정리 순서·재시도·잔여 재조회는 `scripts/demo-session.ts` 를 그대로 따른다.
 */
async function clean(): Promise<void> {
  const m = loadManifest()
  if (!m) {
    console.log(`지울 것이 없습니다 (${MANIFEST} 이 없음).`)
    return
  }
  await asDbOwner()

  // 지우기 전에 무엇을 지우는지 눈으로 본다 — id 가 어긋나면 여기서 드러난다
  const targets = await all<{ id: string; name: string; club_id: string | null }>(
    `select id, name, club_id from tournaments where id = any($1::uuid[])`,
    [m.tournamentIds],
  )
  console.log(`정리 대상 ${targets.length}건:`)
  for (const t of targets) console.log(`   ${t.name}`)

  // 기록 파일이 어떤 이유로든 남의 것을 가리키면 손을 뗀다
  const stray = targets.filter((t) => t.club_id !== m.clubId)
  if (stray.length > 0) {
    console.log(`🚨 이 동아리 것이 아닌 대상이 섞여 있다 — 아무것도 지우지 않는다: ${stray.length}건`)
    process.exitCode = 1
    return
  }

  const del = await sweep('모임·대회', `delete from tournaments where id = any($1::uuid[])`, [
    m.tournamentIds,
  ])
  console.log(`🧹 정리 — 모임·대회 ${del}건`)

  /*
   * 급수·성별은 기본으로 **남긴다.**
   *
   * 이건 이 스크립트가 만들어 낸 가짜 데이터가 아니라 실제 회원의 속성이고,
   * 지우면 사용자가 열여섯 명분을 손으로 다시 입력해야 한다. 되돌리고 싶을
   * 때만 `--reset-profiles` 로 채우기 전 값(전부 비어 있었다)으로 돌린다.
   */
  const resetProfiles = process.argv.includes('--reset-profiles')
  if (resetProfiles) {
    for (const p of m.profilesBefore) {
      await sweep(`프로필 ${p.name}`, `update profiles set grade = $1, gender = $2 where id = $3`, [
        p.grade,
        p.gender,
        p.userId,
      ])
    }
    console.log(`🧹 프로필 급수·성별 ${m.profilesBefore.length}명 원래대로`)
  } else {
    console.log(
      `ℹ️ 프로필 급수·성별은 남겨 둡니다 (지우면 회원 ${m.profilesBefore.length}명분을 다시 입력해야 합니다).`,
    )
    console.log('   되돌리려면:  npx tsx scripts/seed-club-demo.ts --clean --reset-profiles')
  }

  if (!(await verifyGone(m))) {
    process.exitCode = 1
    return
  }
  // 프로필을 남겼으면 **되돌릴 값도 남긴다** — 파일을 지우면 원래 값을 잃는다
  if (resetProfiles) rmSync(MANIFEST, { force: true })
  else saveManifest({ ...m, tournamentIds: [] })
}

/** pooler 의 간헐적 끊김은 재시도로 넘긴다. 실패해도 다음 단계는 돌아야 한다 */
async function sweep(label: string, sql: string, params: unknown[]): Promise<number> {
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

/** "지웠다" 와 "안 남았다" 는 다른 이야기다 — 다시 조회해서 눈으로 본다 */
async function verifyGone(m: Manifest): Promise<boolean> {
  try {
    const rest = await one<{ tours: number; club: number; others: number }>(
      `select (select count(*) from tournaments where id = any($1::uuid[]))::int  as tours,
              (select count(*) from clubs       where id = $2)::int               as club,
              (select count(*) from tournaments where club_id = $2)::int          as others`,
      [m.tournamentIds, m.clubId],
    )
    const gone = rest.tours === 0
    console.log(
      gone
        ? `🧹 잔여 확인: 이번에 만든 모임·대회 0 · 동아리 ${rest.club}개 그대로 · ` +
            `동아리에 남은 모임 ${rest.others}개(사용자가 만든 것) — 남의 것은 안 건드렸다`
        : `🚨 잔여: 모임·대회 ${rest.tours}건 — 손으로 지워야 한다`,
    )
    return gone
  } catch (err) {
    console.log(`🚨 잔여 확인 자체가 실패 — 남았는지 알 수 없다: ${String(err)}`)
    return false
  }
}

await main()
