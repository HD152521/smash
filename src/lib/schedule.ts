import { hasNoGroups, playerTitle } from './session'
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

/**
 * 코트 대기열에서 몇 번째인가 (1부터). 없으면 null.
 *
 * ⚠ 이 정의가 '곧 차례' 알림이 나가는 자리를 정한다.
 *   supabase/migrations/20260824000001_notify_when_up_next.sql 의 notify_up_next 가
 *   같은 순서(queue_order, created_at)로 같은 줄을 센다. 한쪽만 바꾸면 화면에
 *   3번으로 보이는 사람에게 알림이 가거나 그 반대가 된다.
 *
 * 진행 중인 경기는 줄에서 뺀다 — 이미 코트 안에 있는 사람은 기다리는 게 아니다.
 */
export function queuePosition(
  waiting: readonly MatchOverviewRow[],
  matchId: string | null,
): number | null {
  if (!matchId) return null
  const i = waiting.findIndex((m) => m.id === matchId)
  return i < 0 ? null : i + 1
}

/** 이 순번이면 '곧 차례' 알림이 이미 나갔다 */
export function isUpNext(position: number | null, readyPosition: number): boolean {
  return position !== null && position <= readyPosition
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

/**
 * "1조 vs 3조" 처럼 한 줄로 읽히게.
 *
 * 모임 경기는 조가 없다(group_id 가 NULL). 그때 '— vs —' 를 내면 대진표와
 * 알림 문구가 통째로 무의미해지므로 사람 이름으로 부른다.
 */
export function matchTitle(m: MatchOverviewRow): string {
  if (hasNoGroups(m)) return playerTitle(m)
  return `${m.group_a_name ?? '—'} vs ${m.group_b_name ?? '—'}`
}
