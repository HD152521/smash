import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Plus } from 'lucide-react'
import { AppHeader } from '@/components/nav/AppHeader'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { CourtMotif } from '@/components/brand/CourtMotif'
import { EmptyState } from '@/components/brand/EmptyState'
import { useAuth } from '@/features/auth/useAuth'
import { useCourts, useMatches, useMembers, useMyTournaments } from '@/features/tournament/queries'
import {
  attendanceThisMonth,
  daysUntilLabel,
  myNextInTournament,
  myNextLabel,
  pickTodayFocus,
  todayLabel,
  type TodayFocus,
} from '@/lib/home'
import { countRsvp, startsAtLabel } from '@/lib/rsvp'

/**
 * 메인 — **오늘을 보여주는 곳.** 이 화면의 책임은 그 하나다.
 *
 * ── 책임을 한 번 바꿨다 ────────────────────────────────────────────
 *
 * 처음에는 "어디로 갈지 고르는 곳" 으로 만들었다. 화면 하나에 책임
 * 하나라는 원칙을 지키려고 문(링크)만 두고 정보를 하나도 그리지 않았는데,
 * 찍어 보니 **흰 카드 다섯 개가 쌓인 목록이고 정보가 0** 이었다
 * (`docs/ui-redesign.md` 의 「홈이 그냥 메뉴다」).
 *
 * 원칙이 틀린 게 아니라 **책임을 잘못 골랐다.** 홈에 온 사람의 질문은
 * "어디로 갈까" 가 아니라 **"내가 지금 뭘 해야 하지"** 다.
 *
 * ── 2026-08-31 — 문을 전부 하단탭으로 내렸다 ───────────────────────
 *
 * 책임은 바꿨는데 **문이 그대로 남아 있었다.** 오늘 카드 아래에 작은 줄
 * 다섯(모임 열기 · 내 목록 · 대회 만들기 · 참가하기 · 내 정보)이 그대로
 * 쌓여 있어서, 화면이 여전히 "요약 한 칸 + 링크 목록" 으로 읽혔다.
 * 갈 곳이 없어서가 아니라 **갈 곳을 둘 자리가 없어서** 홈에 쌓인
 * 것이었다 — 대회 밖에는 하단탭이 없었으니까.
 *
 * 전역 하단탭(`AppTabBar`)이 생기면서 그 자리가 생겼다.
 *
 *   내 목록 · 내 정보 · 동아리  →  탭. **모든 화면에서** 한 번에 닿는다
 *   대회 만들기 · 참가하기      →  「내 목록」. 내 대회에 관한 일이다
 *   모임 열기                   →  홈에 남는다. **오늘 하는 일**이라서다
 *
 * 큰 초록 '동아리' 버튼도 걷어냈다. 동아리가 탭이 된 이상 같은 화면에서
 * 같은 곳으로 가는 버튼이 둘이 되고, 그러면 *"둘 다 덜 믿게 된다"*
 * (`BackBar` 주석). 동아리가 하나뿐인 사람을 바로 그 동아리로 보내던
 * 규칙은 탭이 그대로 이어받았다.
 *
 * 남은 것은 **오늘 하나**다.
 *
 * ── 그래서 무엇을 안 그리는가 ──────────────────────────────────────
 *
 * **여전히 점수판이 아니다.** 코트별 현황·대기열·순위는 그리지 않는다 —
 * 그건 대회 화면(`TournamentPage`)의 일이고, 두 화면이 같은 것을 다르게
 * 보여주기 시작하면 어느 쪽이 맞는지 아무도 모르게 된다.
 *
 * 그리는 것은 **오늘 하나에 대한 요약 몇 줄**뿐이다. 진행 중인 것이
 * 여럿이어도 하나만 고른다 — 셋을 나란히 놓으면 그건 다시 목록이고,
 * 목록은 「내 목록」이 할 일이다.
 *
 * ── 조회를 늘리지 않는 방법 ────────────────────────────────────────
 *
 * 참가 인원은 **고른 하나에 대해서만** 부른다. 목록 전체에 대해 부르면
 * 모임 수만큼 요청이 나가는 N+1 이 된다. 고를 것이 없으면 아예 안 부른다
 * (`enabled`).
 */
