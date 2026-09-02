import type { MatchOverviewRow, PlayerGender, PlayerGrade } from '@/types/database'
import { buildBusyMap } from './busy'
import type { MatchKind, MatchKindFilter } from './gender'
import { gradeRankOrUnknown } from './grade'

/**
 * 다음 경기에 누가 들어갈지 **앱이 먼저 정한다.**
 *
 * 이 파일이 있는 이유는 이 앱의 존재 이유와 같다. 12명이 두 시간을 돌아가며
 * 치는 판을 공평하게 굴리는 건 사람 머리로 안 된다 — 총무가 제일 듣기 싫은
 * 말이 "나 아까부터 기다렸는데" 인데, 그 말은 총무가 게을러서가 아니라
 * 사람이 열두 명의 판수를 머릿속에 담을 수 없어서 나온다. 세는 일은 기계가
 * 하고 사람은 예외만 본다.
 *
 * 그래서 이건 **버튼이 아니라 기본값**이다. 경기 짜기 화면을 열면 네 명이
 * 이미 들어가 있고, 그대로 좋으면 한 번 누르면 끝난다. `[자동으로 짜기]`
 * 버튼을 옆에 달았다면 아무도 안 눌렀을 것이다 — 누를 이유가 없는 버튼은
 * 화면에 글자가 하나 는 것일 뿐이다.
 *
 * ── 고르는 규칙 ────────────────────────────────────────────────────
 * 사용자가 정한 말 그대로다: **"급수를 우선으로 하되, 1~2게임 이상
 * 차이나면 안 친 사람 먼저."** 두 기준의 우열이 상황에 따라 뒤집힌다는
 * 뜻이라, 점수를 합쳐 한 줄로 세우지 않고 **두 단계**로 나눠 푼다.
 *
 *   1단계(판수) — 판수가 뒤처진 사람만 남긴다. 여기서 걸러진 사람은
 *                 급수가 아무리 잘 맞아도 이번 판에 못 들어간다.
 *   2단계(급수) — 남은 사람 안에서만 급수를 맞춘다.
 *
 * 점수를 더하는 방식(`판수 × w1 + 급수차 × w2`)을 안 쓴 이유: 가중치가
 * 조금만 어긋나도 "3판 뒤처진 사람이 급수 때문에 또 밀렸다" 가 생기는데,
 * 그건 이 기능이 없애려던 바로 그 상황이다. 계층으로 자르면 그 일이
 * **구조적으로** 못 일어난다.
 *
 * ── 종목(남복 · 여복 · 혼복)이 들어가는 자리 ───────────────────────
 * 사용자의 말: *"기본적으로는 남복 여복 이렇게를 잡고, 여복이 안 되는
 * 경우가 많아 — 남자가 많더라고. 그럴 때 어쩔 수 없이 혼복을 들어가게
 * 하자. 근데 혼복은 남남 여여 끼리 실력이 비슷해야 좋아."*
 *
 * 종목은 **1단계 아래**에 들어간다. 계층을 먼저 자르고 그 안에서 종목을
 * 본다 — 순서가 뒤집히면 "혼복 하나 만들자고 방금 3판 친 사람을 또
 * 넣는" 일이 생긴다. 그건 판수 계층을 만든 이유를 통째로 없앤다.
 *
 *   `'any'`  계층 안에서 **같은 성별 넷(남복·여복)을 먼저** 찾고, 없으면
 *            혼복(남2·여2), 그것도 안 되면 종목을 안 보고 고른다.
 *            마지막 갈래가 있어야 성별을 아직 안 적은 명단에서도 코트가
 *            빈 채로 남지 않는다 (그리고 그때 동작이 종목 도입 전과 같다).
 *   지정 시  그 종목만. 성별을 모르는 사람은 **후보에서 빠진다** —
 *            모르는 것을 짐작해 '남복' 이라고 적을 수는 없다. 대신 화면이
 *            몇 명이 빠졌는지 말해야 한다 (`excludedByKind`).
 *
 * ── 안 하는 것 ─────────────────────────────────────────────────────
 * · 대기열에 자동으로 넣지 않는다. 화면에 채워 놓는 데서 멈춘다 — 자동
 *   투입은 서버 RPC 와 잠금이 필요하고, 두 사람이 동시에 짜면 같은 사람이
 *   두 코트에 들어간다.
 * · 같은 사람끼리 연속으로 만나는 것을 피하지 않는다. `players_a/b` 에
 *   데이터는 이미 있어서 할 수는 있지만(직전 경기의 짝을 감점),
 *   판수·급수가 먼저 자리를 잡은 뒤에 얹어야 순서가 안 꼬인다.
 *   → `bestGradeFit` 의 동점 처리에 얹을 자리를 남겨 뒀다.
 */

