import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { useCourts, useMatches, useMembers, useMyTournaments } from '@/features/tournament/queries'
import {
  attendanceThisMonth,
  daysUntilLabel,
  myNextInTournament,
  myNextLabel,
  pickTodayFocus,
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
 * "어디로 갈까" 가 아니라 **"내가 지금 뭘 해야 하지"** 다. 책임을
 * "오늘을 보여준다" 로 바꾸면 원칙은 그대로 지켜지고, 문은 그 아래
 * 딸린 것이 된다.
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
  const { signOut } = useAuth()

  return (
    <div className="min-h-dvh bg-surface-0">
      <Header />
      <main className="mx-auto w-full max-w-2xl px-5 pb-16">
        <Today />

        {/*
          가장 자주 하는 일 하나만 버튼으로 남긴다.
          모임은 매주 열리고, 대회는 시즌에 몇 번, 초대 코드로 참가하는 쪽은
          그보다도 드물다. 전에는 셋을 같은 크기 카드로 늘어놔서 화면 절반이
          **한 달에 한 번도 안 눌리는 버튼**이었다.
        */}
        <Link
          to="/new/session"
          className="mt-6 flex min-h-16 items-center justify-between gap-3 rounded-2xl
                     bg-brand-600 px-5 py-4 text-white transition-transform
                     hover:-translate-y-0.5 focus-visible:-translate-y-0.5
                     focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-brand-600"
        >
          <span className="text-lg font-black tracking-tight">모임 열기</span>
          <ArrowRight aria-hidden className="size-5 shrink-0" />
        </Link>

        {/*
          나머지는 전부 한 칸에 작은 줄로. 자주 안 누르는 것에 큰 면적을
          주면 매일 보는 것(오늘)이 밀려 내려간다.
        */}
        <nav className="mt-3 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
          <SmallRow to="/my" title="내 목록" />
          <SmallRow to="/clubs" title="내 동아리" />
          <SmallRow to="/new" title="대회 만들기" />
          <SmallRow to="/join" title="대회 참가하기" />
          {/*
            알림은 대회가 아니라 이 브라우저에 붙는다. 대회 설정 안에 두면
            참가한 대회 수만큼 같은 스위치가 생기고, 아직 어느 대회에도 안
            들어간 사람은 켤 자리가 없다.
          */}
          <SmallRow to="/settings/alerts" title="알림" last />
        </nav>

        {/*
          로그아웃은 몇 달에 한 번 누른다. 화면 맨 위가 아니라 여기가 맞다.
          링크가 아니라 동작이라 줄 목록 밖에 따로 둔다.
        */}
        <div className="mt-6 flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            로그아웃
          </Button>
        </div>
      </main>
    </div>
  )
}

// ── 오늘 ──────────────────────────────────────────────────────────────

/**
 * 이 화면의 본문.
 *
 * 실패해도 오류 문구를 띄우지 않는다. 아래에 멀쩡한 문 다섯 개가 있고,
 * 요약 한 칸이 막혔다고 사람을 멈춰 세울 이유가 없다.
 */
