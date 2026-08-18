/**
 * 데모 대회에 참가자를 채운다.
 *
 * 경기 편성·스코어링을 손으로 확인하려면 조마다 최소 2명이 필요하다.
 * 매번 브라우저로 계정을 만들 수는 없으므로 DB 에 직접 넣는다.
 * (가입 API 는 도메인 검증과 메일 발송 한도에 걸린다)
 *
 *   npm run db:seed
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
  if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].trim()
}

const NAMES = [
  '김민준', '이서연', '박지훈', '최수아', '정도현', '강예은',
  '조현우', '윤하은', '임채원', '한지우', '오세훈', '신유진',
  '배준호', '문가영', '서동현', '홍서윤',
]

const client = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// 데모 계정이 만든 가장 최근 대회를 대상으로 한다
const { rows: tRows } = await client.query<{ id: string; name: string }>(
  `select t.id, t.name from tournaments t
   join auth.users u on u.id = t.owner_id
   where u.email = 'demo@smashtest.local'
   order by t.created_at desc limit 1`,
)

if (tRows.length === 0) {
  console.error('❌ demo@smashtest.local 이 만든 대회가 없습니다. 먼저 앱에서 대회를 만드세요.')
  process.exit(1)
}

const tournament = tRows[0]!
console.log(`대상 대회: ${tournament.name}`)

const { rows: groups } = await client.query<{ id: string; name: string; is_joker: boolean }>(
  `select id, name, is_joker from groups where tournament_id = $1 order by sort_order`,
  [tournament.id],
)

let created = 0
for (const [i, name] of NAMES.entries()) {
  const email = `seed-${i}@smashtest.local`

  const { rows: existing } = await client.query<{ id: string }>(
    `select id from auth.users where email = $1`,
    [email],
  )

  let userId = existing[0]?.id
  if (!userId) {
    const { rows } = await client.query<{ id: string }>(
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
    userId = rows[0]!.id
    await client.query(
      `insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                    last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid,
               jsonb_build_object('sub', $2::text, 'email', $3::text),
               'email', $2::text, now(), now(), now())`,
      [userId, userId, email],
    )
    created++
  }

  // 조를 골고루 나눈다 (4개 조면 조당 4명)
  const group = groups[i % groups.length]!
  await client.query(
    `insert into tournament_members (tournament_id, user_id, role, display_name, group_id)
     values ($1, $2, 'member', $3, $4)
     on conflict (tournament_id, user_id) do update set group_id = excluded.group_id`,
    [tournament.id, userId, name, group.id],
  )
}

const { rows: summary } = await client.query<{ name: string; is_joker: boolean; n: string }>(
  `select g.name, g.is_joker, count(m.id)::text as n
   from groups g left join tournament_members m on m.group_id = g.id
   where g.tournament_id = $1
   group by g.id, g.name, g.is_joker, g.sort_order
   order by g.sort_order`,
  [tournament.id],
)

console.log(`✅ 계정 ${created}개 신규 생성, 참가자 ${NAMES.length}명 배정 완료`)
for (const s of summary) {
  console.log(`   ${s.name}${s.is_joker ? ' 🃏' : '   '}  ${s.n}명`)
}
console.log('\n비밀번호는 모두 SeedTest12345! 입니다')

await client.end()