/**
 * 판수가 이만큼 벌어지면 **급수를 이긴다.**
 *
 * 사용자의 말은 "1~2게임 이상 차이나면" 이었다. 2 로 둔다 — 1 판 차이는
 * 두 판만 돌면 저절로 뒤집히는 일상적인 들쭉날쭉이라, 거기까지 판수를
 * 앞세우면 급수가 전혀 안 맞는 경기가 계속 나온다. 2 판은 다르다.
 * 그때부터는 본인이 센다.
 *
 * 조정될 값이라 이름을 붙여 뒀다. 값을 키우면 급수가 더 자주 이기고,
 * 1 로 줄이면 판수가 거의 항상 이긴다.
 */
export const FAIRNESS_GAP = 2

/** 편성 계산에 필요한 최소한의 모양 — `MemberSummary` 가 그대로 들어온다 */
export interface AutoMatchCandidate {
  id: string
  /** 경기 기록은 이름으로만 사람을 부른다 (`busy.ts` 와 같은 기준) */
  displayName: string
  /** null 은 '모른다'. **후보에서 빼지 않는다** — 아래 `bestGradeFit` 참고 */
  grade: PlayerGrade | null
  /**
   * null 은 '모른다'. 급수와 달리 **종목이 지정되면 후보에서 뺀다** —
   * 급수는 몰라도 한가운데로 메워 줄을 세울 수 있지만 성별은 메울 수 없다.
   * 짐작해서 채우면 '남복' 이라고 적힌 경기에 여자가 들어간다.
   */
  gender: PlayerGender | null
}

/** 계산하는 동안만 쓰는 모양 — 후보 한 사람의 판수·급수·성별·원래 자리 */
interface Ranked {
  id: string
  plays: number
  rank: number
  gender: PlayerGender | null
  /** 명단에서 몇 번째였나. 마지막 동점 기준이자 결과를 안 흔들리게 하는 닻 */
  order: number
}

/** 계층 안에서 `need` 명을 고르는 방법 — 종목을 보느냐 마느냐가 여기서 갈린다 */
type TierPicker = (tier: readonly Ranked[], need: number, anchor: number | null) => Ranked[]

/**
 * 오늘 누가 몇 판 했나 — 이름 → 판수.
 *
 * 무효(`void`)만 뺀다. 끝난 경기는 물론이고 **지금 뛰는 중·이미 편성된
 * 경기도 센다.** 편성된 순간 그 사람의 몫은 이미 쓰였고, 그 판이 끝나 다시
 * 후보가 될 때 0 부터 세면 방금 친 사람이 곧바로 또 뽑힌다.
 *
 * 화면도 이 숫자를 그대로 이름 옆에 그린다 — 제안의 근거는 제안과 같은
 * 셈에서 나와야 한다. 근거가 따로 계산되면 "2판이라며 왜 얘가 빠졌지" 가
 * 생기고, 그러면 총무는 제안을 매번 갈아엎게 된다.
 */
export function countPlays(matches: readonly MatchOverviewRow[]): Map<string, number> {
  const plays = new Map<string, number>()
  for (const m of matches) {
    if (m.status === 'void') continue
    for (const name of [...(m.players_a ?? []), ...(m.players_b ?? [])]) {
      plays.set(name, (plays.get(name) ?? 0) + 1)
    }
  }
  return plays
}

/**
 * 종목을 지정하면 제안에서 빠지는 사람 수 — 성별을 안 적은 사람.
 *
 * **화면이 이 숫자를 말해야 한다.** 종목을 고른 순간 성별 미상인 사람은
 * 제안에 영영 안 뜨는데, 아무 말도 없으면 총무는 그 사람이 왜 안 나오는지
 * 알 길이 없다 — 그리고 그건 그 사람이 오늘 경기를 못 하게 되는 일이다.
 * 판단은 여기 있고 화면은 숫자를 그리기만 한다 (`busyCount` 와 같은 규율).
 */
