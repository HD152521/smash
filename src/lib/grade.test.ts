import { describe, expect, it } from 'vitest'
import {
  PLAYER_GRADES,
  UNKNOWN_GRADE_RANK,
  gradeDistance,
  gradeLabel,
  gradeRank,
  gradeRankOrUnknown,
  parseGrade,
} from './grade'

describe('PLAYER_GRADES — 값 목록 겸 순서', () => {
  it('앞이 강하다 (S > A > B > C > D > 초심)', () => {
    expect([...PLAYER_GRADES]).toEqual(['S', 'A', 'B', 'C', 'D', 'beginner'])
  })

  /*
   * 이 검사가 지키는 것은 배열의 내용이 아니라 **DB 와의 약속**이다.
   * player_grade enum 의 선언 순서(20260901000001_player_grade.sql)와
   * 이 배열이 어긋나면, 서버가 `order by grade` 로 준 순서와 화면이
   * 이 배열로 매긴 순서가 조용히 달라진다.
   */
  it("DB 값에 한글이 없다 — '초심' 은 화면 문구일 뿐이다", () => {
    for (const g of PLAYER_GRADES) {
      expect(g).toMatch(/^[A-Za-z]+$/)
    }
  })
})

describe('gradeLabel — 화면 문구', () => {
  it('beginner 만 한글이고 나머지는 그대로다', () => {
    expect(PLAYER_GRADES.map(gradeLabel)).toEqual(['S', 'A', 'B', 'C', 'D', '초심'])
  })

  /*
   * 빈 문자열이 아니라 null 이어야 한다. 빈 문자열을 돌려주면 호출부가
   * `{gradeLabel(g) && <Badge/>}` 같은 판단을 못 하고 **빈 배지**를 그린다 —
   * "급수를 모른다" 는 배지를 안 그리는 것으로 말한다.
   */
  it('모르면 null 이다 (빈 문자열이 아니다)', () => {
    expect(gradeLabel(null)).toBeNull()
    expect(gradeLabel(undefined)).toBeNull()
  })
})

describe('parseGrade — 모르는 값은 null', () => {
  it('아는 값은 그대로 통과한다', () => {
    for (const g of PLAYER_GRADES) {
      expect(parseGrade(g)).toBe(g)
    }
  })

  /*
   * 서버의 parse_player_grade(text) 와 같은 규칙이다. DB 에 enum 값이
   * 늘어난 뒤 클라이언트가 아직 안 배포된 몇 분 동안 실제로 일어난다 —
   * 그때 화면에 'undefined' 를 그리는 대신 배지를 안 그린다.
   */
  it('모르는 문자열·다른 타입·빈 값은 전부 null 이다', () => {
    for (const raw of [
      '',
      ' ',
      'Z',
      'ss',
      '초심',
      's',
      'BEGINNER',
      null,
      undefined,
      3,
      {},
      ['S'],
    ]) {
      expect(parseGrade(raw)).toBeNull()
    }
  })

  it('대소문자를 고쳐 주지 않는다 — DB 가 받는 값과 글자 그대로 같아야 한다', () => {
    expect(parseGrade('s')).toBeNull()
    expect(parseGrade('S')).toBe('S')
  })
})

describe('gradeRank — 숫자 순위', () => {
  it('배열 자리 그대로다 — S 가 0, 초심이 5', () => {
    expect(PLAYER_GRADES.map(gradeRank)).toEqual([0, 1, 2, 3, 4, 5])
  })

  /*
   * gradeLabel 과 같은 규율이다. '모른다' 를 아무 숫자로 바꿔 놓으면
   * 부르는 쪽이 그게 진짜 급수인지 우리가 메운 값인지 구분할 수 없다.
   * 메울지 말지는 부르는 쪽이 정한다.
   */
  it('모르면 null 이다 (0 이 아니다)', () => {
    expect(gradeRank(null)).toBeNull()
    expect(gradeRank(undefined)).toBeNull()
  })
})

describe('gradeRankOrUnknown — 모르는 급수의 자리', () => {
  /*
   * 맨 끝(초심)으로 밀면 초심들하고만 묶이고, 맨 앞(S)으로 당기면 고수
   * 사이에 끼어 매번 진다. 한가운데는 아무 주장도 안 한다 — 급수를 안
   * 적었다는 이유로 특정 무리에 갇히지 않는다.
   */
  it('한가운데다 — 양 끝에서 똑같이 떨어져 있다', () => {
    expect(gradeRankOrUnknown(null)).toBe(UNKNOWN_GRADE_RANK)
    expect(gradeDistance(null, 'S')).toBe(gradeDistance(null, 'beginner'))
  })

  it('아는 급수는 그대로 통과한다', () => {
    expect(gradeRankOrUnknown('B')).toBe(2)
  })
})

describe('gradeDistance — 두 급수가 얼마나 떨어져 있나', () => {
  it('같은 급수는 0 이고, 방향은 상관없다', () => {
    expect(gradeDistance('B', 'B')).toBe(0)
    expect(gradeDistance('S', 'C')).toBe(gradeDistance('C', 'S'))
  })

  /*
   * 확신이 없을 때는 덜 극단적인 쪽으로 틀린다 — 모르는 사람을 S 옆에
   * 두는 것이 초심을 S 옆에 두는 것보다 덜 위험하다.
   */
  it('모르는 급수는 아는 급수끼리의 최대 거리보다 가깝다', () => {
    expect(gradeDistance(null, 'S')).toBeLessThan(gradeDistance('beginner', 'S'))
  })

  it('둘 다 모르면 0 이다 — 서로에 대해 아무 근거도 없다', () => {
    expect(gradeDistance(null, null)).toBe(0)
  })
})
