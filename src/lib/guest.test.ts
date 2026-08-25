import { describe, expect, test } from 'vitest'
import {
  GUEST_NAME_MAX,
  guestErrorMessage,
  guestLinkUrl,
  parseGuestJoinResult,
  parseGuestSessions,
  validateGuestName,
} from './guest'

describe('validateGuestName', () => {
  test('멀쩡한 이름은 통과시킨다', () => {
    expect(validateGuestName('홍길동')).toBeNull()
  })

  test('비어 있으면 막는다', () => {
    expect(validateGuestName('')).toBe(`이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`)
  })

  test('공백만 있으면 빈 이름과 같게 본다', () => {
    expect(validateGuestName('   ')).toBe(`이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`)
  })

  test('20자까지는 되고 21자부터 막는다', () => {
    expect(validateGuestName('가'.repeat(GUEST_NAME_MAX))).toBeNull()
    expect(validateGuestName('가'.repeat(GUEST_NAME_MAX + 1))).toBe(
      `이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`,
    )
  })

  test('앞뒤 공백은 길이에 세지 않는다', () => {
    expect(validateGuestName(`  ${'가'.repeat(GUEST_NAME_MAX)}  `)).toBeNull()
  })

  /*
   * join_as_guest 와 같은 순서다 — 먼저 지우고 나서 길이를 잰다.
   * 제어문자만 가득한 이름은 지운 뒤 빈 문자열이 되어 막힌다.
   */
  test('제어문자만 있는 이름은 지운 뒤 빈 이름으로 본다', () => {
    const controlOnly = String.fromCharCode(1) + String.fromCharCode(2) + String.fromCharCode(3)
    expect(validateGuestName(controlOnly)).toBe(`이름은 1~${GUEST_NAME_MAX}자로 입력해 주세요`)
  })

  /*
   * 제로폭 문자(U+200B)를 정리 없이 길이만 재면, 20자 제한을 우회해
   * 눈에 안 보이는 글자를 끼워 넣은 21자 이상 이름이 통과해 버린다.
   */
  test('제로폭 문자를 지운 뒤 길이를 잰다', () => {
    const zeroWidth = String.fromCharCode(0x200b)
    const padded = zeroWidth.repeat(50) + '가'.repeat(GUEST_NAME_MAX)
    expect(validateGuestName(padded)).toBeNull()
  })

  /*
   * U+202E(RTL override) 를 안 거르면 명단·심판 배지에서 다른 회원과
   * 구별이 안 되는 이름을 만들 수 있다(마이그레이션 주석의 경고).
   * 정리 후에도 남는 글자가 있으면 통과해야 한다 — 문자만 지우지, 이름
   * 자체를 통째로 막는 게 아니다.
   */
  test('방향 재정렬 문자를 지우고 나머지 글자는 살린다', () => {
    const rtlOverride = String.fromCharCode(0x202e)
    expect(validateGuestName(`${rtlOverride}길동`)).toBeNull()
  })
})

describe('guestLinkUrl', () => {
  test('/g/:guestCode 형태로 만든다', () => {
    expect(guestLinkUrl('https://smash.app', 'ABCDEFGHIJKLMNOPQRSTUV')).toBe(
      'https://smash.app/g/ABCDEFGHIJKLMNOPQRSTUV',
    )
  })

  test('origin 끝에 슬래시가 있어도 두 번 겹치지 않는다', () => {
    expect(guestLinkUrl('https://smash.app/', 'CODE')).toBe('https://smash.app/g/CODE')
  })
})

describe('guestErrorMessage', () => {
  test('코드마다 다른 안내를 준다 — 사용자가 할 일이 다르다', () => {
    expect(guestErrorMessage('bad_code')).toContain('링크')
    expect(guestErrorMessage('no_open_session')).toContain('열린 모임')
    expect(guestErrorMessage('session_closed')).toContain('등록할 수 없는')
    expect(guestErrorMessage('bad_name')).toContain('이름')
    expect(guestErrorMessage('guest_limit')).toContain('더 받을 수 없습니다')
  })

  test('unknown 도 빈 문구가 아니다', () => {
    expect(guestErrorMessage('unknown').length).toBeGreaterThan(0)
  })
})

