import { Fragment, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleDot } from 'lucide-react'
import { LiveBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useGuestBoard } from '@/features/guest/queries'
import { toUserMessage } from '@/lib/errors'
import {
  GUEST_NAME_MAX,
  guestErrorMessage,
  validateGuestName,
  type GuestBoardMatch,
} from '@/lib/guest'
import {
  buildGuestBoard,
  hasVisibleScore,
  isMyMatch,
  myNextMatch,
  type GuestBoardView,
  type GuestCourtQueue,
  type GuestMyNext,
} from '@/lib/guestBoard'
import { browserGuestMeStorage, clearGuestName, loadGuestName, saveGuestName } from '@/lib/guestMe'
import { queuePosition } from '@/lib/schedule'
import { startsAtLabel } from '@/lib/rsvp'
import { cn } from '@/lib/utils'

/**
 * 게스트 현황판 — `/g/:guestCode/:sessionId`. 로그인 가드 밖에 있는 두 번째
 * 화면이다 (`src/app/routes.tsx` 참고).
 *
 * **아무것도 누를 수 없다.** 경기로 들어가는 링크도, 코트를 잡는 뮤테이션도,
 * 대기열 모달도 없다. 그래서 로그인 사용자용 `CourtBoard` 를 재사용하지
 * 않는다 — 그 컴포넌트의 분기가 전부 "누를 수 있나" 를 묻고, 게스트에게는
 * 그 답이 항상 아니오다. 재사용하면 그 분기를 하나씩 끄는 일이 되고, 하나만
 * 빠뜨려도 게스트가 42501 을 만난다. 받는 데이터 모양도 다르다 —
 * `CourtBoard` 는 `match_overview` 행을, 여기는 `guest_board` 봉투를 받는다.
 *
 * **이 화면은 판단하지 않는다.** 코트별로 묶는 것 · 점수를 보여줄지 · 내
 * 차례까지 몇 경기인지는 전부 `src/lib/guestBoard.ts` 가 이미 정했고, 대기
 * 순번은 `queuePosition`(= SQL `notify_up_next` 와 같은 줄) 하나로 센다.
 * 여기서 다시 계산하면 같은 줄을 세는 셈법이 넷으로 갈린다.
 *
 * **게스트 코드를 화면에 그리지 않는다.** 표시도 공유 버튼도 없다 — 화면
 * 캡처 한 장으로 그날 명단에 아무나 들어올 수 있게 된다. 주소창에 이미 있는
 * 것과, 우리가 복사하기 쉽게 놓아 주는 것은 다르다.
 *
 * 코트 옆에서 밝은 햇빛 아래 폰으로 보는 화면이라 글자를 작게 만들지
 * 않는다. 선수 이름과 점수가 이 화면의 전부다.
 */
export function GuestBoardPage() {
  const { guestCode, sessionId } = useParams<{ guestCode: string; sessionId: string }>()
  const board = useGuestBoard(guestCode, sessionId)
  const me = useGuestMe(sessionId)

  if (!guestCode || !sessionId) {
    return <StatusScreen message={guestErrorMessage('bad_code')} />
  }

  if (board.isPending) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-16">
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  // 네트워크·서버 오류 (guestSupabase.rpc 호출 자체가 실패한 경우).
  // 등록 입구를 안내하지 않는다 — 링크가 닫힌 게 아니라 지금 못 부른 것이라,
  // 거기로 보내면 같은 이유로 또 실패한다.
  if (board.error) {
    return <StatusScreen message={toUserMessage(board.error, '코트 현황을 불러오지 못했습니다')} />
  }

  const outcome = board.data
  if (!outcome || !outcome.ok) {
    /*
     * `board_closed` 는 다른 동아리 · 대회 · 시각 창 밖 · 없는 id · 코드-세션
     * 불일치를 서버가 **하나로 합쳐** 준 코드다. 화면도 그 합침을 그대로
     * 지킨다 — 여기서 갈라 그리면 임의의 UUID 로 "이 동아리에 이 모임이
     * 있나" 를 알아내는 탐색기가 된다.
     */
    return (
      <StatusScreen
        message={outcome?.message ?? guestErrorMessage('unknown')}
        joinPath={`/g/${guestCode}`}
      />
    )
  }

  const view = buildGuestBoard(outcome.matches, outcome.courts)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8 pb-16">
      <BoardHeader
        clubName={outcome.clubName}
        sessionName={outcome.session.name}
        startsAt={outcome.session.startsAt}
        finished={outcome.session.status === 'finished'}
      />

      {outcome.session.status === 'finished' ? (
        <FinishedNotice finishedCount={outcome.finishedCount} />
      ) : (
        <LiveBoard view={view} finishedCount={outcome.finishedCount} me={me} />
      )}
    </main>
  )
}

