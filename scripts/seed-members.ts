/**
 * 대회에 테스트 참가자를 채운다.
 *
 * 경기 편성·스코어링을 손으로 확인하려면 조마다 최소 2명이 필요하다.
 * 매번 브라우저로 계정을 만들 수는 없으므로 DB 에 직접 넣는다.
 * (가입 API 는 도메인 검증과 메일 발송 한도에 걸린다)
 *
 *   npm run db:seed -- <주최자-이메일> [대회이름조각]
 *   npm run db:seed -- wkdrndydtlr@naver.com
 *
 * 이미 있는 사람은 건드리지 않고, 각 조를 정원까지만 채운다.
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}

const ownerEmail = process.argv[2] ?? 'demo@smashtest.local'
const nameLike = process.argv[3] ?? ''

/** 실제 대회처럼 보이도록 흔한 한국 이름을 쓴다 */
const POOL = [
  '김민준', '이서연', '박지훈', '최수아', '정도현', '강예은', '조현우', '윤하은',
  '임채원', '한지우', '오세훈', '신유진', '배준호', '문가영', '서동현', '홍서윤',
  '권태영', '남지민', '류승우', '심하늘', '양준서', '엄지원', '표민석', '황유나',
  '고은비', '노태현', '도경수', '마채린', '반석호', '설다인', '소진우', '안세영',
]

const client = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const { rows: tRows } = await client.query<{ id: string; name: string; status: string }>(
  `select t.id, t.name, t.status::text
   from tournaments t join auth.users u on u.id = t.owner_id
   where u.email = $1 and ($2 = '' or t.name ilike '%' || $2 || '%')
   order by t.created_at desc limit 1`,
  [ownerEmail, nameLike],
)

if (tRows.length === 0) {
  console.error(`❌ ${ownerEmail} 이 만든 대회를 찾지 못했습니다.`)
  process.exit(1)
}

const tournament = tRows[0]!
console.log(`대상 대회: ${tournament.name} (${tournament.status})`)

const { rows: groups } = await client.query<{
  id: string
  name: string
  is_joker: boolean
  capacity: number
  filled: number
}>(
  `select g.id, g.name, g.is_joker, g.capacity,
          (select count(*)::int from tournament_members m where m.group_id = g.id) as filled
   from groups g where g.tournament_id = $1 order by g.sort_order`,
  [tournament.id],
)

if (groups.length === 0) {
  console.error('❌ 이 대회에 조가 없습니다.')
  process.exit(1)
}

async function ensureUser(email: string, name: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `select id from auth.users where email = $1`,
    [email],
  )
  if (rows[0]) return rows[0].id

  const { rows: created } = await client.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change,
       email_change_token_new, email_change_token_current
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated', $1, crypt('SeedTest12345!', gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('name', $2::text),
       '', '', '', '', ''
     ) returning id`,
    [email, name],
  )
  const id = created[0]!.id
  await client.query(
    `insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                  last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid,
             jsonb_build_object('sub', $2::text, 'email', $3::text),
             'email', $2::text, now(), now(), now())`,
    [id, id, email],
  )
  return id
}

let poolIndex = 0
let added = 0

for (const g of groups) {
  const need = Math.max(0, g.capacity - g.filled)
  for (let k = 0; k < need; k++) {
    const name = POOL[poolIndex % POOL.length]!
    // 이름이 겹칠 수 있으므로 이메일은 순번으로 유일하게 만든다
    const email = `seed-${poolIndex}@smashtest.local`
    poolIndex++

    const userId = await ensureUser(email, name)
    await client.query(
      `insert into tournament_members (tournament_id, user_id, role, display_name, group_id)
       values ($1, $2, 'member', $3, $4)
       on conflict (tournament_id, user_id) do update set group_id = excluded.group_id`,
      [tournament.id, userId, name, g.id],
    )
    added++
  }
}

const { rows: summary } = await client.query<{ name: string; is_joker: boolean; n: string }>(
  `select g.name, g.is_joker,
          (select count(*)::text from tournament_members m where m.group_id = g.id) as n
   from groups g where g.tournament_id = $1 order by g.sort_order`,
  [tournament.id],
)

console.log(`\n✅ ${added}명 배정 완료`)
for (const s of summary) {
  console.log(`   ${s.name}${s.is_joker ? ' 🃏' : '   '}  ${s.n}명`)
}
console.log('\n테스트 계정 비밀번호는 모두 SeedTest12345! 입니다')
console.log('(seed-N@smashtest.local — 실제 메일이 나가지 않는 도메인)')

await client.end()