export function excludedByKind(
  members: readonly AutoMatchCandidate[],
  kind: MatchKindFilter,
): number {
  if (kind === 'any') return 0
  return members.filter((m) => m.gender === null).length
}

/**
 * 지금 고를 수 있는 사람 — 다른 경기에 안 묶인 사람.
 *
 * '묶였다' 의 판단은 `busy.ts` 하나뿐이다. 화면이 흐리게 만드는 기준과
 * 제안이 거르는 기준이 갈리면 **화면이 못 누르게 막아 둔 사람을 제안이
 * 채워 넣는다** — 총무가 손도 못 대는 편성이 기본값으로 뜬다.
 */
function availableCandidates(
  members: readonly AutoMatchCandidate[],
  matches: readonly MatchOverviewRow[],
  plays: ReadonlyMap<string, number>,
): Ranked[] {
  const busy = buildBusyMap(matches)
  const free: Ranked[] = []
  for (const [order, m] of members.entries()) {
    if (busy.has(m.displayName)) continue
    free.push({
      id: m.id,
      plays: plays.get(m.displayName) ?? 0,
      rank: gradeRankOrUnknown(m.grade),
      gender: m.gender,
      order,
    })
  }
  return free
}

/**
 * 1단계 — 판수가 뒤처진 사람이 먼저 자리를 가져간다.
 *
 * 최소 판수 min 에서 `FAIRNESS_GAP` 만큼 벌어지기 **전까지**를 한 계층으로
 * 본다(min+1 까지). 계층이 인원수를 채우면 그 안에서만 급수로 고른다 —
 * 2 판 이상 뒤처진 사람은 급수가 아무리 좋아도 못 들어온다.
 *
 * ⚠ 계층이 인원수에 **못 미칠 때**가 이 함수의 진짜 어려운 부분이다.
 * 처음에는 판수 상한만 한 칸씩 넓혔는데, 그러면 여덟 명 중 넷이 코트에
 * 있는 흔한 상황에서 규칙이 통째로 뒤집혔다 — 0판인 사람 하나와 2판인
 * 사람 넷이 남으면, 넓힌 계층 안에서 급수만 보고 2판짜리 넷을 골라
 * **0판인 사람을 또 앉혀 뒀다.** 없애려던 바로 그 장면이다.
 *
 * 그래서 넓히는 게 아니라 **자리를 먼저 준다.** 앞 계층 사람은 전원
 * 확정이고, 남는 자리만 다음 계층에서 같은 규칙으로 다시 고른다. 이러면
 * 자리가 모자라 밀리는 사람은 언제나 **더 많이 친 쪽**이다.
 *
 * 남는 자리를 채울 때는 **이미 확정된 사람들의 급수**를 기준(anchor)으로
 * 넘긴다. 찍어 보고서야 안 문제였다 — 기준 없이 뒤 계층에서 한 명만
 * 고르면 폭이 늘 0 이라 정렬 맨 앞, 즉 **가장 센 사람이 매번 뽑혔다.**
 * 초심 셋에 S 하나가 끼는 편성이 계속 나온다. 남는 자리는 센 사람 자리가
 * 아니라 **앞사람들에 어울리는 자리**다.
 *
 * ⚠ 남는 자리를 채울 때는 종목을 **안 본다** (`bestGradeFit` 고정). 뒤
 * 계층 호출은 앞에서 확정된 사람들의 성별을 모르는데, 모른 채로 "남자
 * 둘"을 채우면 남3여1 이 나온다. 게다가 여기까지 왔다는 건 계층이 이미
 * 모자란 상황이라, 종목을 맞추려면 더 많이 친 사람을 끌어와야 한다.
 * 그건 판수 규칙을 이기는 일이고 **종목은 판수보다 아래다.**
 */
function fairPick(
  candidates: readonly Ranked[],
  need: number,
  pickInTier: TierPicker = bestGradeFit,
  anchor: number | null = null,
): Ranked[] {
  if (candidates.length < need) return []

  const limit = Math.min(...candidates.map((c) => c.plays)) + FAIRNESS_GAP - 1
  const tier = candidates.filter((c) => c.plays <= limit)
  if (tier.length >= need) return pickInTier(tier, need, anchor)

  const rest = candidates.filter((c) => c.plays > limit)
  return [...tier, ...fairPick(rest, need - tier.length, bestGradeFit, meanRank(tier))]
}