// ── 이 폰에 남은 내 이름 ──────────────────────────────────────────────

interface GuestMe {
  /** 없으면 강조를 안 할 뿐, 현황판은 똑같이 전부 보인다 */
  name: string | null
  remember: (name: string) => void
  forget: () => void
}

/**
 * 이 모임에서 쓸 이름을 `guestMe.ts` 를 통해서만 읽고 쓴다.
 *
 * `window.localStorage` 를 직접 만지지 않는 것이 중요하다 — 사파리 프라이빗
 * 모드에서는 그 객체에 **닿는 것만으로** 예외가 나고, 그 예외가 새면 강조
 * 하나 때문에 현황판이 통째로 안 뜬다. `guestMe.ts` 가 접근을 전부 try/catch
 * 로 감싸 두었으므로 여기서는 null 만 다루면 된다.
 */
function useGuestMe(sessionId: string | undefined): GuestMe {
  const [storage] = useState(browserGuestMeStorage)
  const [name, setName] = useState<string | null>(() =>
    sessionId ? loadGuestName(sessionId, storage, Date.now()) : null,
  )

  return {
    name,
    remember: (next: string) => {
      if (!sessionId) return
      saveGuestName(sessionId, next, storage, Date.now())
      setName(next.trim() || null)
    },
    forget: () => {
      if (!sessionId) return
      clearGuestName(sessionId, storage)
      setName(null)
    },
  }
}

// ── 화면 조각 ─────────────────────────────────────────────────────────

function BoardHeader({
  clubName,
  sessionName,
  startsAt,
  finished,
}: {
  clubName: string
  sessionName: string
  startsAt: string | null
  finished: boolean
}) {
  return (
    <header>
      <h1 className="text-3xl font-black tracking-tight text-ink-1">{clubName}</h1>
      <p className="mt-1 text-lg font-bold text-ink-2">{sessionName}</p>
      <p className="mt-1 text-base text-ink-3">
        {startsAtLabel(startsAt) ?? '즉석 모임'}
        {/* 경기 칸의 '진행 중' 과 같은 말을 쓰지 않는다 — 모임 상태와 경기
            상태가 한 화면에 같은 글자로 있으면 어느 쪽을 말하는지 알 수 없다 */}
        <span className={cn('ml-2 font-bold', finished ? 'text-ink-2' : 'text-live-fg')}>
          {finished ? '모임 종료' : '모임 진행 중'}
        </span>
      </p>
    </header>
  )
}

/**
 * 끝난 모임.
 *
 * **등록 입구로 가는 줄을 두지 않는다.** 끝난 모임에 이름을 적는 것은
 * 게스트가 할 수 있는 일이 아니고, 링크를 눌러 본 뒤에야 그걸 아는 것은
 * 안내가 아니라 함정이다.
 *
 * 완료 경기는 개수만 온다(목록이 아니다). 코트별로 갈라 보여줄 수 없는 것도
 * 같은 이유다 — 서버가 숫자 하나만 싣는다.
 */
function FinishedNotice({ finishedCount }: { finishedCount: number }) {
  return (
    <section className="mt-8 rounded-2xl border border-border-subtle bg-surface-1 p-6 text-center">
      <p className="text-xl font-black text-ink-1">오늘 모임이 끝났습니다</p>
      <p className="mt-2 text-base text-ink-2">
        완료 <span className="tabular font-black text-ink-1">{finishedCount}</span>경기
      </p>
    </section>
  )
}

