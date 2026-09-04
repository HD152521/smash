import { describe, expect, test } from 'vitest'
import {
  AUTO_QUEUE_LABEL,
  autoQueueKeyOfMatch,
  isAutoQueued,
  labelAfterHumanEdit,
  planAutoQueue,
} from './autoQueue'
import type { AutoMatchCandidate } from './autoMatch'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

/*
 * 자동 예약이 **언제 안 만드는지**가 이 파일의 본론이다.
 *
 * 만드는 건 눈에 보인다 — 코트에 경기가 걸린다. 안 만들어야 할 때 만드는
 * 것은 안 보인다. 한 코트에 두 개가 쌓이거나, 사람이 모자란데 억지로
 * 짜거나, 공용 대기가 이미 있는데 또 만드는 일은 그날 저녁 체육관에서야
 * 드러난다. 그래서 여기서 못박는다.
 */

function court(id: string, sort: number): CourtRow {
  return { id, tournament_id: 't1', name: `${sort}번 코트`, sort_order: sort } as CourtRow
}

function match(over: Partial<MatchOverviewRow>): MatchOverviewRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    court_id: null,
    court_name: null,
    label: null,
    status: 'scheduled',
    players_a: [],
    players_b: [],
    referees: [],
    ...over,
  } as MatchOverviewRow
}

/**
 * 이름 = id — 판수는 이름으로, 편성 결과는 id 로 오간다.
 *
 * 성별은 null('모른다') 이다. 자동 예약은 아직 종목을 안 고른다 —
 * 여기서 `'any'` 로 돌아가는 것이 지금의 동작이고, 종목 설정은 다음
 * 단계에서 이 파일에 들어온다.
 */
function member(id: string): AutoMatchCandidate {
  return { id, displayName: id, grade: null, gender: null, rsvp: 'going' }
}

const EIGHT = ['가', '나', '다', '라', '마', '바', '사', '아'].map(member)
const COURTS = [court('c1', 1), court('c2', 2), court('c3', 3)]

describe('planAutoQueue — 채울 코트 고르기', () => {
  test('대기가 0인 코트를 채운다 — 정렬 순서상 앞선 코트부터', () => {
    const plan = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })

    expect(plan?.courtId).toBe('c1')
    expect(plan?.playersA).toHaveLength(2)
    expect(plan?.playersB).toHaveLength(2)
  })

  test('경기 중인 코트보다 빈 코트를 먼저 채운다', () => {
    /*
     * 실제로 이랬다. '대기 경기가 없는 코트' 만 보고 코트 번호 순으로
     * 채우니, 지금 경기 중인 1번 코트가 텅 빈 3번 코트보다 먼저 찼다.
     * 12명이 오면 1·2번 코트 대기를 채우는 데 여덟이 묶여 아무도 안 서
     * 있는 3번 코트가 끝내 비어 있었다 — 코트 하나를 놀린 것이다.
     *
     * 빈 코트는 지금 사람이 필요하고 경기 중인 코트는 나중에 필요하다.
     */
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'live1', court_id: 'c1', status: 'live' })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c2')
  })

  test('빈 코트가 없으면 그때 경기 중인 코트에 대기를 건다', () => {
    // 다음 경기를 미리 걸어 두는 것 자체는 옳다. 순서가 뒤였을 뿐이다.
    const plan = planAutoQueue({
      courts: [court('c1', 1)],
      matches: [match({ id: 'live1', court_id: 'c1', status: 'live' })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c1')
  })

  test('빈 코트끼리는 코트 순서를 지킨다', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'live1', court_id: 'c2', status: 'live' })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c1')
  })

  test('이미 대기가 1개 있는 코트는 건너뛴다 — 한 코트에 두 개를 쌓지 않는다', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'q1', court_id: 'c1', status: 'scheduled' })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c2')
  })

  test('진행 중인 경기는 대기가 아니다 — 그 코트에도 다음 경기를 걸어 둔다', () => {
    const plan = planAutoQueue({
      courts: [court('c1', 1)],
      matches: [match({ id: 'live1', court_id: 'c1', status: 'live', players_a: ['가', '나'] })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c1')
    // 뛰는 중인 사람은 안 뽑힌다 (busy.ts 와 같은 판단)
    expect(plan?.playersA.concat(plan.playersB)).not.toContain('가')
  })

  test('끝난 경기는 대기로 안 센다', () => {
    const plan = planAutoQueue({
      courts: [court('c1', 1)],
      matches: [match({ id: 'done', court_id: 'c1', status: 'finished' })],
      members: EIGHT,
      squad: 2,
    })

    expect(plan?.courtId).toBe('c1')
  })

  test('모든 코트에 대기가 있으면 아무것도 안 만든다', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: COURTS.map((c, i) => match({ id: `q${i}`, court_id: c.id, status: 'scheduled' })),
      members: EIGHT,
      squad: 2,
    })

    expect(plan).toBeNull()
  })

  test('코트가 없으면 만들지 않는다', () => {
    expect(planAutoQueue({ courts: [], matches: [], members: EIGHT, squad: 2 })).toBeNull()
  })
})