/**
 * 앞 칸부터 차례로 비교해 더 작은 쪽. 배열끼리 `<` 로 비교하면 문자열로
 * 바뀌어 `[1, 2]` 가 `[1, 10]` 보다 크다고 나온다 — 숫자로 비교한다.
 */
function isBetter(a: readonly number[], b: readonly number[]): boolean {
  for (const [i, value] of a.entries()) {
    if (value !== b[i]) return value < b[i]!
  }
  return false
}

/** 이 사람들의 급수 한가운데 — 남는 자리를 채울 때 기준이 된다 */
function meanRank(people: readonly Ranked[]): number {
  return people.reduce((sum, p) => sum + p.rank, 0) / people.length
}

/**
 * 한 묶음이 얼마나 잘 맞나 — 작을수록 좋다.
 *
 * **급수 폭** → **기준(anchor)과의 거리** → **판수 합** 순이다. 폭이 첫
 * 칸인 이유는 그게 경기의 재미를 결정하기 때문이고, 판수가 마지막인 이유는
 * 판수가 이미 1단계에서 계층으로 걸러졌기 때문이다 — 여기 남은 판수 차이는
 * 최대 한 판이라 동점을 가르는 데만 쓴다.
 */
function fitScore(people: readonly Ranked[], anchor: number | null): [number, number, number] {
  const ranks = people.map((p) => p.rank)
  return [
    Math.max(...ranks) - Math.min(...ranks),
    anchor === null ? 0 : Math.abs(meanRank(people) - anchor),
    people.reduce((sum, p) => sum + p.plays, 0),
  ]
}

/**
 * 2단계 — 계층 안에서 급수가 가장 붙어 있는 네 명.
 *
 * 급수 순으로 세운 뒤 연속한 `need` 명씩 훑어 폭(맨 뒤 − 맨 앞)이 가장
 * 좁은 창을 고른다. 붙어 있는 사람끼리 묶는 게 급수 차를 줄이는 방법이라,
 * 떨어진 사람을 굳이 섞어 보는 경우의 수는 볼 필요가 없다.
 *
 * **급수를 모르는 사람은 여기서도 후보다.** 순위를 한가운데로 메워
 * (`gradeRankOrUnknown`) 다른 사람들과 똑같이 줄을 선다. 급수 없는 사람을
 * 걸렀다면 급수는 '선택 입력' 이 아니라 사실상 필수가 됐을 것이고, 안 적은
 * 사람은 영영 경기에 못 들어갔을 것이다.
 *
 * 폭이 같은 창이 여럿이면 **기준(anchor)에 가까운 쪽** → **판수 합이 적은
 * 쪽** → 명단 순서 순으로 고른다(`fitScore`). anchor 는 앞 계층에서 이미
 * 확정된 사람들의 급수 한가운데다(없으면 안 본다). (다음 단계에서 '직전
 * 경기와 같은 짝' 감점을 얹는다면 이 동점 처리에 한 항을 더하는 자리다.)
 */
function bestGradeFit(tier: readonly Ranked[], need: number, anchor: number | null): Ranked[] {
  const sorted = [...tier].sort((a, b) => a.rank - b.rank || a.plays - b.plays || a.order - b.order)

  let best: Ranked[] = []
  let bestScore: [number, number, number] = [Infinity, Infinity, Infinity]
  for (let i = 0; i + need <= sorted.length; i += 1) {
    const window = sorted.slice(i, i + need)
    const score = fitScore(window, anchor)
    if (isBetter(score, bestScore)) {
      best = window
      bestScore = score
    }
  }
  return best
}

// ── 종목 ──────────────────────────────────────────────────────────────

/** 그 성별인 사람만. **성별을 모르는 사람은 여기서 빠진다** */
function ofGender(pool: readonly Ranked[], gender: PlayerGender): Ranked[] {
  return pool.filter((p) => p.gender === gender)
}

