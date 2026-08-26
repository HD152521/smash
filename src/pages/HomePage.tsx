import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { useMyTournaments } from '@/features/tournament/queries'
import type { MyTournament } from '@/features/tournament/api'

/**
 * 메인 — **어디로 갈지 고르는 곳.** 이 화면의 책임은 그 하나다.
 *
 * 그래서 여기에는 **문만 있고 내용물이 없다.** 진행 중인 것을 맨 위에
 * 올리지만 점수도 코트도 그리지 않는다 — 이름과 "들어가기" 뿐이다.
 * 점수를 그리기 시작하면 그건 대회 화면(`TournamentPage`)이 할 일을
 * 여기서 반쯤 하는 것이고, 두 화면이 같은 것을 다르게 보여주기 시작한다.
 *
 * ── 왜 '진행 중' 을 새로 올렸나 ─────────────────────────────────────
 *
 * 전에는 누구에게나 매일 똑같은 칸 다섯 개였다. 그런데 이 앱을 여는
 * 가장 흔한 이유는 **"오늘 하는 그거 열어줘"** 인데, 그게 화면에 없어서
 * 내 목록 → 탭 고르기 → 찾아 누르기, 세 번을 거쳐야 했다.
 * 가장 자주 하는 일이 가장 멀리 있었다.
 *
 * ── 왜 자리를 미리 비워 두나 ────────────────────────────────────────
 *
 * 목록은 서버에서 온다. 다 받은 뒤에 칸을 끼워 넣으면 아래 버튼들이
 * 통째로 밀려 내려가고, 그때 이미 손가락이 내려오고 있던 사람은 엉뚱한
 * 것을 누른다. 그래서 불러오는 동안 같은 높이를 미리 잡아 둔다.
 */
export function HomePage() {
  const { user, signOut } = useAuth()
  // 계정 이름. 대회 안에서 바꾸는 이름(display_name)은 그 대회에만 남으므로
  // 여기는 따라 바뀌지 않는다.
  const displayName =
    (user?.user_metadata?.['name'] as string | undefined) ?? user?.email?.split('@')[0] ?? '참가자'

  return (
    <div className="min-h-dvh bg-surface-0">
      <Header onSignOut={() => void signOut()} />

      <main className="mx-auto w-full max-w-2xl px-5 pb-16">
        <h1 className="mt-5 text-[2.5rem] leading-[1.05] font-black tracking-tighter text-ink-1">
          <span className="block text-lg font-bold tracking-tight text-ink-2">안녕하세요</span>
          {displayName}님
        </h1>

        <LiveShortcuts />

        <SectionLabel>시작하기</SectionLabel>

        {/*
          참가가 가장 잦은 행동이므로 가장 큰 면적을 준다. 만들기(모임·대회)는
          한 사람이 가끔 하는 일이고, 참가는 모두가 매번 한다.
        */}
        <Link
          to="/join"
          className="group relative mt-3 block overflow-hidden rounded-3xl bg-brand-600 p-6
                     text-white shadow-[var(--shadow-card)] transition-transform
                     hover:-translate-y-0.5 focus-visible:-translate-y-0.5
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 size-52 rounded-full
                       bg-white/10 blur-xl transition-transform duration-500 group-hover:scale-110"
          />
          <p className="relative text-sm font-semibold text-brand-100">초대 코드가 있다면</p>
          <p className="relative mt-1 text-2xl font-black tracking-tight">대회 참가하기</p>
          <p className="relative mt-2 text-sm text-brand-100">
            6자리 코드를 입력하면 바로 들어갑니다
          </p>
        </Link>

        {/*
          모임을 대회보다 앞에 둔다. 대회는 한 시즌에 몇 번이고 모임은 매주
          있다 — 자주 하는 쪽이 먼저다.
        */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DoorCard
            to="/new/session"
            title="모임 열기"
            desc="오늘 모여서 치는 날. 코트만 정하면 시작"
          />
          <DoorCard to="/new" title="대회 만들기" desc="조를 나누고 순위를 매기는 날" />
        </div>

        <SectionLabel>내 것 보기</SectionLabel>

        <div className="mt-3 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
          <QuietRow to="/my" title="내 목록" desc="참가했던 대회와 모임" />
          <QuietRow to="/clubs" title="내 동아리" desc="동아리 명단과 그 밑에 연 모임" />
          {/*
            알림은 대회가 아니라 이 브라우저에 붙는다. 대회 설정 안에 두면
            참가한 대회 수만큼 같은 스위치가 생기고, 아직 어느 대회에도 안
            들어간 사람은 켤 자리가 없다.
          */}
          <QuietRow to="/settings/alerts" title="알림" desc="내 차례가 오면 알려주기" last />
        </div>
      </main>
    </div>
  )
}

// ── 머리 ──────────────────────────────────────────────────────────────

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 pt-6 pb-1">
      <p className="flex items-center gap-2">
        {/*
          전광판 느낌의 표식 하나. 로고 이미지를 따로 받지 않는 이유는
          첫 화면에서 네트워크를 한 번이라도 덜 쓰기 위해서다 —
          체육관 회선은 대체로 느리다.
        */}
        <span aria-hidden className="h-4 w-1 rounded-full bg-brand-600" />
        <span className="text-sm font-black tracking-[0.25em] text-ink-1 uppercase">Smash</span>
      </p>
      <Button size="sm" variant="ghost" onClick={onSignOut}>
        로그아웃
      </Button>
    </header>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mt-9 text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">{children}</h2>
  )
}

