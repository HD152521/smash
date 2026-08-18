/**
 * 실제 DB 스키마에서 TypeScript 타입을 생성한다.
 *
 * `supabase gen types` 는 Docker 를 요구하는데 이 환경엔 Docker 가 없다.
 * 필요한 건 우리 스키마(테이블 12 + 뷰 1 + enum 5 + 함수 몇 개)뿐이라
 * information_schema 를 직접 읽어 만든다.
 *
 *   npm run db:types
 */
import { Client } from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m?.[1] && m[2] !== undefined) out[m[1]] = m[2].trim()
  }
  return out
}

/** PostgREST 가 JSON 으로 돌려주는 형태 기준으로 매핑한다. */
function tsType(udt: string, enums: Map<string, string[]>): string {
  if (udt.startsWith('_')) return `${tsType(udt.slice(1), enums)}[]`
  if (enums.has(udt)) return pascal(udt)
  switch (udt) {
    case 'bool':
      return 'boolean'
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number'
    case 'json':
    case 'jsonb':
      return 'Json'
    default:
      // text, varchar, uuid, timestamptz, date, time … 전부 문자열로 온다
      return 'string'
  }
}

function pascal(s: string): string {
  return s
    .split('_')
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : ''))
    .join('')
}

interface ColumnRow {
  table_name: string
  column_name: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  has_default: boolean
  kind: 'r' | 'v'
}

async function main() {
  const url = loadEnv()['SUPABASE_DB_URL']
  if (!url) throw new Error('.env.local 에 SUPABASE_DB_URL 이 없습니다')

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const { rows: enumRows } = await client.query<{ name: string; labels: string[] }>(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace
    group by t.typname order by t.typname`)
  const enums = new Map(enumRows.map((r) => [r.name, r.labels]))

  const { rows: cols } = await client.query<ColumnRow>(`
    select c.relname as table_name,
           a.attname as column_name,
           t.typname as udt_name,
           case when a.attnotnull then 'NO' else 'YES' end as is_nullable,
           (a.atthasdef or a.attidentity <> '') as has_default,
           c.relkind as kind
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_type t on t.oid = a.atttypid
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r','v')
      and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`)

  await client.end()

  const byTable = new Map<string, ColumnRow[]>()
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, [])
    byTable.get(c.table_name)!.push(c)
  }

  const out: string[] = []
  out.push('/**')
  out.push(' * 이 파일은 실제 DB 스키마에서 생성됩니다. 직접 수정하지 마세요.')
  out.push(' *   npm run db:types')
  out.push(' *')
  out.push(' * 스키마를 바꿨으면 db:push 후 이 명령을 다시 돌리세요.')
  out.push(' */')
  out.push('')
  out.push('export type Json = string | number | boolean | null | { [k: string]: Json } | Json[]')
  out.push('')

  for (const [name, labels] of enums) {
    out.push(`export type ${pascal(name)} = ${labels.map((l) => `'${l}'`).join(' | ')}`)
  }
  out.push('')

  const tables: string[] = []
  const views: string[] = []

  for (const [table, columns] of [...byTable].sort((a, b) => a[0].localeCompare(b[0]))) {
    const isView = columns[0]!.kind === 'v'
    const iface = `${pascal(table)}Row`
    out.push(`export interface ${iface} {`)
    for (const c of columns) {
      const t = tsType(c.udt_name, enums)
      out.push(`  ${c.column_name}: ${t}${c.is_nullable === 'YES' ? ' | null' : ''}`)
    }
    out.push('}')
    out.push('')

    if (isView) {
      views.push(`      ${table}: { Row: ${iface}; Relationships: [] }`)
    } else {
      // Insert: NOT NULL 이고 기본값 없는 컬럼만 필수
      const required = columns.filter((c) => c.is_nullable === 'NO' && !c.has_default)
      const insert =
        required.length === columns.length
          ? iface
          : `Partial<${iface}> & Pick<${iface}, ${required.map((c) => `'${c.column_name}'`).join(' | ') || 'never'}>`
      tables.push(
        `      ${table}: { Row: ${iface}; Insert: ${insert}; Update: Partial<${iface}>; Relationships: [] }`,
      )
    }
  }

  out.push('export interface Database {')
  out.push('  public: {')
  out.push('    Tables: {')
  out.push(tables.join('\n'))
  out.push('    }')
  out.push('    Views: {')
  out.push(views.join('\n'))
  out.push('    }')
  out.push('    Enums: {')
  for (const name of enums.keys()) out.push(`      ${name}: ${pascal(name)}`)
  out.push('    }')
  out.push('  }')
  out.push('}')
  out.push('')

  writeFileSync('src/types/database.gen.ts', out.join('\n'))
  console.log(
    `✅ src/types/database.gen.ts 생성 — 테이블 ${tables.length}, 뷰 ${views.length}, enum ${enums.size}`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
