/**
 * 게스트가 자기 이름을 다시 알려주는 방법 — 브라우저에만 남긴다.
 *
 * ⚠ **이 이름은 권한이 아니다.** 서버로 보내지 않고, 보낼 곳도 없다
 * (`guest_board` 는 이름을 인자로 받지 않는다). 쓰임은 현황판에서 자기
 * 경기를 강조하는 것 하나뿐이고, **이름이 없어도 현황판은 똑같이 전부
 * 보인다.** 이미 받은 목록과 문자열을 맞춰 볼 뿐이라 명단 탐색 도구가
 * 되지도 않는다 — 애초에 명단을 안 받기 때문이다.
 *
 * 그래서 잃어도 잃는 것이 강조뿐이다. 브라우저 청소·시크릿창이면 사라지고,
 * 그때는 한 칸 입력으로 다시 받는다.
 *
 * 설계 셋을 못 박는다:
 *
 *  · **키에 sessionId 를 넣는다.** 모임마다 따로 저장하지 않으면 다음 주
 *    모임에 지난주 이름이 따라붙어 **엉뚱한 사람을 강조**한다.
 *
 *  · **저장하는 값은 서버가 돌려준 최종 display_name 이다.** 같은 이름이
 *    이미 있으면 `join_as_guest` 가 접미사를 붙이므로, 사용자가 입력한
 *    원문으로는 편성 목록과 매칭이 안 된다.
 *
 *  · **접근을 전부 try/catch 로 감싼다.** 사파리 프라이빗 모드 등에서는
 *    `window.localStorage` 에 **닿는 것만으로** 예외가 난다. 그 예외가
 *    새어 나가면 강조 하나 때문에 **현황판이 통째로 안 뜬다.** 실패는 전부
 *    "이름 없음" 이다.
 */

const KEY_PREFIX = 'smash:guest-me:'

/**
 * 저장한 이름의 수명.
 *
 * 모임 하나가 끝나면 쓸모가 없어지는 값이라 짧아야 한다. 다만 창 판단은
 * 서버(`guest_board` 의 시각 창 −12h~+24h)가 하게 두고 여기서는 조금
 * 넉넉히 잡는다 — 저장값이 먼저 죽어서 "어제 등록했는데 강조가 안 된다"
 * 가 되는 쪽이, 조금 오래 남는 쪽보다 나쁘다.
 */
export const GUEST_ME_TTL_MS = 36 * 60 * 60 * 1000

/** localStorage 중 우리가 실제로 쓰는 부분만. 테스트가 가짜를 끼우기 쉽게 좁힌다 */
export interface GuestMeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * 이 브라우저의 저장소. 못 쓰면 null 이다.
 *
 * `window.localStorage` 를 **읽는 것 자체가** 던질 수 있어 여기서 한 번
 * 감싼다. 호출부는 null 을 그냥 넘기면 되고, 아래 함수들은 null 을 "저장소
 * 없음" 으로 조용히 처리한다.
 */
export function browserGuestMeStorage(): GuestMeStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function keyFor(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`
}

interface StoredName {
  name: string
  savedAt: number
}

function isStoredName(value: unknown): value is StoredName {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return typeof o['name'] === 'string' && typeof o['savedAt'] === 'number'
}

/**
 * 이 모임에서 내가 적은 이름. 없거나·만료됐거나·읽을 수 없으면 null.
 *
 * 손상된 값과 만료된 값을 구별하지 않는다 — 둘 다 결과가 "이름 없음" 이고,
 * 게스트에게 보여 줄 차이도 없다.
 */
export function loadGuestName(
  sessionId: string,
  storage: GuestMeStorage | null,
  now: number,
): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(keyFor(sessionId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredName(parsed)) return null
    if (now - parsed.savedAt > GUEST_ME_TTL_MS) return null
    return parsed.name || null
  } catch {
    return null
  }
}

/**
 * 이 모임에서 쓸 이름을 남긴다. **서버가 돌려준 최종 이름을 넣어라.**
 *
 * 저장에 실패해도 알리지 않는다. 게스트가 할 수 있는 일이 없고, 실패의
 * 결과는 다음에 이름을 한 번 더 적는 것뿐이다.
 */
export function saveGuestName(
  sessionId: string,
  name: string,
  storage: GuestMeStorage | null,
  now: number,
): void {
  if (!storage) return
  try {
    const trimmed = name.trim()
    if (!trimmed) {
      storage.removeItem(keyFor(sessionId))
      return
    }
    const value: StoredName = { name: trimmed, savedAt: now }
    storage.setItem(keyFor(sessionId), JSON.stringify(value))
  } catch {
    // 저장 공간이 없거나 저장소가 막혔다. 강조를 못 할 뿐 화면은 계속 돈다.
  }
}

/** 이름 지우기 — "내가 아닙니다" 를 눌렀을 때. 실패는 역시 삼킨다 */
export function clearGuestName(sessionId: string, storage: GuestMeStorage | null): void {
  if (!storage) return
  try {
    storage.removeItem(keyFor(sessionId))
  } catch {
    // 위와 같다.
  }
}
