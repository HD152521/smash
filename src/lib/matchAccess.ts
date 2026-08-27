import type { MatchOverviewRow } from '@/types/database'

/**
 * 이 경기를 돌릴 수 있는 사람인가 — 시작 · 채점 · 종료가 같은 판단을 쓴다.
 *
 * 서버의 `can_run_match(uuid)` 를 그대로 옮긴 것이다
 * (`supabase/migrations/20260825000001_session_mode.sql`):
 *
 * ```sql
 *     is_match_referee(mid)
 *  or is_tournament_admin(match_tournament_id(mid))
 *  or (is_session_match(mid) and is_match_player(mid))
 * ```
 *
 * 화면이 서버보다 **좁게** 판단하면 될 일이 화면에서 막힌다 — 모임에서
 * 뛰는 사람이 자기 경기를 못 끝낸다. 반대로 **넓게** 판단하면 눌러 놓고
 * 권한 오류를 본다. 그래서 판단을 한 곳에 두고 SQL 과 함께 고친다.
 *
 * ⚠ 선수·심판 판단은 **표시 이름**으로 한다. 화면이 받는 `match_overview`
 * 에는 user_id 가 없고 이름 배열만 있다. 심판 판단이 이미 같은 방식이라
 * 정확도가 새로 나빠지지는 않는다.
 */
export interface MatchRunAccess {
  /** 이 대회·모임의 운영진인가 */
  isAdmin: boolean
  /** 모임인가 — 모임에서만 '뛰는 사람' 이 자기 경기를 돌릴 수 있다 */
  isSession: boolean
  /** 이 대회 안에서 쓰는 내 표시 이름 */
  myName: string | undefined
}

export function isMatchReferee(m: MatchOverviewRow, myName: string | undefined): boolean {
  return myName ? Boolean(m.referees?.includes(myName)) : false
}

export function isMatchPlayer(m: MatchOverviewRow, myName: string | undefined): boolean {
  if (!myName) return false
  return Boolean(m.players_a?.includes(myName)) || Boolean(m.players_b?.includes(myName))
}

export function canRunMatch(m: MatchOverviewRow, access: MatchRunAccess): boolean {
  // 무효 처리된 경기는 서버가 어차피 막는다. 여기서 먼저 걸러 버튼을 안 그린다.
  if (m.status === 'void') return false
  if (access.isAdmin) return true
  if (isMatchReferee(m, access.myName)) return true
  // 모임에는 심판이 없다. 넷이 모여 치는데 그 중 하나를 심판으로 세울 수 없다.
  return access.isSession && isMatchPlayer(m, access.myName)
}
