import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

/**
 * 경기 변경을 실시간으로 받는다.
 *
 * matches 테이블만 구독한다. score_events(원장)를 구독하면 클라이언트가
 * 매번 재집계해야 하고 이벤트도 훨씬 잦다. 투영 테이블 한 줄이면 충분하다.
 *
 * 구독이 끊겨도 화면이 멈추면 안 되므로, 각 쿼리에 폴링 안전망이 걸려 있다.
 * 여기서는 상태만 돌려주고 "실시간" 배지를 켜고 끄는 데 쓴다.
 */
export function useRealtimeMatches(tournamentId: string | undefined): RealtimeStatus {
  const qc = useQueryClient()
  const [status, setStatus] = useState<RealtimeStatus>('connecting')

  useEffect(() => {
    if (!tournamentId) return

    const channel = supabase
      .channel(`tournament:${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
          void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'standings'] })
          const row = (payload.new ?? payload.old) as { id?: string } | null
          if (row?.id) void qc.invalidateQueries({ queryKey: ['match', row.id] })
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tournamentId, qc])

  return status
}
