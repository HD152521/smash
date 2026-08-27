/**
 * 경기 짜기 화면의 판단 — 누구를 몇 번째로 골랐는지, 어느 편인지.
 *
 * 컴포넌트 밖으로 빼는 이유: 고르기·팀 배정 규칙이 화면과 테스트 양쪽에서
 * 같은 소스여야 "다 찼는데도 눌린다" 같은 어긋남이 생기지 않는다.
 * (`SessionMatchCreatePage` 가 쓴다.)
 */

/**
 * 사람을 고르거나 뺀다.
 *
 * 이미 골랐으면 뺀다. 안 골랐고 자리가 남았으면 뒤에 붙인다. 다 찼으면
 * 아무 일도 안 한다 — 조용히 앞사람을 밀어내면 누가 빠졌는지 모른다.
 */
export function togglePick(picked: readonly string[], memberId: string, need: number): string[] {
  if (picked.includes(memberId)) {
    return picked.filter((x) => x !== memberId)
  }
  if (picked.length >= need) {
    return [...picked]
  }
  return [...picked, memberId]
}

/** 고른 목록에서 한 사람을 뺀다 (하단 고정 바의 × 에서 쓴다) */
export function removePick(picked: readonly string[], memberId: string): string[] {
  return picked.filter((x) => x !== memberId)
}

export interface TeamSplit {
  teamA: string[]
  teamB: string[]
  /** 두 편이 다 찼는가 — 제출 가능 여부 */
  ready: boolean
}

/**
 * 고른 순서대로 앞 절반이 A팀, 뒤 절반이 B팀.
 *
 * squad 는 한 편의 인원 (단식 1 · 복식 2).
 */
export function splitTeams(picked: readonly string[], squad: number): TeamSplit {
  const need = squad * 2
  return {
    teamA: picked.slice(0, squad),
    teamB: picked.slice(squad, need),
    // togglePick 이 need 를 넘기지 못하게 막지만, >= 로 둬서 방어적으로도 맞는다
    ready: picked.length >= need,
  }
}
