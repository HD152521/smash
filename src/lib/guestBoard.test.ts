import { describe, expect, test } from 'vitest'
import type { GuestBoardCourt, GuestBoardMatch } from './guest'
import { buildGuestBoard, hasVisibleScore, myNextMatch } from './guestBoard'

function court(id: string, name: string, sortOrder: number): GuestBoardCourt {
  return { id, name, sortOrder }
}

function match(over: Partial<GuestBoardMatch> & Pick<GuestBoardMatch, 'id'>): GuestBoardMatch {
  return {
    courtId: null,
    status: 'scheduled',
    queueOrder: 1,
    startedAt: null,
    scoreA: 0,
    scoreB: 0,
    playersA: [],
    playersB: [],
    ...over,
  }
}

const COURT_1 = court('c1', '1번 코트', 1)
const COURT_2 = court('c2', '2번 코트', 2)

describe('buildGuestBoard', () => {
  test('코트 목록의 순서를 그대로 지킨다', () => {
    // Arrange
    const courts = [COURT_1, COURT_2]

    // Act
    const board = buildGuestBoard([], courts)

    // Assert
    expect(board.courts.map((q) => q.court.name)).toEqual(['1번 코트', '2번 코트'])
  })

  test('코트별로 진행 중 경기 하나와 대기 경기를 나눠 담는다', () => {
    // Arrange
    const live = match({ id: 'live1', courtId: 'c1', status: 'live', queueOrder: 1 })
    const wait1 = match({ id: 'w1', courtId: 'c1', queueOrder: 2 })
    const wait2 = match({ id: 'w2', courtId: 'c2', queueOrder: 3 })

    // Act
    const board = buildGuestBoard([live, wait1, wait2], [COURT_1, COURT_2])

    // Assert
    expect(board.courts[0]?.live?.id).toBe('live1')
    expect(board.courts[0]?.waiting.map((m) => m.id)).toEqual(['w1'])
    expect(board.courts[1]?.live).toBeNull()
    expect(board.courts[1]?.waiting.map((m) => m.id)).toEqual(['w2'])
  })

  /*
   * 서버는 queue_order, created_at 으로 정렬해 보내는데 created_at 은 응답에
   * 없다. 여기서 다시 정렬하면 동점 처리를 재현할 수 없어 notify_up_next 와
   * 다른 줄을 세게 된다 — 정렬은 서버 것 하나뿐이다.
   */
  test('서버가 준 순서를 다시 정렬하지 않는다', () => {
    // Arrange — queue_order 가 뒤죽박죽인 채로 들어온다
    const first = match({ id: 'first', courtId: 'c1', queueOrder: 9 })
    const second = match({ id: 'second', courtId: 'c1', queueOrder: 2 })

    // Act
    const board = buildGuestBoard([first, second], [COURT_1])

    // Assert
    expect(board.courts[0]?.waiting.map((m) => m.id)).toEqual(['first', 'second'])
  })

  /*
   * 이게 이 파일에서 가장 중요한 테스트다. 로그인 사용자 화면은 코트 미정
   * 경기를 모든 코트에 함께 띄우는데(먼저 비는 코트가 집어가므로 옳다),
   * 게스트 화면에서 그러면 "대기 2번" 이 코트 넷에 동시에 뜬다.
   */
  test('코트 미정 경기를 코트마다 복제하지 않고 따로 낸다', () => {
    // Arrange
    const floating = match({ id: 'free', courtId: null, queueOrder: 5 })

    // Act
    const board = buildGuestBoard([floating], [COURT_1, COURT_2])

    // Assert
    expect(board.unassigned.map((m) => m.id)).toEqual(['free'])
    expect(board.courts[0]?.waiting).toEqual([])
    expect(board.courts[1]?.waiting).toEqual([])
  })

  test('코트 미정 줄에는 예정 경기만 담는다', () => {
    // Arrange — 코트 없이 진행 중인 경기는 실제로는 안 생긴다(claim_court 가 붙인다)
    const liveNoCourt = match({ id: 'odd', courtId: null, status: 'live' })

    // Act
    const board = buildGuestBoard([liveNoCourt], [COURT_1])

    // Assert
    expect(board.unassigned).toEqual([])
  })

  test('코트가 하나도 없으면 코트 줄도 비어 있다', () => {
    // Arrange
    const waiting = match({ id: 'w1', courtId: null })

    // Act
    const board = buildGuestBoard([waiting], [])

    // Assert
    expect(board.courts).toEqual([])
    expect(board.unassigned.map((m) => m.id)).toEqual(['w1'])
  })
})

describe('hasVisibleScore', () => {
  /*
   * matches.scored 는 not null default true 라 진행 중 경기도 참이다.
   * 그걸로 판단하면 모든 코트에 0 : 0 이 뜬다 — 서버가 scored 를 아예
   * 안 싣는 이유이자 이 함수가 있는 이유다.
   */
  test('아직 한 점도 안 났으면 점수를 보여주지 않는다', () => {
    expect(hasVisibleScore(match({ id: 'm', scoreA: 0, scoreB: 0 }))).toBe(false)
  })

  test('한쪽만 점수가 있어도 보여준다', () => {
    expect(hasVisibleScore(match({ id: 'm', scoreA: 1, scoreB: 0 }))).toBe(true)
    expect(hasVisibleScore(match({ id: 'm', scoreA: 0, scoreB: 1 }))).toBe(true)
  })

  test('양쪽 다 점수가 있으면 보여준다', () => {
    expect(hasVisibleScore(match({ id: 'm', scoreA: 11, scoreB: 9 }))).toBe(true)
  })
})

