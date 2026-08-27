/**
 * 마이그레이션이 의도대로 적용됐는지 구조적으로 검증한다.
 *
 * "push 가 성공했다" 와 "설계한 보안 경계가 실제로 서 있다" 는 다른 이야기다.
 * 특히 RLS 는 조용히 비어 있어도 에러가 안 나기 때문에 반드시 확인해야 한다.
 *
 *   npm run db:verify
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim()
  }
  return out
}

interface Check {
  name: string
  sql: string
  /** 통과 조건. rows 를 받아 boolean 을 돌려준다. */
  pass: (rows: Record<string, unknown>[]) => boolean
  detail?: (rows: Record<string, unknown>[]) => string
}

/**
 * anon 이 EXECUTE 할 수 있는 public 함수 전체. **비로그인 공격 표면의 정본**이다.
 *
 * 개수가 아니라 **집합**으로 못 박는다 — 개수만 세면 하나가 빠지고 하나가
 * 늘어난 교체를 못 잡는다. 인자 이름까지 적는 이유는 PostgREST 가 함수를
 * **인자 이름 집합**으로 찾기 때문이다. 이름이 바뀌면 같은 함수라도 앱에서
 * 안 불린다.
 *
 * ⚠ is_direct_api_call() 이 여기 있는 것은 의도된 결정이다
 *   (20260819000001_fix_guard_permission.sql). guard_tournament_update ·
 *   guard_member_update · guard_member_delete 는 SECURITY INVOKER 여야만
 *   발동한다 — DEFINER 로 바꾸면 current_user 가 postgres 가 되어 가드가 영영
 *   안 걸린다. INVOKER 라는 것은 호출자 권한으로 이 함수를 부른다는 뜻이라
 *   앱 롤에 EXECUTE 가 있어야 한다. 예전에 이 grant 를 걷었다가 **관리자
 *   수정이 통째로 막힌 적이 있다.** 걷어내지 마라. 노출되는 정보는 "당신이
 *   authenticated 인가" 불리언 하나뿐이다.
 *
 * ⚠ 트리거 함수(prorettype = 'trigger')는 제외한다 — PostgREST 가 노출하지
 *   않으므로 anon 이 부를 수 있는 표면이 아니다.
 */
const ANON_EXECUTABLE_FUNCTIONS = [
  'guest_board(p_code text, p_session_id uuid)',
  'guest_sessions(p_code text)',
  'is_direct_api_call()',
  // p_grade 는 20260901000001 에서 **맨 뒤 default null** 로 붙었다. 옛
  // 3인자 함수는 같은 파일에서 drop 했다 — 남겨 두면 이름이 같은 함수가 둘이
  // 되어 PostgREST 가 `function is not unique` 로 떨어지고 게스트 등록이
  // 통째로 막힌다. 이 줄이 그 drop 이 실제로 됐는지까지 함께 지킨다.
  'join_as_guest(p_code text, p_session_id uuid, p_name text, p_grade text DEFAULT NULL::text)',
]

