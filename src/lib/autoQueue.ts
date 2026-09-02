import type { CourtRow, MatchOverviewRow } from '@/types/database'
import { suggestMatch, type AutoMatchCandidate } from './autoMatch'
import { unassignedQueue } from './court'
import { splitTeams } from './matchPicker'

/**
 * 코트마다 다음 경기 하나를 **미리 걸어 둔다.**
 *
 * 1단계(`autoMatch.ts`)는 경기 짜기 화면을 열었을 때 네 명을 채워 놓는
 * 데서 멈췄다. 그래도 누군가는 화면을 열어야 한다 — 코트가 비었는데
 * 아무도 안 짜 놓으면 사람들이 코트 옆에 서서 총무를 기다린다.
 * 여기서는 **아무도 안 열어도** 코트마다 한 경기가 걸려 있게 한다.
 * 코트가 비면 초록 카드를 한 번 누르는 것으로 다음 판이 시작된다.
 *
 * 판단만 여기 있고 **부르는 일은 화면이 한다**(`useAutoQueue.ts`).
 * 순수 함수라야 "이 코트를 채워야 하나" 를 테스트로 못박을 수 있다.
 *
 * ── ⚠ 이건 화면 안에서만 막는 임시 방편이다 ────────────────────────
 *
 * 12명이 각자 폰으로 코트 화면을 켜 두면, 그 12개 화면이 동시에 "대기가
 * 비었네" 하고 판단한다. 한 화면 안에서의 중복은 `useAutoQueue` 가 막지만
 * (동시 실행 잠금 · 같은 상태 재시도 금지 · 실패 시 중단), **여러 기기가
 * 동시에 열려 있으면 여전히 같은 코트에 여러 경기가 겹쳐 만들어질 수
 * 있다.** 화면은 남의 화면이 방금 무엇을 만들었는지 모른다.
 *
 * 제대로 하려면 서버에 잠금을 건 RPC 가 필요하다 — 대기 수를 세고 경기를
 * 넣는 구간을 `pg_advisory_xact_lock` 으로 직렬화하는 것. 이 저장소는
 * `join_as_guest` 에서 이미 같은 방식을 쓴다(게스트 상한 60을 셀 때,
 * 20260828000001_guest_registration.sql). 마이그레이션을 여는 날 그쪽으로
 * 옮기고 이 파일은 '무엇을 만들지' 만 남기면 된다.
 *
 * 지금 겹침의 실질적 피해를 줄이는 장치는 두 가지다:
 *   1. **모임장만 자동 예약을 돌린다.** 열두 대가 아니라 한두 대다.
 *      권한 판단이기도 하다 — `create_session_match` 는 관리자가 아니면
 *      '자기가 뛰는 경기' 만 허락하는데, 자동 제안이 고른 넷에 그 사람이
 *      들어 있을 이유가 없다(판수가 적은 사람부터 고르므로 오히려 없다).
 *   2. **만든 경기가 눈에 보이고 한 번에 지워진다.** 겹쳐 만들어져도
 *      코트 카드에서 바로 보이고 × 하나로 사라진다.
 */

/**
 * 자동으로 만든 경기라는 표시 — `matches.label` 에 적는다.
 *
 * 컬럼을 늘리지 않으려고 이미 있는 자유 입력 칸을 빌려 쓴다. ⚠ **사람이
 * 직접 적을 수도 있는 칸이다.** 누군가 경기 이름을 '자동' 이라고 적으면
 * 그 경기도 자동 예약으로 보인다 — 배지가 하나 잘못 붙고 × 가 하나 더
 * 생길 뿐이라 피해가 없어서 이대로 둔다. 자동 예약이 계속 쓰이면 그때
 * `matches.auto_queued boolean` 을 두는 게 맞다.
 */
export const AUTO_QUEUE_LABEL = '자동'

/** 자동 예약으로 걸린 경기인가 */
export function isAutoQueued(m: MatchOverviewRow): boolean {
  return m.label === AUTO_QUEUE_LABEL
}

export interface AutoQueueInput {
  /** 정렬된 코트 목록 (`useCourts` 가 sort_order 로 내려준다) */
  courts: readonly CourtRow[]
  matches: readonly MatchOverviewRow[]
  /** 이 모임 명단 — `suggestMatch` 가 그대로 받는다 */
  members: readonly AutoMatchCandidate[]
  /** 한 편 인원 (단식 1 · 복식 2) */
  squad: number
}