describe('planAutoQueue — 공용 대기를 코트 수에서 뺀다', () => {
  test('코트 미정 대기 1개는 빈 코트 하나를 덮는다', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'shared', court_id: null, status: 'scheduled' })],
      members: EIGHT,
      squad: 2,
    })

    // c1 은 공용 대기가 집어갈 몫이라 c2 부터 채운다
    expect(plan?.courtId).toBe('c2')
  })

  test('공용 대기가 빈 코트 수만큼 있으면 아무것도 안 만든다', () => {
    const shared = COURTS.map((_, i) => match({ id: `s${i}`, court_id: null, status: 'scheduled' }))

    expect(planAutoQueue({ courts: COURTS, matches: shared, members: EIGHT, squad: 2 })).toBeNull()
  })
})

describe('planAutoQueue — 사람이 모자라면 조용히 안 만든다', () => {
  test('남은 사람이 넷이 안 되면 null (오류가 아니다)', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [],
      members: EIGHT.slice(0, 3),
      squad: 2,
    })

    expect(plan).toBeNull()
  })

  test('여섯 명 중 넷이 이미 코트에 있으면 null', () => {
    const plan = planAutoQueue({
      courts: COURTS,
      matches: [
        match({ id: 'live1', court_id: 'c1', status: 'live', players_a: ['가', '나'] }),
        match({ id: 'live2', court_id: 'c2', status: 'live', players_a: ['다', '라'] }),
      ],
      members: EIGHT.slice(0, 6),
      squad: 2,
    })

    expect(plan).toBeNull()
  })

  test('명단이 비어 있으면 null', () => {
    expect(planAutoQueue({ courts: COURTS, matches: [], members: [], squad: 2 })).toBeNull()
  })

  test('한 편 인원이 0 이면 만들지 않는다', () => {
    expect(planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 0 })).toBeNull()
  })
})

/*
 * 🔴 자동 예약에는 사람이 없다. 수동 화면은 총무가 명단을 보고 판단하지만
 * 여기는 그냥 넣는다 — 그래서 「모임 나가기」를 누른 사람이 코트마다 걸리는
 * 첫 경기에 그대로 들어갔다. 규칙 자체는 `autoMatch.test.ts` 가 지키고,
 * 여기서는 자동 예약이 그 규칙 위에서 돈다는 것만 못박는다.
 */
describe('planAutoQueue — 모임을 나간 사람은 안 건다', () => {
  test("rsvp 가 'declined' 인 사람은 자동 예약에 안 들어간다", () => {
    const members = EIGHT.map((m, i) => (i < 2 ? { ...m, rsvp: 'declined' as const } : m))

    const plan = planAutoQueue({ courts: COURTS, matches: [], members, squad: 2 })

    expect(plan?.playersA.concat(plan.playersB)).not.toContain('가')
    expect(plan?.playersA.concat(plan.playersB)).not.toContain('나')
  })

  test('안 누른 사람은 그대로 걸린다 — 참가는 게이트가 아니다', () => {
    const members = EIGHT.map((m) => ({ ...m, rsvp: 'invited' as const }))

    const plan = planAutoQueue({ courts: COURTS, matches: [], members, squad: 2 })

    expect(plan?.playersA).toHaveLength(2)
    expect(plan?.playersB).toHaveLength(2)
  })
})