export function HomePage() {
  const now = useNow()

  return (
    <div className="min-h-dvh bg-surface-0">
      {/*
        세로로 늘어나는 칸이다. 오늘 볼 것은 위에, **하는 것은 맨 아래**에
        붙인다(docs/design.md 원칙 3 — 화면 아래 3분의 1이 엄지가 닿는 곳).
        `fixed` 로 띄우지 않는 이유는 하단탭이 이미 그 자리를 쓰고 있어서다 —
        겹치면 화면 아래가 두 겹이 된다. `mt-auto` 는 흐름 안에 있으므로
        내용이 길어지면 그냥 뒤로 밀린다.
      */}
      <main
        className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5"
        style={{ paddingBottom: APP_TAB_PADDING }}
      >
        <AppHeader mark title="오늘" meta={todayLabel(now)} />
        <Today now={now} />
      </main>
    </div>
  )
}

// ── 오늘 ──────────────────────────────────────────────────────────────

/**
 * 이 화면의 본문.
 *
 * 실패해도 오류 문구를 띄우지 않는다. '모임 열기' 는 요약과 무관하게 늘
 * 눌리고, 나머지 갈 곳은 하단탭에 있다 — 요약 한 칸이 막혔다고 사람을
 * 멈춰 세울 이유가 없다.
 */
function Today({ now }: { now: Date }) {
  const { data, isPending } = useMyTournaments()

  if (isPending)
    return (
      <>
        <TodaySkeleton />
        <OpenSessionButton />
      </>
    )

  const list = data ?? []
  const focus = pickTodayFocus(list, now)
  const attended = attendanceThisMonth(list, now)

  if (!focus)
    return (
      <>
        <NothingToday attended={attended} />
        <OpenSessionButton />
      </>
    )

  return (
    <>
      <section aria-labelledby="today-heading" className="mt-5">
        <h2 id="today-heading" className="sr-only">
          오늘
        </h2>
        <FocusCard focus={focus} now={now} />
        {attended > 0 && <AttendanceLine count={attended} />}
      </section>
      <OpenSessionButton />
    </>
  )
}

/**
 * 진행 중이든 다음 모임이든 **같은 카드**로 그린다.
 *
 * 코트 카드(`CourtBoard`)와 같은 문법 — 흰 카드 + 왼쪽 띠. 띠 색만
 * 다르다. 초록은 "들어갈 수 있다"(`docs/design.md` 색은 상태다) 이고,
 * 아직 시작 안 한 것은 들어갈 데가 없으므로 색을 쓰지 않는다.
 *
 * **색만으로 말하지 않는다.** 띠 옆에 "진행 중" · "내일" 같은 글자가
 * 항상 붙는다 — 체육관 조명과 햇빛에서 색이 제일 먼저 무너진다.
 *
 * 카드 뒤에 코트 라인을 깐다. **배경 레이어**라 카드가 커지지 않는다
 * (docs/design.md — "높이를 늘리지 않고 진해진다"). 이 화면에서 가장
 * 중요한 한 칸이 이 앱의 물건처럼 보여야 한다.
 */
