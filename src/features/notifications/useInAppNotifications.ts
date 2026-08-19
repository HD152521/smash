import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/useAuth'

/**
 * 앱을 켜 둔 사람에게 보이는 알림 배너.
 *
 * 웹 푸시는 앱이 닫혀 있을 때를 위한 것이고, 켜 놓고 있는 사람에게는
 * 시스템 알림이 오히려 방해가 된다(화면을 가린다). 그래서 앱 안에서는
 * 배너로 보여준다.
 *
 * 아이폰처럼 푸시가 아예 안 되는 환경에서는 이게 유일한 알림이 된다.
 */
interface Banner {
  id: string
  title: string
  body: string
  url: string
}

export function useInAppNotifications() {
  const { user } = useAuth()
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notify:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_outbox',
          // 남의 알림까지 받아서 걸러내면 안 된다. 서버에서 걸러 보낸다.
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; match_id: string }
          void hydrate(row.id, row.match_id).then((b) => {
            if (b) setBanner(b)
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  return { banner, dismiss: () => setBanner(null) }
}

/**
 * 알림 행에는 match_id 만 있다. 배너에 보여줄 문구는 경기에서 만든다.
 * (발송기가 쓰는 pending_notifications 는 남의 구독까지 들고 있어서
 *  일반 사용자에게 열 수 없다. 그래서 화면용은 따로 조회한다.)
 */
async function hydrate(id: string, matchId: string): Promise<Banner | null> {
  const { data, error } = await supabase
    .from('match_overview')
    .select('id, tournament_id, group_a_name, group_b_name, court_name')
    .eq('id', matchId)
    .single()
  if (error || !data) return null

  return {
    id,
    // 받는 사람이 알아야 할 것은 '어느 코트로 가라' 다
    title: `${data.court_name ?? '코트'} 배정`,
    body: `${data.group_a_name ?? '—'} vs ${data.group_b_name ?? '—'}`,
    url: `/t/${data.tournament_id}/matches/${data.id}`,
  }
}