function LiveBoard({
  view,
  finishedCount,
  me,
}: {
  view: GuestBoardView
  finishedCount: number
  me: GuestMe
}) {
  const next = myNextMatch(view, me.name ?? undefined)

  return (
    <>
      {me.name === null ? (
        <NameRow onSubmit={me.remember} />
      ) : next ? (
        <MyNextCard name={me.name} next={next} onForget={me.forget} />
      ) : (
        <MeLine name={me.name} onForget={me.forget} />
      )}

      {/* 코트 이름이 h3 라 그 위에 걸어 둘 h2 가 있어야 한다 (SchedulePage 와 같은 자리) */}
      <h2 className="sr-only">코트 현황</h2>
      <p className="mt-6 text-base font-bold text-ink-2">
        코트 {view.courts.length} · 완료 {finishedCount}경기
      </p>

      {view.courts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-base text-ink-2">
          아직 코트가 없습니다.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {view.courts.map((queue) => (
            <CourtCard key={queue.court.id} queue={queue} myName={me.name} />
          ))}
        </div>
      )}

      {view.unassigned.length > 0 && (
        <UnassignedSection matches={view.unassigned} myName={me.name} />
      )}
    </>
  )
}

/**
 * 이름 한 칸.
 *
 * ⚠ **이 이름은 서버로 보내지 않는다.** 보낼 곳도 없다 — `guest_board` 는
 * 이름을 인자로 받지 않는다. 이미 받아 둔 편성 목록과 문자열을 맞춰 볼 뿐이라
 * 명단 탐색 도구가 되지도 않는다(애초에 명단을 안 받는다). 저장은 이 폰의
 * localStorage 뿐이고, 잃어도 잃는 것은 강조 하나다.
 */
function NameRow({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState('')
  const error = value.length > 0 ? validateGuestName(value) : null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (validateGuestName(value)) return
    onSubmit(value)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-2xl border-2 border-dashed border-border-subtle p-4"
    >
      <label htmlFor="guest-me-name" className="block text-base font-bold text-ink-1">
        이름을 적으면 내 경기를 강조합니다
      </label>
      <p className="mt-1 text-sm text-ink-2">
        명단에 적힌 이름 그대로 넣어 주세요. 이 이름은 이 폰에만 남습니다.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          id="guest-me-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={GUEST_NAME_MAX}
          placeholder="명단에 쓴 이름"
          className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-border-subtle bg-surface-1 px-4
                     text-lg font-bold text-ink-1 outline-none transition-colors
                     placeholder:text-ink-3/60 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
        <Button type="submit" size="xl" disabled={value.trim().length === 0 || Boolean(error)}>
          확인
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
          {error}
        </p>
      )}
    </form>
  )
}

/**
 * 내 다음 경기.
 *
 * `myNextMatch` 가 null 을 주면 이 카드는 **아예 안 그린다** — 빈 카드를 남겨
 * 두면 게스트는 "내 경기가 사라졌나" 로 읽는다. 그 자리는 `MeLine` 이 한 줄로
 * 대신한다.
 */
function MyNextCard({
  name,
  next,
  onForget,
}: {
  name: string
  next: GuestMyNext
  onForget: () => void
}) {
  return (
    <section className="mt-6 rounded-2xl border-2 border-brand-600 bg-brand-600/10 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-black tracking-widest text-brand-fg uppercase">내 다음 경기</h2>
        <ForgetButton onForget={onForget} />
      </div>
      <p className="mt-2 text-2xl font-black text-ink-1">{myNextLabel(next)}</p>
      <p className="mt-1 text-base text-ink-2">{name}</p>
    </section>
  )
}

/**
 * 이름은 있는데 남은 편성이 없을 때의 한 줄.
 *
 * 카드가 아니라 줄이다 — "예정된 내 경기가 없다" 를 **말로** 하면 사라진 게
 * 아니라는 걸 알 수 있고, 접미사가 붙은 이름을 잘못 적은 사람에게 고칠
 * 자리도 남는다.
 */
