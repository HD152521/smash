import { supabase } from '@/lib/supabase'

/**
 * 웹 푸시 구독.
 *
 * 아이폰 주의: iOS 16.4+ 에서 되지만 반드시 '홈 화면에 추가' 를 해야 한다.
 * 사파리 탭으로 열어둔 상태에서는 Notification 자체가 없거나 권한 요청이
 * 통하지 않는다. 그래서 지원 여부를 뭉뚱그리지 않고 이유까지 돌려준다.
 */

export type PushSupport =
  { ok: true } | { ok: false; reason: 'unsupported' | 'ios-needs-install' | 'no-key' }

/** iOS 사파리인지 (아이패드는 데스크톱으로 위장하므로 터치 여부까지 본다) */
function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** 홈 화면에 추가된 상태로 실행 중인가 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS 사파리만 쓰는 비표준 속성
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function checkPushSupport(): PushSupport {
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-key' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    // 아이폰인데 안 되는 건 대부분 '홈 화면에 추가' 를 안 해서다.
    // 그냥 '지원 안 함' 이라고 하면 해결할 방법이 있는데도 포기하게 된다.
    if (isIos() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' }
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}

/**
 * base64url VAPID 공개키를 PushManager 가 받는 형식으로.
 *
 * ArrayBuffer 를 명시적으로 만든다. 그냥 new Uint8Array(n) 은 타입이
 * ArrayBufferLike(SharedArrayBuffer 포함)라 BufferSource 로 안 받아준다.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function keyToBase64(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const key = sub.getKey(name)
  if (!key) throw new Error(`구독 키(${name})를 읽지 못했습니다`)
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js')
  // register() 는 설치가 끝나기 전에 돌아온다. ready 를 기다리지 않고
  // subscribe 하면 활성 워커가 없어서 실패한다.
  await navigator.serviceWorker.ready
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!checkPushSupport().ok) return null
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function enablePush(): Promise<void> {
  const support = checkPushSupport()
  if (!support.ok) throw new Error('이 브라우저에서는 알림을 켤 수 없습니다')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? '알림이 차단돼 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
        : '알림 권한을 받지 못했습니다',
    )
  }

  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      // false 로 두면 브라우저가 거부한다. 알림은 반드시 사용자에게 보여야 한다.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
    }))

  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) throw new Error('로그인이 필요합니다')

  // 같은 브라우저가 다시 구독하면 endpoint 가 같다. 그때 새 행을 만들면
  // 죽은 구독이 쌓이므로 endpoint 를 기준으로 덮어쓴다.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: keyToBase64(sub, 'p256dh'),
      auth: keyToBase64(sub, 'auth'),
      user_agent: navigator.userAgent.slice(0, 300),
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  // 브라우저에서만 지우면 서버는 계속 죽은 엔드포인트로 쏜다
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

/**
 * 발송기를 한 번 깨운다.
 *
 * 알림을 보내는 주체는 서버(Edge Function)다. 여기서는 "지금 밀어내라" 는
 * 신호만 준다 — 보낼 대상과 내용은 전적으로 DB 가 정하므로, 이 호출로는
 * 남의 알림을 만들어낼 수 없다.
 *
 * 실패해도 조용히 넘어간다. 보낼 것은 아웃박스에 남아 다음 호출 때 나간다.
 * 여기서 오류를 띄우면 경기는 잘 만들어졌는데 실패한 것처럼 보인다.
 */
export async function kickPushSender(): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: {} })
  } catch {
    // 알림은 부가 기능이다. 편성 자체를 막지 않는다.
  }
}
