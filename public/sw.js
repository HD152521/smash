/*
 * 알림용 서비스 워커.
 *
 * 앱이 닫혀 있어도 브라우저가 이 파일을 깨워서 알림을 띄운다.
 * 그래서 여기 있는 코드는 앱 번들과 완전히 분리돼 있다 — import 도, 빌드도 없다.
 *
 * 캐싱은 하지 않는다. 오프라인 지원을 하려는 게 아니라 알림만 받으면 되는데,
 * 캐싱을 잘못 붙이면 점수 화면이 옛날 것으로 굳어버린다. 그게 훨씬 위험하다.
 */

self.addEventListener('install', () => {
  // 새 워커가 바로 일하게 한다. 알림 형식이 바뀌었는데 옛 워커가
  // 계속 돌면 엉뚱한 알림이 뜬다.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // 형식이 깨져도 알림 자체는 띄운다. 조용히 사라지는 것보다 낫다.
    data = {}
  }

  const title = data.title || 'SMASH'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 경기 알림이 여러 번 오면 쌓이지 않고 덮어쓴다
    tag: data.tag || 'smash',
    renotify: true,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열린 탭이 있으면 그 탭을 쓴다. 누를 때마다 새 탭이 생기면
      // 체육관에서 탭이 열 개씩 쌓인다.
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
