import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ClubScreen } from '@/features/club/ClubScreen'
import { useRotateGuestCode } from '@/features/club/queries'
import { toUserMessage } from '@/lib/errors'
import { guestLinkUrl } from '@/lib/guest'

/**
 * 게스트 링크 — **오늘 온 손님을 부르는 링크 하나.** 그것만 한다.
 *
 * 체육관에서 운영진이 동아리 화면을 여는 이유는 거의 언제나 이것이다.
 * 그런데 전에는 이 링크가 동아리 화면 한가운데, 회원 30명 명단과 산하
 * 대회 목록 사이에 끼어 있었다. 가장 자주 하는 일이 가장 찾기 어려웠다.
 *
 * ⚠ 여기에 동아리 코드를 같이 두지 마라. 둘은 들어오는 문이 다르다 —
 * 동아리 코드는 **회원이 되는** 코드(영구 명단), 게스트 링크는 **오늘
 * 하루** 이름을 적는 링크(계정 없음)다. 한 화면에 두면 운영진이 급할 때
 * 엉뚱한 것을 복사해 뿌린다. `routes.tsx` 가 들어오는 문(`/join` ·
 * `/clubs/join`)을 이미 같은 이유로 갈라 뒀다.
 */
export function ClubGuestLinkPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const rotate = useRotateGuestCode(clubId ?? '')
  const [copied, setCopied] = useState(false)

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 클립보드가 막힌 브라우저 — 링크는 화면에 그대로 있어 손으로 복사할 수 있다
    }
  }

  /**
   * 재발급은 확인을 한 번 더 받는다 — 누르는 순간 옛 링크가 즉시 죽어서,
   * 방금 카톡으로 그 링크를 뿌린 사람이 있으면 그 사람들은 다시 못 들어온다.
   * 이미 등록된 게스트는 건드리지 않는다(`rotate_guest_code` 주석 참고).
   */
  async function handleRotate() {
    if (!confirm('게스트 링크를 다시 만들까요? 지금 링크는 바로 꺼집니다.')) return
    try {
      await rotate.mutateAsync()
    } catch {
      // rotate.error 로 화면에 뿌린다
    }
  }

  return (
    <ClubScreen
      clubId={clubId!}
      title="게스트 링크"
      description="계정이 없는 사람도 이 링크로 오늘 열린 모임에 이름을 적고 들어옵니다."
      staffOnly
    >
      {({ club }) => {
        const url = guestLinkUrl(window.location.origin, club.guest_code)
        return (
          <>
            <p className="tabular rounded-xl bg-surface-2 px-3 py-3 text-sm font-semibold break-all text-ink-1">
              {url}
            </p>

            <Button type="button" className="mt-3 w-full" onClick={() => void copy(url)}>
              <Copy className="size-4" aria-hidden />
              {copied ? '복사했습니다' : '링크 복사'}
            </Button>

            {/*
              재발급은 파괴적이라 복사와 같은 무게로 두지 않는다. 선을 긋고
              아래로 내려, 급히 복사하러 온 손가락이 스치지 않게 한다.
            */}
            <section className="mt-10 border-t border-border-subtle pt-6">
              <h2 className="font-bold text-ink-1">링크가 샜다면</h2>
              <p className="mt-1 text-sm text-ink-2">
                다시 만들면 지금 링크는 바로 꺼집니다. 이미 등록된 게스트는 그대로 남습니다.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                loading={rotate.isPending}
                onClick={() => void handleRotate()}
              >
                <RefreshCw className="size-4" aria-hidden />
                다시 만들기
              </Button>
              {rotate.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                  {toUserMessage(rotate.error, '게스트 링크를 다시 만들지 못했습니다')}
                </p>
              )}
            </section>
          </>
        )
      }}
    </ClubScreen>
  )
}
