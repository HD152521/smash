import { describe, expect, test } from 'vitest'
import {
  FAIRNESS_GAP,
  countPlays,
  excludedByKind,
  suggestMatch,
  type AutoMatchCandidate,
} from './autoMatch'
import { matchKindOf } from './gender'
import type { MatchOverviewRow, PlayerGender, PlayerGrade } from '@/types/database'

/*
 * 이 파일이 곧 명세다.
 *
 * 편성 규칙은 화면을 봐서는 검증할 수 없다 — "왜 얘가 빠졌지" 는 눈으로
 * 보이지 않고, 두 판쯤 돌아야 비로소 어긋난 게 드러난다. 그때는 이미
 * 총무가 앱을 안 믿기 시작한 뒤다. 규칙 하나에 검사 하나를 붙여 둔다.
 */

/** 이 함수들이 보는 칸만 채운다 */
function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    status: 'finished',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

/**
 * 이름 = id 로 둔다 — 판수는 이름으로, 편성 결과는 id 로 오가서 헷갈리기 쉽다.
 *
 * 성별은 기본이 null('모른다') 이다. 종목이 들어오기 전에 쓰인 검사들이
 * 그대로 남아 있어야 `'any'` 회귀를 지킨다 — 성별을 안 적은 명단에서
 * 답이 달라지면 그건 기존 동작이 바뀐 것이다.
 */
function member(
  id: string,
  grade: PlayerGrade | null,
  gender: PlayerGender | null = null,
): AutoMatchCandidate {
  return { id, displayName: id, grade, gender }
}

const man = (id: string, grade: PlayerGrade | null) => member(id, grade, 'male')
const woman = (id: string, grade: PlayerGrade | null) => member(id, grade, 'female')

/** 뽑힌 id 들의 종목 — `gender.ts` 의 판정을 그대로 쓴다 */
function kindOf(members: readonly AutoMatchCandidate[], picked: readonly string[]) {
  return matchKindOf(picked.map((id) => members.find((m) => m.id === id)?.gender ?? null))
}

/** 이 사람들이 `times` 판 쳤다고 치는 끝난 경기들 */
function playedMatches(names: readonly string[], times: number): MatchOverviewRow[] {
  return Array.from({ length: times }, (_, i) =>
    match({ id: `done-${names.join('')}-${i}`, status: 'finished', players_a: [...names] }),
  )
}

describe('countPlays — 오늘 몇 판 했나', () => {
  test('양 편을 다 세고, 안 뛴 사람은 아예 없다', () => {
    const plays = countPlays([match({ players_a: ['가'], players_b: ['나'] })])

    expect(plays.get('가')).toBe(1)
    expect(plays.get('나')).toBe(1)
    expect(plays.get('다')).toBeUndefined()
  })

  /*
   * 편성된 순간 그 사람의 몫은 이미 쓰였다. 끝날 때까지 안 세면, 그 판이
   * 끝나고 다시 후보가 되는 순간 판수 0 으로 되살아나 곧바로 또 뽑힌다.
   */
  test('진행 중·대기 중인 경기도 센다', () => {
    const plays = countPlays([
      match({ id: 'a', status: 'live', players_a: ['가'] }),
      match({ id: 'b', status: 'scheduled', players_a: ['가'] }),
    ])

    expect(plays.get('가')).toBe(2)
  })

  test('무효 경기는 안 센다 — 없던 판이다', () => {
    const plays = countPlays([
      match({ id: 'a', status: 'finished', players_a: ['가'] }),
      match({ id: 'b', status: 'void', players_a: ['가'] }),
    ])

    expect(plays.get('가')).toBe(1)
  })
})

