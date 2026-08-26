import { describe, expect, test } from 'vitest'
import {
  GUEST_ME_TTL_MS,
  clearGuestName,
  loadGuestName,
  saveGuestName,
  type GuestMeStorage,
} from './guestMe'

/** 실제 localStorage 처럼 문자열만 담는 가짜 저장소 */
function fakeStorage(): GuestMeStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

/** 사파리 프라이빗 모드처럼 닿기만 해도 던지는 저장소 */
function throwingStorage(): GuestMeStorage {
  return {
    getItem: () => {
      throw new DOMException('SecurityError')
    },
    setItem: () => {
      throw new DOMException('QuotaExceededError')
    },
    removeItem: () => {
      throw new DOMException('SecurityError')
    },
  }
}

const NOW = 1_700_000_000_000

describe('saveGuestName / loadGuestName', () => {
  test('저장한 이름을 그대로 돌려준다', () => {
    // Arrange
    const storage = fakeStorage()

    // Act
    saveGuestName('s1', '홍길동', storage, NOW)

    // Assert
    expect(loadGuestName('s1', storage, NOW)).toBe('홍길동')
  })

  test('저장한 적이 없으면 null 이다', () => {
    // Arrange
    const storage = fakeStorage()

    // Act
    const name = loadGuestName('s1', storage, NOW)

    // Assert
    expect(name).toBeNull()
  })

  /*
   * 키에 sessionId 를 안 넣으면 다음 주 모임에 지난주 이름이 따라붙어
   * 엉뚱한 사람의 경기를 강조한다.
   */
  test('모임이 다르면 지난 모임의 이름이 따라붙지 않는다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('지난주', '홍길동', storage, NOW)

    // Act
    const thisWeek = loadGuestName('이번주', storage, NOW)

    // Assert
    expect(thisWeek).toBeNull()
    expect(loadGuestName('지난주', storage, NOW)).toBe('홍길동')
  })

  test('앞뒤 공백은 지우고 저장한다', () => {
    // Arrange
    const storage = fakeStorage()

    // Act
    saveGuestName('s1', '  홍길동  ', storage, NOW)

    // Assert
    expect(loadGuestName('s1', storage, NOW)).toBe('홍길동')
  })

  test('빈 이름을 저장하면 남아 있던 값을 지운다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('s1', '홍길동', storage, NOW)

    // Act
    saveGuestName('s1', '   ', storage, NOW)

    // Assert
    expect(loadGuestName('s1', storage, NOW)).toBeNull()
  })
})

describe('만료', () => {
  test('36시간이 지나기 전이면 그대로 살아 있다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('s1', '홍길동', storage, NOW)

    // Act
    const name = loadGuestName('s1', storage, NOW + GUEST_ME_TTL_MS - 1)

    // Assert
    expect(name).toBe('홍길동')
  })

  test('36시간이 지나면 없는 것으로 본다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('s1', '홍길동', storage, NOW)

    // Act
    const name = loadGuestName('s1', storage, NOW + GUEST_ME_TTL_MS + 1)

    // Assert
    expect(name).toBeNull()
  })
})

describe('손상된 값', () => {
  /*
   * 저장 형식이 바뀌었거나 다른 코드가 같은 키를 덮어썼을 수 있다.
   * 여기서 예외가 새어 나가면 강조 하나 때문에 현황판이 통째로 안 뜬다.
   */
  test('JSON 이 아니면 예외 없이 null 이다', () => {
    // Arrange
    const storage = fakeStorage()
    storage.map.set('smash:guest-me:s1', '{망가진')

    // Act
    const name = loadGuestName('s1', storage, NOW)

    // Assert
    expect(name).toBeNull()
  })

  test('모양이 다른 JSON 이면 null 이다', () => {
    // Arrange
    const storage = fakeStorage()
    storage.map.set('smash:guest-me:s1', JSON.stringify({ name: 42 }))

    // Act
    const name = loadGuestName('s1', storage, NOW)

    // Assert
    expect(name).toBeNull()
  })
})

describe('저장소를 못 쓸 때', () => {
  /*
   * 사파리 프라이빗 모드 등에서는 접근 자체가 던진다. 이름은 강조 전용이라
   * 잃어도 잃는 게 강조뿐이고, 현황판은 반드시 그대로 떠야 한다.
   */
  test('읽기가 던져도 예외를 밖으로 내보내지 않는다', () => {
    // Arrange
    const storage = throwingStorage()

    // Act & Assert
    expect(() => loadGuestName('s1', storage, NOW)).not.toThrow()
    expect(loadGuestName('s1', storage, NOW)).toBeNull()
  })

  test('쓰기가 던져도 예외를 밖으로 내보내지 않는다', () => {
    // Arrange
    const storage = throwingStorage()

    // Act & Assert
    expect(() => saveGuestName('s1', '홍길동', storage, NOW)).not.toThrow()
  })

  test('지우기가 던져도 예외를 밖으로 내보내지 않는다', () => {
    // Arrange
    const storage = throwingStorage()

    // Act & Assert
    expect(() => clearGuestName('s1', storage)).not.toThrow()
  })

  test('저장소 자체가 없으면 조용히 이름 없음으로 본다', () => {
    // Arrange — browserGuestMeStorage() 가 null 을 돌려준 경우
    const storage = null

    // Act & Assert
    expect(loadGuestName('s1', storage, NOW)).toBeNull()
    expect(() => saveGuestName('s1', '홍길동', storage, NOW)).not.toThrow()
    expect(() => clearGuestName('s1', storage)).not.toThrow()
  })
})

describe('clearGuestName', () => {
  test('저장한 이름을 지운다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('s1', '홍길동', storage, NOW)

    // Act
    clearGuestName('s1', storage)

    // Assert
    expect(loadGuestName('s1', storage, NOW)).toBeNull()
  })

  test('그 모임 것만 지우고 다른 모임은 건드리지 않는다', () => {
    // Arrange
    const storage = fakeStorage()
    saveGuestName('s1', '홍길동', storage, NOW)
    saveGuestName('s2', '김철수', storage, NOW)

    // Act
    clearGuestName('s1', storage)

    // Assert
    expect(loadGuestName('s2', storage, NOW)).toBe('김철수')
  })
})