function MeLine({ name, onForget }: { name: string; onForget: () => void }) {
  return (
    <p className="mt-6 flex items-center gap-2 text-base text-ink-2">
      <span className="font-bold text-ink-1">{name}</span>
      <span>· 예정된 내 경기가 없습니다</span>
      <ForgetButton onForget={onForget} />
    </p>
  )
}

/** 이름을 잘못 적었을 때 되돌리는 유일한 길. 서버로는 아무것도 안 간다 */
function ForgetButton({ onForget }: { onForget: () => void }) {
  return (
    <button
      type="button"
      onClick={onForget}
      className="ml-auto min-h-11 shrink-0 px-2 text-sm font-bold text-ink-2 underline
                 underline-offset-2 transition-colors hover:text-ink-1
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      이름 바꾸기
    </button>
  )
}

function myNextLabel(next: GuestMyNext): string {
  switch (next.kind) {
    case 'playing':
      return `지금 ${next.courtName}`
    case 'waiting':
      // 앞이 비었으면 '앞에 0경기' 대신 말로 한다. 숫자 0 은 잘못 읽기 쉽다.
      return next.ahead === 0
        ? `${next.courtName} · 바로 다음`
        : `${next.courtName} · 앞에 ${next.ahead}경기`
    case 'unassigned':
      return '코트가 정해지지 않았습니다'
  }
}

// ── 코트 ──────────────────────────────────────────────────────────────