describe('suggestMatch — 1단계: 판수가 급수를 이기는 지점', () => {
  /*
   * 사용자가 정한 규칙의 핵심. 판수가 2 벌어지면 급수가 아무리 잘 맞아도
   * 뒤처진 사람이 먼저다. 여기서는 B 넷이 완벽하게 맞는데도 못 들어온다.
   */
  test(`판수가 ${FAIRNESS_GAP} 뒤처진 사람이 급수를 이긴다`, () => {
    const members = [
      member('덜친S', 'S'),
      member('덜친초심', 'beginner'),
      member('덜친A', 'A'),
      member('덜친D', 'D'),
      member('많이친B1', 'B'),
      member('많이친B2', 'B'),
      member('많이친B3', 'B'),
      member('많이친B4', 'B'),
    ]
    const matches = playedMatches(['많이친B1', '많이친B2', '많이친B3', '많이친B4'], FAIRNESS_GAP)

    const picked = suggestMatch(members, matches, 2)

    expect(picked).not.toBeNull()
    expect([...picked!].sort()).toEqual(['덜친A', '덜친D', '덜친S', '덜친초심'].sort())
  })

  /*
   * 반대쪽 경계. 1 판 차이는 두 판만 돌면 저절로 뒤집히는 들쭉날쭉이라
   * 급수를 앞세운다 — 안 그러면 급수가 전혀 안 맞는 경기가 계속 나온다.
   */
  test('판수 차이가 1 이면 급수가 이긴다', () => {
    const members = [
      member('B1', 'B'),
      member('B2', 'B'),
      member('B3', 'B'),
      member('B4', 'B'),
      member('안친S', 'S'),
      member('안친A', 'A'),
      member('안친C', 'C'),
      member('안친초심', 'beginner'),
    ]
    const matches = playedMatches(['B1', 'B2', 'B3', 'B4'], 1)

    const picked = suggestMatch(members, matches, 2)

    expect([...picked!].sort()).toEqual(['B1', 'B2', 'B3', 'B4'])
  })

  /*
   * 코트를 비워 두는 것보다는 덜 공평한 편성이 낫다. 여덟 명 중 넷이 이미
   * 코트에 있으면 남은 넷의 판수가 어떻든 그 넷이 친다.
   */
  test('계층이 4명에 못 미치면 더 많이 친 사람으로 자리를 채운다', () => {
    const members = [
      member('안친1', 'B'),
      member('안친2', 'B'),
      member('많이1', 'B'),
      member('많이2', 'B'),
      member('많이3', 'B'),
      member('많이4', 'B'),
    ]
    const matches = playedMatches(['많이1', '많이2', '많이3', '많이4'], 5)

    const picked = suggestMatch(members, matches, 2)

    expect(picked).toHaveLength(4)
    // 넓히더라도 덜 친 사람이 먼저다 — 급수가 같으면 판수 적은 쪽이 앞선다
    expect(picked).toContain('안친1')
    expect(picked).toContain('안친2')
  })
})