describe('planAutoQueue — 열쇠(key)', () => {
  test('지운 편성을 다시 계산해도 열쇠가 같다 — × 를 눌렀는데 되살아나지 않는다', () => {
    /*
     * 자동으로 걸린 경기를 총무가 지우면 세상은 '만들기 직전' 으로
     * 돌아간다. 열쇠가 세상의 지문이었다면 여기서 열쇠가 바뀌어 똑같은
     * 편성이 즉시 되살아났다 — 지우는 버튼이 아무 일도 안 하는 셈이다.
     */
    const before = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })
    const created = match({
      id: 'auto-1',
      court_id: 'c1',
      status: 'scheduled',
      label: '자동',
      players_a: before!.playersA,
      players_b: before!.playersB,
    })

    // 만들어졌을 때는 c1 이 덮여 c2 를 본다
    const filled = planAutoQueue({
      courts: COURTS,
      matches: [created],
      members: EIGHT,
      squad: 2,
    })
    expect(filled?.courtId).toBe('c2')

    // 지우면 c1 이 다시 비지만, 제안이 같으므로 열쇠도 같다
    const afterDelete = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })
    expect(afterDelete?.key).toBe(before?.key)
  })

  test('경기가 하나 끝나면 같은 편성도 다시 제안할 수 있다', () => {
    const before = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })
    // 끝난 경기는 판수에 안 잡히는 사람들로 — 제안 자체는 그대로 두고 눈금만 움직인다
    const after = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'done', status: 'finished', players_a: [], players_b: [] })],
      members: EIGHT,
      squad: 2,
    })

    expect(after?.playersA).toEqual(before?.playersA)
    expect(after?.key).not.toBe(before?.key)
  })

  test('세상이 그대로면 열쇠도 그대로 — 화면이 두 번 만들지 않는 근거', () => {
    const a = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })
    const b = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })

    expect(a?.key).toBe(b?.key)
  })

  test('경기가 하나 생기면 열쇠가 바뀐다 — 다음 코트를 채울 수 있다', () => {
    const before = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })
    const after = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'q1', court_id: 'c1', status: 'scheduled' })],
      members: EIGHT,
      squad: 2,
    })

    expect(after?.key).not.toBe(before?.key)
  })

  test('경기 상태가 바뀌면 열쇠가 바뀐다 (같은 경기라도)', () => {
    const scheduled = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'q1', court_id: 'c1', status: 'scheduled' })],
      members: EIGHT,
      squad: 2,
    })
    const live = planAutoQueue({
      courts: COURTS,
      matches: [match({ id: 'q1', court_id: 'c1', status: 'live', players_a: ['가', '나'] })],
      members: EIGHT,
      squad: 2,
    })

    expect(live?.key).not.toBe(scheduled?.key)
  })

  test('명단이 늘면 열쇠가 바뀐다 — 못 짜던 편성이 가능해진다', () => {
    const three = planAutoQueue({
      courts: COURTS,
      matches: [],
      members: EIGHT.slice(0, 3),
      squad: 2,
    })
    const four = planAutoQueue({
      courts: COURTS,
      matches: [],
      members: EIGHT.slice(0, 4),
      squad: 2,
    })

    expect(three).toBeNull()
    expect(four?.key).toBeTruthy()
  })
})

describe('autoQueueKeyOfMatch — 지운 경기를 그 경기를 낳은 열쇠로 되짚는다', () => {
  test('만들어진 경기에서 뽑은 열쇠가 그 경기를 만든 열쇠와 같다', () => {
    /*
     * 화면을 새로 연 뒤에 지워도 통해야 한다 — 새 화면의 문지기는 그
     * 편성을 만든 적이 없어 기억이 비어 있다. 그래서 '만든 적 있나' 를
     * 추론하지 않고 경기 행에서 열쇠를 다시 계산한다.
     */
    const plan = planAutoQueue({ courts: COURTS, matches: [], members: EIGHT, squad: 2 })!
    const names = new Map(EIGHT.map((m) => [m.id, m.displayName]))
    const created = match({
      id: 'auto-1',
      court_id: plan.courtId,
      status: 'scheduled',
      label: AUTO_QUEUE_LABEL,
      players_a: plan.playersA.map((id) => names.get(id)!),
      players_b: plan.playersB.map((id) => names.get(id)!),
    })

    expect(autoQueueKeyOfMatch(created, [])).toBe(plan.key)
  })

  test('코트를 안 정한 경기는 열쇠가 없다 (자동 예약은 늘 코트를 정한다)', () => {
    expect(autoQueueKeyOfMatch(match({ court_id: null }), [])).toBeNull()
  })
})

describe('isAutoQueued — 자동으로 만든 경기 표시', () => {
  test('라벨이 붙은 경기만 자동이다', () => {
    expect(isAutoQueued(match({ label: AUTO_QUEUE_LABEL }))).toBe(true)
    expect(isAutoQueued(match({ label: null }))).toBe(false)
    expect(isAutoQueued(match({ label: '결승' }))).toBe(false)
  })
})

/*
 * 총무가 자동 편성을 들여다보고 고친 순간, 그 편성은 더 이상 앱이 짠 것이
 * 아니다. 배지를 남겨 두면 앱이 남의 결정을 자기 것이라고 우기게 된다.
 */
describe('labelAfterHumanEdit', () => {
  test("'자동' 은 뗀다", () => {
    expect(labelAfterHumanEdit(AUTO_QUEUE_LABEL)).toBeNull()
  })

  test('사람이 직접 붙인 이름은 그대로 둔다 — 고치기가 건드릴 것이 아니다', () => {
    expect(labelAfterHumanEdit('결승')).toBe('결승')
  })

  test('이름이 없던 경기는 그대로 없다', () => {
    expect(labelAfterHumanEdit(null)).toBeNull()
    expect(labelAfterHumanEdit(undefined)).toBeNull()
  })
})
