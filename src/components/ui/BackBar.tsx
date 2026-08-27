import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
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
 */
export function BackBar({
  to,
  label,
  fixed = false,
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
  /** 뒤로가기 오른쪽에 함께 서는 것 (대회 이름·상태 배지 등) */
  children?: ReactNode
  className?: string
  /** 페이지 껍데기의 위쪽 여백. 이만큼을 머리말이 대신 진다. */
  topPad?: string
}) {
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
    </header>
  )
}
