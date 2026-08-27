import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
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
 * 가장 흔한 이유는 "오늘 하는 그거 열어줘" 인데, 그게 화면에 없어서
 * 내 목록 → 탭 고르기 → 찾아 누르기, 세 번을 거쳐야 했다.
 * 가장 자주 하는 일이 가장 멀리 있었다.
 *
 * 카드는 코트 카드(`CourtBoard`)와 같은 문법을 쓴다 — 흰 카드 + 왼쪽
 * 초록 띠. 초록은 "들어갈 수 있다" 는 뜻이고, 진행 중인 모임에 들어가는
 * 것도 정확히 그 뜻이다(docs/design.md 색은 상태다).
 *
 * ── 왜 인사말이 없나 ──────────────────────────────────────────────
 *
 * 여기 온 이유는 인사를 받으려는 게 아니라 문을 고르려는 것이다
 * (docs/design.md 제목을 지우고 정보를 키운다). 이름은 로그아웃 버튼
 * 옆에 작게만 남는다.
 *
 * ── 왜 "모임 열기" 가 맨 위인가 ───────────────────────────────────
 *
 * 실측(docs/design.md 이 앱이 실제로 쓰이는 상황)상 모임은 매주 열리고
 * 대회는 시즌에 몇 번, 초대 코드로 참가하는 쪽은 그보다도 드물다.
 * 위계를 사용 빈도에 맞춘다 — 모임 열기 > 대회 만들기 > 참가하기.
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
      <Header name={displayName} onSignOut={() => void signOut()} />

      <main className="mx-auto w-full max-w-2xl px-5 pb-16">
        <LiveShortcuts />

        <SectionLabel>시작하기</SectionLabel>

        {/* 가장 자주 하는 일 — 모임 열기. 그래서 가장 크다 */}
        <Link
          to="/new/session"
          className="mt-3 block rounded-2xl border border-border-subtle bg-surface-1 p-6
                     transition-colors hover:bg-surface-2 focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <p className="text-xl font-black tracking-tight text-ink-1">모임 열기</p>
          <p className="mt-1 text-sm text-ink-2">오늘 모여서 치는 날. 코트만 정하면 시작</p>
        </Link>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DoorCard to="/new" title="대회 만들기" desc="조를 나누고 순위를 매기는 날" />
          <DoorCard to="/join" title="대회 참가하기" desc="6자리 코드를 입력하면 바로 들어갑니다" />
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

function Header({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 pt-6 pb-4">
      <p className="flex items-center gap-2">
        {/*
          전광판 느낌의 표식 하나. 로고 이미지를 따로 받지 않는 이유는
          첫 화면에서 네트워크를 한 번이라도 덜 쓰기 위해서다 —
          체육관 회선은 대체로 느리다.
        */}
        <span aria-hidden className="h-4 w-1 rounded-full bg-brand-600" />
        <span className="text-sm font-black tracking-[0.25em] text-ink-1 uppercase">Smash</span>
      </p>
      <div className="flex items-center gap-3">
        {/* 이름은 여기, 작게. 이 화면의 주인공은 인사가 아니라 문이다 */}
        <span className="hidden text-xs font-semibold text-ink-3 sm:inline">{name}</span>
        <Button size="sm" variant="ghost" onClick={onSignOut}>
          로그아웃
        </Button>
      </div>
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
 * 지금 열려 있는 것으로 바로 간다. 이 화면의 유일한 목적.
 *
 * 실패해도 아무것도 그리지 않는다. 여기는 **지름길**이라, 못 그려도 바로
 * 아래 "내 목록" 으로 같은 곳에 갈 수 있다. 지름길이 막혔다고 오류 문구를
 * 띄우면 멀쩡한 문 세 개를 두고 사람을 멈춰 세우는 셈이다.
 */
function LiveShortcuts() {
  const { data, isPending } = useMyTournaments()

  if (isPending) return <ShortcutSkeleton />

  const live = (data ?? []).filter((t) => t.status === 'live').slice(0, MAX_SHORTCUTS)
  if (live.length === 0) return null

  return (
    <section aria-labelledby="live-heading" className="mt-6">
      <h2 id="live-heading" className="text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">
        진행 중
      </h2>

      <ul className="mt-3 flex flex-col gap-2.5">
        {live.map((t) => (
          <li key={t.id}>
            <LiveRow tournament={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * 코트 카드와 같은 문법 — 흰 카드 + 왼쪽 초록 띠. "들어갈 수 있다" 는
 * 뜻이라 초록이다(docs/design.md 색은 상태다). 빨강/분홍이었던 것을
 * 걷어낸다 — 진행 중인 건 정상이지 경고가 아니다.
 */
function LiveRow({ tournament }: { tournament: MyTournament }) {
  return (
    <Link
      to={`/t/${tournament.id}`}
      className="group flex min-h-20 items-center gap-3 rounded-2xl border border-border-subtle
                 border-l-4 border-l-state-open bg-surface-1 px-5 py-4 transition-colors
                 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-brand-600"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xl font-black tracking-tight text-ink-1">
          {tournament.name}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-sm font-bold text-state-open-fg">
          <Play className="size-3.5 shrink-0" aria-hidden />
          {tournament.kind === 'session' ? '모임' : '대회'} 진행 중 · 들어가기
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
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
    <div aria-hidden className="mt-6">
      <div className="h-4 w-20 rounded-full bg-surface-2" />
      <div className="mt-3 h-20 animate-pulse rounded-2xl bg-surface-2" />
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
