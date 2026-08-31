import { useCallback, useEffect, useRef, useState } from 'react'
import { useCreateSessionMatch } from '@/features/tournament/queries'
import { AUTO_QUEUE_LABEL, autoQueueKeyOfMatch, planAutoQueue } from '@/lib/autoQueue'
import { createAutoQueueGuard } from '@/lib/autoQueueGuard'
import type { AutoMatchCandidate } from '@/lib/autoMatch'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 코트 화면이 **스스로** 다음 경기를 걸어 둔다.
 *
 * 무엇을 만들지는 `lib/autoQueue.ts` 가, 몇 번 만들지는 `lib/autoQueueGuard.ts`
 * 가 정한다. 여기는 둘을 잇고 실제로 서버를 부르는 자리다 — 이 파일에는
 * 판단이 없어야 테스트가 화면 없이 규칙을 지킬 수 있다.
 *
 * ── 왜 모임장만인가 ────────────────────────────────────────────────
 * `enabled` 를 부르는 쪽(`TournamentPage`)이 모임장일 때만 켠다.
 *   · **권한** — `create_session_match` 는 관리자가 아니면 '자기가 뛰는
 *     경기' 만 허락한다. 자동 제안은 판수가 적은 사람부터 고르므로 지금
 *     화면을 보는 사람이 그 넷에 들어 있을 이유가 없다. 일반 참가자
 *     화면에서 돌리면 42501 만 반복해서 받는다.
 *   · **폭주** — 열두 명이 각자 폰을 켜 두면 열두 화면이 동시에 만든다.
 *     모임장만 돌리면 한두 대다. 완전한 해법은 아니다(`autoQueue.ts` 머리).
 *
 * 실패하면 **아무 말도 안 한다.** 사람이 여섯인 날 "편성할 사람이
 * 모자랍니다" 를 15초마다 띄우는 건 고장이지 안내가 아니고, 자동 예약이
 * 실패해도 손으로 짜는 길(`경기 짜기`)은 그대로 있다.
 */
export interface UseAutoQueueInput {
  tournamentId: string
  /** 켜져 있고, 부를 권한이 있고, 데이터가 다 왔을 때만 true */
  enabled: boolean
  courts: readonly CourtRow[]
  matches: readonly MatchOverviewRow[]
  members: readonly AutoMatchCandidate[]
  /** 한 편 인원 (단식 1 · 복식 2) */
  squad: number
}

export interface AutoQueueHandle {
  /**
   * 이 경기를 지웠다 — **같은 편성을 다시 걸지 않는다.**
   *
   * 없으면 × 가 아무 일도 안 하는 것처럼 보인다. 지운 순간 세상이
   * 만들기 직전으로 돌아가 똑같은 넷이 곧바로 다시 걸리기 때문이다.
   */
  declineMatch: (m: MatchOverviewRow) => void
}

