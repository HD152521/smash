import { describe, expect, it } from 'vitest'
import {
  countRsvp,
  groupRsvp,
  hasAccountContrast,
  hasStarted,
  partitionGoing,
  rsvpCountsText,
  rsvpErrorMessage,
  rsvpLabel,
  startsAtFromInput,
  startsAtLabel,
  type RsvpMember,
} from './rsvp'
import type { RsvpStatus } from '@/types/database'

/**
 * 시각은 전부 **로컬 시간**으로 만든다.
 *
 * `new Date(2026, 9, 7, 20, 0)` → `.toISOString()` 으로 보냈다가 다시 읽으면
 * 어느 시간대에서 돌려도 같은 벽시계 값이 나온다. ISO 문자열을 손으로 적으면
 * CI 시간대가 바뀌는 순간 테스트가 흔들린다 — 그리고 그건 이 기능의 요점
 * (판단은 사용자 시간대로 한다)을 검사하지 못한다는 뜻이다.
 */
const at = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm)
const iso = (date: Date) => date.toISOString()

function member(rsvp: RsvpStatus, userId: string | null = 'u1'): RsvpMember {
  return { userId, rsvp }
}

describe('hasStarted — 서버가 아니라 화면이 판단한다', () => {
  const start = at(2026, 10, 7, 20, 0)

  it('시작 시각 전이면 아직 안 시작했다', () => {
    expect(hasStarted(iso(start), at(2026, 10, 7, 19, 59))).toBe(false)
  })

  it('시작 시각을 지나면 시작했다', () => {
    expect(hasStarted(iso(start), at(2026, 10, 7, 20, 1))).toBe(true)
  })

  /*
   * 경계는 시작 시각을 포함한다. 정각에 화면이 아직 안 바뀌면
   * "내 시계는 20시인데 왜 아직 참가 신청 화면이지" 가 된다.
   */
  it('정각은 시작한 것으로 본다 (경계 포함)', () => {
    expect(hasStarted(iso(start), start)).toBe(true)
  })

  it('하루 전이든 한 달 전이든 안 시작한 것은 같다', () => {
    expect(hasStarted(iso(start), at(2026, 10, 6, 20, 0))).toBe(false)
    expect(hasStarted(iso(start), at(2026, 9, 7, 20, 0))).toBe(false)
  })

  /*
   * starts_at 이 NULL 이면 "지금 모여서 치는 날" 로 즉석 개설한 모임이다.
   * 대기 화면을 그릴 시각 자체가 없다.
   */
  it('starts_at 이 없으면 즉석 모임 — 항상 시작한 것으로 본다', () => {
    expect(hasStarted(null, at(2026, 1, 1))).toBe(true)
    expect(hasStarted(undefined, at(2026, 1, 1))).toBe(true)
  })

  /*
   * 못 읽는 값에서 false 를 주면 아무도 빠져나올 수 없는 대기 화면에 갇힌다.
   * 코트 현황은 최소한 늘 쓸 수 있어야 한다.
   */
  it('못 읽는 값도 시작한 것으로 본다 — 갇히는 화면을 만들지 않는다', () => {
    expect(hasStarted('내일쯤', at(2026, 1, 1))).toBe(true)
  })
})

describe('startsAtLabel', () => {
  it('사용자 시간대의 월·일·요일·시각을 읽는다', () => {
    expect(startsAtLabel(iso(at(2026, 10, 7, 20, 0)))).toBe('10월 7일 (수) 20:00')
  })

  it('한 자리 시각은 앞을 채운다 (목록에서 자리가 밀리지 않게)', () => {
    expect(startsAtLabel(iso(at(2026, 1, 3, 9, 5)))).toBe('1월 3일 (토) 09:05')
  })

  it('즉석 모임과 못 읽는 값은 null — 부르는 쪽이 자기 말을 고른다', () => {
    expect(startsAtLabel(null)).toBeNull()
    expect(startsAtLabel(undefined)).toBeNull()
    expect(startsAtLabel('내일쯤')).toBeNull()
  })
})

