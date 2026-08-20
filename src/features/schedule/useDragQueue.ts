import { useCallback, useRef, useState } from 'react'

/**
 * 끌어서 옮기기 — 코트 대기열 재배치.
 *
 * HTML5 드래그 앤 드롭은 쓰지 않는다. 터치에서 dragstart 가 아예 안 나서
 * 폰에서는 동작하지 않는다. 이 앱은 체육관에서 폰으로 쓰는 게 기본이다.
 * 그래서 포인터 이벤트로 직접 만든다 — 마우스와 손가락이 같은 코드를 탄다.
 *
 * 흐름:
 *   손잡이를 누르면 그 경기를 집는다 (setPointerCapture 로 손가락을 붙잡는다)
 *   움직이면 손가락 아래에 있는 '놓을 자리' 를 찾는다
 *   떼면 그 자리로 확정한다
 *
 * 스크롤과 싸우지 않게 손잡이에는 touch-action: none 을 준다.
 * 목록 전체에 주면 화면을 못 굴린다.
 */

export interface DropTarget {
  /** 어느 코트 줄인가 (null 이면 코트 미배정) */
  courtId: string | null
  /** 그 줄에서 몇 번째 자리인가 */
  index: number
}

interface Dragging {
  matchId: string
  fromCourtId: string | null
  /** 손가락 위치 — 떠 있는 카드를 그리는 데 쓴다 */
  x: number
  y: number
}

export interface DragQueue {
  dragging: Dragging | null
  target: DropTarget | null
  /** 손잡이에 붙인다 */
  handleProps: (matchId: string, courtId: string | null) => {
    onPointerDown: (e: React.PointerEvent) => void
    style: React.CSSProperties
  }
  /** 놓을 자리마다 붙인다 (data 속성으로 위치를 알린다) */
  slotProps: (courtId: string | null, index: number) => Record<string, string>
}

const SLOT_COURT = 'data-slot-court'
const SLOT_INDEX = 'data-slot-index'
/** 코트가 없는 줄을 문자열로 표시한다 (data 속성은 문자열만 담는다) */
const NO_COURT = '__none__'

export function useDragQueue(onDrop: (matchId: string, target: DropTarget) => void): DragQueue {
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  /*
   * 놓을 자리는 ref 로도 들고 있는다.
   * pointerup 은 이 렌더의 state 를 보므로, 마지막으로 지나간 자리를
   * state 로만 읽으면 한 박자 옛 값을 쓴다.
   */
  const targetRef = useRef<DropTarget | null>(null)

  const findSlot = useCallback((x: number, y: number): DropTarget | null => {
    // 손가락 아래에서 가장 가까운 '놓을 자리' 를 찾는다.
    // elementFromPoint 는 떠 있는 카드를 집을 수 있으므로 그건 pointer-events 로 뺀다.
    const el = document.elementFromPoint(x, y)
    const slot = el?.closest(`[${SLOT_COURT}]`)
    if (!slot) return null
    const court = slot.getAttribute(SLOT_COURT)
    const index = Number(slot.getAttribute(SLOT_INDEX))
    if (Number.isNaN(index)) return null
    return { courtId: court === NO_COURT ? null : court, index }
  }, [])

  const handleProps = useCallback(
    (matchId: string, courtId: string | null) => ({
      style: { touchAction: 'none' as const, cursor: 'grab' },
      onPointerDown: (e: React.PointerEvent) => {
        // 오른쪽 버튼이나 멀티터치로 시작하지 않는다
        if (e.button !== 0) return
        e.preventDefault()

        /*
         * 움직임은 window 에서 듣는다.
         *
         * setPointerCapture 로 손가락을 손잡이에 묶는 방식이 흔하지만,
         * 그게 실패하면(브라우저가 그 포인터를 모르는 경우) 드래그가 통째로
         * 죽는다. 손잡이 밖으로 손가락이 나가는 순간 아무 일도 안 일어난다.
         * window 에서 들으면 그런 일이 없다 — 캡처는 있으면 좋은 정도라
         * 실패해도 넘어간다.
         */
        const el = e.currentTarget as HTMLElement
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* 캡처가 안 돼도 window 리스너로 끝까지 따라간다 */
        }

        setDragging({ matchId, fromCourtId: courtId, x: e.clientX, y: e.clientY })
        targetRef.current = null
        setTarget(null)

        const move = (ev: PointerEvent) => {
          setDragging((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d))
          const t = findSlot(ev.clientX, ev.clientY)
          targetRef.current = t
          setTarget(t)
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
          try {
            el.releasePointerCapture(e.pointerId)
          } catch {
            /* 캡처가 안 걸렸으면 풀 것도 없다 */
          }
          const t = targetRef.current
          setDragging(null)
          setTarget(null)
          targetRef.current = null
          if (t) onDrop(matchId, t)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      },
    }),
    [findSlot, onDrop],
  )

  const slotProps = useCallback(
    (courtId: string | null, index: number) => ({
      [SLOT_COURT]: courtId ?? NO_COURT,
      [SLOT_INDEX]: String(index),
    }),
    [],
  )

  return { dragging, target, handleProps, slotProps }
}
