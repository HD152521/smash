/**
 * 데모 대회에 진행 중인 경기를 하나 만들거나 점수를 올린다.
 * 실시간 반영을 눈으로 확인할 때 쓴다.
 *
 *   npm run demo:live          진행 중 경기 준비
 *   npm run demo:live -- score A   A팀 득점
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

async function token(email: string, password: string) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error(`로그인 실패: ${JSON.stringify(body)}`)
  return body.access_token
}

async function rpc(tk: string, fn: string, args: unknown) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const db = new Client({
  connectionString: env['SUPABASE_DB_URL'],
  ssl: { rejectUnauthorized: false },
})
await db.connect()

const tk = await token('demo@smashtest.local', 'DemoTest12345!')

const { rows: tRows } = await db.query<{ id: string; name: string }>(
  `select t.id, t.name from tournaments t join auth.users u on u.id = t.owner_id
   where u.email = 'demo@smashtest.local' order by t.created_at desc limit 1`,
)
const tournament = tRows[0]!

const mode = process.argv[2]

if (mode === 'score') {
  const side = (process.argv[3] ?? 'A') as 'A' | 'B'
  const { rows } = await db.query<{ id: string }>(
    `select id from matches where tournament_id=$1 and status='live' order by started_at desc limit 1`,
    [tournament.id],
  )
  if (rows.length === 0) {
    console.error('진행 중인 경기가 없습니다. 먼저 npm run demo:live 를 실행하세요.')
    process.exit(1)
  }
  const r = await rpc(tk, 'record_score', {
    p_match_id: rows[0]!.id,
    p_side: side,
    p_delta: 1,
    p_client_event_id: `demo-${side}-${Math.random().toString(36).slice(2, 12)}`,
  })
  const m = r.body as unknown as { score_a: number; score_b: number; status: string }
  console.log(`${side}팀 득점 → ${m.score_a} : ${m.score_b} (${m.status})`)
} else {
  const { rows: existing } = await db.query<{ id: string }>(
    `select id from matches where tournament_id=$1 and status='live' limit 1`,
    [tournament.id],
  )
  if (existing.length > 0) {
    console.log('이미 진행 중인 경기가 있습니다:', existing[0]!.id)
  } else {
    const { rows: groups } = await db.query<{ id: string; name: string }>(
      `select id, name from groups where tournament_id=$1 order by sort_order`,
      [tournament.id],
    )
    const { rows: courts } = await db.query<{ id: string }>(
      `select id from courts where tournament_id=$1 order by sort_order limit 1`,
      [tournament.id],
    )
    const pick = async (groupId: string) => {
      const { rows } = await db.query<{ id: string }>(
        `select id from tournament_members where tournament_id=$1 and group_id=$2 limit 2`,
        [tournament.id, groupId],
      )
      return rows.map((r) => r.id)
    }
    const created = await rpc(tk, 'create_match', {
      p_tournament_id: tournament.id,
      p_court_id: courts[0]?.id ?? null,
      p_label: null,
      p_group_a: groups[0]!.id,
      p_players_a: await pick(groups[0]!.id),
      p_group_b: groups[2]!.id,
      p_players_b: await pick(groups[2]!.id),
      p_referees: [],
    })
    if (created.status !== 200) throw new Error(JSON.stringify(created.body))
    const matchId = (created.body as unknown as { id: string }).id
    await rpc(tk, 'start_match', { p_match_id: matchId })
    console.log(`경기 생성 + 시작: ${groups[0]!.name} vs ${groups[2]!.name}`)
    console.log(`관전 화면: /t/${tournament.id}/live`)
  }
}

await db.end()
