import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useAutoJoin } from './useAutoJoin'
import type { RsvpStatus } from '@/types/database'

/**
 * 화면을 여는 것만으로 서버에 쓰는 드문 자리다. 그래서 **안 써야 할 때**가
 * 이 파일의 본론이다.
 *
 * 잘못 쓰면 사람이 누른 것을 앱이 뒤집는다 — 불참을 눌렀는데 화면을 볼
 * 때마다 참가로 돌아오면, 그 사람은 앱이 자기 말을 안 듣는다고 읽는다.
 * 그건 버그 보고로도 안 온다. 그냥 안 쓰게 된다.
 */

function run(rsvp: RsvpStatus | undefined, enabled = true) {
  const onJoin = vi.fn()
  const { rerender } = renderHook(({ r }) => useAutoJoin({ rsvp: r, enabled, onJoin }), {
    initialProps: { r: rsvp },
  })
  return { onJoin, rerender }
}

describe('들어오면 참가로 표시한다', () => {
  test('아직 아무것도 안 누른 사람은 참가가 된다', () => {
    const { onJoin } = run('invited')
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  test('이미 참가면 아무것도 안 쓴다 — 쓸 이유가 없다', () => {
    const { onJoin } = run('going')
    expect(onJoin).not.toHaveBeenCalled()
  })

  test('불참을 누른 사람을 되돌리지 않는다', () => {
    /*
     * 이게 이 훅에서 제일 중요한 한 줄이다. 되돌리면 그 사람이 화면을
     * 볼 때마다 자기가 누른 것이 뒤집힌다.
     */
    const { onJoin } = run('declined')
    expect(onJoin).not.toHaveBeenCalled()
  })

  test('명단에 없으면 안 쓴다 — 누를 주체가 없다', () => {
    const { onJoin } = run(undefined)
    expect(onJoin).not.toHaveBeenCalled()
  })

  test('시작 전 화면이 아니면 안 쓴다', () => {
    const { onJoin } = run('invited', false)
    expect(onJoin).not.toHaveBeenCalled()
  })
})

describe('한 번만 시도한다', () => {
  test('명단이 다시 들어와도 두 번 쓰지 않는다', () => {
    /*
     * 명단·모임 조회는 포커스 복귀·폴링·실시간으로 자주 갱신된다.
     * 그때마다 쓰면 권한이 없거나 시각이 지난 모임에서 서버를 끝없이
     * 때린다.
     */
    const { onJoin, rerender } = run('invited')
    rerender({ r: 'invited' })
    rerender({ r: 'invited' })

    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  test('실패해서 미정 그대로여도 다시 걸지 않는다', () => {
    // 실패는 화면이 오류로 말하고, 사람이 버튼으로 다시 누른다.
    const { onJoin, rerender } = run('invited')
    rerender({ r: 'invited' })

    expect(onJoin).toHaveBeenCalledTimes(1)
  })
})
