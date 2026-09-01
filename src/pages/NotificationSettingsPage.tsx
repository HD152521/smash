import { AppHeader } from '@/components/nav/AppHeader'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { PushToggle } from '@/features/notifications/PushToggle'

/**
 * 알림 설정 — **이 기기**의 알림을 켜고 끈다. 그 하나만 한다.
 *
 * 전에는 대회 설정 화면 가운데에 끼어 있었다. 그런데 `PushToggle` 은
 * `tournamentId` 를 받지 않는다 — 브라우저 구독 하나를 켜고 끌 뿐이다.
 * 대회 화면에 두면 세 가지가 어긋난다.
 *
 *  1. 대회 셋에 참가한 사람에게는 **같은 스위치가 세 군데**에 뜨고 셋이
 *     같은 값을 공유한다. A 대회에서 끄면 B·C 알림도 같이 죽는데 화면은
 *     그렇게 말하지 않는다
 *  2. 아직 어느 대회에도 안 들어간 사람은 **켤 방법이 아예 없다**
 *  3. 대회 설정에 오는 이유는 "내 조를 바꾸려고" 인데, 그 사이에 성격이
 *     다른 스위치가 끼어 있다
 *
 * 그래서 계정·기기 단위 화면으로 뺐다. 대회 설정에는 조와 이름만 남는다.
 */
export function NotificationSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5" style={{ paddingBottom: APP_TAB_PADDING }}>
      {/*
        위쪽 이동이 없다 — 이 화면에는 전역 하단탭이 뜨고 '나' 탭이 켜진 채로
        열린다(`appTabs.ts`). 그 탭이 곧 부모 화면(`/me`)이라 나가는 길이
        이미 있다. 위에 '내 정보' 를 또 두면 같은 곳으로 가는 것이 둘이 된다
        (`BackBar` 주석).
      */}
      <AppHeader title="알림" />
      <p className="mt-2 text-sm text-ink-2">
        내 경기 차례가 가까워지면 알려드립니다. 참가 중인 모든 대회와 모임에 함께 적용됩니다.
      </p>

      <div className="mt-6">
        <PushToggle />
      </div>

      {/*
        "이 기기에만" 을 스위치 아래에 한 번 더 적는다. 폰에서 켜 두고
        노트북에서 안 온다고 고장으로 읽는 일이 실제로 생긴다 — 구독은
        브라우저마다 따로 만들어진다.
      */}
      <p className="mt-4 text-sm text-ink-3">
        알림은 지금 보고 있는 이 브라우저에만 켜집니다. 다른 기기에서도 받으려면 그 기기에서 한 번
        더 켜 주세요.
      </p>
    </main>
  )
}
