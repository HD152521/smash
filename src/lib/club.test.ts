import { describe, expect, test } from 'vitest'
import {
  CLUB_NAME_MAX,
  clubRoleLabel,
  isClubStaff,
  parseJoinResult,
  validateClubName,
} from './club'

describe('clubRoleLabel', () => {
  test('세 역할을 동아리 말로 부른다', () => {
    expect(clubRoleLabel('owner')).toBe('동아리장')
    expect(clubRoleLabel('admin')).toBe('운영진')
    expect(clubRoleLabel('member')).toBe('회원')
  })

  /*
   * 대회 쪽 호칭(주최자·관리자·참가자)과 겹치면 안 된다.
   * 같은 흐름에서 같은 단어가 두 계층을 가리키면 지금 어디를 보고 있는지
   * 알 수 없게 된다 — 초대 코드가 두 종류가 된 것과 같은 종류의 혼동이다.
   */
  test('대회 쪽 호칭과 한 글자도 겹치지 않는다', () => {
    const clubWords = ['owner', 'admin', 'member'].map((r) =>
      clubRoleLabel(r as 'owner' | 'admin' | 'member'),
    )
    expect(clubWords).not.toContain('주최자')
    expect(clubWords).not.toContain('관리자')
    expect(clubWords).not.toContain('참가자')
  })

  /*
   * 캐시에 남은 옛 행이나 조인 실패로 역할이 비어 올 수 있다.
   * 모르면 운영진으로 읽는 쪽으로 두면 관리 버튼이 열린 것처럼 보이고,
   * 실제로는 RLS 가 막아서 눌러도 아무 일이 없는 고장으로 보인다.
   */
  test('값이 없으면 가장 권한 낮은 쪽으로 읽는다', () => {
    expect(clubRoleLabel(null)).toBe('회원')
    expect(clubRoleLabel(undefined)).toBe('회원')
  })
})

describe('isClubStaff', () => {
  /*
   * DB 의 is_club_admin 이 role in ('owner','admin') 으로 판정한다.
   * 화면에서 admin 만 보면 동아리를 만든 본인(owner)에게 관리 버튼이
   * 안 보인다 — 만들자마자 자기 동아리를 못 만지는 상태가 된다.
   */
  test('동아리장도 운영진이다', () => {
    expect(isClubStaff('owner')).toBe(true)
    expect(isClubStaff('admin')).toBe(true)
  })

  test('회원은 운영진이 아니다', () => {
    expect(isClubStaff('member')).toBe(false)
  })

  test('값이 없으면 운영진이 아니다', () => {
    expect(isClubStaff(null)).toBe(false)
    expect(isClubStaff(undefined)).toBe(false)
  })
})

describe('validateClubName', () => {
  test('멀쩡한 이름은 통과시킨다', () => {
    expect(validateClubName('한밭 배드민턴')).toBeNull()
  })

  test('비어 있으면 막는다', () => {
    expect(validateClubName('')).toBe('동아리 이름을 입력해 주세요')
  })

  /*
   * SQL 제약이 length(btrim(name)) 이라 공백만 채운 이름은 서버에서 떨어진다.
   * 화면이 trim 없이 재면 통과시켜 놓고 왕복 한 번 뒤에 실패한다.
   */
  test('공백만 있는 이름은 빈 이름과 같게 본다', () => {
    expect(validateClubName('   ')).toBe('동아리 이름을 입력해 주세요')
  })

  test('60자까지는 되고 61자부터 막는다', () => {
    expect(validateClubName('가'.repeat(CLUB_NAME_MAX))).toBeNull()
    expect(validateClubName('가'.repeat(CLUB_NAME_MAX + 1))).toBe(
      '동아리 이름은 60자까지 쓸 수 있습니다',
    )
  })

  /* 앞뒤 공백은 서버가 btrim 으로 떼므로 길이에 세지 않는다 */
  test('앞뒤 공백은 길이에 세지 않는다', () => {
    expect(validateClubName(`  ${'가'.repeat(CLUB_NAME_MAX)}  `)).toBeNull()
  })
})

