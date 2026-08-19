import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { checkPushSupport, currentSubscription, disablePush, enablePush } from './push'
import { toUserMessage } from '@/lib/errors'

/**
 * 알림 켜기/끄기.
 *
 * 권한 요청은 사용자가 버튼을 누른 뒤에만 한다. 화면 열자마자 물어보면
 * 대부분 반사적으로 '차단' 을 누르고, 한 번 차단하면 앱에서는 되돌릴
 * 방법이 없다 (브라우저 설정에서 직접 풀어야 한다).
 */
export function PushToggle() {
  const support = checkPushSupport()
  // 지원되지 않는 환경이면 처음부터 '꺼짐' 이다. 효과에서 뒤늦게 바꾸면
  // 한 프레임 동안 로딩 상태가 깜빡인다.
  const [on, setOn] = useState<boolean | null>(support.ok ? null : false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!support.ok) return
    let alive = true
    void currentSubscription().then((s) => {
      if (alive) setOn(Boolean(s))
    })
    return () => {
      alive = false
    }
  }, [support.ok])

  if (!support.ok) return <Unsupported reason={support.reason} />

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (on) {
        await disablePush()
        setOn(false)
      } else {
        await enablePush()
        setOn(true)
      }
    } catch (e) {
      setError(toUserMessage(e, '알림 설정을 바꾸지 못했습니다'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-4">
        {on ? (
          <Bell className="mt-0.5 size-5 shrink-0 text-brand-fg" aria-hidden />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-1">{on ? '알림 켜짐' : '알림 꺼짐'}</p>
          <p className="mt-1 text-sm text-ink-2">
            내 경기가 잡히면 알려드립니다. 앱을 닫아둬도 옵니다.
          </p>
        </div>
      </div>

      <Button
        variant={on ? 'secondary' : 'primary'}
        className="mt-3 w-full"
        loading={busy}
        disabled={on === null}
        onClick={() => void toggle()}
      >
        {on ? '알림 끄기' : '알림 켜기'}
      </Button>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {error}
        </p>
      )}
    </div>
  )
}

function Unsupported({ reason }: { reason: 'unsupported' | 'ios-needs-install' | 'no-key' }) {
  if (reason === 'ios-needs-install') {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4">
        <p className="flex items-center gap-2 font-bold text-ink-1">
          <Share className="size-4 shrink-0" aria-hidden />홈 화면에 추가하면 알림을 받을 수 있어요
        </p>
        <p className="mt-2 text-sm text-ink-2">
          아이폰은 사파리 탭으로 열어둔 상태에서는 알림이 오지 않습니다. 애플 정책이라 앱에서 바꿀
          수 없습니다.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>사파리 아래쪽 공유 버튼을 누릅니다</li>
          <li>&lsquo;홈 화면에 추가&rsquo;를 선택합니다</li>
          <li>홈 화면에 생긴 아이콘으로 다시 들어와 알림을 켭니다</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4">
      <p className="font-bold text-ink-1">이 브라우저는 알림을 지원하지 않습니다</p>
      <p className="mt-1 text-sm text-ink-2">
        {reason === 'no-key'
          ? '알림 서버가 아직 설정되지 않았습니다.'
          : '크롬이나 삼성 인터넷에서는 알림을 받을 수 있습니다.'}
      </p>
    </div>
  )
}
