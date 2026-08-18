/**
 * 타입 계층이 살아 있는지 확인하는 컴파일 타임 검사.
 *
 * 왜 필요한가:
 *   supabase-js 는 Database['public'] 이 GenericSchema 를 만족하지 않으면
 *   Schema 를 never 로 떨어뜨리고, .rpc()/.from() 이 조용히 any 가 된다.
 *   에러가 나지 않기 때문에 타입이 죽은 걸 아무도 모른다.
 *
 *   실제로 그런 일이 있었다: 생성기가 Row 를 `interface` 로 뽑았는데,
 *   TypeScript 에서 interface 는 암묵적 인덱스 시그니처가 없어
 *   Record<string, unknown> 에 할당되지 않는다. 그래서 스키마 인식이
 *   통째로 실패했고, 타입이 전부 any 인 채로 빌드가 통과했다.
 *
 * 이 파일은 런타임 코드가 없다. tsc 가 통과하면 그 자체가 검사 결과다.
 */
import type { supabase } from '@/lib/supabase'
import type { Database, MatchRow, StandingRow, TournamentRow } from './database'

type Expect<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type Not<T extends boolean> = T extends true ? false : true
type Extends<A, B> = [A] extends [B] ? true : false

// ── 1. 스키마가 인식되는가 ───────────────────────────────────────────
// rpc 의 첫 인자가 string 으로 넓어지면 스키마가 never 로 죽은 것이다.
type RpcNames = Parameters<(typeof supabase)['rpc']>[0]
export type _SchemaIsAlive = Expect<Not<Extends<string, RpcNames>>>
export type _RpcNamesAreLiterals = Expect<Extends<'record_score', RpcNames>>

// ── 2. Row 들이 Record<string, unknown> 을 만족하는가 ────────────────
// (interface 로 뽑히면 여기서 걸린다)
type Tables = Database['public']['Tables']
export type _RowsAreIndexable = Expect<Extends<Tables['matches']['Row'], Record<string, unknown>>>
export type _TournamentRowIndexable = Expect<Extends<TournamentRow, Record<string, unknown>>>
export type _StandingRowIndexable = Expect<Extends<StandingRow, Record<string, unknown>>>

// ── 3. RPC 인자·반환이 실제 타입인가 ─────────────────────────────────
type Fns = Database['public']['Functions']
export type _RecordScoreArgsTyped = Expect<
  Extends<Fns['record_score']['Args']['p_side'], 'A' | 'B'>
>
export type _RecordScoreReturnsMatch = Expect<Extends<Fns['record_score']['Returns'], MatchRow>>
export type _StandingsReturnsArray = Expect<Extends<Fns['get_standings']['Returns'], StandingRow[]>>
export type _NothingIsAny = Expect<Not<IsAny<Fns['create_tournament']['Args']>>>

// ── 4. jsonb config 가 실제 모양으로 좁혀졌는가 ──────────────────────
export type _ConfigIsTyped = Expect<Extends<TournamentRow['config']['jokerPoints'], number>>
