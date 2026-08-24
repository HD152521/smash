import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'smash.scoreLandscape'

/**
 * 심판 화면을 가로로 본다.
 *
 * 세로로 위아래 두 칸이면 점수판 하나가 화면의 절반뿐이라 코트 건너편에서
 * 안 보인다. 가로로 좌우 두 칸이면 실제 코트 배치와도 같아서 어느 쪽이
 * 어느 팀인지 헷갈리지 않는다.
 *
 * ── 왜 버튼이 필요한가 ──────────────────────────────────────────────
 *
 * "폰을 눕히면 되지" 가 안 통한다. 체육관 폰은 대부분 회전 잠금이 켜져 있어서
 * 눕혀도 브라우저가 세로 그대로다.
 *
 * ── 두 갈래로 처리한다 ──────────────────────────────────────────────
 *
 *   1) 전체화면 + orientation.lock  — 안드로이드 크롬. 진짜로 돌아간다.
 *   2) CSS 로 90도 회전            — 아이폰 사파리. lock 이 아예 없다.
 *
 * 둘 다 '지금 화면이 가로인가' 하나로 수렴시킨다. 잠금이 먹으면 resize 가
 * 나면서 wide 가 true 가 되고, 그러면 CSS 로 돌릴 이유가 사라진다.
 * 사용자가 손으로 폰을 눕혀도 같은 경로로 처리된다.
 */
export function useScreenRotation() {
  const [landscape, setLandscape] = useState(readStored)
  const [wide, setWide] = useState(isWide)

  useEffect(() => {
    function sync() {
      setWide(isWide())
    }
    window.addEventListener('resize', sync)
    // 아이폰은 회전해도 resize 가 늦게 오는 경우가 있다
    window.addEventListener('orientationchange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  // 화면을 떠날 때는 반드시 풀어 준다. 안 풀면 다음 화면까지 가로로 잠긴다.
  useEffect(() => {
    return () => {
      void release()
    }
  }, [])

  const toggle = useCallback(() => {
    setLandscape((prev) => {
      const next = !prev
      writeStored(next)
      if (next) void lock()
      else void release()
      return next
    })
  }, [])

  return {
    /** 가로로 보기로 했나 */
    landscape,
    /**
     * 브라우저가 안 돌려주니 CSS 로 돌려야 하나.
     * 이미 화면이 가로면(실제로 눕혔거나 잠금이 먹었거나) 돌릴 필요가 없다.
     */
    rotated: landscape && !wide,
    toggle,
  }
}

function isWide(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth > window.innerHeight
}

/**
 * localStorage 는 사파리 시크릿 모드에서 읽기만 해도 던진다.
 * 기억하지 못하는 건 불편할 뿐이라 조용히 세로로 시작한다.
 */
function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStored(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    // 못 기억해도 이번 화면은 돈다
  }
}

/** 화면 방향 잠금은 표준 타입에 없는 브라우저가 많다 */
type Lockable = ScreenOrientation & {
  lock?: (o: 'landscape') => Promise<void>
  unlock?: () => void
}

async function lock() {
  try {
    // 전체화면이 아니면 크롬이 lock 을 거부한다. 실패해도 CSS 폴백이 받는다.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen()
    }
    const o = screen.orientation as Lockable | undefined
    await o?.lock?.('landscape')
  } catch {
    // 아이폰 사파리에는 lock 이 없다. rotated 로 떨어진다.
  }
}

async function release() {
  try {
    const o = screen.orientation as Lockable | undefined
    o?.unlock?.()
  } catch {
    // 잠근 적이 없으면 던질 수 있다
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    // 이미 나왔다
  }
}
