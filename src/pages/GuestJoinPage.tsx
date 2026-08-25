import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useGuestSessions, useJoinAsGuest } from '@/features/guest/queries'
import { GUEST_NAME_MAX, guestErrorMessage, validateGuestName } from '@/lib/guest'
import { toUserMessage } from '@/lib/errors'
import { startsAtLabel } from '@/lib/rsvp'

/**
 * 게스트 등록 — `/g/:guestCode`. 이 앱에서 유일하게 **로그인 가드 밖**에 있는
 * 화면이다 (`src/app/routes.tsx` 참고).
 *
 * 계정이 없어서 이 링크를 연 사람에게 로그인을 권하지 않는다 — 계정을 만들
 * 이유가 없는 사람이다. 완료 화면에는 되돌아갈 곳을 두지 않는다(마일스톤 4
 * 전까지 게스트가 볼 화면이 없다). 대신 **적힌 이름을 크게** 보여준다 —
 * `unique_display_name` 이 접미사를 붙였으면 게스트가 그 사실을 알아야
 * 코트 현황판에서 자기를 찾는다.
 *
 * 흐름: 동아리 이름 확인 → 모임 고르기(후보가 하나면 자동으로 건너뛴다) →
 * 이름 적기 → 완료. 서버가 후보만 주고 게스트가 직접 고른다
 * (`guest_sessions` 가 후보를 조립하고, 서버는 어느 모임인지 판단하지 않는다).
 */
export function GuestJoinPage() {
  const { guestCode } = useParams<{ guestCode: string }>()
  const sessions = useGuestSessions(guestCode)
  const join = useJoinAsGuest()

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [name, setName] = useState('')

  if (!guestCode) {
    return <StatusScreen message={guestErrorMessage('bad_code')} />
  }

  if (sessions.isPending) {
    return (
      <main className="mx-auto w-full max-w-md px-5 pt-10 pb-16">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  // 네트워크·서버 오류 (guestSupabase.rpc 호출 자체가 실패한 경우)
  if (sessions.error) {
    return (
      <StatusScreen
        message={toUserMessage(sessions.error, '게스트 등록을 처리하지 못했습니다')}
      />
    )
  }

  const outcome = sessions.data
  if (!outcome || !outcome.ok) {
    return <StatusScreen message={outcome?.message ?? guestErrorMessage('unknown')} />
  }

  const candidates = outcome.sessions
  if (candidates.length === 0) {
    return <StatusScreen message={guestErrorMessage('no_open_session')} />
  }

  // ── 완료 ────────────────────────────────────────────────────────────
  if (join.data && join.data.ok) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 pb-16 text-center">
        <p className="text-sm font-semibold tracking-widest text-brand-fg uppercase">등록 완료</p>
        <h1 className="mt-4 text-4xl font-black break-words text-ink-1">
          {join.data.displayName}
        </h1>
        <p className="mt-4 text-sm text-ink-2">{join.data.sessionName}에 참가로 등록됐습니다.</p>
        <p className="mt-1.5 text-xs text-ink-3">
          코트 현황판에서 이 이름으로 자신을 찾을 수 있습니다.
        </p>
      </main>
    )
  }

  // 후보가 하나면 자동으로 건너뛴다. 여럿이면 사용자가 고른 뒤에만 이름 단계로 간다
  const active =
    candidates.find((c) => c.id === pickedId) ?? (candidates.length === 1 ? candidates[0] : null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!active || validateGuestName(name)) return
    try {
      await join.mutateAsync({ code: guestCode!, sessionId: active.id, name })
    } catch {
      // 기술적 오류는 join.error 로 화면에 뿌린다
    }
  }

  const nameError = name.length > 0 ? validateGuestName(name) : null
  const joinErrorMessage =
    join.data && !join.data.ok
      ? join.data.message
      : join.error
        ? toUserMessage(join.error, '게스트 등록을 처리하지 못했습니다')
        : null

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-10 pb-16">
      <p className="text-sm font-semibold tracking-widest text-brand-fg uppercase">GUEST</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-1">{outcome.clubName}</h1>
      <p className="mt-2 text-sm text-ink-2">오늘 모임에 이름만 적으면 명단에 들어갑니다.</p>

      {!active ? (
        <section aria-label="모임 고르기" className="mt-8">
          <h2 className="text-sm font-semibold text-ink-2">어느 모임에 오셨나요</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPickedId(c.id)}
                  className="min-h-14 w-full rounded-2xl border-2 border-border-subtle bg-surface-1
                             px-4 text-left transition-colors hover:bg-surface-2
                             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span className="block font-bold text-ink-1">{c.name}</span>
                  <span className="block text-xs text-ink-3">
                    {startsAtLabel(c.startsAt) ?? '지금 바로'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8">
          {candidates.length > 1 && (
            <p className="text-xs text-ink-3">
              <b className="text-ink-1">{active.name}</b>에 등록합니다.{' '}
              <button
                type="button"
                onClick={() => setPickedId(null)}
                className="font-semibold text-brand-fg underline underline-offset-2
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                모임 바꾸기
              </button>
            </p>
          )}

          <label className="mt-4 block">
            <span className="text-sm font-semibold text-ink-2">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={GUEST_NAME_MAX}
              aria-label="이름"
              placeholder="명단에 쓸 이름"
              className="mt-2 h-14 w-full rounded-2xl border-2 border-border-subtle bg-surface-1 px-4
                         text-lg font-bold text-ink-1 outline-none transition-colors
                         placeholder:text-ink-3/50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
          </label>
          <p className="mt-1.5 text-xs text-ink-3">
            {name.length} / {GUEST_NAME_MAX}자 · 같은 이름이 있으면 구분 숫자가 붙습니다.
          </p>

          {(nameError || joinErrorMessage) && (
            <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
              {nameError ?? joinErrorMessage}
            </p>
          )}

          <Button
            type="submit"
            size="xl"
            className="mt-6 w-full"
            loading={join.isPending}
            disabled={name.trim().length === 0 || Boolean(nameError)}
          >
            명단에 들어가기
          </Button>
        </form>
      )}
    </main>
  )
}

function StatusScreen({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 pb-16 text-center">
      <p role="alert" className="text-base font-semibold text-ink-1">
        {message}
      </p>
    </main>
  )
}
