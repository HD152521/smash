/**
 * 점수 진행 — 랠리 하나하나를 되짚는다.
 *
 * 최종 점수만 보면 21:19 도 21:5 도 그냥 '이겼다' 다. 실제로 궁금한 건
 * "언제 벌어졌고 언제 따라붙었나" 다. 원장(score_events)에 득점 순서가
 * 그대로 남아 있으니 그걸 그대로 펼친다.
 *
 * 취소된 득점(voided)은 없던 일이다. 남겨두면 그래프가 실제 경기와
 * 어긋나고, 심판이 잘못 눌렀다가 취소한 흔적이 기록으로 굳어버린다.
 */

export type Side = 'A' | 'B'

export interface ScoreEvent {
  /** bigint identity — 들어온 순서 그대로다. created_at 은 같은 밀리초가 겹칠 수 있다. */
  id: number
  side: Side
  delta: number
  voided: boolean
}

export interface Rally {
  /** 몇 번째 랠리인가 (1부터) */
  index: number
  side: Side
  /** 이 랠리가 끝난 시점의 누적 점수 */
  a: number
  b: number
}

export interface Progress {
  rallies: Rally[]
  finalA: number
  finalB: number
  /** 한 팀이 연속으로 몇 점까지 냈나 */
  longestRunA: number
  longestRunB: number
  /** 앞서던 팀이 바뀐 횟수 */
  leadChanges: number
  /** 동점이 된 횟수 (0:0 은 세지 않는다) */
  ties: number
}

export function buildProgress(events: readonly ScoreEvent[]): Progress {
  const live = events.filter((e) => !e.voided).sort((x, y) => x.id - y.id)

  const rallies: Rally[] = []
  let a = 0
  let b = 0
  let longestRunA = 0
  let longestRunB = 0
  let runSide: Side | null = null
  let runLength = 0
  let leadChanges = 0
  let ties = 0
  /**
   * 마지막으로 '앞섰던' 팀. 동점에서는 갱신하지 않는다.
   * 동점마다 0 으로 지워버리면 A 리드 → 동점 → B 리드 가 역전으로 안 잡힌다.
   * 배드민턴에서 역전은 거의 다 동점을 지나가므로 그러면 전부 0 이 된다.
   */
  let lastLead = 0

  for (const e of live) {
    if (e.side === 'A') a += e.delta
    else b += e.delta

    rallies.push({ index: rallies.length + 1, side: e.side, a, b })

    // 연속 득점은 '점수를 올린' 랠리만 센다. 정정(-1)은 흐름이 아니다.
    if (e.delta > 0) {
      if (runSide === e.side) runLength += 1
      else {
        runSide = e.side
        runLength = 1
      }
      if (e.side === 'A') longestRunA = Math.max(longestRunA, runLength)
      else longestRunB = Math.max(longestRunB, runLength)
    } else {
      runSide = null
      runLength = 0
    }

    const next = a === b ? 0 : a > b ? 1 : -1
    if (next === 0) {
      // 0:0 에서 시작하므로 첫 득점 전까지는 동점으로 세지 않는다
      if (a > 0 || b > 0) ties += 1
    } else {
      if (lastLead !== 0 && next !== lastLead) leadChanges += 1
      lastLead = next
    }
  }

  return { rallies, finalA: a, finalB: b, longestRunA, longestRunB, leadChanges, ties }
}
