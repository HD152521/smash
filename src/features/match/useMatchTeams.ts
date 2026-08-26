import { useState } from 'react'
import type { GroupRow, TournamentConfig } from '@/types/database'

export interface MatchTeamsValue {
  groupA: string
  groupB: string
  playersA: string[]
  playersB: string[]
}

interface UseMatchTeamsOptions {
  squadSize: number
  /** 첫 렌더에서 한 번만 읽는다 */
  initial?: Partial<MatchTeamsValue>
  /**
   * 한쪽 선수 명단이 바뀌었다.
   *
   * 심판을 두는 화면(편성 · 수정)이 뛰는 사람을 심판에서 빼는 데 쓴다.
   * 심판은 여기 없다 — 지난 결과 입력에는 심판 자체가 없기 때문이다.
   */
  onPlayersChange?: (picked: string[]) => void
}

/**
 * 조 vs 조를 고르는 상태 — 세 화면(편성 · 지난 결과 · 수정)이 같이 쓴다.
 *
 * 화면마다 다른 것(코트 · 점수 · 심판)은 여기 들이지 않는다. 그것까지 얹는
 * 순간 이 훅이 예전의 mode 토글이 되고, 화면을 가른 뜻이 사라진다.
 */
export function useMatchTeams({ squadSize, initial, onPlayersChange }: UseMatchTeamsOptions) {
  const [groupA, setGroupA] = useState(initial?.groupA ?? '')
  const [groupB, setGroupB] = useState(initial?.groupB ?? '')
  const [playersA, setPlayersA] = useState<string[]>(initial?.playersA ?? [])
  const [playersB, setPlayersB] = useState<string[]>(initial?.playersB ?? [])

  function selectGroup(side: 'A' | 'B', groupId: string) {
    // 조가 바뀌면 그 조 사람이 아닌 선택은 무효다
    if (side === 'A') {
      setGroupA(groupId)
      setPlayersA([])
    } else {
      setGroupB(groupId)
      setPlayersB([])
    }
  }

  function togglePlayer(side: 'A' | 'B', memberId: string) {
    const list = side === 'A' ? playersA : playersB
    const next = list.includes(memberId)
      ? list.filter((x) => x !== memberId)
      : // 정원을 넘기면 가장 오래된 선택을 밀어낸다 — 해제 후 재선택을 강요하지 않는다
        [...list, memberId].slice(-squadSize)
    if (side === 'A') setPlayersA(next)
    else setPlayersB(next)
    onPlayersChange?.(next)
  }

  /** 서버에서 온 값으로 폼을 채운다 (수정 화면) */
  function fill(value: MatchTeamsValue) {
    setGroupA(value.groupA)
    setGroupB(value.groupB)
    setPlayersA(value.playersA)
    setPlayersB(value.playersB)
  }

  /** 저장하고 이어서 다음 경기를 짜는 화면(편성)이 쓴다 */
  function clear() {
    fill({ groupA: '', groupB: '', playersA: [], playersB: [] })
  }

  return {
    groupA,
    groupB,
    playersA,
    playersB,
    selectGroup,
    togglePlayer,
    fill,
    clear,
    /** 지금 코트에 서 있게 될 사람들 — 심판 후보에서 빼는 기준 */
    playing: new Set([...playersA, ...playersB]),
    ready:
      Boolean(groupA) &&
      Boolean(groupB) &&
      groupA !== groupB &&
      playersA.length === squadSize &&
      playersB.length === squadSize,
  }
}

/**
 * 이 조의 목표 점수. 조커조는 적은 점수로 이기는 대신 승점이 절반이다.
 *
 * 화면이 보여주는 건 미리보기일 뿐이다 — 실제 스냅샷은 서버가 굳힌다.
 * 설정이 아직 안 왔으면 보여줄 미리보기도 없다. 그때 화면은 스켈레톤이라
 * 이 0 은 눈에 닿지 않는다.
 */
export function targetPoints(
  group: GroupRow | undefined,
  config: TournamentConfig | undefined,
): number {
  if (!config) return 0
  return group?.is_joker ? config.jokerPoints : config.normalPoints
}
