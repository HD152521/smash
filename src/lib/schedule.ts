import type { CourtRow, MatchOverviewRow } from '@/types/database'

/**
 * 대진표 = 아직 안 끝난 경기 목록.
 *
 * 운영 순서가 이렇게 흘러간다:
 *   관리자가 경기를 여러 개 만든다 (코트 미정)
 *   → 비는 코트를 보고 코트에 배정한다 → 그 코트 대기열에 선다
 *   → 대기열에서 눌러 시작한다
 *
 * 그래서 코트별 줄과 '코트를 아직 안 정한 경기' 를 따로 낸다.
 * 화면은 코트별 줄을 먼저 보여주고 미배정을 맨 아래에 둔다.
 */

export interface CourtQueue {
  court: CourtRow
  /** 이 코트에서 지금 하는 경기 (한 코트 한 경기) */
  live: MatchOverviewRow | null
  /** 이 코트에 배정된 예정 경기 */
  waiting: MatchOverviewRow[]
}

export interface Schedule {
  /** 코트를 아직 안 정한 예정 경기 */
  unassigned: MatchOverviewRow[]
  courts: CourtQueue[]
  scheduledCount: number
  liveCount: number
}

export function buildSchedule(
  matches: readonly MatchOverviewRow[],
  courts: readonly CourtRow[],
): Schedule {
  const scheduled = matches.filter((m) => m.status === 'scheduled')
  const live = matches.filter((m) => m.status === 'live')

  return {
    unassigned: scheduled.filter((m) => !m.court_id),
    courts: courts.map((court) => ({
      court,
      live: live.find((m) => m.court_id === court.id) ?? null,
      waiting: scheduled.filter((m) => m.court_id === court.id),
    })),
    scheduledCount: scheduled.length,
    liveCount: live.length,
  }
}

/** 이 경기에서 내 자리 — 뛰거나, 심판을 보거나, 상관없거나 */
export type MyMatchRole = 'player' | 'referee' | null

/**
 * 대진표에서 내 경기를 골라내는 기준.
 *
 * 이름으로 맞춘다. match_overview 가 내려주는 건 display_name 뿐이고,
 * 머리말의 심판 배지도 이미 같은 기준을 쓴다 (useTournamentNav).
 *
 * 뛰는 것과 심판을 겸하는 편성은 없지만, 겹치면 뛰는 쪽을 앞세운다 —
 * 그때 몸이 있어야 할 곳은 코트 안이다.
 */
export function myMatchRole(m: MatchOverviewRow, myName: string | undefined): MyMatchRole {
  if (!myName) return null
  if (m.players_a?.includes(myName) || m.players_b?.includes(myName)) return 'player'
  if (m.referees?.includes(myName)) return 'referee'
  return null
}

/** "1조 vs 3조" 처럼 한 줄로 읽히게 */
export function matchTitle(m: MatchOverviewRow): string {
  return `${m.group_a_name ?? '—'} vs ${m.group_b_name ?? '—'}`
}