const checks: Check[] = [
  {
    name: 'auth.users 트리거 (profiles 자동 생성)',
    sql: `select tgname from pg_trigger
          where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'`,
    pass: (r) => r.length === 1,
    detail: (r) => (r.length ? '생성됨' : '없음 — 가입해도 profiles 가 안 생긴다'),
  },
  {
    name: 'RLS 헬퍼가 SECURITY DEFINER 인가 (무한재귀 방지)',
    sql: `select proname, prosecdef from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname in ('is_tournament_member','is_tournament_admin','is_tournament_owner',
                            'is_match_referee','match_tournament_id','match_team_tournament_id')
          order by proname`,
    pass: (r) => r.length === 6 && r.every((x) => x['prosecdef'] === true),
    detail: (r) => `${r.filter((x) => x['prosecdef']).length}/6 개가 SECURITY DEFINER`,
  },
  {
    name: '모든 테이블에 RLS 활성화',
    sql: `select relname, relrowsecurity, relforcerowsecurity from pg_class
          where relnamespace = 'public'::regnamespace and relkind = 'r'
          order by relname`,
    pass: (r) => r.length > 0 && r.every((x) => x['relrowsecurity'] === true),
    detail: (r) => {
      const off = r.filter((x) => !x['relrowsecurity']).map((x) => x['relname'])
      return off.length ? `RLS 꺼진 테이블: ${off.join(', ')}` : `${r.length}개 테이블 전부 ON`
    },
  },
  {
    name: 'tournament_members 에 FORCE RLS 가 꺼져 있는가 (재귀 방지 조건)',
    sql: `select relforcerowsecurity from pg_class
          where relnamespace = 'public'::regnamespace and relname = 'tournament_members'`,
    pass: (r) => r[0]?.['relforcerowsecurity'] === false,
    detail: (r) =>
      r[0]?.['relforcerowsecurity'] === false
        ? 'OFF — 헬퍼가 RLS 를 우회할 수 있다 (의도대로)'
        : 'ON — 무한재귀가 난다',
  },
  {
    name: 'score_events 에 쓰기 정책이 없는가 (RPC 우회 차단)',
    sql: `select cmd, policyname from pg_policies
          where schemaname = 'public' and tablename = 'score_events'`,
    pass: (r) => r.length > 0 && r.every((x) => x['cmd'] === 'SELECT'),
    detail: (r) => `정책 ${r.length}개, 종류: ${[...new Set(r.map((x) => x['cmd']))].join(', ')}`,
  },
  {
    name: 'profiles 가 본인만 조회 가능한가',
    sql: `select cmd, qual from pg_policies
          where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'`,
    pass: (r) => r.length === 1 && String(r[0]?.['qual'] ?? '').includes('auth.uid()'),
    detail: (r) => (r.length ? `조건: ${String(r[0]?.['qual']).slice(0, 60)}` : '정책 없음'),
  },
  {
    name: 'Realtime 발행에 matches 가 등록됐는가',
    sql: `select tablename from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'`,
    pass: (r) => r.some((x) => x['tablename'] === 'matches'),
    detail: (r) => `발행 테이블: ${r.map((x) => x['tablename']).join(', ') || '(없음)'}`,
  },
  {
    name: 'match_overview 뷰가 security_invoker 인가 (RLS 우회 통로 차단)',
    sql: `select reloptions from pg_class
          where relnamespace='public'::regnamespace and relname='match_overview'`,
    pass: (r) => JSON.stringify(r[0]?.['reloptions'] ?? []).includes('security_invoker=true'),
    detail: (r) => JSON.stringify(r[0]?.['reloptions'] ?? []),
  },
  {
    name: 'RPC 가 authenticated 에게만 노출됐는가',
    sql: `select p.proname,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok,
                 has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_ok
          from pg_proc p
          where p.pronamespace='public'::regnamespace
            and p.proname in ('create_tournament','join_tournament','record_score','undo_score',
                              'finish_match','reopen_match','create_match','set_my_group')
          order by p.proname`,
    pass: (r) => r.length === 8 && r.every((x) => x['auth_ok'] === true && x['anon_ok'] === false),
    detail: (r) => {
      const leaked = r.filter((x) => x['anon_ok']).map((x) => x['proname'])
      return leaked.length ? `⚠ anon 에게 노출됨: ${leaked.join(', ')}` : `${r.length}/8 정상`
    },
  },
  {
    name: 'anon 이 호출 가능한 public 함수가 정확히 그 넷인가 (비로그인 공격 표면)',
    sql: `select p.proname || '(' || pg_get_function_arguments(p.oid) || ')' as sig
          from pg_proc p
          where p.pronamespace = 'public'::regnamespace
            and p.prorettype <> 'trigger'::regtype
            and has_function_privilege('anon', p.oid, 'EXECUTE')
          order by 1`,
    pass: (r) =>
      r.map((x) => String(x['sig'])).join(' | ') === ANON_EXECUTABLE_FUNCTIONS.join(' | '),
    detail: (r) => {
      const actual = r.map((x) => String(x['sig']))
      const added = actual.filter((s) => !ANON_EXECUTABLE_FUNCTIONS.includes(s))
      const removed = ANON_EXECUTABLE_FUNCTIONS.filter((s) => !actual.includes(s))
      if (!added.length && !removed.length) return `${actual.length}개 — 목록과 일치`
      return `⚠ 늘어난 것: [${added.join(', ')}] · 사라진 것: [${removed.join(', ')}]`
    },
  },
  {
    name: '내부 전용 함수가 앱 사용자에게 막혀 있는가 (감사로그 위조 방지)',
    sql: `select p.proname,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok,
                 has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_ok
          from pg_proc p
          where p.pronamespace='public'::regnamespace
            and p.proname in ('log_audit','gen_invite_code')`,
    pass: (r) => r.length === 2 && r.every((x) => !x['auth_ok'] && !x['anon_ok']),
    detail: (r) => {
      const open = r.filter((x) => x['auth_ok'] || x['anon_ok']).map((x) => x['proname'])
      return open.length ? `⚠ 호출 가능: ${open.join(', ')}` : '둘 다 차단됨'
    },
  },
  {
    /*
     * not null 로 굳으면 이미 있는 행 전부와, 명단에 사람을 넣는 모든
     * 경로가 "채울 책임" 을 진다 — 마일스톤 3 이 정확히 그것으로
     * 프로덕션을 깼다(docs/todo.md 🔴 절). 급수를 모르는 사람은 모르는
     * 채로 두는 것이 설계다. 나중에 누가 "비어 있으니 default 를 주자" 고
     * 굳히는 순간 이 검사가 막는다.
     */
    name: '급수 컬럼 둘이 nullable 인가 (default 도 없는가)',
    sql: `select table_name, is_nullable, column_default, udt_name
          from information_schema.columns
          where table_schema = 'public' and column_name = 'grade'
          order by table_name`,
    pass: (r) =>
      r.length === 2 &&
      r.every(
        (x) =>
          x['is_nullable'] === 'YES' &&
          x['column_default'] === null &&
          x['udt_name'] === 'player_grade',
      ),
    detail: (r) =>
      r.length
        ? r
            .map(
              (x) =>
                `${x['table_name']}.grade ${x['udt_name']} ${x['is_nullable'] === 'YES' ? 'nullable' : '⚠ NOT NULL'}${x['column_default'] ? ` ⚠ default=${x['column_default']}` : ''}`,
            )
            .join(' · ')
        : '⚠ grade 컬럼이 하나도 없다',
  },
  {
    /*
     * 순서(S > A > B > C > D > 초심)가 곧 실력 순서라 `order by grade` 가
     * 그대로 동작한다. src/lib/grade.ts 의 PLAYER_GRADES 와 **글자 그대로
     * 같아야** 서버 정렬과 화면 정렬이 안 어긋난다. 그리고 라벨에 한글이
     * 섞이면 나중에 문구를 못 바꾼다 — '초심' 은 화면에서만 산다.
     */
    name: 'player_grade 순서가 S>A>B>C>D>beginner 이고 한글이 없는가',
    sql: `select array_agg(e.enumlabel::text order by e.enumsortorder) as labels
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          where t.typnamespace = 'public'::regnamespace and t.typname = 'player_grade'`,
    pass: (r) =>
      JSON.stringify(r[0]?.['labels'] ?? []) ===
      JSON.stringify(['S', 'A', 'B', 'C', 'D', 'beginner']),
    detail: (r) => `순서: ${JSON.stringify(r[0]?.['labels'] ?? '(없음)')}`,
  },
  {
    name: 'get_standings 가 실제로 실행되는가',
    sql: `select count(*) as n from get_standings('00000000-0000-0000-0000-000000000000')`,
    pass: (r) => r.length === 1,
    detail: (r) => `빈 대회로 호출 → ${r[0]?.['n']}행 (에러 없음)`,
  },
]

async function main() {
  const env = loadEnv()
  const url = env['SUPABASE_DB_URL']
  if (!url) throw new Error('.env.local 에 SUPABASE_DB_URL 이 없습니다')

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  let failed = 0
  for (const check of checks) {
    try {
      const { rows } = await client.query(check.sql)
      const ok = check.pass(rows as Record<string, unknown>[])
      if (!ok) failed++
      const mark = ok ? '✅' : '❌'
      const detail = check.detail?.(rows as Record<string, unknown>[]) ?? ''
      console.log(`${mark} ${check.name}`)
      if (detail) console.log(`     ${detail}`)
    } catch (err) {
      failed++
      console.log(`❌ ${check.name}`)
      console.log(`     실행 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await client.end()
  console.log(`\n${checks.length - failed}/${checks.length} 통과`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
