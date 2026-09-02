import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { GradePicker } from '@/components/ui/GradePicker'
import { GenderPicker } from '@/components/ui/GenderPicker'
import { CourtMotif } from '@/components/brand/CourtMotif'
import { Shuttlecock } from '@/components/brand/Shuttlecock'
import { useGuestSessions, useJoinAsGuest } from '@/features/guest/queries'
import { GUEST_NAME_MAX, guestErrorMessage, validateGuestName } from '@/lib/guest'
import { browserGuestMeStorage, loadGuestName, saveGuestName } from '@/lib/guestMe'
import { toUserMessage } from '@/lib/errors'
import { startsAtLabel } from '@/lib/rsvp'
import type { PlayerGender, PlayerGrade } from '@/types/database'

/**
 * 게스트 등록 — `/g/:guestCode`. 로그인 가드 밖에 있는 두 화면 중 앞의 것이다
 * (`src/app/routes.tsx` 참고).
 *
 * 계정이 없어서 이 링크를 연 사람에게 로그인을 권하지 않는다 — 계정을 만들
 * 이유가 없는 사람이다. 완료 화면은 **적힌 이름을 크게** 보여준다 —
 * `unique_display_name` 이 접미사를 붙였으면 게스트가 그 사실을 알아야
 * 코트 현황판에서 자기를 찾는다. 그 아래에 현황판으로 가는 줄 하나를 둔다.
 *
 * 흐름: 동아리 이름 확인 → 모임 고르기(후보가 하나면 자동으로 건너뛴다) →
 * 이름 적기 → 완료. 서버가 후보만 주고 게스트가 직접 고른다
 * (`guest_sessions` 가 후보를 조립하고, 서버는 어느 모임인지 판단하지 않는다).
 *
 * 링크를 다시 열면 등록 화면이 아니라 현황판으로 간다 — 아래 '재방문' 절.
 */