describe('suggestMatch — 2단계: 계층 안에서 급수 맞추기', () => {
  test('급수가 가장 붙어 있는 넷을 고른다', () => {
    const members = [
      member('S', 'S'),
      member('C1', 'C'),
      member('C2', 'C'),
      member('C3', 'C'),
      member('C4', 'C'),
      member('초심', 'beginner'),
    ]

    const picked = suggestMatch(members, [], 2)

    expect([...picked!].sort()).toEqual(['C1', 'C2', 'C3', 'C4'])
  })

  /*
   * 급수는 **선택 입력**이다. 여기서 걸러 버리면 급수를 안 적은 사람은
   * 영영 경기에 못 들어가고, 급수는 사실상 필수 입력이 된다.
   */
  test('급수를 모르는 사람도 후보다 — 딱 넷이면 그 넷이 뽑힌다', () => {
    const members = [
      member('모름1', null),
      member('모름2', null),
      member('모름3', null),
      member('모름4', null),
    ]

    const picked = suggestMatch(members, [], 2)

    expect([...picked!].sort()).toEqual(['모름1', '모름2', '모름3', '모름4'])
  })

  test('급수를 모르는 사람이 판수로 앞서면 급수 아는 사람을 제친다', () => {
    const members = [
      member('모름', null),
      member('B1', 'B'),
      member('B2', 'B'),
      member('B3', 'B'),
      member('B4', 'B'),
    ]
    const matches = playedMatches(['B1', 'B2', 'B3', 'B4'], FAIRNESS_GAP)

    const picked = suggestMatch(members, matches, 2)

    expect(picked).toContain('모름')
  })

  /*
   * ⚠ 이 검사가 실제로 잡은 버그가 있다. 처음 구현은 계층이 모자라면
   * 판수 상한을 한 칸씩 **넓혀서** 다시 급수로 골랐는데, 그러면 자리가
   * 모자란 순간 판수 규칙이 통째로 무력해졌다 — 0판 한 명과 2판 넷이
   * 남으면 급수가 딱 맞는 2판짜리 넷이 뽑히고 0판인 사람은 또 앉아
   * 있었다. 없애려던 바로 그 장면이라, 넓히는 대신 **앞 계층에 자리를
   * 먼저 주는** 방식으로 고쳤다.
   */
  test('자리가 모자라도 뒤처진 사람이 밀리지 않는다 — 밀리는 쪽은 많이 친 사람이다', () => {
    const members = [
      member('0판', 'B'),
      member('많이1', 'B'),
      member('많이2', 'B'),
      member('많이3', 'B'),
      member('많이4', 'B'),
    ]
    const matches = playedMatches(['많이1', '많이2', '많이3', '많이4'], FAIRNESS_GAP)

    const picked = suggestMatch(members, matches, 2)!

    expect(picked).toContain('0판')
    expect(picked).toHaveLength(4)
  })

  /*
   * ⚠ 이것도 화면을 찍고서야 보였다. 남는 자리를 뒤 계층에서 한 명만
   * 채울 때는 급수 폭이 늘 0 이라(한 명이니까) 동점이 되고, 정렬 맨 앞
   * 사람 — 즉 **가장 센 사람**이 매번 뽑혔다. 초심 셋에 S 하나가 끼는
   * 편성이 반복된다는 뜻이다. 남는 자리는 센 사람 자리가 아니라 앞사람들에
   * 어울리는 자리다.
   */
  test('남는 자리는 이미 확정된 사람들의 급수에 어울리는 사람이 채운다', () => {
    const members = [
      member('안친초심', 'beginner'),
      member('안친D1', 'D'),
      member('안친D2', 'D'),
      member('많이친S', 'S'),
      member('많이친A', 'A'),
      member('많이친B', 'B'),
      member('많이친C', 'C'),
    ]
    const matches = playedMatches(['많이친S', '많이친A', '많이친B', '많이친C'], FAIRNESS_GAP)

    const picked = suggestMatch(members, matches, 2)!

    expect(picked).toContain('많이친C')
    expect(picked).not.toContain('많이친S')
  })

  /*
   * 모르는 급수는 한가운데(2.5)로 본다. 그래서 B·C 무리에는 끼지만
   * S 넷 사이에 억지로 끼어들지는 않는다 — 확신 없을 때는 덜 극단적인
   * 쪽으로 틀린다.
   */
  test('모르는 급수는 한가운데라 극단으로 몰리지 않는다', () => {
    const members = [
      member('모름', null),
      member('S1', 'S'),
      member('S2', 'S'),
      member('S3', 'S'),
      member('S4', 'S'),
    ]

    const picked = suggestMatch(members, [], 2)

    expect(picked).not.toContain('모름')
  })
})

describe('suggestMatch — 3단계: 두 편 급수 맞추기', () => {
  /*
   * 넷을 잘 골라 놔도 나누기를 잘못하면 S·A 대 C·D 가 된다.
   * 앞 squad 명이 A편이라는 약속은 `splitTeams` 와 같다.
   */
  test('두 편의 급수 합이 최소가 되게 가른다', () => {
    const members = [member('S', 'S'), member('A', 'A'), member('C', 'C'), member('D', 'D')]

    const picked = suggestMatch(members, [], 2)!
    const rankOf: Record<string, number> = { S: 0, A: 1, C: 3, D: 4 }
    const sumA = rankOf[picked[0]!]! + rankOf[picked[1]!]!
    const sumB = rankOf[picked[2]!]! + rankOf[picked[3]!]!

    // S+D(4) vs A+C(4) — 다르게 가르면 1 vs 7 이나 3 vs 5 가 된다
    expect(sumA).toBe(sumB)
  })

  test('단식이면 두 명만 낸다', () => {
    const members = [member('a', 'B'), member('b', 'B'), member('c', 'B')]

    expect(suggestMatch(members, [], 1)).toHaveLength(2)
  })
})

