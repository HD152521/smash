import type { PlayerGrade } from '@/types/database'

/**
 * 급수(S · A · B · C · D · 초심)의 판단을 모아 둔 곳.
 *
 * 화면 셋이 같이 쓴다 — 가입(LoginPage) · 게스트 등록(GuestJoinPage) ·
 * 명단(MembersPage). 값 목록과 문구가 화면마다 흩어지면 한 곳만 고쳤을 때
 * 목록에 없는 급수를 고를 수 있게 되거나, 같은 값이 화면마다 다른 이름으로
 * 보인다.
 *
 * **DB 값은 영문이고 화면 문구만 한글이다.** enum 라벨(`beginner`)을
 * 바꾸는 것은 마이그레이션이지만 여기 문구를 바꾸는 것은 한 줄이다 —
 * 그래서 '초심' 은 여기서만 산다 (20260901000001_player_grade.sql 참고).
 */

/**
 * 값 목록 **겸 순서**. 앞이 강하다 (S > A > B > C > D > 초심).
 *
 * 이 배열이 순서의 유일한 정본이다. `player_grade` enum 의 선언 순서와
 * 글자 그대로 같아서, 서버가 `order by grade` 로 정렬한 결과와 화면이
 * 이 배열로 정렬한 결과가 어긋나지 않는다. 순서를 바꿔야 하면 enum 과
 * 여기를 **같이** 고쳐야 한다.
 *
 * 고르는 화면도 이 순서를 그대로 그린다 — 강한 쪽이 왼쪽이다.
 */
export const PLAYER_GRADES = ['S', 'A', 'B', 'C', 'D', 'beginner'] as const

/**
 * 화면에 그릴 문구.
 *
 * `beginner` 만 한글이고 나머지는 알파벳 그대로다. 동호인이 실제로 쓰는
 * 말이 'S조', 'A조' … '초심' 이라 굳이 번역하지 않는다.
 */
const GRADE_LABEL: Record<PlayerGrade, string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  beginner: '초심',
}

/**
 * 급수를 화면 문구로. 모르면(null) 빈 문자열이 아니라 null 을 돌려준다 —
 * 빈 문자열을 돌려주면 호출부가 그것을 그대로 그려 **빈 배지**가 뜬다.
 * "급수를 모른다" 는 배지를 안 그리는 것으로 말해야 한다.
 */
export function gradeLabel(grade: PlayerGrade | null | undefined): string | null {
  return grade ? GRADE_LABEL[grade] : null
}

/**
 * 모르는 값은 null. 서버의 `parse_player_grade(text)` 와 **같은 규칙**이다.
 *
 * DB 에서 읽은 값에도 이걸 통과시키는 이유: enum 값이 늘어난 DB 를
 * 배포하고 클라이언트를 아직 안 배포한 몇 분 동안, 생성 타입은
 * `PlayerGrade` 라고 약속하지만 실제로는 우리가 모르는 문자열이 온다.
 * 그대로 `GRADE_LABEL[...]` 에 넣으면 `undefined` 가 화면에 그려진다.
 * 모르면 '모른다' 로 떨어뜨려 **배지를 안 그리는** 쪽이 맞다.
 */
export function parseGrade(raw: unknown): PlayerGrade | null {
  return typeof raw === 'string' && (PLAYER_GRADES as readonly string[]).includes(raw)
    ? (raw as PlayerGrade)
    : null
}

/**
 * 급수의 숫자 순위 — 0 이 가장 강하다 (S 0 · A 1 · B 2 · C 3 · D 4 · 초심 5).
 *
 * `PLAYER_GRADES` 의 자리 그대로다. 순위표를 따로 두지 않는 이유는 그러면
 * 배열과 표 둘 다 고쳐야 하고, 한쪽만 고친 날 조용히 어긋나기 때문이다.
 *
 * 모르면 null 이다. **`gradeLabel` 과 같은 규율** — '모른다' 를 아무 숫자로
 * 바꿔 놓으면 부르는 쪽이 그게 진짜 급수인지 메운 값인지 구분할 수 없다.
 * 메울지 말지는 부르는 쪽이 정한다 (`gradeRankOrUnknown`).
 */
export function gradeRank(grade: PlayerGrade | null | undefined): number | null {
  if (!grade) return null
  const i = PLAYER_GRADES.indexOf(grade)
  return i < 0 ? null : i
}

/**
 * 급수를 모르는 사람의 자리 — 한가운데.
 *
 * 급수는 **선택 입력**이라 비어 있는 사람이 흔하다. 모르는 사람을 맨 끝
 * (초심)으로 밀면 그 사람은 초심들하고만 묶이고, 맨 앞(S)으로 당기면
 * 고수들 사이에 끼어 매번 진다. 둘 다 실제로는 '모른다' 가 아니라
 * 우리가 지어낸 답이다.
 *
 * 한가운데는 아무 주장도 하지 않는다 — 누구와 묶여도 거리가 절반이라,
 * 급수를 안 적었다는 이유로 특정 무리에 갇히지 않는다.
 */
export const UNKNOWN_GRADE_RANK = (PLAYER_GRADES.length - 1) / 2

/** 순위. 모르면 한가운데로 메운다 — 편성 계산처럼 숫자가 꼭 필요한 곳에서 쓴다 */
export function gradeRankOrUnknown(grade: PlayerGrade | null | undefined): number {
  return gradeRank(grade) ?? UNKNOWN_GRADE_RANK
}

/**
 * 두 급수가 얼마나 떨어져 있나. 0 이면 같은 급수다.
 *
 * 모르는 급수는 한가운데로 본다 — 그래서 S 와 '모름' 의 거리(2.5)는
 * S 와 초심의 거리(5)보다 가깝다. 확신이 없을 때는 덜 극단적인 쪽으로
 * 틀리는 게 맞다.
 */
export function gradeDistance(
  a: PlayerGrade | null | undefined,
  b: PlayerGrade | null | undefined,
): number {
  return Math.abs(gradeRankOrUnknown(a) - gradeRankOrUnknown(b))
}