describe('parseGuestSessions', () => {
  test('성공 봉투에서 동아리 이름과 후보를 꺼낸다', () => {
    const outcome = parseGuestSessions({
      ok: true,
      club_name: '한밭 배드민턴',
      sessions: [
        { id: 's1', name: '화요일 모임', starts_at: '2026-10-07T11:00:00Z' },
        { id: 's2', name: '즉석 모임', starts_at: null },
      ],
    })
    expect(outcome).toEqual({
      ok: true,
      clubName: '한밭 배드민턴',
      sessions: [
        { id: 's1', name: '화요일 모임', startsAt: '2026-10-07T11:00:00Z' },
        { id: 's2', name: '즉석 모임', startsAt: null },
      ],
    })
  })

  /*
   * 아는 오류는 서버 문구("링크가 올바르지 않습니다")와 우연히 같아 보여도
   * 우리 표를 통해서 나온다 — 서버가 문구를 바꿔도 화면 문구는 안 흔들린다.
   */
  test('막힌 이유마다 다른 안내를 준다', () => {
    const badCode = parseGuestSessions({ ok: false, error: 'bad_code', message: '무시된다' })
    const noOpen = parseGuestSessions({ ok: false, error: 'no_open_session', message: '무시된다' })

    expect(badCode).toEqual({ ok: false, error: 'bad_code', message: '링크가 올바르지 않습니다' })
    expect(noOpen.ok === false && noOpen.message).toContain('모임장에게 확인')
  })

  test('모르는 오류 코드면 서버 문구를 그대로 살린다', () => {
    const outcome = parseGuestSessions({
      ok: false,
      error: 'club_suspended',
      message: '동아리가 정지됐습니다',
    })
    expect(outcome).toEqual({ ok: false, error: 'unknown', message: '동아리가 정지됐습니다' })
  })

  test('모르는 오류에 문구도 없으면 기본 안내로 채운다 — 빈 문구는 절대 안 나온다', () => {
    const outcome = parseGuestSessions({ ok: false, error: 'club_suspended', message: '   ' })
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })

  /*
   * jsonb 라 타입은 약속일 뿐이다. 봉투가 아예 아닌 값이 와도 화면은
   * 빈 문구가 아니라 읽을 수 있는 안내를 보여야 한다.
   */
  test('봉투가 아닌 값은 전부 unknown 으로 떨어뜨리고 빈 문구를 만들지 않는다', () => {
    for (const bad of [null, undefined, '문자열', 42, [{ ok: true }], true]) {
      const outcome = parseGuestSessions(bad)
      expect(outcome.ok).toBe(false)
      expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
    }
  })

  test('성공이라면서 club_name 이 없으면 실패로 본다', () => {
    const outcome = parseGuestSessions({ ok: true, sessions: [] })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })

  test('성공이라면서 sessions 항목이 이상한 모양이면 실패로 본다', () => {
    const outcome = parseGuestSessions({
      ok: true,
      club_name: '한밭 배드민턴',
      sessions: [{ id: 's1' }],
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })

  test('sessions 가 빈 배열이면 성공으로 본다 — no_open_session 은 서버가 이미 걸러 준다', () => {
    const outcome = parseGuestSessions({ ok: true, club_name: '한밭 배드민턴', sessions: [] })
    expect(outcome).toEqual({ ok: true, clubName: '한밭 배드민턴', sessions: [] })
  })
})

describe('parseGuestJoinResult', () => {
  test('성공 봉투에서 적힌 이름과 모임 이름을 꺼낸다', () => {
    const outcome = parseGuestJoinResult({
      ok: true,
      display_name: '홍길동(2)',
      session_name: '화요일 모임',
    })
    expect(outcome).toEqual({ ok: true, displayName: '홍길동(2)', sessionName: '화요일 모임' })
  })

  test('막힌 이유마다 다른 안내를 준다', () => {
    const badCode = parseGuestJoinResult({ ok: false, error: 'bad_code', message: '무시된다' })
    const closed = parseGuestJoinResult({ ok: false, error: 'session_closed', message: '무시된다' })
    const badName = parseGuestJoinResult({ ok: false, error: 'bad_name', message: '무시된다' })
    const limit = parseGuestJoinResult({ ok: false, error: 'guest_limit', message: '무시된다' })

    expect(badCode.ok === false && badCode.error).toBe('bad_code')
    expect(closed.ok === false && closed.message).toBe('지금은 등록할 수 없는 모임입니다')
    expect(badName.ok === false && badName.message).toContain('이름은')
    expect(limit.ok === false && limit.message).toContain('오늘은 더 받을 수 없습니다')
  })

  test('모르는 오류 코드면 서버 문구를 그대로 살린다', () => {
    const outcome = parseGuestJoinResult({
      ok: false,
      error: 'club_deleted',
      message: '동아리가 삭제됐습니다',
    })
    expect(outcome).toEqual({ ok: false, error: 'unknown', message: '동아리가 삭제됐습니다' })
  })

  test('모르는 오류에 문구도 없으면 기본 안내로 채운다 — 빈 문구는 절대 안 나온다', () => {
    const outcome = parseGuestJoinResult({ ok: false, error: 'club_deleted', message: '' })
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })

  /*
   * jsonb 라 타입은 약속일 뿐이다. 게스트는 로그인도 안 한 사람이라
   * 이 경로가 깨졌을 때 개발자 콘솔을 열어 보라고 할 수도 없다 —
   * 빈 화면보다는 읽을 수 있는 안내가 훨씬 중요하다.
   */
  test('봉투가 아닌 값은 전부 unknown 으로 떨어뜨리고 빈 문구를 만들지 않는다', () => {
    for (const bad of [null, undefined, '문자열', 42, [{ ok: true }], true]) {
      const outcome = parseGuestJoinResult(bad)
      expect(outcome.ok).toBe(false)
      expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
    }
  })

  test('성공이라면서 display_name 이 없으면 실패로 본다', () => {
    const outcome = parseGuestJoinResult({ ok: true, session_name: '화요일 모임' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })

  test('성공이라면서 session_name 이 없으면 실패로 본다', () => {
    const outcome = parseGuestJoinResult({ ok: true, display_name: '홍길동' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
  })
})
