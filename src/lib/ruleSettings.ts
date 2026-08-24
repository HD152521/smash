import type { TournamentConfig } from '@/types/database'

/**
 * 대회에 하나뿐인 경기 규칙 — 화면이 다루는 형태.
 *
 * 서버의 config(jsonb) 에서 '사람이 고르는 것' 만 뽑은 것이다.
 *
 *   jokerGroupCount 는 빠진다. groups.is_joker 가 진실이고 config 쪽은
 *   사본이라, 화면에서 숫자만 바꾸면 둘이 어긋난다.
 *
 *   lossPoints 는 빠진다. 순위 계산(get_standings)이 진 팀에 아무것도
 *   더하지 않으므로 값이 어디에도 쓰이지 않는다. 고를 수 있게 해 두면
 *   바꿔도 아무 일이 안 일어나는 설정이 된다.
 */
export type RuleSettings = Omit<TournamentConfig, 'jokerGroupCount' | 'lossPoints'>

export const DEFAULT_RULES: RuleSettings = {
  format: 'doubles',
  normalPoints: 21,
  jokerPoints: 11,
  deuce: false,
  deuceCap: null,
  jokerDeuceCap: null,
  winPoints: 1,
  jokerWinPoints: 0.5,
  courtChange: false,
  courtChangeAt: null,
  readyQueuePosition: 2,
}

/**
 * 저장하기 전에 한 줄로 읽히게 — 접어 둔 설정 안에 뭐가 들었는지.
 *
 * 예전에 만든 대회는 새 키가 없고(undefined), 목록 화면은 대회가 도착하기
 * 전에도 한 번 그려진다. 요약 한 줄 때문에 관리 화면 전체가 죽으면 안 되므로
 * 값이 없을 수 있다고 보고 읽는다.
 */
export function ruleSummary(r: Partial<RuleSettings> | null | undefined): string {
  if (!r) return ''
  return [
    r.format === 'singles' ? '단식' : '복식',
    r.normalPoints ? `${r.normalPoints}점` : null,
    r.deuce ? (r.deuceCap == null ? '듀스' : `듀스 최대 ${r.deuceCap}점`) : '듀스 없음',
    r.courtChange ? '코트 체인지' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * 서버 config → 폼 값.
 *
 * 마이그레이션이 예전 대회에도 새 키를 채워 넣지만, 아직 안 돌았거나 캐시에
 * 옛 행이 남아 있어도 화면이 죽지 않게 한 번 더 막는다.
 *
 * null 을 기본값으로 되돌리지 않는 항목이 둘 있다 (deuceCap · courtChangeAt).
 * 거기서 null 은 '값이 없음' 이 아니라 뜻이 있는 값이다 — 상한 없음, 자동 계산.
 */
export function toRuleSettings(config: Partial<TournamentConfig> | null | undefined): RuleSettings {
  if (!config) return DEFAULT_RULES
  return {
    format: config.format ?? DEFAULT_RULES.format,
    normalPoints: config.normalPoints ?? DEFAULT_RULES.normalPoints,
    jokerPoints: config.jokerPoints ?? DEFAULT_RULES.jokerPoints,
    deuce: config.deuce ?? DEFAULT_RULES.deuce,
    deuceCap: config.deuceCap ?? null,
    jokerDeuceCap: config.jokerDeuceCap ?? null,
    winPoints: config.winPoints ?? DEFAULT_RULES.winPoints,
    jokerWinPoints: config.jokerWinPoints ?? DEFAULT_RULES.jokerWinPoints,
    courtChange: config.courtChange ?? DEFAULT_RULES.courtChange,
    courtChangeAt: config.courtChangeAt ?? null,
    readyQueuePosition: config.readyQueuePosition ?? DEFAULT_RULES.readyQueuePosition,
  }
}