export function GuestJoinPage() {
  const { guestCode } = useParams<{ guestCode: string }>()
  const sessions = useGuestSessions(guestCode)
  const join = useJoinAsGuest()

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  /*
   * 급수는 **이름과 함께 그때 한 번만** 받는다. 게스트는 계정이 없어서
   * 다음에 와도 이 값이 따라오지 않는다 — 저장할 프로필이 없다.
   * 선택이라 기본값은 '안 골랐다'(null)다.
   */
  const [grade, setGrade] = useState<PlayerGrade | null>(null)
  /*
   * 성별도 그때 한 번만 받는다 — 급수와 같은 이유(게스트는 저장할 프로필이
   * 없다). 비어 있으면 오늘 남복·여복 편성에서 빠지는데, 그건 게스트에게
   * 특히 아깝다: 코트 앞에 서 있는 사람인데 자동 편성이 못 쓰는 것이다.
   */
  const [gender, setGender] = useState<PlayerGender | null>(null)
  const [storage] = useState(browserGuestMeStorage)
  /*
   * 저장한 이름의 만료(36시간)를 잴 기준 시각. 화면을 연 순간으로 한 번만
   * 잡는다 — 렌더할 때마다 `Date.now()` 를 부르면 순수하지 않고
   * (`react-hooks/purity`), 이 화면이 열려 있는 몇 초 사이에 만료가 바뀔 일도
   * 없다.
   */
  const [openedAt] = useState(() => Date.now())

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
      <StatusScreen message={toUserMessage(sessions.error, '게스트 등록을 처리하지 못했습니다')} />
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

  // 후보가 하나면 자동으로 건너뛴다. 여럿이면 사용자가 고른 뒤에만 이름 단계로 간다
  const active =
    candidates.find((c) => c.id === pickedId) ?? (candidates.length === 1 ? candidates[0] : null)

  // ── 완료 ────────────────────────────────────────────────────────────
  /*
   * 이 분기가 아래 '재방문' 자동 이동보다 **먼저** 와야 한다. 방금 등록하면서
   * 이름을 저장했으므로, 순서가 바뀌면 완료 화면이 그려지자마자 현황판으로
   * 튀어 접미사 붙은 최종 이름을 읽을 시간을 뺏는다.
   */
  if (join.data && join.data.ok) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 pb-16 text-center">
        <Shuttlecock size={32} className="text-brand-fg" />
        <p className="mt-3 text-sm font-semibold tracking-widest text-brand-fg uppercase">
          등록 완료
        </p>
        <h1 className="mt-4 text-4xl font-black break-words text-ink-1">{join.data.displayName}</h1>
        <p className="mt-4 text-sm text-ink-2">{join.data.sessionName}에 참가로 등록됐습니다.</p>
        <p className="mt-1.5 text-xs text-ink-3">
          코트 현황판에서 이 이름으로 자신을 찾을 수 있습니다.
        </p>
        {active && (
          <Link
            to={`/g/${guestCode}/${active.id}`}
            className="mt-8 inline-flex min-h-16 w-full items-center justify-center rounded-2xl
                       bg-brand-600 px-6 text-lg font-semibold text-brand-ink transition-colors
                       hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-brand-600"
          >
            코트 현황 보기
          </Link>
        )}
      </main>
    )
  }

  // ── 재방문 ──────────────────────────────────────────────────────────
  /*
   * 이미 이 폰으로 등록을 마친 모임이 후보에 아직 있으면 현황판으로 보낸다.
   * 코트 앞에 선 사람이 링크를 다시 열었을 때 이름을 또 적게 하면 안 된다.
   *
   * **저장값만 믿고 넘기지 않는다.** 후보 목록에 있는 모임만 고르므로, 끝난
   * 모임 주소로 보내 놓고 "지금은 볼 수 없는 모임입니다" 만 보여 주는 일이
   * 없다 (현황판의 시각 창은 등록 필터의 상위집합이라, 후보에 있으면
   * `board_closed` 가 나올 수 없다).
   *
   * **`replace` 다.** `push` 면 현황판에서 뒤로가기를 누를 때마다 여기로
   * 돌아오고, 돌아온 즉시 다시 현황판으로 밀려 등록↔현황판을 무한 왕복한다.
   *
   * 효과가 아니라 렌더 중에 판단한다 — `useEffect` 로 옮기면 등록 화면이 한
   * 번 그려진 뒤에 튀고, `react-hooks/set-state-in-effect` 규칙에도 걸린다.
   */
  const returning = candidates.find((c) => loadGuestName(c.id, storage, openedAt) !== null)
  if (returning) return <Navigate to={`/g/${guestCode}/${returning.id}`} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!active || validateGuestName(name)) return
    try {
      const result = await join.mutateAsync({
        code: guestCode!,
        sessionId: active.id,
        name,
        grade,
        gender,
      })
      /*
       * **서버가 돌려준 최종 이름**을 남긴다. 같은 이름이 이미 있으면
       * `join_as_guest` 가 접미사를 붙이므로, 사용자가 적은 원문으로는
       * 현황판의 편성 목록과 문자열이 안 맞아 강조가 안 된다.
       */
      if (result?.ok) saveGuestName(active.id, result.displayName, storage, Date.now())
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
    // 게스트 화면은 이 앱을 처음 보는 사람의 첫 화면이라 정체성이 가장
    // 필요하다(docs/design.md). 코트 라인 모티프를 머리 뒤에 옅게 깐다 —
    // 배경 레이어라 아래 흐름의 탭 수·높이에는 관여하지 않는다.
    <main className="relative mx-auto w-full max-w-md px-5 pt-10 pb-16">
      {/* 정적 배치 내용은 기본적으로 절대 위치 형제 위에 그려지지만, 명시적으로
          얹어 둔다 — LoginPage 의 같은 주석 참고 */}
      <CourtMotif className="absolute inset-x-0 top-0 h-36" />
      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <Shuttlecock size={18} className="text-brand-fg" />
          <p className="text-sm font-semibold tracking-widest text-brand-fg uppercase">GUEST</p>
        </div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-1">{outcome.clubName}</h1>
        <p className="mt-2 text-sm text-ink-2">오늘 모임에 이름만 적으면 명단에 들어갑니다.</p>
      </div>

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

          {/*
            이름 바로 아래에 둔다 — 운영진이 경기를 짤 때 "누구랑 붙일까" 에
            답하는 값이라 이름과 한 덩어리다. 이름과 마찬가지로 **선택**이고
            (서버 컬럼도 nullable), 안 골라도 '명단에 들어가기' 는 눌린다.
            코트 앞에서 한 손으로 누르는 자리라 lg 크기를 쓴다.
          */}
          <div className="mt-5">
            <GradePicker
              value={grade}
              onChange={setGrade}
              size="lg"
              disabled={join.isPending}
              hint="선택입니다 — 안 고르셔도 등록됩니다."
            />
          </div>

          {/*
            성별은 급수 바로 아래다. 둘 다 "어느 경기에 넣을까" 에 답하는
            값이라 한 덩어리로 보여야 한다. 안내 문구만 다르다 — 급수는 안
            적어도 편성에 들어가지만, 성별이 비면 남복·여복·혼복 어디에도
            못 들어간다(`matchKindOf`). 그 차이를 문구가 말한다.
          */}
          <div className="mt-4">
            <GenderPicker
              value={gender}
              onChange={setGender}
              size="lg"
              disabled={join.isPending}
              hint="적어두면 남복·여복 편성에 들어갑니다."
            />
          </div>

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
