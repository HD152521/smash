import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { MatchOverviewRow, MatchRow, TeamSide } from '@/types/database'

export async function fetchMatchOverview(matchId: string): Promise<MatchOverviewRow> {
  const res = await supabase.from('match_overview').select('*').eq('id', matchId).single()
  return unwrap(res) as unknown as MatchOverviewRow
}

export async function startMatch(matchId: string): Promise<MatchRow> {
  const res = await supabase.rpc('start_match', { p_match_id: matchId })
  return unwrap(res) as MatchRow
}

/**
 * 득점 기록.
 *
 * clientEventId 는 호출자가 만든다. 재전송해도 서버가 같은 키를 알아보고
 * 한 번만 반영하기 때문에, 실패한 요청을 마음 놓고 다시 보낼 수 있다.
 */
export async function recordScore(
  matchId: string,
  side: TeamSide,
  delta: number,
  clientEventId: string,
): Promise<MatchRow> {
  const res = await supabase.rpc('record_score', {
    p_match_id: matchId,
    p_side: side,
    p_delta: delta,
    p_client_event_id: clientEventId,
  })
  return unwrap(res) as MatchRow
}

export async function undoScore(matchId: string): Promise<MatchRow> {
  const res = await supabase.rpc('undo_score', { p_match_id: matchId })
  return unwrap(res) as MatchRow
}

export async function finishMatch(matchId: string, winner?: TeamSide): Promise<MatchRow> {
  const res = await supabase.rpc('finish_match', {
    p_match_id: matchId,
    p_winner_side: winner ?? null,
  })
  return unwrap(res) as MatchRow
}

export async function reopenMatch(matchId: string): Promise<MatchRow> {
  const res = await supabase.rpc('reopen_match', { p_match_id: matchId })
  return unwrap(res) as MatchRow
}
