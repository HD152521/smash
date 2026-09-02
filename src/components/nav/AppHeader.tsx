import type { ReactNode } from 'react'
import { CourtMotif } from '@/components/brand/CourtMotif'
import { Shuttlecock } from '@/components/brand/Shuttlecock'

/**
 * 하단탭이 뜨는 네 화면(오늘 · 동아리 · 내 목록 · 나)의 **공통 머리말**.
 *
 * ── 왜 하나로 묶는가 ───────────────────────────────────────────────
 *
 * 전에는 홈만 작은 마크 한 줄로 시작하고, 나머지 셋은 `BackBar('메인으로')`
 * + 큰 제목 + 설명문으로 시작했다. **화면마다 머리가 다르면 매번 "여기가
 * 어디지" 를 다시 읽어야 한다.** 탭으로 오가는 네 화면은 같은 자리에서
 * 같은 모양으로 시작해야 탭을 눌렀을 때 "같은 앱 안에서 자리를 옮겼다"
 * 로 읽힌다.
 *
 * ── 뒤로가기를 뺀 이유 ─────────────────────────────────────────────
 *
 * 이 넷은 이제 **최상위 장소**다. 되짚어 나갈 위가 없다 — 홈으로 가는
 * 것은 탭이 한다. `BackBar` 를 그대로 두면 '메인으로' 와 '홈' 탭이 같은
 * 일을 하는 버튼 둘이 되고, *"같은 화면에 같은 곳으로 가는 버튼이 둘이면
 * 둘 다 덜 믿게 된다"*(`BackBar` 주석).
 *
 * 하위 화면(`/c/:id/members` · `/settings/alerts` 등)은 그대로 `BackBar`
 * 를 쓴다. 거기서는 되짚기가 진짜 필요하다 — 대신 `home={false}` 로 홈
 * 버튼만 끈다. 홈은 탭에 있다.
 *
 * ── 크기와 여백 ────────────────────────────────────────────────────
 *
 * 제목은 본문보다 훨씬 크다(`text-[1.75rem]`). `docs/design.md` 의
 * 「제목을 지우고 정보를 키운다」와 부딪치는 것처럼 보이지만 아니다 —
 * 그 원칙은 **가동 화면**(코트 · 경기 짜기)에서 제목이 코트를 밀어내는 걸
 * 막는 것이고, 여기 넷은 가동 화면이 아니라 목적지 화면이다. 어디 왔는지
 * 한눈에 보이는 편이 낫다.
 *
 * 노치 아래에 앉힌다 — `BackBar` 가 `env(safe-area-inset-top)` 을 쓰는
 * 것과 같은 규율.
 */
export function AppHeader({
  title,
  meta,
  mark = false,
  children,
}: {
  title: string
  /** 제목 아래 한 줄. 날짜·개수처럼 **사실**만 적는다 (설명문 자리가 아니다) */
  meta?: ReactNode
  /** 셔틀콕 마크. 앱의 첫 화면(홈)에서만 켠다 */
  mark?: boolean
  /** 제목 오른쪽에 서는 것 */
  children?: ReactNode
}) {
  return (
    /*
      코트 라인 모티프를 머리 뒤에 아주 옅게 깐다. relative 부모 + absolute
      모티프라 아래 내용의 높이에 관여하지 않는다 (docs/design.md 시각
      정체성 — "높이를 늘리지 않고 진해진다"). 껍데기의 좌우 여백만큼
      바깥으로 물러나 가장자리까지 선이 닿게 한다.

      아래로 갈수록 사라지게 마스크를 씌운다. **찍어 보고 넣은 것이다** —
      마스크가 없으면 모티프의 아래 테두리가 본문 한가운데에서 딱 끊겨,
      코트 라인이 아니라 **아무 뜻 없는 가로줄**로 읽힌다. 「내 목록」에서는
      필터 칩을, 「내 정보」에서는 안내 문구를 정확히 가로질렀다. 선이
      끝나는 자리를 안 보이게 하면 그 줄이 사라진다.
    */
    <div className="relative -mx-5">
      <CourtMotif className="absolute inset-x-0 top-0 h-32 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]" />
      <header
        className="relative z-10 px-5 pb-1"
        style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
      >
        {mark && (
          <div className="flex items-center gap-1.5 pb-3">
            {/* 시안(design/neon)의 라임 셔틀콕 마크 */}
            <Shuttlecock size={16} className="text-brand-fg" />
            <span className="eyebrow text-ink-2">Smash</span>
          </div>
        )}
        <div className="flex items-end justify-between gap-3">
          <h1 className="min-w-0 flex-1 truncate text-[1.75rem] leading-tight font-black tracking-tight text-ink-1">
            {title}
          </h1>
          {children}
        </div>
        {meta && <p className="mt-1 text-sm font-semibold text-ink-2">{meta}</p>}
      </header>
    </div>
  )
}