describe('myNextMatch', () => {
  test('이름이 없으면 카드를 그리지 않는다', () => {
    // Arrange
    const mine = match({ id: 'w', courtId: 'c1', playersA: ['홍길동'] })
    const board = buildGuestBoard([mine], [COURT_1])

    // Act
    const next = myNextMatch(board, undefined)

    // Assert
    expect(next).toBeNull()
  })

  test('편성이 하나도 없으면 카드를 그리지 않는다', () => {
    // Arrange
    const board = buildGuestBoard([match({ id: 'w', courtId: 'c1', playersA: ['남'] })], [COURT_1])

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toBeNull()
  })

  test('지금 뛰는 중이면 코트 이름만 알려준다', () => {
    // Arrange
    const live = match({ id: 'l', courtId: 'c2', status: 'live', playersB: ['홍길동'] })
    const board = buildGuestBoard([live], [COURT_1, COURT_2])

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'playing', courtName: '2번 코트' })
  })

  test('뛰는 중이면 뒤에 예정 경기가 있어도 뛰는 쪽을 앞세운다', () => {
    // Arrange
    const live = match({
      id: 'l',
      courtId: 'c1',
      status: 'live',
      queueOrder: 1,
      playersA: ['홍길동'],
    })
    const later = match({ id: 'w', courtId: 'c2', queueOrder: 2, playersA: ['홍길동'] })
    const board = buildGuestBoard([live, later], [COURT_1, COURT_2])

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'playing', courtName: '1번 코트' })
  })

  test('코트에 붙은 대기면 앞에 몇 경기인지 센다', () => {
    // Arrange — 내 앞에 두 경기가 서 있다
    const board = buildGuestBoard(
      [
        match({ id: 'a', courtId: 'c1', queueOrder: 1 }),
        match({ id: 'b', courtId: 'c1', queueOrder: 2 }),
        match({ id: 'mine', courtId: 'c1', queueOrder: 3, playersB: ['홍길동'] }),
      ],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'waiting', courtName: '1번 코트', ahead: 2 })
  })

  test('내가 그 코트의 맨 앞이면 앞에 0경기다', () => {
    // Arrange
    const board = buildGuestBoard(
      [match({ id: 'mine', courtId: 'c1', queueOrder: 1, playersA: ['홍길동'] })],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'waiting', courtName: '1번 코트', ahead: 0 })
  })

  test('지금 뛰는 경기는 앞에 선 줄로 세지 않는다', () => {
    // Arrange — 코트에서 남이 뛰는 중이어도 내 앞 대기는 0 이다
    const board = buildGuestBoard(
      [
        match({ id: 'live', courtId: 'c1', status: 'live', queueOrder: 1 }),
        match({ id: 'mine', courtId: 'c1', queueOrder: 2, playersA: ['홍길동'] }),
      ],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'waiting', courtName: '1번 코트', ahead: 0 })
  })

  /*
   * 어느 코트가 먼저 빌지 모르는데 "앞에 2경기" 를 내면 그건 추측이 아니라
   * 거짓말이다. 숫자를 아예 내지 않는다.
   */
  test('코트가 안 정해졌으면 숫자를 내지 않는다', () => {
    // Arrange
    const board = buildGuestBoard(
      [match({ id: 'mine', courtId: null, queueOrder: 4, playersA: ['홍길동'] })],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'unassigned' })
  })

  test('코트 미정 경기가 더 앞서면 그쪽을 고른다', () => {
    // Arrange
    const board = buildGuestBoard(
      [
        match({ id: 'free', courtId: null, queueOrder: 1, playersA: ['홍길동'] }),
        match({ id: 'onCourt', courtId: 'c1', queueOrder: 2, playersA: ['홍길동'] }),
      ],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'unassigned' })
  })

  test('여러 코트에 내 경기가 있으면 queue_order 가 가장 앞선 것을 고른다', () => {
    // Arrange
    const board = buildGuestBoard(
      [
        match({ id: 'later', courtId: 'c1', queueOrder: 7, playersA: ['홍길동'] }),
        match({ id: 'sooner', courtId: 'c2', queueOrder: 3, playersA: ['홍길동'] }),
      ],
      [COURT_1, COURT_2],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'waiting', courtName: '2번 코트', ahead: 0 })
  })

  test('B 팀에 있어도 내 경기로 찾는다', () => {
    // Arrange
    const board = buildGuestBoard(
      [match({ id: 'mine', courtId: 'c1', queueOrder: 1, playersB: ['홍길동'] })],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toEqual({ kind: 'waiting', courtName: '1번 코트', ahead: 0 })
  })

  /*
   * 같은 이름이 이미 있으면 join_as_guest 가 접미사를 붙인다. 저장하는 값이
   * 서버가 돌려준 최종 이름이어야 하는 이유가 여기 있다 — 느슨하게 맞추면
   * '홍길동' 이 '홍길동2' 의 경기를 자기 것으로 강조한다.
   */
  test('접미사가 붙은 다른 사람의 경기를 내 것으로 보지 않는다', () => {
    // Arrange
    const board = buildGuestBoard(
      [match({ id: 'other', courtId: 'c1', queueOrder: 1, playersA: ['홍길동2'] })],
      [COURT_1],
    )

    // Act
    const next = myNextMatch(board, '홍길동')

    // Assert
    expect(next).toBeNull()
  })
})