describe('startsAtFromInput — 비워 두면 즉석 개설', () => {
  it('빈 칸은 null 이다 (starts_at 을 안 보낸다)', () => {
    expect(startsAtFromInput('')).toBeNull()
    expect(startsAtFromInput('   ')).toBeNull()
  })

  it('입력값을 사용자 시간대로 읽어 ISO 로 바꾼다', () => {
    expect(startsAtFromInput('2026-10-07T20:00')).toBe(iso(at(2026, 10, 7, 20, 0)))
  })

  it('왕복해도 같은 벽시계 값이다', () => {
    expect(startsAtLabel(startsAtFromInput('2026-10-07T20:00'))).toBe('10월 7일 (수) 20:00')
  })

  it('말이 안 되는 값은 null 로 떨어뜨린다', () => {
    expect(startsAtFromInput('언젠가')).toBeNull()
  })
})

describe('countRsvp', () => {
  it('참가·미정·불참을 센다', () => {
    const counts = countRsvp([
      member('going', 'a'),
      member('going', 'b'),
      member('invited', 'c'),
      member('declined', 'd'),
    ])
    expect(counts).toEqual({ going: 2, undecided: 1, declined: 1, noAccount: 0 })
  })

  /*
   * 이 검사가 이 파일의 요점이다. 계정 없는 회원은 누를 주체가 없다.
   * '미정' 으로 세면 매주 그대로 남아 유령 미응답자가 되고, 모임장은
   * 오지도 않을 답을 기다린다.
   */
  it("계정 없는 회원(userId null)을 '미정' 으로 세지 않는다", () => {
    const counts = countRsvp([member('invited', 'c'), member('invited', null)])
    expect(counts.undecided).toBe(1)
    expect(counts.noAccount).toBe(1)
  })

  /*
   * 값이 'going' 이면 온다는 뜻이다 — 모임장이 "전화로 온다고 한 사람" 을
   * 대신 체크하는 건 정상 경로다. 계정이 갈리는 건 답이 없는 행뿐이다.
   */
  it('계정이 없어도 참가·불참으로 표시됐으면 그대로 센다', () => {
    const counts = countRsvp([member('going', null), member('declined', null)])
    expect(counts).toEqual({ going: 1, undecided: 0, declined: 1, noAccount: 0 })
  })

  it('네 숫자의 합은 언제나 명단 전체다', () => {
    const roster = [
      member('going', 'a'),
      member('declined', 'b'),
      member('invited', 'c'),
      member('invited', null),
    ]
    const c = countRsvp(roster)
    expect(c.going + c.undecided + c.declined + c.noAccount).toBe(roster.length)
  })

  it('빈 명단도 0 으로 답한다', () => {
    expect(countRsvp([])).toEqual({ going: 0, undecided: 0, declined: 0, noAccount: 0 })
  })
})

describe('groupRsvp — 숫자와 목록이 같은 곳에서 나온다', () => {
  const roster = [
    { userId: 'a', rsvp: 'invited' as const, name: '미정이' },
    { userId: 'b', rsvp: 'going' as const, name: '참가자' },
    { userId: null, rsvp: 'invited' as const, name: '명단만' },
    { userId: 'c', rsvp: 'declined' as const, name: '불참자' },
  ]

  it('네 칸으로 가른다', () => {
    const g = groupRsvp(roster)
    expect(g.going.map((m) => m.name)).toEqual(['참가자'])
    expect(g.undecided.map((m) => m.name)).toEqual(['미정이'])
    expect(g.declined.map((m) => m.name)).toEqual(['불참자'])
    expect(g.noAccount.map((m) => m.name)).toEqual(['명단만'])
  })

  it('countRsvp 와 언제나 같은 답을 준다', () => {
    const g = groupRsvp(roster)
    expect(countRsvp(roster)).toEqual({
      going: g.going.length,
      undecided: g.undecided.length,
      declined: g.declined.length,
      noAccount: g.noAccount.length,
    })
  })
})

describe('rsvpCountsText', () => {
  it('머리말 한 줄로 읽힌다', () => {
    expect(rsvpCountsText({ going: 12, undecided: 3, declined: 1, noAccount: 2 })).toBe(
      '참가 12 · 미정 3 · 불참 1',
    )
  })
})

describe('rsvpLabel', () => {
  it("'초대됨' 이 아니라 '미정' 이라고 부른다", () => {
    expect(rsvpLabel('invited')).toBe('미정')
    expect(rsvpLabel('going')).toBe('참가')
    expect(rsvpLabel('declined')).toBe('불참')
  })

  it('값이 없으면 미정 — 빈칸을 그리지 않는다', () => {
    expect(rsvpLabel(null)).toBe('미정')
    expect(rsvpLabel(undefined)).toBe('미정')
  })
})

