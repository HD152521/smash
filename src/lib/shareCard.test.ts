import { describe, expect, test } from 'vitest'
import {
  buildGuestBoardCard,
  buildGuestJoinCard,
  CARD_MARK_END,
  CARD_MARK_START,
  DEFAULT_CARD,
  formatSessionTime,
  injectCardMeta,
  renderCardMeta,
  safeText,
} from './shareCard'

const IMAGE = 'https://smash.juganlab.com/og.png'

/**
 * 실제 `guest_sessions` 봉투. 서버가 주는 키를 하나도 빼지 않고 옮겼다 —
 * 「카드에 뭐가 실리나」 를 검사하려면 입력이 실물이어야 한다.
 */
const JOIN_PAYLOAD = {
  ok: true,
  club_name: '한빛배드민턴',
  sessions: [
    { id: '5f1b0e3a-2c4d-4a11-9f00-abcdef012345', name: '수요 정기모임', starts_at: '2026-09-02T10:30:00+00:00' },
  ],
}

/**
 * 실제 `guest_board` 봉투. **사람 이름과 id 가 들어 있는 그대로**다 —
 * 이 입력으로 만든 카드에 그것들이 한 조각도 안 나오는지가 이 파일의
 * 가장 중요한 검사다.
 */
const BOARD_PAYLOAD = {
  ok: true,
  club_name: '한빛배드민턴',
  session: {
    id: '5f1b0e3a-2c4d-4a11-9f00-abcdef012345',
    name: '수요 정기모임',
    starts_at: '2026-09-02T10:30:00+00:00',
    status: 'live',
  },
  courts: [
    { id: 'c1', name: 'A코트', sort_order: 1 },
    { id: 'c2', name: 'B코트', sort_order: 2 },
  ],
  matches: [
    {
      id: 'm1',
      court_id: 'c1',
      status: 'live',
      queue_order: 1,
      started_at: '2026-09-02T10:40:00+00:00',
      score_a: 11,
      score_b: 7,
      players_a: ['김철수', '이영희'],
      players_b: ['박민수', '최지은'],
    },
    {
      id: 'm2',
      court_id: null,
      status: 'scheduled',
      queue_order: 2,
      started_at: null,
      score_a: 0,
      score_b: 0,
      players_a: ['정하나', '강두리'],
      players_b: ['윤세영', '한네모'],
    },
    {
      id: 'm3',
      court_id: null,
      status: 'scheduled',
      queue_order: 3,
      started_at: null,
      score_a: 0,
      score_b: 0,
      players_a: [],
      players_b: [],
    },
  ],
  finished_count: 12,
}

/** 카드에 절대 나오면 안 되는 것 전부. 하나라도 새면 링크 하나로 새는 것이다 */
const FORBIDDEN = [
  // 사람 이름
  '김철수',
  '이영희',
  '박민수',
  '최지은',
  '정하나',
  '강두리',
  '윤세영',
  '한네모',
  // 사람·모임·코트를 가리키는 키
  '5f1b0e3a',
  'abcdef012345',
  'c1',
  'c2',
  'm1',
  'm2',
  'm3',
  // 코드 — 주소에 이미 있다. 카드에 또 적으면 화면 캡처로 링크가 샌다
  'ABCDEFGHJKLMNPQRSTUVW2',
  'A1B2C3',
  // 점수 · 자유 입력 · 운영 메타데이터
  'score_a',
  'players_a',
  'players_b',
  'started_at',
  'queue_order',
]

function html(card: { title: string; description: string }): string {
  return renderCardMeta(card, IMAGE)
}

describe('카드 전수 검사 — 사람과 코드는 한 조각도 안 나간다', () => {
  test('현황판 카드에 사람 이름·id·코드가 하나도 없다', () => {
    const rendered = html(buildGuestBoardCard(BOARD_PAYLOAD))
    for (const secret of FORBIDDEN) {
      expect(rendered).not.toContain(secret)
    }
  })

  test('등록 카드에 사람 이름·id·코드가 하나도 없다', () => {
    const rendered = html(buildGuestJoinCard(JOIN_PAYLOAD))
    for (const secret of FORBIDDEN) {
      expect(rendered).not.toContain(secret)
    }
  })

  test('봉투에 없던 필드를 서버가 늘려도 카드는 안 바뀐다', () => {
    // 다음 마이그레이션이 필드를 하나 더 실어 보내는 상황. 빌더가 키를 이름으로
    // 꺼내 쓰므로 저절로 새면 안 된다 — 새려면 이 파일을 먼저 고쳐야 한다.
    const widened = {
      ...BOARD_PAYLOAD,
      members: ['김철수', '이영희', '박민수'],
      invite_code: 'A1B2C3',
      guest_code: 'ABCDEFGHJKLMNPQRSTUVW2',
      created_by: '5f1b0e3a-2c4d-4a11-9f00-abcdef012345',
    }
    expect(buildGuestBoardCard(widened)).toEqual(buildGuestBoardCard(BOARD_PAYLOAD))
  })

  test('점수는 안 싣는다 — 카드는 그 경기와 무관한 사람에게까지 간다', () => {
    const card = buildGuestBoardCard(BOARD_PAYLOAD)
    expect(card.description).not.toContain('11')
    expect(card.description).not.toContain('7')
  })
})

