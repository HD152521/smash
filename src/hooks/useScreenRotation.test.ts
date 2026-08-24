import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useScreenRotation } from './useScreenRotation'

/**
 * 이 훅의 존재 이유는 '아이폰은 화면을 못 돌린다' 는 사실 하나다.
 * 잠금이 안 먹을 때 CSS 폴백으로 떨어지지 않으면 버튼이 아무 일도 안 한다.
 */

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  setViewport(390, 844) // 세로로 든 폰
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('화면 돌리기', () => {
  test('처음에는 세로다', () => {
    const { result } = renderHook(() => useScreenRotation())
    expect(result.current.landscape).toBe(false)
    expect(result.current.rotated).toBe(false)
  })

  test('잠금이 없는 기기(아이폰)에서는 CSS 로 돌린다', () => {
    const { result } = renderHook(() => useScreenRotation())

    act(() => result.current.toggle())

    expect(result.current.landscape).toBe(true)
    // 화면은 여전히 세로다 → 우리가 돌려야 한다
    expect(result.current.rotated).toBe(true)
  })

  test('브라우저가 실제로 돌려주면 CSS 로 또 돌리지 않는다', () => {
    const { result } = renderHook(() => useScreenRotation())

    act(() => result.current.toggle())
    // 잠금이 먹었거나 사용자가 폰을 눕혔다
    act(() => {
      setViewport(844, 390)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.landscape).toBe(true)
    // 두 번 돌리면 거꾸로 선다
    expect(result.current.rotated).toBe(false)
  })

  test('다시 누르면 세로로 돌아온다', () => {
    const { result } = renderHook(() => useScreenRotation())

    act(() => result.current.toggle())
    act(() => result.current.toggle())

    expect(result.current.landscape).toBe(false)
    expect(result.current.rotated).toBe(false)
  })

  test('선택을 기억한다 — 경기마다 다시 누르게 하지 않는다', () => {
    const first = renderHook(() => useScreenRotation())
    act(() => first.result.current.toggle())
    first.unmount()

    const second = renderHook(() => useScreenRotation())
    expect(second.result.current.landscape).toBe(true)
  })

  test('localStorage 가 막혀 있어도 동작한다 (사파리 시크릿)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    const { result } = renderHook(() => useScreenRotation())
    act(() => result.current.toggle())

    // 기억은 못 해도 이번 화면은 돌아야 한다
    expect(result.current.landscape).toBe(true)
  })
})