export interface AutoQueuePlan {
  courtId: string
  playersA: string[]
  playersB: string[]
  /**
   * **이 제안 자체의 지문** — 어느 코트에 · 누구를 · 몇 판이 끝난 시점에.
   *
   * 화면이 "이 열쇠로는 이미 해 봤다" 를 기억하는 데 쓴다(`autoQueueGuard.ts`).
   * 경기 목록은 실시간 · 포커스 복귀 · 폴링으로 계속 갱신되고 그때마다 이
   * 계산이 다시 도는데, 답이 같으면 열쇠도 같아 두 번 만들지 않는다.
   *
   * ⚠ **세상의 지문이 아니라 답의 지문이어야 한다.** 처음에는 경기 목록
   * 전체를 지문으로 삼았는데, 그러면 총무가 자동 예약을 × 로 지우는 순간
   * 세상이 '만들기 직전' 으로 돌아가 **똑같은 편성이 즉시 되살아났다.**
   * 지우는 버튼이 아무 일도 안 하는 것처럼 보인다. 답을 열쇠로 삼으면
   * 지운 편성은 다시 안 나온다 — 지웠다는 것은 "이 편성은 싫다" 는 뜻이다.
   *
   * 끝난 경기 수를 함께 넣는 이유는 반대쪽 실수를 막기 위해서다. 답만
   * 넣으면 두 시간 동안 한 번 나왔던 조합은 영영 다시 못 나온다 —
   * 열두 명이 돌다 보면 같은 넷이 같은 코트에 다시 걸릴 만하다. 경기가
   * 하나 끝나면(세상이 실제로 움직이면) 다시 제안할 수 있다.
   */
  key: string
}

/**
 * 지금 채워야 할 코트 **하나**와 거기 넣을 사람들. 없으면 null.
 *
 * ── 왜 한 번에 하나인가 ────────────────────────────────────────────
 * 코트 셋이 비어 있으면 셋을 한꺼번에 만들고 싶어지지만, 그러면 같은
 * 사람이 세 코트에 들어간다 — `suggestMatch` 는 **이미 저장된 경기**만
 * 보고 누가 묶였는지 판단하므로, 아직 안 보낸 두 번째·세 번째 제안은
 * 첫 제안이 데려간 사람을 다시 고른다. 하나 만들고, 그 결과가 목록에
 * 돌아온 뒤, 그 위에서 다음을 계산한다. 느리지만 틀리지 않는다.
 *
 * ── 공용 대기를 코트 수에서 뺀다 ───────────────────────────────────
 * 코트를 아직 안 정한 경기는 **먼저 비는 코트가 집어간다**(`court.ts`).
 * 코트가 셋이고 공용 대기가 둘이면 실제로 비는 자리는 하나다. 이걸 안
 * 빼면 공용 대기 둘이 있는데도 코트마다 하나씩 더 만들어 대기가 다섯이
 * 된다 — 사람은 열둘뿐인데.
 *
 * 사람이 모자라면 `suggestMatch` 가 null 을 내고 여기도 null 이다.
 * **조용히 아무것도 안 한다.** 여섯 명이 온 날 "편성할 사람이 모자랍니다"
 * 를 15초마다 띄우는 건 고장이지 안내가 아니다.
 */
export function planAutoQueue(input: AutoQueueInput): AutoQueuePlan | null {
  const { courts, matches, members, squad } = input
  if (squad <= 0) return null

  /*
   * ── 빈 코트가 먼저다 ─────────────────────────────────────────────
   *
   * 처음에는 '대기 경기가 없는 코트' 만 보고 코트 번호 순으로 채웠는데,
   * 그러면 **지금 경기 중인 1번 코트가 텅 빈 3번 코트보다 먼저** 찬다.
   * 실제로 그랬다 — 12명이 오면 1번 코트 대기와 2번 코트 대기를 채우는
   * 데 여덟이 묶여, 아무도 안 서 있는 3번 코트는 끝내 비어 있었다.
   *
   * 급한 정도가 다르다. **빈 코트는 지금 사람이 필요하고**, 경기 중인
   * 코트는 그 경기가 끝난 뒤에 필요하다. 사람이 모자란 날에는 그 차이가
   * 곧 "코트 하나를 놀리느냐" 가 된다.
   *
   * 그래서 대기가 없는 코트를 고른 뒤 **비어 있는 것을 앞으로** 옮긴다.
   * 같은 무리 안에서는 코트 순서를 지킨다(정렬이 안정적이다).
   */
  const isPlaying = (courtId: string) =>
    matches.some((m) => m.status === 'live' && m.court_id === courtId)

  const uncovered = courts
    .filter((c) => !matches.some((m) => m.status === 'scheduled' && m.court_id === c.id))
    .sort((a, b) => Number(isPlaying(a.id)) - Number(isPlaying(b.id)))

  // 앞에서부터 공용 대기가 덮는다 — 그 뒤 첫 코트가 진짜로 빈 자리다
  const target = uncovered[unassignedQueue(matches).length]
  if (!target) return null

  const picked = suggestMatch(members, matches, squad)
  if (!picked) return null

  const { teamA, teamB, ready } = splitTeams(picked, squad)
  if (!ready) return null

  const name = new Map(members.map((m) => [m.id, m.displayName]))
  return {
    courtId: target.id,
    playersA: teamA,
    playersB: teamB,
    key: planKey(
      target.id,
      [...teamA, ...teamB].map((id) => name.get(id) ?? id),
      matches,
    ),
  }
}