function CourtCard({ queue, myName }: { queue: GuestCourtQueue; myName: string | null }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface-1',
        queue.live ? 'border-live/40' : 'border-border-subtle',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <CircleDot
          className={cn('size-4 shrink-0', queue.live ? 'text-live-fg' : 'text-ink-3')}
          aria-hidden
        />
        <h3 className="text-lg font-black text-ink-1">{queue.court.name}</h3>
        {queue.live && <LiveBadge />}
        <span className="ml-auto shrink-0 text-sm font-bold text-ink-2">
          대기 {queue.waiting.length}
        </span>
      </header>

      {queue.live ? (
        <>
          <MatchRow match={queue.live} myName={myName} emphasis />
          {/* 대기자의 진짜 질문은 "내 앞 경기가 언제 끝나나" 다 */}
          {queue.live.startedAt && (
            <p className="px-4 pb-3 text-sm text-ink-2">{timeLabel(queue.live.startedAt)} 시작</p>
          )}
        </>
      ) : (
        <p className="px-4 py-6 text-center text-base text-ink-3">비어 있음</p>
      )}

      {queue.waiting.length > 0 && (
        <ol className="border-t border-border-subtle">
          {queue.waiting.map((match) => (
            <li key={match.id} className="border-b border-border-subtle last:border-b-0">
              <MatchRow
                match={match}
                myName={myName}
                order={queuePosition(queue.waiting, match.id)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * 아직 코트가 안 정해진 경기 — **한 곳에만 그린다.**
 *
 * 로그인 사용자 화면(`CourtBoard`)은 이 줄을 모든 코트에 함께 띄운다. 먼저
 * 비는 코트가 집어가는 구조라 거기서는 그게 옳다. 게스트는 코트를 집어갈 수
 * 없으므로 같은 걸 복제하면 "대기 2번" 이 코트 넷에 동시에 떠서 자기 차례를
 * 네 번 센 것으로 읽는다.
 *
 * 순번을 안 매기는 것도 같은 이유다 — 어느 코트가 먼저 빌지 모르는데 숫자를
 * 내면 그건 추측이 아니라 거짓말이다.
 */
function UnassignedSection({
  matches,
  myName,
}: {
  matches: readonly GuestBoardMatch[]
  myName: string | null
}) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-black text-ink-1">아직 코트 미정</h2>
      <p className="mt-1 text-sm text-ink-2">먼저 비는 코트에서 시작합니다.</p>
      <ol className="mt-2 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
        {matches.map((match) => (
          <li key={match.id} className="border-b border-border-subtle last:border-b-0">
            <MatchRow match={match} myName={myName} />
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── 경기 한 줄 ────────────────────────────────────────────────────────

function MatchRow({
  match,
  myName,
  order = null,
  emphasis = false,
}: {
  match: GuestBoardMatch
  myName: string | null
  /** 코트 대기열에서 몇 번째인가. 코트 미정 줄에는 순번이 없다 */
  order?: number | null
  /** 진행 중인 경기는 점수를 크게 */
  emphasis?: boolean
}) {
  const mine = isMyMatch(match, myName)

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4',
        emphasis ? 'py-4' : 'py-3',
        mine && 'bg-brand-600/12',
      )}
    >
      {order !== null && (
        <span className="tabular w-5 shrink-0 text-center text-base font-black text-ink-2">
          {order}
        </span>
      )}
      <Side players={match.playersA} myName={myName} emphasis={emphasis} />
      <MatchCenter match={match} emphasis={emphasis} />
      <Side players={match.playersB} myName={myName} emphasis={emphasis} align="right" />
    </div>
  )
}

/**
 * 가운데 칸 — 점수이거나, 진행 중이거나, 아직 안 붙었거나.
 *
 * ⚠ 점수를 보여줄지는 `hasVisibleScore` 가 정한다. `matches.scored` 로
 * 판단하면 안 되는 이유(그 컬럼은 `not null default true` 라 점수를 한 번도
 * 안 넣은 경기도 참이다)가 그 함수 주석에 있고, 서버는 아예 안 싣는다.
 */
function MatchCenter({ match, emphasis }: { match: GuestBoardMatch; emphasis: boolean }) {
  if (match.status === 'scheduled') {
    return <span className="shrink-0 text-base font-bold text-ink-3">vs</span>
  }
  if (!hasVisibleScore(match)) {
    return <span className="shrink-0 text-base font-black text-live-fg">진행 중</span>
  }
  return (
    <span
      className={cn('tabular shrink-0 font-black text-ink-1', emphasis ? 'text-3xl' : 'text-lg')}
    >
      {match.scoreA} : {match.scoreB}
    </span>
  )
}

function Side({
  players,
  myName,
  emphasis,
  align = 'left',
}: {
  players: readonly string[]
  myName: string | null
  emphasis: boolean
  align?: 'left' | 'right'
}) {
  const className = cn(
    'min-w-0 flex-1 truncate',
    emphasis ? 'text-lg' : 'text-base',
    align === 'right' && 'text-right',
  )

  if (players.length === 0) {
    return <p className={cn(className, 'text-ink-3')}>미정</p>
  }

  return (
    <p className={className}>
      {players.map((player, i) => (
        <Fragment key={`${player}-${i}`}>
          {i > 0 && <span className="text-ink-3"> · </span>}
          <span className={cn('font-bold', player === myName ? 'text-brand-fg' : 'text-ink-1')}>
            {player}
          </span>
        </Fragment>
      ))}
    </p>
  )
}

// ── 안내 화면 ─────────────────────────────────────────────────────────

/** 'HH:MM'. 서버가 준 ISO 를 이 폰의 시계로 읽는다 — 코트 옆 사람이 보는 시각이 그거다 */
function timeLabel(iso: string): string | null {
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? null
    : `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

function StatusScreen({ message, joinPath }: { message: string; joinPath?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 pb-16 text-center">
      <p role="alert" className="text-lg font-semibold text-ink-1">
        {message}
      </p>
      {/*
        등록 입구로 돌아가는 줄. 링크가 살아 있는데 모임만 지났을 때 게스트가
        갈 수 있는 유일한 곳이다. 이 주소는 지금 보고 있는 주소의 앞부분이라
        새로 새는 것이 없다 — 코드를 따로 적어 보여주거나 복사 버튼을 다는 것과
        다르다.
      */}
      {joinPath && (
        <Link
          to={joinPath}
          className="mt-5 inline-flex min-h-14 items-center rounded-2xl border-2 border-border-subtle
                     bg-surface-1 px-6 text-base font-bold text-ink-1 transition-colors
                     hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-brand-600"
        >
          등록 화면으로
        </Link>
      )}
    </main>
  )
}
