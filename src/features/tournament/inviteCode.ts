/**
 * 초대 코드 입력 보정.
 *
 * 코드는 체육관에서 구두로 전달되거나 카톡으로 복사된다.
 * 소문자, 공백, 하이픈이 섞여 들어오는 걸 전제로 받아야 한다.
 * 서버(join_tournament)도 같은 정규화를 하지만, 화면에서 미리 정리해 주면
 * 사용자가 "6자리 다 채웠는지" 를 눈으로 확인할 수 있다.
 */

/** DB gen_invite_code 와 같은 알파벳 — I L O 0 1 은 헷갈려서 뺐다 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

/** 자주 혼동되는 글자를 코드 알파벳 쪽으로 되돌린다 */
const CONFUSABLES: Record<string, string> = {
  I: 'J',
  L: 'J',
  O: 'Q',
  '0': 'Q',
  '1': '7',
}

/**
 * 입력값을 코드 형태로 정리한다.
 * 알파벳에 없는 글자는 버린다 — 서버가 어차피 거부하므로 미리 걸러 낸다.
 */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LENGTH)
}

/**
 * 혼동 문자를 자동 교정하지는 않는다 — 잘못 고치면 남의 대회에 들어갈 수 있다.
 * 대신 사용자가 O 나 0 을 입력했을 때 안내 문구를 띄우기 위한 판별만 한다.
 */
export function hasConfusableChar(input: string): boolean {
  return input
    .toUpperCase()
    .split('')
    .some((c) => c in CONFUSABLES && !CODE_ALPHABET.includes(c))
}

export function isCompleteCode(code: string): boolean {
  return code.length === CODE_LENGTH
}
