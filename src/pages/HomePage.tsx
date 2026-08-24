import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'

/**
 * 메인 — 참가 / 모임 열기 / 대회 만들기 / 내 목록.
 *
 * 참가와 생성은 성격이 다르다. 참가는 자주, 생성은 가끔.
 * 그래서 균등한 카드 그리드로 늘어놓지 않고 참가를 큰 면적으로 앞세운다.
 *
 * '모임 열기' 를 '대회 만들기' 보다 앞에 둔다. 대회는 한 시즌에 몇 번이고
 * 모임은 매주 있다 — 자주 하는 일이 위에 있어야 한다.
 */
export function HomePage() {
  const { user, signOut } = useAuth()
  // 계정 이름. 대회 안에서 바꾸는 이름(display_name)은 그 대회에만 남으므로
  // 여기는 따라 바뀌지 않는다.
  const displayName =
    (user?.user_metadata?.['name'] as string | undefined) ?? user?.email?.split('@')[0] ?? '참가자'

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <p className="text-sm font-semibold tracking-widest text-brand-fg uppercase">
          SMASH
        </p>
        <Button size="sm" variant="ghost" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-16">
        <h1 className="mt-4 text-3xl leading-tight font-black tracking-tight text-ink-1">
          {displayName}님,
          <br />
          오늘 어떤 경기인가요?
        </h1>

        <div className="mt-8 grid gap-3.5">
          {/* 참가가 가장 잦은 행동이므로 가장 큰 면적을 준다 */}
          <Link
            to="/join"
            className="group relative overflow-hidden rounded-3xl bg-brand-600 p-6 text-white
                       shadow-[var(--shadow-card)] transition-transform
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
            모임은 매주 열린다. 대회 만들기 옆에 같은 크기로 두면 성격이
            다른 두 일이 같은 무게로 보인다 — 자주 하는 쪽을 넓게 준다.
          */}
          <Link
            to="/new/session"
            className="rounded-2xl border border-border-subtle bg-surface-1 p-5
                       transition-colors hover:bg-surface-2
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <p className="text-lg font-black tracking-tight text-ink-1">모임 열기</p>
            <p className="mt-1 text-sm text-ink-2">
              오늘 모여서 치는 날. 코트만 정하면 바로 시작합니다
            </p>
          </Link>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Link
              to="/new"
              className="rounded-2xl border border-border-subtle bg-surface-1 p-5
                         transition-colors hover:bg-surface-2
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <p className="text-lg font-bold text-ink-1">대회 만들기</p>
              <p className="mt-1 text-sm text-ink-2">조 개수와 조커조를 정하고 시작</p>
            </Link>

            <Link
              to="/my"
              className="rounded-2xl border border-border-subtle bg-surface-1 p-5
                         transition-colors hover:bg-surface-2
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <p className="text-lg font-bold text-ink-1">내 대회 모음</p>
              <p className="mt-1 text-sm text-ink-2">참가했던 대회와 기록</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
