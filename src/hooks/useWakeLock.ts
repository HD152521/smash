import { useEffect, useState } from 'react'

/**
 * 화면 꺼짐 방지.
 *
 * 심판은 폰을 코트 옆에 세워두고 5~20분을 쓴다. 기본 잠금 시간(30초~1분)에
 * 걸리면 득점할 때마다 잠금을 풀어야 하고, 그 사이 랠리를 놓친다.
 *
 * Wake Lock API 는 구형 사파리에 없다. 없으면 조용히 넘어간다 —
 * 화면이 꺼지는 건 불편할 뿐이지 점수가 사라지는 건 아니다.
 * 탭이 백그라운드로 갔다 오면 잠금이 풀리므로 visibilitychange 에서 다시 잡는다.
 */
export function useWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled || !supported) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire() {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void next.release()
          return
        }
        sentinel = next
        setActive(true)
        next.addEventListener('release', () => setActive(false))
      } catch {
        // 배터리 절약 모드 등에서 거부될 수 있다. 앱은 계속 돌아야 한다.
        setActive(false)
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && !sentinel) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
      setActive(false)
    }
  }, [enabled, supported])

  return { supported, active }
}