describe('parseJoinResult', () => {
  const club = { id: 'c1', name: '한밭 배드민턴' }

  test('성공 봉투에서 동아리를 꺼낸다', () => {
    const outcome = parseJoinResult({ ok: true, club })
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.club.id).toBe('c1')
  })

  /*
   * 오류 문구가 화면마다 흩어지지 않게 여기서만 정한다.
   * 종류별로 사용자가 할 일이 다르다 — 기다려야 하는가(rate_limited),
   * 다시 입력해야 하는가(bad_format), 코드를 다시 받아야 하는가(not_found).
   */
  test('막힌 이유마다 다른 안내를 준다', () => {
    const rate = parseJoinResult({ ok: false, error: 'rate_limited', message: '무시된다' })
    const bad = parseJoinResult({ ok: false, error: 'bad_format', message: '무시된다' })
    const none = parseJoinResult({ ok: false, error: 'not_found', message: '무시된다' })
    const anon = parseJoinResult({ ok: false, error: 'unauthenticated', message: '무시된다' })

    expect(rate).toEqual({
      ok: false,
      error: 'rate_limited',
      message: '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요',
    })
    expect(bad.ok === false && bad.message).toBe('동아리 코드는 6자리입니다')
    expect(none.ok === false && none.message).toContain('대회 코드')
    expect(anon.ok === false && anon.message).toBe('로그인이 필요합니다')
  })

  /*
   * 초대 코드가 동아리·대회 두 종류가 됐다. 서버 문구("초대 코드는 6자리입니다")
   * 는 둘을 구별하지 않으므로 아는 오류는 우리 문구로 덮는다.
   */
  test('아는 오류는 서버 문구를 쓰지 않는다', () => {
    const outcome = parseJoinResult({
      ok: false,
      error: 'bad_format',
      message: '초대 코드는 6자리입니다',
    })
    expect(outcome.ok === false && outcome.message).not.toBe('초대 코드는 6자리입니다')
  })

  /*
   * 서버가 오류 종류를 늘리면 이 파일이 먼저 모른다. 그때 우리 기본 문구로
   * 덮어 버리면 정작 사용자가 고칠 수 있었던 문제의 설명이 사라진다.
   */
  test('모르는 오류 코드면 서버 문구를 그대로 살린다', () => {
    const outcome = parseJoinResult({
      ok: false,
      error: 'club_full',
      message: '정원이 찼습니다',
    })
    expect(outcome).toEqual({ ok: false, error: 'unknown', message: '정원이 찼습니다' })
  })

  test('모르는 오류에 문구도 없으면 기본 안내로 채운다', () => {
    const outcome = parseJoinResult({ ok: false, error: 'club_full', message: '   ' })
    expect(outcome.ok === false && outcome.message).toBe(
      '동아리에 들어가지 못했습니다. 잠시 뒤에 다시 시도해 주세요',
    )
  })

  /*
   * jsonb 라 타입은 약속일 뿐이다. 봉투가 아예 아닌 값이 와도 화면은
   * 빈 문구가 아니라 읽을 수 있는 안내를 보여야 한다.
   */
  test('봉투가 아닌 값은 전부 unknown 으로 떨어뜨린다', () => {
    for (const bad of [null, undefined, '들어갔습니다', 42, [{ ok: true }]]) {
      const outcome = parseJoinResult(bad)
      expect(outcome.ok).toBe(false)
      expect(outcome.ok === false && outcome.message.length).toBeGreaterThan(0)
    }
  })

  /*
   * ok 인데 club 이 없으면 성공으로 치면 안 된다. 그대로 넘기면 화면이
   * /c/undefined 로 이동해, 코드가 틀린 건지 앱이 깨진 건지 구별할 수 없는
   * 자리에 사용자가 남는다.
   */
  test('성공이라면서 동아리가 안 실려 오면 실패로 본다', () => {
    expect(parseJoinResult({ ok: true }).ok).toBe(false)
    expect(parseJoinResult({ ok: true, club: null }).ok).toBe(false)
    expect(parseJoinResult({ ok: true, club: { name: '이름만' } }).ok).toBe(false)
  })
})