// ── 진행 중 바로가기 ──────────────────────────────────────────────────

/** 한 번에 몇 개까지 — 넘으면 목록 화면이 할 일이다 */
const MAX_SHORTCUTS = 3

/**
 * 지금 열려 있는 것으로 바로 간다.
 *
 * 실패해도 아무것도 그리지 않는다. 여기는 **지름길**이라, 못 그려도 바로
 * 아래 "내 목록" 으로 같은 곳에 갈 수 있다. 지름길이 막혔다고 오류 문구를
 * 띄우면 멀쩡한 문 네 개를 두고 사람을 멈춰 세우는 셈이다.
 */
function LiveShortcuts() {
  const { data, isPending } = useMyTournaments()

  if (isPending) return <ShortcutSkeleton />

  const live = (data ?? []).filter((t) => t.status === 'live').slice(0, MAX_SHORTCUTS)
  if (live.length === 0) return null

  return (
    <section aria-labelledby="live-heading" className="mt-7">
      <h2 id="live-heading" className="flex items-center gap-2">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-live" />
        <span className="text-xs font-bold tracking-[0.14em] text-live-fg uppercase">진행 중</span>
      </h2>

      <ul className="mt-3 grid gap-2">
        {live.map((t) => (
          <li key={t.id}>
            <LiveRow tournament={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function LiveRow({ tournament }: { tournament: MyTournament }) {
  return (
    <Link
      to={`/t/${tournament.id}`}
      className="group flex min-h-16 items-center gap-3 rounded-2xl border border-live/25
                 bg-live/8 px-4 py-3 transition-colors hover:bg-live/12
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-black tracking-tight text-ink-1">
          {tournament.name}
        </span>
        <span className="mt-0.5 block text-sm text-ink-2">
          {tournament.kind === 'session' ? '모임' : '대회'} · 들어가기
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 text-live-fg transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}

/**
 * 불러오는 동안 자리를 잡아 둔다.
 *
 * 진행 중인 것이 하나도 없으면 이 칸은 사라지고 아래가 위로 올라온다.
 * 그건 어쩔 수 없지만, **밀려 내려가는 것보다 낫다** — 올라오는 쪽은
 * 누르려던 것이 손가락 아래에서 사라질 뿐이고, 밀려 내려가는 쪽은
 * 그 자리에 다른 버튼이 들어온다.
 */
function ShortcutSkeleton() {
  return (
    <div aria-hidden className="mt-7">
      <div className="h-4 w-20 rounded-full bg-surface-2" />
      <div className="mt-3 h-16 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  )
}

// ── 문 ────────────────────────────────────────────────────────────────

function DoorCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border-subtle bg-surface-1 p-5 transition-colors
                 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-brand-600"
    >
      <p className="text-lg font-black tracking-tight text-ink-1">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{desc}</p>
    </Link>
  )
}

function QuietRow({
  to,
  title,
  desc,
  last = false,
}: {
  to: string
  title: string
  desc: string
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-16 items-center gap-3 px-5 py-3.5 transition-colors
                  hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2
                  focus-visible:outline-brand-600 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink-1">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-2">{desc}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
    </Link>
  )
}
