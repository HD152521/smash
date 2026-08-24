import { describe, expect, it } from 'vitest'
import type { CourtRow, MatchOverviewRow } from '@/types/database'
import { buildSchedule, isUpNext, matchTitle, myMatchRole, queuePosition } from './schedule'

const courts = [
  { id: 'c1', name: '1번 코트' },
  { id: 'c2', name: '2번 코트' },
] as CourtRow[]

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    label: null,
    status: 'scheduled',
    source: 'live',
    score_a: 0,
    score_b: 0,
    winner_side: null,
    queue_order: 0,
    started_at: null,
    finished_at: null,
    edited_at: null,
    created_at: null,
    group_a_id: 'g1',
    group_a_name: '1조',
    group_a_joker: true,
    target_a: 11,
    deuce_a: false,
    max_a: null,
    group_b_id: 'g2',
    group_b_name: '2조',
    group_b_joker: false,
    target_b: 21,
    deuce_b: false,
    max_b: null,
    players_a: null,
    players_b: null,
    referees: null,
    ...over,
  }
}

describe('buildSchedule', () => {
  it('코트를 안 정한 예정 경기를 따로 모은다', () => {
    const s = buildSchedule([match({ id: 'a' }), match({ id: 'b', court_id: 'c1' })], courts)
    expect(s.unassigned.map((m) => m.id)).toEqual(['a'])
    expect(s.courts[0]!.waiting.map((m) => m.id)).toEqual(['b'])
    expect(s.courts[1]!.waiting).toEqual([])
  })

  it('코트마다 진행 중인 경기는 하나만 잡는다', () => {
    const s = buildSchedule(
      [
        match({ id: 'live', status: 'live', court_id: 'c1' }),
        match({ id: 'wait', court_id: 'c1' }),
      ],
      courts,
    )
    expect(s.courts[0]!.live?.id).toBe('live')
    expect(s.courts[0]!.waiting.map((m) => m.id)).toEqual(['wait'])
    expect(s.courts[1]!.live).toBeNull()
  })

  it('끝난 경기와 무효 경기는 대진표에 안 나온다', () => {
    // 대진표는 '앞으로 할 것' 만 본다. 끝난 건 경기 기록이 맡는다.
    const s = buildSchedule(
      [
        match({ id: 'done', status: 'finished', court_id: 'c1' }),
        match({ id: 'void', status: 'void' }),
        match({ id: 'next' }),
      ],
      courts,
    )
    expect(s.scheduledCount).toBe(1)
    expect(s.unassigned.map((m) => m.id)).toEqual(['next'])
    expect(s.courts[0]!.waiting).toEqual([])
  })

  it('진행 중 경기 수를 센다', () => {
    const s = buildSchedule(
      [match({ status: 'live', court_id: 'c1' }), match({ status: 'live', court_id: 'c2' })],
      courts,
    )
    expect(s.liveCount).toBe(2)
  })

  it('코트가 없으면 전부 미배정으로 남는다', () => {
    const s = buildSchedule([match({ id: 'a' })], [])
    expect(s.courts).toEqual([])
    expect(s.unassigned).toHaveLength(1)
  })

  it('모르는 코트 id 는 엉뚱한 줄에 끼지 않는다', () => {
    // 실제로 코트를 지우면 FK 가 on delete set null 이라 미배정으로 돌아온다.
    // 그래도 모르는 id 를 만났을 때 아무 코트 줄에나 밀어 넣지는 않는지 못 박는다.
    const s = buildSchedule([match({ id: 'orphan', court_id: 'gone' })], courts)
    expect(s.scheduledCount).toBe(1)
    expect(s.unassigned).toEqual([])
    expect(s.courts.every((c) => c.waiting.length === 0)).toBe(true)
  })
})

describe('matchTitle', () => {
  it('조 이름을 한 줄로 만든다', () => {
    expect(matchTitle(match({}))).toBe('1조 vs 2조')
  })
})

describe('myMatchRole', () => {
  it('뛰는 경기를 골라낸다 (양쪽 팀 모두)', () => {
    expect(myMatchRole(match({ players_a: ['장용식', '김코트'] }), '장용식')).toBe('player')
    expect(myMatchRole(match({ players_b: ['장용식'] }), '장용식')).toBe('player')
  })

  it('심판으로 걸린 경기도 골라낸다', () => {
    expect(myMatchRole(match({ referees: ['장용식'] }), '장용식')).toBe('referee')
  })

  it('겸하면 뛰는 쪽이 이긴다 — 그때 있어야 할 곳은 코트 안이다', () => {
    const m = match({ players_a: ['장용식'], referees: ['장용식'] })
    expect(myMatchRole(m, '장용식')).toBe('player')
  })

  it('상관없는 경기와 이름을 모를 때는 null', () => {
    expect(myMatchRole(match({ players_a: ['남'] }), '장용식')).toBeNull()
    expect(myMatchRole(match({ players_a: ['장용식'] }), undefined)).toBeNull()
  })
})

describe('queuePosition — 알림이 나가는 자리와 같은 정의', () => {
  const waiting = [match({ id: 'a' }), match({ id: 'b' }), match({ id: 'c' })]

  it('맨 앞이 1번이다', () => {
    expect(queuePosition(waiting, 'a')).toBe(1)
    expect(queuePosition(waiting, 'c')).toBe(3)
  })

  it('줄에 없으면 null', () => {
    expect(queuePosition(waiting, 'zzz')).toBeNull()
    expect(queuePosition(waiting, null)).toBeNull()
  })

  it('진행 중인 경기는 줄에 없다 — 기다리는 게 아니라 뛰는 중이다', () => {
    const s = buildSchedule(
      [
        match({ id: 'live', status: 'live', court_id: 'c1' }),
        match({ id: 'next', court_id: 'c1' }),
      ],
      courts,
    )
    expect(queuePosition(s.courts[0]!.waiting, 'next')).toBe(1)
    expect(queuePosition(s.courts[0]!.waiting, 'live')).toBeNull()
  })

  it('임계값 이하면 곧 차례다', () => {
    expect(isUpNext(2, 2)).toBe(true)
    expect(isUpNext(3, 2)).toBe(false)
    expect(isUpNext(null, 2)).toBe(false)
  })
})
