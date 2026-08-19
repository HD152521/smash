/**
 * 웹 푸시 발송기.
 *
 * 아웃박스에 쌓인 알림을 읽어 각 사람의 브라우저로 보낸다.
 *
 * 왜 아웃박스를 두는가: 트리거 안에서 바로 외부로 쏘면 푸시 서버가 느리거나
 * 죽었을 때 경기 편성 트랜잭션까지 같이 실패한다. 알림이 안 가는 것보다
 * 경기가 안 만들어지는 게 훨씬 나쁘다.
 *
 * 누가 부르는가: 관리자가 경기를 편성한 직후 앱이 한 번 부른다.
 * 그 호출이 실패해도 아웃박스에 남아 다음 호출 때 함께 나간다.
 *
 * 배포:
 *   supabase functions deploy send-push
 *   supabase secrets set VAPID_PRIVATE_KEY=... VAPID_PUBLIC_KEY=... VAPID_SUBJECT=mailto:...
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface Pending {
  outbox_id: string
  user_id: string
  title: string
  body: string
  url: string
  subscriptions: { endpoint: string; p256dh: string; auth: string }[]
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@juganlab.com'
  if (!publicKey || !privateKey) {
    return json({ error: 'VAPID 키가 설정되지 않았습니다' }, 500)
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  // 이 함수는 아무나 불러도 된다 — 보낼 대상과 내용은 전적으로 DB 가 정하고,
  // 호출자는 "지금 밀어내라" 는 신호만 준다. 남의 알림을 만들 수는 없다.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await admin.rpc('pending_notifications', { p_limit: 200 })
  if (error) return json({ error: error.message }, 500)

  const pending = (data ?? []) as Pending[]
  if (pending.length === 0) return json({ sent: 0, pending: 0 })

  let sent = 0
  let gone = 0
  const done: string[] = []

  for (const row of pending) {
    // 구독이 하나도 없어도 처리한 것으로 표시한다. 안 그러면 알림을 안 켠
    // 사람 앞으로 영원히 남아 매번 다시 시도된다.
    if (row.subscriptions.length === 0) {
      done.push(row.outbox_id)
      continue
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url,
      tag: row.outbox_id,
    })

    const results = await Promise.allSettled(
      row.subscriptions.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 6 },
        ),
      ),
    )

    // 다시 시도해서 될 실패(일시적)와, 시도해도 소용없는 실패(구독이 죽음)를 나눈다
    let retryable = false

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const endpoint = row.subscriptions[i]!.endpoint
      if (r.status === 'fulfilled') {
        sent++
        await admin.rpc('mark_subscription_ok', { p_endpoint: endpoint })
      } else {
        // 410/404 는 '이 구독은 영영 죽었다' 는 뜻이다. 지워야 다음 발송이 느려지지 않는다.
        const status = (r.reason as { statusCode?: number })?.statusCode
        const isGone = status === 404 || status === 410
        if (isGone) gone++
        else retryable = true
        await admin.rpc('mark_subscription_failed', { p_endpoint: endpoint, p_gone: isGone })
      }
    }

    // 기기가 여러 대인데 하나만 성공해도 그 사람에게는 닿았다.
    // 전부 실패했더라도 그 구독들이 이미 죽어 지워졌다면 다시 시도해도 소용없다 —
    // 남겨두면 보낼 곳도 없는 알림이 대기열에 영원히 쌓인다.
    const delivered = results.some((r) => r.status === 'fulfilled')
    if (delivered || !retryable) done.push(row.outbox_id)
  }

  if (done.length > 0) {
    await admin.rpc('mark_notifications_sent', { p_ids: done })
  }

  return json({ sent, gone, processed: done.length, pending: pending.length })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