describe('suggestMatch — 제안을 안 하는 경우', () => {
  /*
   * 반쯤 채워진 제안은 고쳐야 할 게 뭔지 안 알려주면서 화면만 어지럽힌다.
   * 셋으로 억지 편성하느니 빈 화면이 정직하다.
   */
  test('사람이 넷에 못 미치면 null 이다', () => {
    const members = [member('a', 'B'), member('b', 'B'), member('c', 'B')]

    expect(suggestMatch(members, [], 2)).toBeNull()
  })

  test('명단이 비면 null 이다', () => {
    expect(suggestMatch([], [], 2)).toBeNull()
  })

  /*
   * 화면이 흐리게 만들어 못 누르게 막아 둔 사람을 제안이 채워 넣으면,
   * 총무가 손도 못 대는 편성이 기본값으로 뜬다. 기준은 `busy.ts` 하나다.
   */
  test('지금 뛰는 사람은 안 뽑는다', () => {
    const members = [
      member('뛰는1', 'B'),
      member('뛰는2', 'B'),
      member('쉬는1', 'B'),
      member('쉬는2', 'B'),
      member('쉬는3', 'B'),
      member('쉬는4', 'B'),
    ]
    const matches = [
      match({ id: 'live', status: 'live', players_a: ['뛰는1'], players_b: ['뛰는2'] }),
    ]

    const picked = suggestMatch(members, matches, 2)

    expect([...picked!].sort()).toEqual(['쉬는1', '쉬는2', '쉬는3', '쉬는4'])
  })

  test('다음 경기에 이미 편성된 사람도 안 뽑는다', () => {
    const members = [
      member('대기1', 'B'),
      member('대기2', 'B'),
      member('쉬는1', 'B'),
      member('쉬는2', 'B'),
      member('쉬는3', 'B'),
      member('쉬는4', 'B'),
    ]
    const matches = [
      match({ id: 'q', status: 'scheduled', players_a: ['대기1'], players_b: ['대기2'] }),
    ]

    const picked = suggestMatch(members, matches, 2)

    expect(picked).not.toContain('대기1')
    expect(picked).not.toContain('대기2')
  })

  test('묶인 사람을 빼고 나면 넷이 안 되는 경우도 null 이다', () => {
    const members = [
      member('뛰는1', 'B'),
      member('뛰는2', 'B'),
      member('쉬는1', 'B'),
      member('쉬는2', 'B'),
      member('쉬는3', 'B'),
    ]
    const matches = [
      match({ id: 'live', status: 'live', players_a: ['뛰는1'], players_b: ['뛰는2'] }),
    ]

    expect(suggestMatch(members, matches, 2)).toBeNull()
  })
})

describe('suggestMatch — 같은 입력이면 같은 답', () => {
  /*
   * 무작위를 안 쓴다. 화면이 다시 그려질 때마다 제안이 흔들리면 총무는
   * 방금 보던 이름이 사라진 이유를 알 수 없고, 그러면 제안 자체를 안 믿는다.
   */
  test('두 번 불러도 같다', () => {
    const members = [
      member('a', 'S'),
      member('b', 'A'),
      member('c', 'B'),
      member('d', 'C'),
      member('e', null),
      member('f', 'D'),
    ]

    expect(suggestMatch(members, [], 2)).toEqual(suggestMatch(members, [], 2))
  })
})

