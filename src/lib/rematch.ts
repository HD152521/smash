import type { MatchOverviewRow } from '@/types/database'

/**
 * 무효 처리 → 다시 입력 사이를 잇는 판단.
 *
 * 끊긴 링크를 잇는 화면 둘(`MatchDetailPage` · `PastMatchEntryPage`)이 라우터
 * state 로 값을 주고받는다. 그 값을 만들고(build) 읽는(parse) 규칙을 여기 하나에
 * 모아 둔다 — 두 화면이 각자 짐작해서 채우면 필드 하나가 어긋나는 날
 * "값이 비어 있다" 는 조용한 버그가 된다.
 */

export interface RematchPrefill {
  groupA: string
  groupB: string
  playersANames: string[]
  playersBNames: string[]
  /** 점수는 대개 고치려는 그 하나다. null 이면 안 세고 끝난 경기다. */
  scoreA: number | null
  scoreB: number | null
}

/** 무효 처리한 경기에서 다시 입력에 넘길 값을 뽑는다 */
export function buildRematchPrefill(match: MatchOverviewRow): RematchPrefill {
  return {
    groupA: match.group_a_id ?? '',
    groupB: match.group_b_id ?? '',
    playersANames: match.players_a ?? [],
    playersBNames: match.players_b ?? [],
    scoreA: match.score_a,
    scoreB: match.score_b,
  }
}

/**
 * 라우터 state 로 받은 값을 검증한다.
 *
 * `location.state` 는 `unknown` 이다 — 이 화면으로 직접 주소를 친 경우 값이
 * 아예 없거나(정상, 그냥 빈 폼으로 취급), 히스토리 조작 등으로 모양이 다른
 * 값이 들어올 수도 있다. 모양이 다르면 조용히 무시한다(null) — 잘못된 값을
 * 반쯤 채운 폼보다 빈 폼이 낫다.
 */
export function parseRematchPrefill(state: unknown): RematchPrefill | null {
  if (!state || typeof state !== 'object') return null
  const s = state as Record<string, unknown>

  if (typeof s.groupA !== 'string' || typeof s.groupB !== 'string') return null
  if (!isStringArray(s.playersANames) || !isStringArray(s.playersBNames)) return null

  return {
    groupA: s.groupA,
    groupB: s.groupB,
    playersANames: s.playersANames,
    playersBNames: s.playersBNames,
    scoreA: typeof s.scoreA === 'number' ? s.scoreA : null,
    scoreB: typeof s.scoreB === 'number' ? s.scoreB : null,
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

/**
 * 경기에 뛴 사람의 **이름**을 명단의 멤버 **id** 로 되짚는다.
 *
 * 화면에는 이름이 남지만 편성 훅(`useMatchTeams`)과 서버는 멤버 id 를 받는다.
 * 명단에서 못 찾은 이름(탈퇴·이름 변경 등)은 조용히 뺀다 — 나머지라도
 * 채워진 폼이 통째로 빈 폼보다 낫고, 어차피 사람은 눈으로 다시 확인한다.
 */
export function resolvePlayerIds(
  names: readonly string[],
  members: readonly { id: string; displayName: string }[],
): string[] {
  return names
    .map((name) => members.find((m) => m.displayName === name)?.id)
    .filter((id): id is string => Boolean(id))
}
