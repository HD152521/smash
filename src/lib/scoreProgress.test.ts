import { describe, expect, it } from 'vitest'
import { buildProgress, type ScoreEvent } from './scoreProgress'

/** 'AABBA' 처럼 득점 순서를 문자열로 적는다 */
function events(seq: string, opts: { voided?: number[] } = {}): ScoreEvent[] {
  return [...seq].map((c, i) => ({
    id: i + 1,
    side: c === 'A' ? ('A' as const) : ('B' as const),
    delta: 1,
    voided: opts.voided?.includes(i + 1) ?? false,
  }))
}

describe('buildProgress', () => {
  it('랠리마다 누적 점수를 쌓는다', () => {
    const p = buildProgress(events('AAB'))
    expect(p.rallies).toEqual([
      { index: 1, side: 'A', a: 1, b: 0 },
      { index: 2, side: 'A', a: 2, b: 0 },
      { index: 3, side: 'B', a: 2, b: 1 },
    ])
    expect(p.finalA).toBe(2)
    expect(p.finalB).toBe(1)
  })

  it('경기가 없으면 빈 진행이다', () => {
    const p = buildProgress([])
    expect(p.rallies).toEqual([])
    expect(p.finalA).toBe(0)
    expect(p.finalB).toBe(0)
  })

  it('취소된 득점은 없던 일로 친다', () => {
    // 심판이 잘못 눌렀다가 취소한 흔적이 그래프에 남으면 안 된다
    const p = buildProgress(events('AAB', { voided: [2] }))
    expect(p.rallies.map((r) => `${r.a}:${r.b}`)).toEqual(['1:0', '1:1'])
    expect(p.finalA).toBe(1)
  })

  it('id 순서대로 되짚는다 (도착 순서가 뒤섞여도)', () => {
    // 원장은 bigint identity 라 id 가 진짜 순서다.
    // 배열이 뒤집혀 와도 그래프는 실제 경기 순서를 그려야 한다.
    const shuffled: ScoreEvent[] = [
      { id: 3, side: 'B', delta: 1, voided: false },
      { id: 1, side: 'A', delta: 1, voided: false },
      { id: 2, side: 'A', delta: 1, voided: false },
    ]
    expect(buildProgress(shuffled).rallies.map((r) => r.side)).toEqual(['A', 'A', 'B'])
  })

  it('연속 득점을 팀별로 센다', () => {
    const p = buildProgress(events('AAABBBBA'))
    expect(p.longestRunA).toBe(3)
    expect(p.longestRunB).toBe(4)
  })

  it('역전 횟수를 센다', () => {
    // A 가 먼저 앞서다 → B 가 뒤집고 → A 가 다시 뒤집는다 = 2회
    const p = buildProgress(events('ABBAA'))
    expect(p.leadChanges).toBe(2)
  })

  it('앞서다 동점이 되는 것만으로는 역전이 아니다', () => {
    const p = buildProgress(events('AB'))
    expect(p.leadChanges).toBe(0)
    expect(p.ties).toBe(1)
  })

  it('0:0 은 동점으로 세지 않는다', () => {
    // 시작 상태를 동점으로 세면 모든 경기가 최소 1회로 잡힌다
    expect(buildProgress([]).ties).toBe(0)
    expect(buildProgress(events('A')).ties).toBe(0)
  })

  it('정정(-1)은 점수를 되돌리되 연속 득점을 끊는다', () => {
    const evs: ScoreEvent[] = [
      { id: 1, side: 'A', delta: 1, voided: false },
      { id: 2, side: 'A', delta: 1, voided: false },
      { id: 3, side: 'A', delta: -1, voided: false },
      { id: 4, side: 'A', delta: 1, voided: false },
    ]
    const p = buildProgress(evs)
    expect(p.finalA).toBe(2)
    // 2연속 뒤 정정이 끼었으므로 그 뒤는 새로 센다
    expect(p.longestRunA).toBe(2)
  })

  it('실제 경기 한 판을 끝까지 되짚는다', () => {
    const seq = 'AABABBBAAABABABABABABA'.slice(0, 21)
    const p = buildProgress(events(seq))
    expect(p.rallies).toHaveLength(21)
    expect(p.finalA + p.finalB).toBe(21)
    expect(p.rallies.at(-1)).toMatchObject({ a: p.finalA, b: p.finalB })
  })
})