describe('partitionGoing — 참가는 게이트가 아니라 순서다', () => {
  const roster = [
    { userId: 'a', rsvp: 'invited' as const, name: '미정이' },
    { userId: 'b', rsvp: 'going' as const, name: '참가자' },
    { userId: null, rsvp: 'declined' as const, name: '명단만' },
  ]

  it('참가한 사람을 앞으로 뽑는다', () => {
    expect(partitionGoing(roster).going.map((m) => m.name)).toEqual(['참가자'])
  })

  it('안 누른 사람도 불참한 사람도 목록에서 빠지지 않는다', () => {
    expect(partitionGoing(roster).others.map((m) => m.name)).toEqual(['미정이', '명단만'])
  })

  it('원래 순서를 지킨다 (명단 정렬이 화면마다 달라지면 안 된다)', () => {
    const many = [
      { userId: 'a', rsvp: 'going' as const, name: '가' },
      { userId: 'b', rsvp: 'going' as const, name: '나' },
    ]
    expect(partitionGoing(many).going.map((m) => m.name)).toEqual(['가', '나'])
  })
})

describe('hasAccountContrast — 소수일 때만 배지가 정보다', () => {
  it('전원 계정이 없으면 배지가 아무도 갈라주지 못한다 — 숨긴다', () => {
    expect(hasAccountContrast([{ userId: null }, { userId: null }])).toBe(false)
  })

  it('전원 계정이 있으면 배지가 아무도 갈라주지 못한다 — 숨긴다', () => {
    expect(hasAccountContrast([{ userId: 'a' }, { userId: 'b' }])).toBe(false)
  })

  it('섞여 있으면 계정 없는 사람이 실제로 다르다 — 보여준다', () => {
    expect(hasAccountContrast([{ userId: 'a' }, { userId: null }])).toBe(true)
  })

  test('다수가 계정이 없으면 안 붙인다 — 배지가 배경이 된다', () => {
    /*
     * 실제로 이랬다. 9명 중 8명에게 '미가입' 이 붙어 눈이 그냥 건너뛰었다.
     * 다수가 계정이 없는 것은 개인의 예외가 아니라 그 명단 전체의 성격이고,
     * 화면 위쪽 요약줄("· 명단만 8")이 이미 말해 준다.
     */
    const many = [{ userId: 'a' }, ...Array.from({ length: 8 }, () => ({ userId: null }))]
    expect(hasAccountContrast(many)).toBe(false)
  })

  test('반반이면 붙인다 — 절반은 아직 갈라 준다', () => {
    expect(
      hasAccountContrast([{ userId: 'a' }, { userId: 'b' }, { userId: null }, { userId: null }]),
    ).toBe(true)
  })

  it('빈 목록이면 갈라줄 것이 없다', () => {
    expect(hasAccountContrast([])).toBe(false)
  })

  it('한 명뿐이면 대비가 없다', () => {
    expect(hasAccountContrast([{ userId: null }])).toBe(false)
  })
})

describe('rsvpErrorMessage', () => {
  /*
   * set_my_rsvp 가 42501 을 던지는 경우는 하나뿐이다 — 이 모임 명단에
   * 내 행이 없다. '권한이 없습니다' 로 보여 주면 기다리면 되는지
   * 모임장에게 말해야 하는지를 알 수 없다.
   */
  it("42501 을 '권한 없음' 이 아니라 '명단에 없다' 로 말한다", () => {
    const message = rsvpErrorMessage({ code: '42501', message: '이 모임의 참가자가 아닙니다' })
    expect(message).toContain('명단에 없어서')
    expect(message).not.toContain('권한이 없습니다')
  })

  it('명단 스냅샷 때문이라는 것까지 알려 준다', () => {
    expect(rsvpErrorMessage({ code: '42501', message: '' })).toContain('다음 모임부터')
  })

  it('대회에서 부른 경우(22023)는 서버 문구를 그대로 쓴다', () => {
    expect(rsvpErrorMessage({ code: '22023', message: '대회에는 참가 신청이 없습니다' })).toBe(
      '대회에는 참가 신청이 없습니다',
    )
  })

  it('알 수 없는 오류도 빈칸으로 두지 않는다', () => {
    expect(rsvpErrorMessage(null)).toBe('참가 여부를 저장하지 못했습니다')
  })
})
