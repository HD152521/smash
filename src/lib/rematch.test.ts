import { describe, expect, test } from 'vitest'
import { buildRematchPrefill, parseRematchPrefill, resolvePlayerIds } from './rematch'
import type { MatchOverviewRow } from '@/types/database'

function match(over: Partial<MatchOverviewRow> = {}): MatchOverviewRow {
  return {
    id: 'match-1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    label: null,
    status: 'void',
    source: 'scored',
    score_a: 21,
    score_b: 15,
    winner_side: 'A',
    scored: true,
    queue_order: null,
    started_at: null,
    finished_at: null,
    edited_at: null,
    created_at: null,
    group_a_id: 'group-a',
    group_a_name: '1조',
    group_a_joker: false,
    target_a: 21,
    deuce_a: true,
    max_a: 30,
    group_b_id: 'group-b',
    group_b_name: '2조',
    group_b_joker: false,
    target_b: 21,
    deuce_b: true,
    max_b: 30,
    players_a: ['가나', '나다'],
    players_b: ['다라', '라마'],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

describe('buildRematchPrefill', () => {
  test('조·선수·점수를 그대로 옮긴다', () => {
    expect(buildRematchPrefill(match())).toEqual({
      groupA: 'group-a',
      groupB: 'group-b',
      playersANames: ['가나', '나다'],
      playersBNames: ['다라', '라마'],
      scoreA: 21,
      scoreB: 15,
    })
  })

  test('점수 없이 끝난 경기는 null 그대로 남긴다', () => {
    const prefill = buildRematchPrefill(match({ score_a: null, score_b: null }))
    expect(prefill.scoreA).toBeNull()
    expect(prefill.scoreB).toBeNull()
  })

  test('조·선수가 비어 있으면 빈 값으로 채운다', () => {
    const prefill = buildRematchPrefill(
      match({ group_a_id: null, group_b_id: null, players_a: null, players_b: null }),
    )
    expect(prefill).toMatchObject({
      groupA: '',
      groupB: '',
      playersANames: [],
      playersBNames: [],
    })
  })
})

describe('parseRematchPrefill', () => {
  test('정상 값은 그대로 통과한다', () => {
    const state = {
      groupA: 'group-a',
      groupB: 'group-b',
      playersANames: ['가나', '나다'],
      playersBNames: ['다라', '라마'],
      scoreA: 21,
      scoreB: 15,
    }
    expect(parseRematchPrefill(state)).toEqual(state)
  })

  test('state 가 없으면 null (직접 주소를 친 정상 경로)', () => {
    expect(parseRematchPrefill(undefined)).toBeNull()
    expect(parseRematchPrefill(null)).toBeNull()
  })

  test('모양이 다르면 null — 반쯤 채운 폼보다 빈 폼이 낫다', () => {
    expect(parseRematchPrefill('not an object')).toBeNull()
    expect(parseRematchPrefill({})).toBeNull()
    expect(parseRematchPrefill({ groupA: 1, groupB: 'group-b' })).toBeNull()
    expect(
      parseRematchPrefill({ groupA: 'a', groupB: 'b', playersANames: [1, 2], playersBNames: [] }),
    ).toBeNull()
  })

  test('점수가 숫자가 아니면 null 로 받는다 (안 센 경기)', () => {
    const parsed = parseRematchPrefill({
      groupA: 'group-a',
      groupB: 'group-b',
      playersANames: [],
      playersBNames: [],
    })
    expect(parsed?.scoreA).toBeNull()
    expect(parsed?.scoreB).toBeNull()
  })
})

describe('resolvePlayerIds', () => {
  const members = [
    { id: 'm1', displayName: '가나' },
    { id: 'm2', displayName: '나다' },
  ]

  test('이름으로 id 를 찾는다', () => {
    expect(resolvePlayerIds(['가나', '나다'], members)).toEqual(['m1', 'm2'])
  })

  test('명단에 없는 이름은 조용히 뺀다', () => {
    expect(resolvePlayerIds(['가나', '탈퇴한사람'], members)).toEqual(['m1'])
  })

  test('빈 배열은 빈 배열', () => {
    expect(resolvePlayerIds([], members)).toEqual([])
  })
})
