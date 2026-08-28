import { describe, expect, test } from 'vitest'
import { buildBusyMap, busyLabel, busyReason } from './busy'
import type { MatchOverviewRow } from '@/types/database'

/** 이 함수가 보는 칸만 채운다 — 나머지는 판단에 안 쓰인다 */
function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    status: 'scheduled',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

describe('buildBusyMap — 다른 경기에 묶인 사람', () => {
  test('진행 중인 경기의 선수는 묶인다', () => {
    const busy = buildBusyMap([
      match({
        id: 'm1',
        status: 'live',
        court_name: '1번 코트',
        players_a: ['가나'],
        players_b: ['나다'],
      }),
    ])

    expect(busy.get('가나')).toEqual({ kind: 'playing', courtName: '1번 코트' })
    expect(busy.get('나다')).toEqual({ kind: 'playing', courtName: '1번 코트' })
  })

  test('대기 중인 경기의 선수도 묶인다', () => {
    const busy = buildBusyMap([
      match({ id: 'm1', status: 'scheduled', court_name: '2번 코트', players_a: ['다라'] }),
    ])

    expect(busy.get('다라')).toEqual({ kind: 'waiting', courtName: '2번 코트' })
  })

  test('코트를 아직 안 정한 대기 경기도 묶인다 — 코트 이름만 없다', () => {
    const busy = buildBusyMap([
      match({ status: 'scheduled', court_name: null, players_a: ['라마'] }),
    ])

    expect(busy.get('라마')).toEqual({ kind: 'waiting', courtName: null })
  })

  test('끝난 경기의 선수는 다시 고를 수 있다', () => {
    const busy = buildBusyMap([
      match({ id: 'm1', status: 'finished', court_name: '1번 코트', players_a: ['가나'] }),
      match({ id: 'm2', status: 'void', court_name: '2번 코트', players_a: ['나다'] }),
    ])

    expect(busy.size).toBe(0)
  })

  test('아무 경기도 없으면 아무도 안 묶인다', () => {
    expect(buildBusyMap([]).size).toBe(0)
  })

  test('뛰는 쪽이 이긴다 — 대기 편성이 진행 중을 덮지 않는다', () => {
    const both = [
      match({ id: 'm1', status: 'live', court_name: '1번 코트', players_a: ['가나'] }),
      match({ id: 'm2', status: 'scheduled', court_name: '3번 코트', players_a: ['가나'] }),
    ]

    // 순서가 어느 쪽이어도 결과가 같아야 한다
    expect(buildBusyMap(both).get('가나')).toEqual({ kind: 'playing', courtName: '1번 코트' })
    expect(buildBusyMap([...both].reverse()).get('가나')).toEqual({
      kind: 'playing',
      courtName: '1번 코트',
    })
  })

  test('심판은 묶지 않는다 — 서버의 검사도 선수만 본다', () => {
    const busy = buildBusyMap([
      match({ status: 'live', players_a: ['가나'], referees: ['심판이'] }),
    ])

    expect(busy.has('심판이')).toBe(false)
    expect(busy.has('가나')).toBe(true)
  })
})

describe('exceptMatchId — 편성을 고치는 화면', () => {
  test('고치는 그 경기의 선수는 묶이지 않는다 (자기 자신 때문에 못 고치면 안 된다)', () => {
    const busy = buildBusyMap(
      [match({ id: 'm1', status: 'scheduled', players_a: ['가나'], players_b: ['나다'] })],
      { exceptMatchId: 'm1' },
    )

    expect(busy.size).toBe(0)
  })

  test('고치는 경기만 빠진다 — 다른 경기의 선수는 그대로 묶인다', () => {
    const busy = buildBusyMap(
      [
        match({ id: 'm1', status: 'scheduled', players_a: ['가나'] }),
        match({ id: 'm2', status: 'live', court_name: '1번 코트', players_a: ['나다'] }),
      ],
      { exceptMatchId: 'm1' },
    )

    expect(busy.has('가나')).toBe(false)
    expect(busy.get('나다')?.kind).toBe('playing')
  })
})

describe('busyLabel · busyReason — 왜 못 고르는지 말해 준다', () => {
  test('코트가 있으면 코트를 부른다 — 그 사람을 찾을 자리를 알려준다', () => {
    expect(busyLabel({ kind: 'playing', courtName: '3번 코트' })).toBe('3번 코트')
  })

  test('뛰는 중과 대기 중을 구분한다 — 대기는 그 경기를 지우면 풀린다', () => {
    expect(busyLabel({ kind: 'waiting', courtName: '3번 코트' })).toBe('3번 코트 대기')
  })

  test('코트가 없으면 상태만 말한다', () => {
    expect(busyLabel({ kind: 'playing', courtName: null })).toBe('경기 중')
    expect(busyLabel({ kind: 'waiting', courtName: null })).toBe('대기 중')
  })

  test('읽어 주기 문구는 어디서 무엇인지 둘 다 담는다', () => {
    expect(busyReason({ kind: 'playing', courtName: '1번 코트' })).toBe(
      '1번 코트에서 경기 중이라 고를 수 없습니다',
    )
    expect(busyReason({ kind: 'waiting', courtName: null })).toBe('대기 중이라 고를 수 없습니다')
  })
})