/**
 * 종목 하나를 만들어 본다. 못 만들면 빈 배열.
 *
 * 남복·여복은 **후보 명단을 그 성별로 좁힌 뒤 1단계를 그대로 돌린다.**
 * 조건을 나중에 걸러 내지 않고 앞에서 좁히는 이유: 남복을 고른 순간
 * 여자의 판수는 이 편성과 아무 상관이 없다. "여자 한 명이 0판이라 계층이
 * 그 사람뿐" 인 상황에서 남복이 안 만들어지면 그건 버그다.
 */
function pickKind(
  pool: readonly Ranked[],
  need: number,
  kind: MatchKind,
  anchor: number | null = null,
): Ranked[] {
  if (kind === 'mens') return fairPick(ofGender(pool, 'male'), need, bestGradeFit, anchor)
  if (kind === 'womens') return fairPick(ofGender(pool, 'female'), need, bestGradeFit, anchor)
  return pickMixed(pool, need, anchor)
}

/**
 * 혼복 — **남자끼리 · 여자끼리 급수를 맞춰서 고른다.**
 *
 * 이게 혼복이 남복·여복과 다른 유일한 지점이다. 넷의 급수 합만 비슷하면
 * 된다고 보면 **S남 + 초심여 vs B남 + B여** 가 나온다. 합은 같지만 실제로는
 * 엉망인 경기다 — 코트에서 실제로 맞붙는 건 합이 아니라 **같은 성별끼리**다.
 *
 * 그래서 넷을 골라 놓고 나누는 게 아니라 **고를 때부터** 성별로 나눠 각각
 * 두 명씩 뽑는다. 각 뽑기가 이미 급수 폭을 최소로 하므로(`bestGradeFit`)
 * 두 남자의 차이와 두 여자의 차이가 그 자리에서 작아진다. 넷을 고른 뒤에
 * 나누기만 해서는 늦다 — 그때는 이미 S남과 초심여가 명단에 들어와 있다.
 *
 * 적은 쪽이 **먼저** 고른다. 여자가 둘뿐인 날 그 둘은 사실상 이미 정해져
 * 있고 남는 남자 자리가 거기 맞춰 가는 게 맞다 — 반대로 하면 남자 둘을
 * 먼저 박아 놓고 여자 쪽이 못 따라간다. (`fairPick` 의 "남는 자리는
 * 앞사람들에 어울리는 자리" 와 같은 규율이라 anchor 로 넘긴다.)
 */
function pickMixed(pool: readonly Ranked[], need: number, anchor: number | null): Ranked[] {
  const half = need / 2
  if (!Number.isInteger(half)) return []

  const men = ofGender(pool, 'male')
  const women = ofGender(pool, 'female')
  const [scarce, plenty] = men.length <= women.length ? [men, women] : [women, men]

  const first = fairPick(scarce, half, bestGradeFit, anchor)
  if (first.length < half) return []
  const second = fairPick(plenty, half, bestGradeFit, meanRank(first))
  if (second.length < half) return []
  return [...first, ...second]
}

/** 다 찬 묶음끼리만 견준다 — 둘 다 되면 잘 맞는 쪽, 완전 동점이면 앞(a) */
function betterFit(
  a: readonly Ranked[],
  b: readonly Ranked[],
  need: number,
  anchor: number | null,
): Ranked[] {
  if (a.length < need) return b.length < need ? [] : [...b]
  if (b.length < need) return [...a]
  return isBetter(fitScore(b, anchor), fitScore(a, anchor)) ? [...b] : [...a]
}

/**
 * `'any'` 일 때 계층 안에서 고르는 방법 — **같은 성별이 먼저, 혼복은 대안.**
 *
 * 사용자의 말 그대로다. 남복과 여복이 둘 다 되면 더 잘 맞는 쪽(급수 폭이
 * 좁은 쪽)을 고르고, 완전히 같으면 남복이 남는다 — 무작위를 안 써야 화면을
 * 다시 그릴 때 제안이 흔들리지 않는다.
 *
 * ⚠ 마지막 갈래(종목을 안 보고 고르기)를 반드시 남긴다. 성별을 아직 아무도
 * 안 적은 명단이나 남3여1 만 남은 시간대에서 이게 없으면 코트가 빈 채로
 * 남는다. 사용자는 `'아무나'` 를 골랐는데 종목을 못 만들었다고 경기를 안
 * 짜 주는 것은 그 선택을 뒤집는 일이다. (종목이 없던 때의 동작이 그대로
 * 남아 있는 자리이기도 하다.)
 */