describe('suggestMatch — 종목: 같은 성별이 먼저, 혼복은 대안', () => {
  /*
   * 사용자의 말 그대로다 — "기본적으로는 남복 여복 이렇게를 잡고".
   * 남자 넷이 되는데 혼복을 내면 그건 앱이 마음대로 정한 것이다.
   */
  test('같은 성별 넷이 되면 혼복보다 먼저 뽑힌다', () => {
    const members = [
      man('남1', 'B'),
      man('남2', 'B'),
      man('남3', 'B'),
      man('남4', 'B'),
      woman('여1', 'B'),
      woman('여2', 'B'),
    ]

    const picked = suggestMatch(members, [], 2)!

    expect(kindOf(members, picked)).toBe('mens')
  })

  /*
   * "여복이 안 되는 경우가 많아. 남자가 많더라고. 그럴 때 어쩔 수 없이
   * 혼복을." — 여자가 둘뿐이면 여복은 애초에 불가능하고, 남자도 둘뿐이라
   * 남복도 안 된다. 그때 코트를 비워 두는 대신 혼복으로 간다.
   */
  test('여자가 둘뿐이면 혼복으로 간다', () => {
    const members = [man('남1', 'B'), man('남2', 'B'), woman('여1', 'B'), woman('여2', 'B')]

    const picked = suggestMatch(members, [], 2)!

    expect(kindOf(members, picked)).toBe('mixed')
  })

  test('남복·여복이 둘 다 되면 급수가 더 붙은 쪽을 고른다', () => {
    const members = [
      man('남S', 'S'),
      man('남A', 'A'),
      man('남C', 'C'),
      man('남D', 'D'),
      woman('여B1', 'B'),
      woman('여B2', 'B'),
      woman('여B3', 'B'),
      woman('여B4', 'B'),
    ]

    const picked = suggestMatch(members, [], 2)!

    expect(kindOf(members, picked)).toBe('womens')
  })

  /*
   * ⚠ 이 검사가 이 기능의 순서를 지킨다. 남자 넷은 완벽한 남복이지만
   * 방금 두 판을 쳤고 여자 둘은 아직 한 판도 못 쳤다. 종목이 판수를
   * 이기면 "혼복 만들려고 3판 친 사람을 또 넣는" 일의 거울상 —
   * "남복 만들려고 2판 친 남자 넷을 또 넣는" 일이 벌어진다.
   */
  test('판수 계층이 종목보다 위다 — 남복이 되는데도 혼복이 나온다', () => {
    const members = [
      woman('여1', 'B'),
      woman('여2', 'B'),
      man('남1', 'B'),
      man('남2', 'B'),
      man('남3', 'B'),
      man('남4', 'B'),
    ]
    const matches = playedMatches(['남1', '남2', '남3', '남4'], FAIRNESS_GAP)

    const picked = suggestMatch(members, matches, 2)!

    expect(picked).toContain('여1')
    expect(picked).toContain('여2')
    expect(kindOf(members, picked)).toBe('mixed')
  })
})

describe('suggestMatch — 혼복은 남남 · 여여 끼리 맞춘다', () => {
  /*
   * 혼복이 남복·여복과 다른 유일한 지점. **합이 같아도 나쁜 경기가 있다** —
   * 남S+여초 vs 남초+여S 는 합이 5 대 5 로 완벽하지만, 코트에서 실제로
   * 맞붙는 건 남자와 남자, 여자와 여자다. S 남자가 초심 남자를 상대로
   * 치는 경기는 그냥 재미없는 경기다.
   *
   * 그래서 **고를 때부터** 성별 안에서 짝을 맞춘다. 넷을 골라 놓고 나누는
   * 것만으로는 늦다 — 그때는 이미 S 와 초심이 같은 명단에 들어와 있다.
   */
  test('합이 맞는 조합이 아니라 성별 안에서 붙는 조합을 고른다', () => {
    const members = [
      man('남S1', 'S'),
      man('남S2', 'S'),
      man('남초1', 'beginner'),
      man('남초2', 'beginner'),
      woman('여S1', 'S'),
      woman('여S2', 'S'),
      woman('여초1', 'beginner'),
      woman('여초2', 'beginner'),
    ]

    const picked = suggestMatch(members, [], 2, 'mixed')!

    expect([...picked].sort()).toEqual(['남S1', '남S2', '여S1', '여S2'])
  })

  /*
   * 여자 쪽이 둘뿐이라 급수 차(B–초심)가 강제될 때도, 남자 쪽은 여전히
   * 남자끼리 붙여야 한다 — 여자 쪽 사정 때문에 남자 급수를 벌리면
   * 못 맞는 짝이 둘이 된다.
   */
  test('한쪽이 강제돼도 다른 쪽은 그 성별 안에서 가장 붙는 둘을 고른다', () => {
    const members = [
      man('남A', 'A'),
      man('남B1', 'B'),
      man('남B2', 'B'),
      woman('여B', 'B'),
      woman('여초', 'beginner'),
    ]

    const picked = suggestMatch(members, [], 2, 'mixed')!

    expect(picked).toContain('남B1')
    expect(picked).toContain('남B2')
    expect(picked).not.toContain('남A')
  })

  test('혼복은 남1·여1 씩 갈린다 — 남남 대 여여 가 되지 않는다', () => {
    const members = [man('남1', 'B'), man('남2', 'B'), woman('여1', 'B'), woman('여2', 'B')]

    const picked = suggestMatch(members, [], 2, 'mixed')!
    const teamA = picked.slice(0, 2)
    const teamB = picked.slice(2)
    const menIn = (team: readonly string[]) => team.filter((id) => id.startsWith('남')).length

    expect(menIn(teamA)).toBe(1)
    expect(menIn(teamB)).toBe(1)
  })
})

