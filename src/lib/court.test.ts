import { describe, expect, it } from 'vitest'
import { courtQueue, courtState, unassignedQueue } from './court'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

function court(id: string, name = `${id}번 코트`): CourtRow {
  return { id, tournament_id: 't1', name, sort_order: 0, created_at: '2026-01-01' }
}

function match(overrides: Partial<MatchOverviewRow> & { id: string }): MatchOverviewRow {
  return {
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    label: null,
    status: 'scheduled',
    source: null,
    score_a: 0,
    score_b: 0,
    winner_side: null,
    scored: null,
    queue_order: 0,
    started_at: null,
    finished_at: null,
    edited_at: null,
    created_at: '2026-01-01',
    group_a_id: null,
    group_a_name: 'A조',
    group_a_joker: false,
    target_a: 21,
    deuce_a: true,
    max_a: 30,
    group_b_id: null,
    group_b_name: 'B조',
    group_b_joker: false,
    target_b: 21,
    deuce_b: true,
    max_b: 30,
    players_a: null,
    players_b: null,
    referees: null,
    ...overrides,
  }
}

describe('courtQueue — 코트 하나의 진행/대기를 가른다 (공용 대기는 안 섞는다)', () => {
  it('이 코트에 배정된 진행 중 경기를 live 로 뽑는다', () => {
    const c = court('c1')
    const live = match({ id: 'm1', court_id: 'c1', status: 'live' })
    const q = courtQueue(c, [live])
    expect(q.live).toBe(live)
  })

  it('진행 중 경기가 없으면 live 는 null 이다', () => {
    const q = courtQueue(court('c1'), [match({ id: 'm1', court_id: 'c2', status: 'live' })])
    expect(q.live).toBeNull()
  })

  it('이 코트에 배정된 예정 경기만 own 에 들어간다', () => {
    const own = match({ id: 'm1', court_id: 'c1', status: 'scheduled' })
    const q = courtQueue(court('c1'), [own])
    expect(q.own).toEqual([own])
  })

  it('코트를 안 정한 공용 대기 경기는 own 에 안 들어간다 — 이중 계산 금지', () => {
    const own = match({ id: 'm1', court_id: 'c1', status: 'scheduled' })
    const shared = match({ id: 'm2', court_id: null, status: 'scheduled' })
    const q = courtQueue(court('c1'), [own, shared])
    expect(q.own).toEqual([own])
  })

  it('다른 코트에 배정된 예정 경기는 own 에 안 뜬다', () => {
    const other = match({ id: 'm1', court_id: 'c2', status: 'scheduled' })
    const q = courtQueue(court('c1'), [other])
    expect(q.own).toEqual([])
  })

  it('끝난 경기는 own 이 아니라 finishedCount 로만 센다', () => {
    const finished = match({ id: 'm1', court_id: 'c1', status: 'finished' })
    const q = courtQueue(court('c1'), [finished])
    expect(q.own).toEqual([])
    expect(q.finishedCount).toBe(1)
  })

  it('다른 코트에서 끝난 경기는 이 코트의 finishedCount 에 안 들어간다', () => {
    const finished = match({ id: 'm1', court_id: 'c2', status: 'finished' })
    const q = courtQueue(court('c1'), [finished])
    expect(q.finishedCount).toBe(0)
  })

  it('무효 처리된 경기는 own 도 finishedCount 도 아니다', () => {
    const voided = match({ id: 'm1', court_id: 'c1', status: 'void' })
    const q = courtQueue(court('c1'), [voided])
    expect(q.own).toEqual([])
    expect(q.finishedCount).toBe(0)
  })

  it('경기가 하나도 없으면 전부 비어 있다', () => {
    const q = courtQueue(court('c1'), [])
    expect(q.live).toBeNull()
    expect(q.own).toEqual([])
    expect(q.finishedCount).toBe(0)
  })
})

describe('unassignedQueue — 코트 미정 경기는 코트 수와 무관하게 한 줄이다', () => {
  it('코트가 없는 예정 경기만 뽑는다', () => {
    const shared = match({ id: 'm1', court_id: null, status: 'scheduled' })
    const own = match({ id: 'm2', court_id: 'c1', status: 'scheduled' })
    expect(unassignedQueue([shared, own])).toEqual([shared])
  })

  it('코트가 없어도 진행 중·완료면 안 뽑는다', () => {
    const live = match({ id: 'm1', court_id: null, status: 'live' })
    const finished = match({ id: 'm2', court_id: null, status: 'finished' })
    expect(unassignedQueue([live, finished])).toEqual([])
  })

  it('코트가 넷이어도 공용 대기 경기 수는 그대로다 — 코트마다 곱해지지 않는다', () => {
    const shared = [
      match({ id: 'm1', court_id: null, status: 'scheduled' }),
      match({ id: 'm2', court_id: null, status: 'scheduled' }),
    ]
    // courtQueue 를 네 번 불러도 unassignedQueue 는 항상 같은 배열이다 —
    // 화면이 코트마다 이 값을 다시 세지 않고 한 번만 계산해 공유해야 한다는 뜻.
    for (let i = 0; i < 4; i++) {
      expect(unassignedQueue(shared)).toHaveLength(2)
    }
  })
})

describe('courtState — busy | open | idle', () => {
  it('진행 중 경기가 있으면 대기와 무관하게 busy 다', () => {
    const live = match({ id: 'm1', status: 'live' })
    const waiting = match({ id: 'm2', status: 'scheduled' })
    expect(courtState({ live, own: [waiting], sharedCount: 0 })).toBe('busy')
    expect(courtState({ live, own: [], sharedCount: 3 })).toBe('busy')
  })

  it('진행 중이 없고 이 코트 대기가 있으면 open 이다', () => {
    const waiting = match({ id: 'm2', status: 'scheduled' })
    expect(courtState({ live: null, own: [waiting], sharedCount: 0 })).toBe('open')
  })

  it('이 코트 대기는 없어도 공용 대기가 있으면 open 이다 — 튄다', () => {
    expect(courtState({ live: null, own: [], sharedCount: 1 })).toBe('open')
  })

  it('진행 중도 대기(이 코트·공용)도 없으면 idle 이다 — 조용히 둔다', () => {
    expect(courtState({ live: null, own: [], sharedCount: 0 })).toBe('idle')
  })
})