describe('없는 모임·틀린 코드는 기본 카드', () => {
  test.each([
    ['ok:false (bad_code)', { ok: false, error: 'bad_code', message: '링크가 올바르지 않습니다' }],
    ['ok:false (no_open_session)', { ok: false, error: 'no_open_session' }],
    ['null', null],
    ['배열', []],
    ['문자열', 'nope'],
    ['ok 만 있는 빈 봉투', { ok: true }],
    ['club_name 이 빈 문자열', { ok: true, club_name: '   ', sessions: [{ name: 'x' }] }],
    ['club_name 이 문자열이 아님', { ok: true, club_name: 42, sessions: [{ name: 'x' }] }],
    ['sessions 가 빈 배열', { ok: true, club_name: '한빛', sessions: [] }],
  ])('등록 카드 — %s', (_label, payload) => {
    expect(buildGuestJoinCard(payload)).toEqual(DEFAULT_CARD)
  })

  test.each([
    ['board_closed', { ok: false, error: 'board_closed' }],
    ['null', null],
    ['배열', []],
    ['club_name 없음', { ok: true, session: { name: '수요 모임' } }],
  ])('현황판 카드 — %s', (_label, payload) => {
    expect(buildGuestBoardCard(payload)).toEqual(DEFAULT_CARD)
  })

  test('기본 카드는 앱 이름과 한 줄 설명뿐이다', () => {
    const rendered = html(DEFAULT_CARD)
    expect(rendered).toContain('SMASH')
    expect(rendered).toContain('배드민턴 대회 운영')
    expect(rendered).toContain(IMAGE)
  })
})

describe('등록 카드 (/g/:code)', () => {
  test('모임이 하나면 동아리·모임 이름과 시각, 그리고 할 일을 말한다', () => {
    const card = buildGuestJoinCard(JOIN_PAYLOAD)
    expect(card.title).toBe('한빛배드민턴 · 수요 정기모임')
    expect(card.description).toContain('9월 2일')
    expect(card.description).toContain('이름만 적으면')
  })

  test('모임이 여럿이면 개수만 말하고 이름은 안 싣는다', () => {
    const card = buildGuestJoinCard({
      ok: true,
      club_name: '한빛배드민턴',
      sessions: [
        { id: 'a', name: '오전 모임', starts_at: null },
        { id: 'b', name: '저녁 모임', starts_at: null },
      ],
    })
    expect(card.title).toBe('한빛배드민턴 모임 참가')
    expect(card.description).toContain('열린 모임 2개')
    expect(card.description).not.toContain('오전 모임')
  })

  test('시각이 없는 즉석 모임도 카드가 나온다', () => {
    const card = buildGuestJoinCard({
      ok: true,
      club_name: '한빛배드민턴',
      sessions: [{ id: 'a', name: '즉석 모임', starts_at: null }],
    })
    expect(card.title).toBe('한빛배드민턴 · 즉석 모임')
    expect(card.description).toBe('이름만 적으면 참가 완료 — 가입도 로그인도 필요 없습니다')
  })
})

describe('현황판 카드 (/g/:code/:sessionId)', () => {
  test('코트 수와 경기 수만 — 사람을 가리키지 않는 숫자뿐이다', () => {
    const card = buildGuestBoardCard(BOARD_PAYLOAD)
    expect(card.title).toBe('수요 정기모임 현황')
    expect(card.description).toBe(
      '한빛배드민턴 · 코트 2면 · 진행 중 1경기 · 대기 2경기 · 끝난 경기 12',
    )
  })

  test('끝난 모임은 0경기 대신 마쳤다고 말한다', () => {
    const card = buildGuestBoardCard({
      ...BOARD_PAYLOAD,
      session: { ...BOARD_PAYLOAD.session, status: 'finished' },
      matches: [],
    })
    expect(card.description).toBe('한빛배드민턴 · 마친 모임 · 총 12경기')
  })

  test('finished_count 가 숫자가 아니면 그 조각만 빠진다', () => {
    const card = buildGuestBoardCard({ ...BOARD_PAYLOAD, finished_count: 'many' })
    expect(card.description).toBe('한빛배드민턴 · 코트 2면 · 진행 중 1경기 · 대기 2경기')
  })

  test('모임 이름이 없으면 동아리 이름으로 제목을 만든다', () => {
    const card = buildGuestBoardCard({
      ...BOARD_PAYLOAD,
      session: { ...BOARD_PAYLOAD.session, name: '' },
    })
    expect(card.title).toBe('한빛배드민턴 모임 현황')
  })
})