function Today() {
  const { data, isPending } = useMyTournaments()

  /*
   * 렌더 중에 `new Date()` 를 부르면 react-hooks/purity 에 걸린다.
   * 마운트 시각으로 고정한다 — 홈에 머무는 몇 초 사이에 "내일" 이
   * "오늘" 로 바뀔 일은 없다.
   */
  const now = useNow()

  if (isPending) return <TodaySkeleton />

  const list = data ?? []
  const focus = pickTodayFocus(list, now)
  const attended = attendanceThisMonth(list, now)

  if (!focus) return <NothingToday attended={attended} />

  return (
    <section aria-labelledby="today-heading" className="mt-6">
      <h2 id="today-heading" className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">
        오늘
      </h2>
      <FocusCard focus={focus} now={now} />
      {attended > 0 && <AttendanceLine count={attended} />}
    </section>
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
 */
function FocusCard({ focus, now }: { focus: TodayFocus; now: Date }) {
  const t = focus.tournament
  const live = focus.kind === 'live'
  const when = focus.kind === 'upcoming' ? startsAtLabel(focus.startsAt) : null
  const inDays = focus.kind === 'upcoming' ? daysUntilLabel(focus.startsAt, now) : null

  return (
    <Link
      to={`/t/${t.id}`}
      className={`group mt-3 flex min-h-24 items-center gap-3 rounded-2xl border
                  border-border-subtle border-l-4 bg-surface-1 px-5 py-4 transition-colors
                  hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-brand-600
                  ${live ? 'border-l-state-open' : 'border-l-border-subtle'}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xl font-black tracking-tight text-ink-1">
          {t.name}
        </span>

        {live ? (
          <>
            <span className="mt-1 flex items-center gap-1.5 text-sm font-bold text-state-open-fg">
              <Play className="size-3.5 shrink-0" aria-hidden />
              {t.kind === 'session' ? '모임' : '대회'} 진행 중
            </span>
            <MyNextLine tournamentId={t.id} />
          </>
        ) : (
          <>
            <span className="mt-1 block text-sm font-bold text-ink-1">
              {inDays}
              {when && <span className="ml-1.5 font-medium text-ink-2">{when}</span>}
            </span>
            <GoingLine tournamentId={t.id} />
          </>
        )}
      </span>
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}

/**
 * 진행 중일 때 **나에게** 남은 일 한 줄.
 *
 * 참가자가 홈에 오는 가장 큰 이유가 "내 차례 언제야" 인데, 전에는 그걸
 * 알려면 코트 화면까지 들어가야 했다. 여기 한 줄이면 안 들어가도 된다.
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

  return <span className="mt-1.5 block text-sm font-bold text-ink-1">{myNextLabel(next)}</span>
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
    <span className="mt-1 block text-sm text-ink-2">
      <b className="font-bold text-ink-1">{counts.going}명</b> 참가
      {counts.undecided > 0 && ` · ${counts.undecided}명 미정`}
    </span>
  )
}

/**
 * 진행 중인 것도 다음 모임도 없는 날. **이게 기본 상태다.**
 *
 * 텅 빈 화면을 두지 않는다. 이번 달에 몇 번 나왔는지를 보여주고, 없으면
 * 무엇을 하면 되는지 한 줄로 말한다.
 */
function NothingToday({ attended }: { attended: number }) {
  return (
    <section className="mt-6 rounded-2xl border border-border-subtle bg-surface-1 px-5 py-6">
      <p className="font-bold text-ink-1">오늘 예정된 모임이 없습니다</p>
      <p className="mt-1 text-sm text-ink-2">
        {attended > 0
          ? `이번 달에 ${attended}번 나오셨습니다.`
          : '아래에서 모임을 열거나 코드로 참가하세요.'}
      </p>
    </section>
  )
}

function AttendanceLine({ count }: { count: number }) {
  return (
    <p className="mt-2 text-sm text-ink-3">
      이번 달 <b className="font-bold text-ink-2">{count}번</b> 나오셨습니다
    </p>
  )
}

/**
 * 불러오는 동안 자리를 잡아 둔다.
 *
 * 다 받은 뒤에 칸을 끼워 넣으면 아래 버튼들이 통째로 밀려 내려가고,
 * 그때 이미 손가락이 내려오고 있던 사람은 엉뚱한 것을 누른다.
 */
function TodaySkeleton() {
  return (
    <div aria-hidden className="mt-6">
      <div className="h-4 w-16 rounded-full bg-surface-2" />
      <div className="mt-3 h-24 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  )
}

/** 마운트 시각. 렌더 중 `new Date()` 는 순수하지 않아 린트가 막는다 */
function useNow(): Date {
  const [now] = useState(() => new Date())
  return now
}

// ── 머리 · 문 ─────────────────────────────────────────────────────────

/**
 * 머리에는 표식 하나뿐이다.
 *
 * 전에는 이름과 로그아웃 버튼이 같이 있었는데, 첫 화면에서 가장 위 —
 * 가장 비싼 자리 — 를 **아무도 안 쓰는 것 둘**이 차지하고 있었다.
 * 자기 이름은 이미 알고, 로그아웃은 몇 달에 한 번 누른다.
 *
 * 로고 이미지를 따로 받지 않는 이유는 첫 화면에서 네트워크를 한 번이라도
 * 덜 쓰기 위해서다 — 체육관 회선은 대체로 느리다.
 */
function Header() {
  return (
    <header className="flex items-center gap-2 px-5 pt-5 pb-1">
      <span aria-hidden className="h-4 w-1 rounded-full bg-brand-600" />
      <span className="text-sm font-black tracking-[0.25em] text-ink-1 uppercase">Smash</span>
    </header>
  )
}

/**
 * 설명 한 줄을 붙이지 않는다.
 *
 * "내 목록 — 참가했던 대회와 모임" 처럼 이름이 이미 말하는 것을 또 적으면
 * 줄 높이가 두 배가 되고, 그만큼 오늘이 화면 밖으로 밀린다. 눌러 보면
 * 아는 것을 미리 설명하지 않는다.
 */
function SmallRow({ to, title, last = false }: { to: string; title: string; last?: boolean }) {
  return (
    <Link
      to={to}
      className={`flex min-h-12 items-center gap-3 px-5 py-2.5 text-sm transition-colors
                  hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2
                  focus-visible:outline-brand-600 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="min-w-0 flex-1 font-bold text-ink-1">{title}</span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
    </Link>
  )
}
