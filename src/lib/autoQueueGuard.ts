/**
 * 자동 예약이 **폭주하지 않게** 잡아 두는 문지기.
 *
 * `planAutoQueue` 는 "채울 코트가 있다" 를 계산할 뿐, 몇 번 계산되는지는
 * 화면 사정이다. 코트 화면은 실시간 구독 · 포커스 복귀 · 폴링 · 부모
 * 리렌더로 초당 여러 번 다시 그려진다. 그때마다 경기를 하나씩 만들면
 * 한 코트에 열 경기가 쌓이고, 그 열 경기가 사람 마흔 명분을 묶는다
 * (`busy.ts`) — 모임이 통째로 멈춘다.
 *
 * React 밖에 두는 이유는 **테스트할 수 있어야 해서**다. "두 번째 호출이
 * 정말 막히나" 는 화면을 띄워서는 확인이 안 되는 종류의 질문이다.
 *
 * ⚠ 이 문지기는 **한 화면 안에서만** 유효하다. 여러 기기가 각자 자기
 * 문지기를 갖고 있으므로 기기 간 겹침은 못 막는다 — 그 한계와 제대로 된
 * 해법(`pg_advisory_xact_lock` 을 건 서버 RPC)은 `autoQueue.ts` 머리
 * 주석에 적어 뒀다.
 */

/**
 * 몇 번 실패하면 포기하나.
 *
 * 계속 재시도하면 서버를 때린다. 실패는 대개 한 번 더 눌러서 풀리는
 * 종류가 아니다 — 권한이 없거나(42501), 명단이 어긋났거나, 서버가 아프다.
 * 두 번은 일시적인 네트워크 끊김을 넘길 만큼이고, 서버를 괴롭히지 않을
 * 만큼 적다. 한 번 포기하면 **화면을 새로 열기 전까지 다시 안 한다** —
 * 자동 예약이 없는 것은 불편할 뿐이지만 폭주는 모임을 망친다.
 */
export const MAX_AUTO_QUEUE_FAILURES = 2

/**
 * 기억할 열쇠 수의 상한.
 *
 * 두 시간짜리 모임에서 경기가 돌 때마다 열쇠가 하나씩 는다. 상한이 없으면
 * 켜 둔 폰의 메모리가 계속 자란다. 넘치면 통째로 비운다 — 지운 열쇠가
 * 다시 오면 한 번 더 시도할 뿐인데, 그때는 이미 그 상태의 경기가 실제로
 * 만들어져 있어서 `planAutoQueue` 가 애초에 그 코트를 안 고른다.
 */
const MAX_REMEMBERED_KEYS = 200

export interface AutoQueueGuard {
  /**
   * 지금 이 열쇠로 만들어도 되나. `true` 면 **이미 시작한 것으로 표시된다** —
   * 부른 쪽은 반드시 `settle` 로 끝을 알려야 한다.
   */
  tryBegin(key: string): boolean
  /** 끝났다. `ok=false` 면 실패 횟수가 는다 */
  settle(ok: boolean): void
  /**
   * 만들지도 않고 "해 봤다" 로 적어 둔다.
   *
   * 총무가 자동 예약을 지웠을 때 쓴다 — 지우면 세상이 만들기 직전으로
   * 돌아가 똑같은 편성이 즉시 되살아나므로, 그 편성의 열쇠를 미리 태워
   * 둬야 지우는 버튼이 뜻을 갖는다 (`autoQueue.ts` 의 `autoQueueKeyOfMatch`).
   */
  decline(key: string): void
  /** 화면에서 스위치를 껐다 켰을 때 — 포기 상태를 푼다 */
  reset(): void
}

export function createAutoQueueGuard(
  maxFailures: number = MAX_AUTO_QUEUE_FAILURES,
): AutoQueueGuard {
  /** 지금 만드는 중인가 — 동시에 한 번만 */
  let running = false
  /** 이미 시도해 본 세상의 지문들 — 같은 상태로 두 번 시도하지 않는다 */
  let tried = new Set<string>()
  let failures = 0

  return {
    tryBegin(key) {
      if (running) return false
      if (failures >= maxFailures) return false
      if (tried.has(key)) return false

      if (tried.size >= MAX_REMEMBERED_KEYS) tried = new Set()
      tried.add(key)
      running = true
      return true
    },

    settle(ok) {
      running = false
      // 성공하면 실패 횟수를 0 으로 — '연속' 실패만 센다. 두 시간 동안
      // 어쩌다 한 번씩 끊긴 것까지 합산해 포기하면 멀쩡한 모임이 멈춘다.
      failures = ok ? 0 : failures + 1
    },

    decline(key) {
      if (tried.size >= MAX_REMEMBERED_KEYS) tried = new Set()
      tried.add(key)
    },

    reset() {
      running = false
      tried = new Set()
      failures = 0
    },
  }
}
