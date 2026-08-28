import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
import { HOME_PATH, HomeLink } from './HomeLink'
import { useCanGoBack } from '@/hooks/useCanGoBack'
import { cn } from '@/lib/utils'

/**
 * 뒤로가기를 얹은 화면 머리말 — **스크롤을 내려도 화면 위에 남는다.**
 *
 * 예전엔 머리말이 그냥 문서 흐름에 있었다. 참가자 명단·기록·대진표처럼 긴
 * 화면에서는 조금만 내려도 뒤로가기가 화면 위로 사라져서, 나가려면 맨
 * 위까지 스크롤을 되감아야 했다. 저녁 내내 한 손으로 쓰는 앱에서 그건
 * 매번 무는 세금이다.
 *
 * 아이폰에서 홈 화면에 추가해 쓰는 사람에게는 더 심하다(알림 때문에 우리가
 * 그렇게 안내한다). 그 화면에는 브라우저 뒤로가기도, 가장자리 스와이프도
 * 없다 — **이 버튼이 유일한 출구다.**
 *
 * ## `fixed` 가 아니라 `sticky` 인 이유
 *
 * 흐름에서 자리를 그대로 차지한다. 그래서 아래 내용이 머리말 뒤에 깔리는
 * 일이 없다 — 화면마다 상단 여백을 따로 맞춰 줄 필요가 없다. 하단탭이
 * `fixed` 라 본문에 `padding-bottom` 을 일일이 넣어야 했던 것과 반대다.
 *
 * ## 가장자리까지 배경을 깐다
 *
 * 페이지 껍데기는 전부 `px-5 pt-6` 이다. 그 안쪽에 그냥 두면 좌우 20px ·
 * 위 24px 짜리 띠가 배경 없이 남아서, 본문 글자가 그 틈으로 머리말을
 * 지나쳐 흐른다. 껍데기 여백만큼 바깥으로 물러났다가(`-mx-5 -mt-6`) 같은
 * 만큼 안쪽 여백으로 되돌려 그 틈을 없앤다. 껍데기 여백이 다른 화면
 * (관전판은 `p-4`)은 `className` 과 `topPad` 로 맞춘다.
 *
 * ## 배경을 반투명으로 하지 않는다
 *
 * 하단탭은 `bg-surface-1/95 backdrop-blur` 를 쓴다. 거기는 밑을 지나가는
 * 것이 없어서 괜찮다. 여기는 본문이 바로 밑으로 흐르므로 5% 만 비쳐도
 * 체육관 조명 아래에서 글자 위에 글자가 겹쳐 읽힌다. 배경색은 페이지와
 * 같은 `surface-0` 이라 스크롤을 안 내린 동안에는 아무 티도 나지 않는다.
 *
 * `z-30` 은 하단탭(`z-40`)과 알림 배너(`z-50`)보다 낮다. 머리말과 하단탭은
 * 애초에 겹칠 자리가 아니지만, 겹치는 날이 오면 손이 자주 가는 쪽이 위여야
 * 한다.
 *
 * ## 오른쪽 끝에 홈 — 기본으로 켜 둔다
 *
 * 뒤로가기만 있으면 한 칸씩 되짚어야 나간다. 동아리 명단에서 메인까지는
 * 서너 번이다. 그래서 홈을 여기에 더한다 — 머리말 하나를 고치면 하단탭이
 * 없는 화면 스무 곳이 한 번에 덮인다.
 *
 * **기본값이 켬인 것이 중요하다.** 새 화면을 만드는 사람이 홈을 따로
 * 챙기지 않아도 출구가 둘 생긴다. 반대로 이미 홈으로 가는 길이 있는
 * 곳(대회·모임 화면은 하단탭 '더보기' 안에 홈이 있다)만 `home={false}`
 * 로 끈다. 같은 화면에 같은 곳으로 가는 버튼이 둘이면 둘 다 덜 믿게 된다.
 *
 * 게스트 화면(`/g/...`)은 애초에 이 머리말을 쓰지 않는다. 계정이 없는
 * 사람에게 `/` 는 로그인 화면이라 홈이 출구가 아니라 막다른 길이다.
 */
export function BackBar({
  to,
  label,
  fixed = false,
  home = true,
  children,
  className,
  topPad = '1.5rem',
}: {
  /** 되짚을 히스토리가 없을 때 갈 곳 (`fixed` 면 항상 여기로) */
  to: string
  /** 되짚을 히스토리가 없을 때 뒤로가기에 적히는 글자 */
  label: string
  /** 히스토리를 무시하고 항상 `to` 로 간다 — 근거는 BackLink 주석 */
  fixed?: boolean
  /** 오른쪽 끝 홈 버튼. 이미 홈으로 가는 길이 있는 화면에서만 끈다 */
  home?: boolean
  /** 뒤로가기 오른쪽에 함께 서는 것 (대회 이름·상태 배지 등) */
  children?: ReactNode
  className?: string
  /** 페이지 껍데기의 위쪽 여백. 이만큼을 머리말이 대신 진다. */
  topPad?: string
}) {
  /*
    뒤로가기가 지금 이 순간 메인으로 향한다면(되짚을 히스토리가 없어 `to`
    로 가는데 그 `to` 가 메인) 홈은 바로 옆 버튼과 같은 일을 한다. 카톡
    링크로 '모임 열기' 화면에 바로 들어온 경우가 그렇다. 그때만 감춘다 —
    `to` 만 보고 끄면 안 된다. 같은 화면도 동아리에서 들어오면
    (`/new/session?club=…`) 메인까지 세 번이라 홈이 꼭 필요하다.
  */
  const canGoBack = useCanGoBack(fixed)
  const backGoesHome = !canGoBack && to === HOME_PATH

  return (
    <header
      className={cn(
        'sticky top-0 z-30 -mx-5 -mt-6 flex items-center justify-between gap-2 bg-surface-0 px-5 pb-2',
        className,
      )}
      /*
        아이폰은 `viewport-fit=cover` 라 화면이 상태바 밑까지 뻗는다.
        하단탭이 `env(safe-area-inset-bottom)` 을 쓰는 것과 같은 규율로,
        위쪽도 노치만큼 배경을 더 깔고 버튼은 그 아래에 남긴다.
      */
      style={{ paddingTop: `calc(${topPad} + env(safe-area-inset-top))` }}
    >
      <BackLink to={to} fixed={fixed}>
        {label}
      </BackLink>
      {children}
      {/*
        홈은 맨 오른쪽이다. 왼쪽 끝(뒤로가기)과 멀어야 급할 때 헷갈리지
        않고, `shrink-0` 이라 가운데에 선 제목이 아무리 길어져도 이 버튼이
        찌그러지지 않는다 — 밀리는 쪽은 항상 제목(`truncate`)이다.
      */}
      {home && !backGoesHome && <HomeLink />}
    </header>
  )
}