describe('suggestMatch — 성별을 모르는 사람', () => {
  /*
   * 모르는 것을 짐작해 '남복' 이라고 적을 수는 없다 (`matchKindOf` 도 같은
   * 규율로 null 을 낸다). 대신 화면이 몇 명이 빠지는지 말한다
   * (`excludedByKind`) — 조용히 사라지면 그 사람은 오늘 못 친다.
   */
  test('종목을 지정하면 빠진다', () => {
    const members = [
      man('남1', 'B'),
      man('남2', 'B'),
      man('남3', 'B'),
      man('남4', 'B'),
      member('모름', 'B'),
    ]

    const picked = suggestMatch(members, [], 2, 'mens')!

    expect(picked).not.toContain('모름')
    expect([...picked].sort()).toEqual(['남1', '남2', '남3', '남4'])
  })

  test('성별 미상을 빼면 넷이 안 되면 조용히 null 이다', () => {
    const members = [man('남1', 'B'), man('남2', 'B'), man('남3', 'B'), member('모름', 'B')]

    expect(suggestMatch(members, [], 2, 'mens')).toBeNull()
  })

  /*
   * `'아무나'` 는 조건을 안 걸겠다는 선택이다. 종목을 못 만든다고 코트를
   * 비워 두면 그 선택을 앱이 뒤집는 것이다 — 종목 없이 고르는 갈래가
   * 남아 있어야 한다(그게 종목 도입 전 동작이기도 하다).
   */
  test("'아무나' 에서는 그대로 들어간다", () => {
    const members = [man('남1', 'B'), man('남2', 'B'), man('남3', 'B'), member('모름', 'B')]

    const picked = suggestMatch(members, [], 2)!

    expect(picked).toContain('모름')
    expect(kindOf(members, picked)).toBeNull()
  })

  test('excludedByKind — 종목을 지정할 때만 셈이 뜻이 있다', () => {
    const members = [man('남1', 'B'), member('모름1', 'B'), member('모름2', null)]

    expect(excludedByKind(members, 'any')).toBe(0)
    expect(excludedByKind(members, 'mens')).toBe(2)
    expect(excludedByKind(members, 'mixed')).toBe(2)
  })
})

describe('suggestMatch — 종목을 못 만들면 조용히 null', () => {
  test('여자가 둘뿐이면 여복은 null 이다', () => {
    const members = [
      man('남1', 'B'),
      man('남2', 'B'),
      man('남3', 'B'),
      man('남4', 'B'),
      woman('여1', 'B'),
      woman('여2', 'B'),
    ]

    expect(suggestMatch(members, [], 2, 'womens')).toBeNull()
    // 같은 명단으로 남복은 된다 — null 은 '사람이 없다' 가 아니라 '그 종목이 안 된다'
    expect(suggestMatch(members, [], 2, 'mens')).toHaveLength(4)
  })

  test('여자가 하나뿐이면 혼복도 null 이다', () => {
    const members = [man('남1', 'B'), man('남2', 'B'), man('남3', 'B'), woman('여1', 'B')]

    expect(suggestMatch(members, [], 2, 'mixed')).toBeNull()
  })
})

describe("suggestMatch — 'any' 는 종목이 없던 때와 같다", () => {
  /*
   * 종목 인자는 기본값이 `'any'` 다. 기존 호출부(인자 셋)와 명시적으로
   * `'any'` 를 넘긴 호출이 갈리면, 화면 한 곳만 고친 날 조용히 어긋난다.
   */
  test('기본값과 명시적 any 가 같다', () => {
    const members = [
      man('a', 'S'),
      woman('b', 'A'),
      man('c', 'B'),
      woman('d', 'C'),
      member('e', null),
      man('f', 'D'),
    ]

    expect(suggestMatch(members, [], 2)).toEqual(suggestMatch(members, [], 2, 'any'))
  })

  test('성별을 아무도 안 적었으면 판수·급수만으로 고른다', () => {
    const members = [
      member('S', 'S'),
      member('C1', 'C'),
      member('C2', 'C'),
      member('C3', 'C'),
      member('C4', 'C'),
      member('초심', 'beginner'),
    ]

    expect([...suggestMatch(members, [], 2)!].sort()).toEqual(['C1', 'C2', 'C3', 'C4'])
  })
})
