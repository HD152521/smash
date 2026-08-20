import { describe, expect, it } from 'vitest'
import { toUserMessage, unwrap, unwrapVoid } from './errors'
import type { PostgrestError } from '@supabase/supabase-js'

const err = (over: Partial<PostgrestError>): PostgrestError =>
  ({ message: 'boom', details: '', hint: '', code: 'X', ...over }) as PostgrestError

describe('unwrap', () => {
  it('값을 그대로 돌려준다', () => {
    expect(unwrap({ data: { id: 'a' }, error: null })).toEqual({ id: 'a' })
  })

  it('오류를 던진다', () => {
    expect(() => unwrap({ data: null, error: err({}) })).toThrow()
  })

  it('값이 없으면 오류로 본다', () => {
    expect(() => unwrap({ data: null, error: null })).toThrow('데이터를 받지 못했습니다')
  })
})

describe('unwrapVoid', () => {
  it('돌려줄 값이 없어도 성공으로 본다', () => {
    /*
     * PostgREST 는 returns void 인 함수에 204 를 준다 (본문 없음).
     * 여기서 unwrap 을 쓰면 서버에서는 잘 처리됐는데 화면만 실패로 보이고
     * 목록도 갱신되지 않는다. 실제로 '제외' 와 '순서 바꾸기' 가 그랬다.
     */
    expect(() => unwrapVoid({ error: null })).not.toThrow()
  })

  it('오류는 그대로 던진다', () => {
    expect(() => unwrapVoid({ error: err({ message: '권한 없음' }) })).toThrow()
  })
})

describe('toUserMessage', () => {
  it('RPC 가 던진 한국어 메시지를 그대로 쓴다', () => {
    expect(toUserMessage(err({ code: '22023', message: '이미 경기에 나갔습니다' }))).toBe(
      '이미 경기에 나갔습니다',
    )
  })

  it('RLS 영문 메시지는 번역한다', () => {
    expect(
      toUserMessage(err({ code: 'X', message: 'new row violates row-level security policy' })),
    ).toBe('권한이 없습니다')
  })
})