function FocusCard({ focus, now }: { focus: TodayFocus; now: Date }) {
  const t = focus.tournament
  const live = focus.kind === 'live'
  const when = focus.kind === 'upcoming' ? startsAtLabel(focus.startsAt) : null
  const inDays = focus.kind === 'upcoming' ? daysUntilLabel(focus.startsAt, now) : null

  return (
    <Link
      to={`/t/${t.id}`}
      className={`group relative block overflow-hidden rounded-3xl border border-border-subtle
                  border-l-4 bg-surface-1 px-5 py-5 shadow-[var(--shadow-card)]
                  transition-transform hover:-translate-y-0.5
                  focus-visible:-translate-y-0.5 focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-brand-600
                  active:translate-y-0 active:scale-[0.99]
                  ${live ? 'border-l-state-open' : 'border-l-border-subtle'}`}
    >
      {/*
        카드 뒤 코트 마킹. 머리말(0.11)보다 옅다 — 여기는 이름과 '내 차례'
        라는 확실한 내용 위라, 같은 세기면 글자를 방해한다(docs/design.md —
        "읽는 것을 방해하면 실패다").
      */}
      <CourtMotif className="absolute inset-0 h-full opacity-[0.07]" />

      <span className="relative block">
        {/*
          눈썹 줄 — 상태를 이름보다 먼저 말한다. 홈에 온 사람이 카드에서
          제일 먼저 알고 싶은 것은 "이게 지금 돌아가고 있나" 다.
        */}
        <span className="flex items-center gap-2">
          {live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-state-open/12 px-2.5 py-1 text-xs font-black text-state-open-fg">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-state-open" />
              {t.kind === 'session' ? '모임' : '대회'} 진행 중
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-black text-ink-2">
              {inDays}
              {when && <span className="tabular font-bold text-ink-2">{when}</span>}
            </span>
          )}
          <ArrowRight
            aria-hidden
            className="ml-auto size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
          />
        </span>

        <span className="mt-2.5 block truncate text-2xl font-black tracking-tight text-ink-1">
          {t.name}
        </span>

        {live ? <MyNextLine tournamentId={t.id} /> : <GoingLine tournamentId={t.id} />}
      </span>
    </Link>
  )
}

/**
 * 진행 중일 때 **나에게** 남은 일 한 줄.
 *
 * 참가자가 홈에 오는 가장 큰 이유가 "내 차례 언제야" 인데, 전에는 그걸
 * 알려면 코트 화면까지 들어가야 했다. 여기 한 줄이면 안 들어가도 된다.
 *
 * 그래서 **면을 깔아 준다.** 카드 안의 다른 글자와 같은 무게로 두면
 * 이름 밑의 설명문처럼 읽히는데, 이건 이 카드에서 가장 급한 한 줄이다.
 *
 * 편성이 없거나 이름을 모르면 **줄 자체를 안 그린다.** 빈 줄을 남겨 두면
 * 게스트는 "내 경기가 사라졌나" 로 읽는다.
 *
 * ⚠ 여기는 여전히 **점수판이 아니다.** 코트별 현황·대기열 전체·점수는
 * 그리지 않는다 — 그건 코트 화면의 일이고, 두 화면이 같은 것을 다르게
 * 보여주기 시작하면 어느 쪽이 맞는지 아무도 모르게 된다.
 */
function MyNextLine({ tournamentId }: { tournamentId: string }) {
  const { user } = useAuth()
  const matches = useMatches(tournamentId)
  const courts = useCourts(tournamentId)
  const members = useMembers(tournamentId)

  if (!matches.data || !courts.data || !members.data) return null

  // 대회 안에서 쓰는 이름은 계정 이름과 다를 수 있다. 편성에 적힌 것은 이쪽이다.
  const myName = members.data.find((m) => m.userId === user?.id)?.displayName
  const next = myNextInTournament(matches.data, courts.data, myName)
  if (!next) return null

  return (
    <span className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5">
      <span className="text-xs font-bold tracking-tight text-ink-3">내 차례</span>
      <span className="min-w-0 flex-1 truncate text-sm font-black text-ink-1">
        {myNextLabel(next)}
      </span>
    </span>
  )
}

/**
 * 몇 명이 온다고 눌렀나.
 *
 * **고른 하나에 대해서만** 부른다 — 목록 전체에 부르면 모임 수만큼
 * 요청이 나간다. 아직 안 왔거나 실패하면 줄 자체를 안 그린다. 숫자가
 * 없는 자리에 "0명" 을 띄우면 아무도 안 온다는 말이 되고, 그건 사실이
 * 아니라 아직 모르는 것이다.
 */
function GoingLine({ tournamentId }: { tournamentId: string }) {
  const { data } = useMembers(tournamentId)
  if (!data) return null

  const counts = countRsvp(data)
  if (counts.going === 0 && counts.undecided === 0) return null

  return (
    <span className="mt-2.5 block text-sm text-ink-2">
      <b className="font-bold text-ink-1">{counts.going}명</b> 참가
      {counts.undecided > 0 && ` · ${counts.undecided}명 미정`}
    </span>
  )
}

