import type { MatchOverviewRow, TournamentKind } from '@/types/database'

/**
 * 모임과 대회를 가르는 판단.
 *
 * 같은 진행 엔진(코트 · 대기열 · 점수 원장 · 알림)을 쓰지만 화면과 규칙이
 * 다르다. 모임에는 조 · 순위 · 심판이 없고, 점수를 안 세고 끝낼 수 있다.
 *
 * 이 파일은 그 차이를 '어디서 갈리는지' 한곳에 모아 둔다. 페이지마다
 * `kind === 'session'` 을 흩뿌리면 새 화면을 만들 때마다 하나씩 빠뜨린다.
 */

/**
 * 모임인가.
 *
 * kind 가 없는 값을 대회로 본다 — 이 컬럼이 생기기 전에 만들어진 대회가
 * 이미 있고, 캐시에 옛 행이 남아 있어도 화면이 죽으면 안 된다.
 * 판단을 뒤집으면(없으면 모임) 지난 대회의 순위 탭이 사라진다.
 */
export function isSession(kind: TournamentKind | null | undefined): boolean {
  return kind === 'session'
}

/**
 * 모임 이름 기본값 — "10월 7일 모임".
 *
 * 모임은 날짜별로 하나씩 생긴다. 매번 이름을 지어내게 하면 "모임", "모임2",
 * "ㅁㅁ" 같은 게 쌓여서 목록에서 어느 날인지 알 수 없게 된다.
 */
export function defaultSessionName(now: Date): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일 모임`
}

/**
 * 모임 경기의 이름 — 조가 없으니 사람으로 부른다.
 *
 * 선수가 아직 안 붙은 경기는 '?' 로 둔다. 빈 문자열로 두면 "vs" 만 남아
 * 무엇이 빠졌는지 알 수 없다.
 */
export function playerTitle(m: MatchOverviewRow): string {
  const a = m.players_a?.join(' · ') || '?'
  const b = m.players_b?.join(' · ') || '?'
  return `${a} vs ${b}`
}

/** 조가 없는 경기인가 = 모임 경기다 (편성 시점에 group_id 가 NULL) */
export function hasNoGroups(m: MatchOverviewRow): boolean {
  return !m.group_a_name && !m.group_b_name
}

/**
 * 점수를 안 세고 끝난 경기인가.
 *
 * `scored === false` 만 본다. `null` (뷰 컬럼이라 nullable) 이나 `undefined`
 * 를 '안 셌다' 로 읽으면, 이 컬럼이 없던 시절의 지난 경기가 전부
 * '점수 없음' 으로 표시된다.
 */
export function isUnscored(m: MatchOverviewRow): boolean {
  return m.scored === false
}