describe('자유 입력이 메타 태그를 뚫지 못한다', () => {
  test('따옴표와 꺾쇠는 실체 참조로 나간다', () => {
    const rendered = html(
      buildGuestJoinCard({
        ok: true,
        club_name: '"><script>alert(1)</script>',
        sessions: [{ id: 'a', name: '모임', starts_at: null }],
      }),
    )
    expect(rendered).not.toContain('<script>')
    expect(rendered).toContain('&quot;&gt;&lt;script&gt;')
    // content 속성이 조기 종료되지 않았는지 — og:title 줄이 정확히 하나다
    expect(rendered.match(/property="og:title"/g)).toHaveLength(1)
  })

  test('제어문자·방향 재정렬 문자는 지운다', () => {
    // RLO(U+202E) 와 ZWSP(U+200B). 리터럴로 적으면 이 파일을 거치는 도구가
    // 조용히 지워 버려 검사가 아무것도 안 하게 된다 — 코드포인트로 만든다.
    const dirty = `수요${String.fromCharCode(0x202e)}모임${String.fromCharCode(0x200b)}정기`
    expect(safeText(dirty, 60)).toBe('수요 모임 정기')
  })

  test('너무 긴 이름은 말줄임표로 끊는다', () => {
    const long = '가'.repeat(200)
    const out = safeText(long, 60)
    expect(out).toHaveLength(60)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('시각은 한국 시간으로 적는다', () => {
  test('UTC 로 받은 값을 KST 로 옮긴다', () => {
    // 2026-09-02T10:30Z = 한국 시간 2026-09-02 19:30 (수)
    expect(formatSessionTime('2026-09-02T10:30:00+00:00')).toBe('9월 2일 (수) 오후 7:30')
  })

  test('한국어 조립은 런타임 로케일에 맡기지 않는다 — 자정·정오도 정확히', () => {
    // 자정 = 오전 12시, 정오 = 오후 12시. h23/h24 판본 차이로 가장 잘 틀리는 자리다.
    expect(formatSessionTime('2026-09-01T15:00:00+00:00')).toBe('9월 2일 (수) 오전 12:00')
    expect(formatSessionTime('2026-09-02T03:00:00+00:00')).toBe('9월 2일 (수) 오후 12:00')
    expect(formatSessionTime('2026-09-02T00:05:00+00:00')).toBe('9월 2일 (수) 오전 9:05')
  })

  test.each([[null], [''], ['어제'], [123]])('시각이 아닌 값은 빈 문자열 (%s)', (value) => {
    expect(formatSessionTime(value)).toBe('')
  })
})

describe('사람에게 가는 응답은 안 바뀐다', () => {
  const built = [
    '<!doctype html>',
    '<html lang="ko" data-theme="dark">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    `    ${CARD_MARK_START}`,
    '    <title>SMASH</title>',
    `    ${CARD_MARK_END}`,
    '    <link rel="manifest" href="/manifest.webmanifest" />',
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" crossorigin src="/assets/index-abc123.js"></script>',
    '  </body>',
    '</html>',
  ].join('\n')

  test('카드 블록만 갈아 끼우고 나머지 문서는 글자 하나 안 건드린다', () => {
    const out = injectCardMeta(built, renderCardMeta(buildGuestJoinCard(JOIN_PAYLOAD), IMAGE))
    // 앱이 뜨는 데 필요한 것 전부가 그대로 있다
    expect(out).toContain('<div id="root"></div>')
    expect(out).toContain('src="/assets/index-abc123.js"')
    expect(out).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(out).toContain('data-theme="dark"')
    expect(out).toContain('<meta charset="UTF-8" />')
    // 제목은 하나뿐이다 — 덧붙이지 않고 교체했다는 뜻
    expect(out.match(/<title>/g)).toHaveLength(1)
    expect(out).toContain('한빛배드민턴 · 수요 정기모임')
  })

  test('경계 주석이 없으면 원본을 그대로 돌려준다 (링크가 안 열리는 것보다 낫다)', () => {
    const noMarks = '<!doctype html><html><head><title>SMASH</title></head></html>'
    expect(injectCardMeta(noMarks, renderCardMeta(DEFAULT_CARD, IMAGE))).toBe(noMarks)
  })

  test('여는 주석만 있고 닫는 주석이 없어도 원본 그대로', () => {
    const half = `<head>${CARD_MARK_START}<title>SMASH</title></head>`
    expect(injectCardMeta(half, renderCardMeta(DEFAULT_CARD, IMAGE))).toBe(half)
  })

  test('갈아 끼운 뒤에도 경계 주석이 남아 다음 요청이 또 갈아 끼울 수 있다', () => {
    const once = injectCardMeta(built, renderCardMeta(DEFAULT_CARD, IMAGE))
    expect(once).toContain(CARD_MARK_START)
    expect(once).toContain(CARD_MARK_END)
    const twice = injectCardMeta(once, renderCardMeta(buildGuestJoinCard(JOIN_PAYLOAD), IMAGE))
    expect(twice.match(/<title>/g)).toHaveLength(1)
  })
})