/**
 * 진행 중인 것도 다음 모임도 없는 날. **이게 기본 상태다.**
 *
 * 전에는 회색 글씨 두 줄짜리 작은 칸이었고 화면 아래 절반이 그냥 비어
 * 있었다. 빈 상태는 **원래 비어 있던 자리**라 정체성을 넣어도 탭이 하나도
 * 안 는다(docs/design.md 「어디에 넣나」) — 다른 화면들이 이미 쓰는
 * `EmptyState` 를 그대로 쓴다. 화면마다 다른 빈 상태를 만들면 통일감이
 * 깨진다.
 *
 * 동작(모임 열기)은 여기 안 넣는다. 바로 아래에 하나 있는데 여기 또 두면
 * 같은 버튼이 둘이 된다.
 */
function NothingToday({ attended }: { attended: number }) {
  return (
    /*
      남는 높이를 **감싸는 칸**이 먹고, 빈 상태 자체는 제 크기 그대로
      가운데에 선다. 진행 중인 것도 다음 모임도 없는 날이 **기본 상태**인데
      (docs/ui-redesign.md), 그때 화면 한가운데가 통째로 비면 '아직 안
      불러온 것' 처럼 보인다. 셔틀콕이 그 자리에 서 있으면 '없는 게 맞다'
      로 읽힌다.

      상자 자체를 늘리지 않는 이유는 찍어 보고 알았다 — 점선 테두리가
      화면 높이만큼 늘어나면 빈 상태가 아니라 **아직 안 채워진 자리**로
      보인다.
    */
    <div className="flex flex-1 items-center py-5">
      <EmptyState
        icon="shuttlecock"
        className="w-full rounded-3xl"
        title="오늘 예정된 모임이 없습니다"
        description={
          attended > 0
            ? `이번 달에 ${attended}번 나오셨습니다.`
            : '아래에서 모임을 열거나 코드로 참가하세요.'
        }
      />
    </div>
  )
}

function AttendanceLine({ count }: { count: number }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
      <span className="font-semibold text-ink-3">이번 달</span>
      <b className="font-black text-ink-1">{count}번</b> 나오셨습니다
    </p>
  )
}

/**
 * 홈에 남은 **단 하나의 동작.**
 *
 * 나머지 문(내 목록 · 내 정보 · 동아리)은 하단탭으로, 대회 만들기·
 * 참가하기는 「내 목록」으로 내려갔다. 모임 열기만 남긴 이유는 이것이
 * 이 화면의 책임과 같은 것이기 때문이다 — **아무것도 안 돌아가는 날
 * '오늘' 을 만드는 일이 곧 모임을 여는 일이다.**
 *
 * 자리는 맨 아래다. 엄지가 닿는 곳이다(docs/design.md 원칙 3). 고정 바로
 * 두지 않는 이유는 하단탭이 이미 그 자리를 쓰고 있어서다 — 겹치면
 * 화면 아래 두 겹이 되고, 홈은 스크롤이 짧아서 그럴 필요도 없다.
 */
function OpenSessionButton() {
  return (
    <Link
      to="/new/session"
      className="mt-auto mb-1 flex min-h-16 items-center gap-3 rounded-2xl bg-brand-600 px-5
                 text-white shadow-[var(--shadow-card)] transition-transform
                 hover:-translate-y-0.5 focus-visible:-translate-y-0.5
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                 active:translate-y-0 active:scale-[0.99]"
    >
      <Plus className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-black tracking-tight">모임 열기</span>
        <span className="mt-0.5 block truncate text-sm text-brand-100">
          코트와 명단을 준비합니다
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0" />
    </Link>
  )
}

/**
 * 불러오는 동안 자리를 잡아 둔다.
 *
 * 다 받은 뒤에 칸을 끼워 넣으면 아래 버튼이 통째로 밀려 내려가고,
 * 그때 이미 손가락이 내려오고 있던 사람은 엉뚱한 것을 누른다.
 */
function TodaySkeleton() {
  return (
    <div aria-hidden className="mt-5">
      <div className="h-32 animate-pulse rounded-3xl bg-surface-2" />
    </div>
  )
}

/** 마운트 시각. 렌더 중 `new Date()` 는 순수하지 않아 린트가 막는다 */
function useNow(): Date {
  const [now] = useState(() => new Date())
  return now
}
