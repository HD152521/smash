import { describe, expect, test } from 'vitest'
import { CODE_ALPHABET, hasConfusableChar, isCompleteCode, normalizeCode } from './inviteCode'

describe('초대 코드 정규화', () => {
  test('소문자를 대문자로 올린다', () => {
    expect(normalizeCode('sark9c')).toBe('SARK9C')
  })

  test('카톡으로 복사할 때 붙는 공백·하이픈을 지운다', () => {
    expect(normalizeCode(' SAR-K9C ')).toBe('SARK9C')
  })

  test('코드에 쓰이지 않는 글자는 버린다', () => {
    // I, L, O, 0, 1 은 헷갈려서 애초에 코드에 안 쓴다
    expect(normalizeCode('SAIRK9C')).toBe('SARK9C')
    expect(normalizeCode('한글SARK9C')).toBe('SARK9C')
  })

  test('6자를 넘겨 붙여넣어도 앞 6자만 남는다', () => {
    expect(normalizeCode('SARK9CXYZ')).toBe('SARK9C')
  })

  test('빈 입력은 빈 문자열', () => {
    expect(normalizeCode('')).toBe('')
  })

  test('정규화 결과는 항상 코드 알파벳 안에 있다', () => {
    const out = normalizeCode('aB!@#zZ09oOiIlL')
    expect(out.split('').every((c) => CODE_ALPHABET.includes(c))).toBe(true)
  })
})

describe('혼동 문자 안내', () => {
  test('O 나 0 을 입력하면 안내 대상이다', () => {
    expect(hasConfusableChar('SARK0C')).toBe(true)
    expect(hasConfusableChar('SARKOC')).toBe(true)
  })

  test('I, L, 1 도 안내 대상이다', () => {
    expect(hasConfusableChar('SARKIC')).toBe(true)
    expect(hasConfusableChar('SARK1C')).toBe(true)
  })

  test('정상 코드는 안내하지 않는다', () => {
    expect(hasConfusableChar('SARK9C')).toBe(false)
  })

  test('자동 교정은 하지 않는다 — 잘못 고치면 남의 대회에 들어간다', () => {
    // O 를 Q 로 자동 변환하지 않고 그냥 버린다
    expect(normalizeCode('SARKOC')).toBe('SARKC')
  })
})

describe('입력 완료 판정', () => {
  test('6자면 완료', () => {
    expect(isCompleteCode('SARK9C')).toBe(true)
  })
  test('5자면 미완료', () => {
    expect(isCompleteCode('SARK9')).toBe(false)
  })
})
