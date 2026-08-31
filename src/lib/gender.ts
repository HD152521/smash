/**
 * 성별과 **종목**(남복 · 여복 · 혼복)의 판단을 모아 둔 곳.
 *
 * `src/lib/grade.ts` 와 같은 자리다 — 화면 여럿이 같이 쓰는 값 목록과
 * 문구를 한곳에 둔다. 흩어지면 한 곳만 고쳤을 때 목록에 없는 값을 고를 수
 * 있게 되거나, 같은 값이 화면마다 다른 이름으로 보인다.
 *
 * **DB 값은 영문이고 화면 문구만 한글이다.** enum 라벨을 바꾸는 것은
 * 마이그레이션이지만 여기 문구를 바꾸는 것은 한 줄이다.
 *
 * ── 종목을 따로 저장하지 않는 이유 ─────────────────────────────────
 *
 * 경기의 종목은 **선수 넷의 성별에서 그대로 나온다** — 남남남남이면
 * 남복이고 남남여여면 혼복이다. 컬럼을 따로 두면 선수를 바꿨을 때
 * 종목과 실제가 어긋날 수 있고, 그 어긋남은 아무도 안 본다.
 * 그래서 저장하지 않고 매번 센다(`matchKindOf`).
 */
import type { PlayerGender } from '@/types/database'

/** 값 목록 겸 화면에 그리는 순서 */
export const PLAYER_GENDERS = ['male', 'female'] as const

const GENDER_LABEL: Record<PlayerGender, string> = {
  male: '남',
  female: '여',
}

/**
 * 성별을 화면 문구로. 모르면(null) 빈 문자열이 아니라 null 을 돌려준다 —
 * 빈 문자열을 돌려주면 호출부가 그대로 그려 **빈 배지**가 뜬다.
 */
export function genderLabel(gender: PlayerGender | null | undefined): string | null {
  if (!gender) return null
  return GENDER_LABEL[gender] ?? null
}

/**
 * 서버에서 온 값을 믿지 않고 판별한다.
 *
 * DB 에 성별이 늘어난 뒤 클라이언트가 아직 배포 안 된 구간에는 모르는
 * 문자열이 실제로 온다. 그대로 흘리면 명단에 `undefined` 배지가 뜬다.
 * (`grade.ts` 의 `parseGrade` 와 같은 이유.)
 */
export function parseGender(raw: unknown): PlayerGender | null {
  return PLAYER_GENDERS.includes(raw as PlayerGender) ? (raw as PlayerGender) : null
}

// ── 종목 ──────────────────────────────────────────────────────────────

/**
 * 경기 종목.
 *
 * `any` 는 "가리지 않는다" 는 뜻이지 종목 이름이 아니다 — 편성할 때
 * 조건을 안 걸겠다는 선택이고, 만들어진 경기는 언제나 셋 중 하나다.
 */
export type MatchKind = 'mens' | 'womens' | 'mixed'
export type MatchKindFilter = MatchKind | 'any'

const KIND_LABEL: Record<MatchKindFilter, string> = {
  any: '아무나',
  mens: '남복',
  womens: '여복',
  mixed: '혼복',
}

export function matchKindLabel(kind: MatchKindFilter): string {
  return KIND_LABEL[kind]
}

/**
 * 고르는 화면에 그릴 순서.
 *
 * 같은 성별끼리(남복·여복)를 먼저 둔다. 사용자의 말 그대로다 —
 * *"기본적으로는 남복 여복 이렇게를 잡고, 여복이 안 되는 경우가 많아
 * 남자가 많더라고. 그럴 때 이제 어쩔 수 없이 혼복을 들어가게 하자."*
 * 혼복은 대안이지 기본이 아니다.
 */
export const MATCH_KIND_FILTERS = ['any', 'mens', 'womens', 'mixed'] as const

/**
 * 선수 넷의 성별로 종목을 판정한다. 성별을 모르는 사람이 섞여 있으면
 * null — **모르는 것을 짐작해서 '남복' 이라고 적으면 안 된다.**
 */
export function matchKindOf(genders: readonly (PlayerGender | null)[]): MatchKind | null {
  if (genders.length === 0 || genders.some((g) => g === null)) return null
  const men = genders.filter((g) => g === 'male').length
  const women = genders.length - men
  if (women === 0) return 'mens'
  if (men === 0) return 'womens'
  return 'mixed'
}