/**
 * 열쇠 만들기 — 사람은 **이름**으로 적는다.
 *
 * 편성 계산은 memberId 로 오가지만 열쇠는 이름을 쓴다. 이유는 하나:
 * `match_overview` 가 내려주는 선수 정보가 이름뿐이라, 이미 만들어진
 * 경기에서도 같은 열쇠를 되짚을 수 있어야 하기 때문이다
 * (`autoQueueKeyOfMatch`). `busy.ts` 도 같은 이유로 이름을 기준으로 삼는다.
 */
function planKey(
  courtId: string,
  playerNames: readonly string[],
  matches: readonly MatchOverviewRow[],
): string {
  return `${courtId}|${[...playerNames].sort().join(',')}|${playedCount(matches)}`
}

/**
 * 이미 만들어진 경기를 **그 경기를 낳았을 열쇠**로 되짚는다.
 *
 * 총무가 자동 예약을 × 로 지웠을 때 쓴다. 지우면 세상이 '만들기 직전' 으로
 * 돌아가 똑같은 제안이 다시 나오는데, 이 열쇠를 문지기에게 "해 봤다" 로
 * 넣어 두면 **되살아나지 않는다.** 지웠다는 것은 "이 편성은 싫다" 는 뜻이다.
 *
 * 화면을 새로 연 뒤에 지워도 통해야 해서 추론이 아니라 계산으로 푼다 —
 * 새로 연 화면의 문지기는 그 편성을 만든 적이 없어 기억이 비어 있다.
 *
 * 코트를 안 정한 경기는 null 이다(공용 대기는 자동 예약이 만들지 않는다).
 */
export function autoQueueKeyOfMatch(
  m: MatchOverviewRow,
  matches: readonly MatchOverviewRow[],
): string | null {
  if (!m.court_id) return null
  return planKey(m.court_id, [...(m.players_a ?? []), ...(m.players_b ?? [])], matches)
}

/**
 * 지금까지 끝난 경기 수 — 열쇠에 들어가는 '세상이 움직였다' 의 눈금.
 *
 * 무효(`void`)도 센다. 되돌릴 수 없이 지나간 사건이면 눈금이 움직여야
 * 한다는 뜻은 같다. 진행 중·대기는 안 센다 — 그 수는 자동 예약 자신이
 * 바꾸는 값이라 넣으면 스스로를 다시 부르는 열쇠가 된다.
 */
function playedCount(matches: readonly MatchOverviewRow[]): number {
  return matches.filter((m) => m.status === 'finished' || m.status === 'void').length
}

/**
 * 사람이 편성을 고친 뒤 남길 이름.
 *
 * **'자동' 은 지운다.** 배지가 하는 말은 "앱이 멋대로 짠 편성이 네 명을
 * 묶어 놨다 — 그러니 접힌 줄에 숨기지 말고 한 번에 지울 수 있게 두자"
 * 였다(`AutoQueueRow` 주석). 총무가 그 넷을 들여다보고 고친 순간 그 전제가
 * 사라진다. 이제 그 편성은 사람이 고른 것이고, 그 위에 '자동' 을 남겨 두면
 * 앱이 남의 결정을 자기 것이라고 우기는 셈이다.
 *
 * 같은 규율이 이미 경기 짜기 화면에 있다 — 이름을 한 번이라도 누르면
 * "적게 친 사람부터 골라 뒀습니다" 가 사라진다. *사람이 자기 손으로 짠
 * 목록 위에 앱의 변명이 남아 있으면 그건 설명이 아니라 잔소리다.*
 *
 * 자동 예약이 이 편성을 되살리지는 않는다. `planAutoQueue` 는 **대기 경기가
 * 없는 코트**만 고르는데, 고친 경기는 그 코트에 그대로 서 있기 때문이다.
 * 이름(`autoQueueKeyOfMatch`)이 선수 이름으로 만들어져 편성이 바뀌면 열쇠도
 * 바뀌지만, 열쇠는 '코트를 고른 뒤' 에야 쓰인다 — 코트가 안 뽑히면 열쇠까지
 * 가지 않는다.
 *
 * 사람이 직접 붙인 다른 이름은 그대로 둔다 — 그건 고치기가 건드릴 것이 아니다.
 */
export function labelAfterHumanEdit(label: string | null | undefined): string | null {
  return label === AUTO_QUEUE_LABEL ? null : (label ?? null)
}