const preferKind: TierPicker = (tier, need, anchor) => {
  const same = betterFit(
    pickKind(tier, need, 'mens', anchor),
    pickKind(tier, need, 'womens', anchor),
    need,
    anchor,
  )
  if (same.length === need) return same

  const mixed = pickKind(tier, need, 'mixed', anchor)
  if (mixed.length === need) return mixed

  return bestGradeFit(tier, need, anchor)
}

/**
 * 3단계 — 두 편을 가른다. **성별 균형이 먼저, 그 다음 급수 합.**
 *
 * 급수가 붙은 네 명을 골라 놔도 나누기를 잘못하면 S·A 대 C·D 가 된다.
 * 인원이 넷(복식)이나 둘(단식)뿐이라 가능한 편 가르기를 전부 세어 보는
 * 게 제일 짧고 확실하다 — 0번 사람을 늘 A편에 고정해(홀수 mask) 좌우가
 * 뒤집힌 같은 편성을 두 번 보지 않는다.
 *
 * **성별 균형이 급수보다 앞이다.** 혼복 넷(남2·여2)을 급수 합만 보고 가르면
 * 남남 대 여여 가 나올 수 있는데, 그건 혼복이 아니라 그냥 이상한 경기다.
 * 남자 수가 양 편에 같아지는 가르기를 먼저 고르고 그 안에서 급수 합을
 * 맞춘다. 남복·여복·성별 미상 편성에서는 이 값이 늘 0 이라 아무것도 안
 * 바뀐다 — 종목이 없던 때와 결과가 같다.
 *
 * 돌려주는 순서는 `splitTeams` 의 약속과 같다 — 앞 `squad` 명이 A편.
 */
function balancedSplit(picked: readonly Ranked[], squad: number): string[] {
  const need = squad * 2
  const men = (team: readonly Ranked[]) => team.filter((p) => p.gender === 'male').length
  const sum = (team: readonly Ranked[]) => team.reduce((s, p) => s + p.rank, 0)

  let bestScore: [number, number] = [Infinity, Infinity]
  let best: string[] = picked.map((p) => p.id)

  for (let mask = 1; mask < 1 << need; mask += 2) {
    const teamA = picked.filter((_, i) => (mask >> i) & 1)
    if (teamA.length !== squad) continue
    const teamB = picked.filter((_, i) => !((mask >> i) & 1))
    const score: [number, number] = [
      Math.abs(men(teamA) - men(teamB)),
      Math.abs(sum(teamA) - sum(teamB)),
    ]
    if (isBetter(score, bestScore)) {
      bestScore = score
      best = [...teamA, ...teamB].map((p) => p.id)
    }
  }
  return best
}

/**
 * 다음 경기 제안 — 고른 순서대로 memberId, 앞 `squad` 명이 A편.
 *
 * **사람이 모자라면 null 이다.** 셋으로 억지 편성을 내거나 이미 뛰는 사람을
 * 채워 넣지 않는다. 반쯤 채워진 제안은 총무가 고쳐야 할 것이 뭔지 안
 * 알려주면서 화면만 어지럽힌다 — 그럴 바에는 빈 화면이 정직하다.
 *
 * 종목을 지정했는데 못 만드는 경우도 **조용히 null** 이다. "여복을 만들 수
 * 없습니다" 를 띄우는 대신, 화면은 성별을 안 적은 사람이 몇인지만 미리 말해
 * 둔다(`excludedByKind`) — 그게 총무가 실제로 고칠 수 있는 것이다.
 */
export function suggestMatch(
  members: readonly AutoMatchCandidate[],
  matches: readonly MatchOverviewRow[],
  squad: number,
  kind: MatchKindFilter = 'any',
): string[] | null {
  const need = squad * 2
  if (need <= 0) return null

  const plays = countPlays(matches)
  const pool = availableCandidates(members, matches, plays)
  const picked = kind === 'any' ? fairPick(pool, need, preferKind) : pickKind(pool, need, kind)
  if (picked.length < need) return null

  return balancedSplit(picked, squad)
}