export function useAutoQueue(input: UseAutoQueueInput): AutoQueueHandle {
  const { tournamentId, enabled, courts, matches, members, squad } = input
  const create = useCreateSessionMatch(tournamentId)
  const { mutateAsync } = create

  /*
   * 문지기는 화면 수명 내내 하나여야 한다. 리렌더마다 새로 만들면 "이미
   * 해 봤다" 는 기억이 매번 지워져 문지기가 없는 것과 같아진다.
   */
  const guardRef = useRef(createAutoQueueGuard())

  /*
   * 스위치를 껐다 켜면 기억을 지운다 — 껐던 동안 벌어진 일 때문에 포기
   * 상태로 들어가 있었다면, 다시 켠 사람의 의도는 "이제 해 봐" 다.
   */
  useEffect(() => {
    if (enabled) guardRef.current.reset()
  }, [enabled])

  /*
   * 계산은 렌더에서, 실행은 효과에서.
   *
   * 채울 코트가 없으면 plan 이 null 이라 효과가 바로 빠져나온다 — 평소
   * (모든 코트가 차 있을 때)에는 아무 일도 안 일어난다. plan 이 있는
   * 짧은 동안에는 리렌더마다 효과가 다시 돌지만, 그 두 번째 이후를 막는
   * 것이 정확히 문지기의 일이다(`tryBegin` 이 false 를 돌려준다).
   */
  const plan = enabled ? planAutoQueue({ courts, matches, members, squad }) : null

  useEffect(() => {
    if (!plan) return
    if (!guardRef.current.tryBegin(plan.key)) return

    let done = false
    mutateAsync({
      courtId: plan.courtId,
      playersA: plan.playersA,
      playersB: plan.playersB,
      // 사람이 지울 수 있게 '자동' 이라고 적어 둔다 (autoQueue.ts 참고)
      label: AUTO_QUEUE_LABEL,
    })
      .then(() => {
        done = true
      })
      .catch(() => {
        // 조용히 넘긴다. 서버가 거절한 편성을 화면이 되살릴 방법은 없다.
      })
      .finally(() => {
        guardRef.current.settle(done)
      })
  }, [plan, mutateAsync])

  const declineMatch = useCallback(
    (m: MatchOverviewRow) => {
      const key = autoQueueKeyOfMatch(m, matches)
      if (key) guardRef.current.decline(key)
    },
    [matches],
  )

  return { declineMatch }
}

/** 이 모임의 자동 예약 스위치가 저장되는 자리 */
function prefKey(tournamentId: string): string {
  return `smash.autoQueue.${tournamentId}`
}

/**
 * 자동 예약 스위치 — **이 기기에서만** 유효하다.
 *
 * 대회 설정(`tournaments.config`)에 두는 쪽이 "모임 하나에 하나" 라는
 * 뜻에는 더 맞지만, 그건 서버 스키마(`normalize_tournament_config`)를
 * 바꾸는 일이다. 그리고 지금 자동 예약은 **실제로 기기별 동작이다** —
 * 코트 화면을 켜 둔 기기가 만든다. 서버 설정으로 두면 "껐는데 왜
 * 만들어지지"(다른 기기가 옛 설정을 캐시한 채 돌고 있다)가 생겨,
 * 스위치가 거짓말을 하게 된다. 있는 그대로 기기별로 둔다.
 *
 * 모임마다 따로 기억한다. 어제 모임에서 껐다고 오늘 모임까지 꺼져
 * 있으면 "왜 안 걸리지" 를 다음 주에 다시 겪는다.
 */
export function useAutoQueueEnabled(
  tournamentId: string | undefined,
): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(() => readPref(tournamentId))

  const set = useCallback(
    (v: boolean) => {
      setEnabled(v)
      if (!tournamentId) return
      try {
        window.localStorage.setItem(prefKey(tournamentId), v ? '1' : '0')
      } catch {
        // 사파리 프라이빗 모드 등 — 저장만 못 할 뿐 이번 화면에서는 동작한다
      }
    },
    [tournamentId],
  )

  return [enabled, set]
}

/**
 * 기본값은 **켬**이다.
 *
 * 사용자가 원한 것이 "코트 현황 보고 한 코트 정도씩 걸려 있으면 좋겠다"
 * 였다. 기본이 꺼짐이면 그걸 얻으려면 매 모임 스위치를 찾아 켜야 하는데,
 * 그러면 이 기능은 없는 것과 같다 — 아무도 안 누르는 버튼이 화면에 하나
 * 더 생길 뿐이다(`autoMatch.ts` 가 `[자동으로 짜기]` 버튼을 안 만든 이유와
 * 같다). 방해가 되는 날은 끄면 되고, 그 선택은 이 기기에 남는다.
 */
function readPref(tournamentId: string | undefined): boolean {
  if (!tournamentId) return false
  try {
    return window.localStorage.getItem(prefKey(tournamentId)) !== '0'
  } catch {
    return true
  }
}
