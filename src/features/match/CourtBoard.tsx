import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, ListOrdered, Loader2, Play } from 'lucide-react'
import { useClaimCourt, useStartMatch } from '@/features/tournament/queries'
import { matchTitle } from '@/lib/schedule'
import { courtQueue, courtState, unassignedQueue } from '@/lib/court'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

interface CourtBoardProps {
  tournamentId: string
  courts: CourtRow[]
  matches: MatchOverviewRow[]
  myDisplayName: string | undefined
  canScore: boolean
}

/**
 * 코트별 경기 현황 — 서명 요소.
 *
 * 운영진의 하루는 "빈 코트를 찾아 다음 경기를 밀어넣는다" 로 줄어든다.
 * 그래서 코트 카드는 흰 사각형이 아니라 진짜 코트처럼 갈린다 — 네트를
 * 가운데 두고 양 팀을 나누는 직사각형(진행 중), 초록으로 튀는 빈 코트.
 *
 * 빈 코트를 누르면 대기 맨 앞 경기가 그 자리에서 시작된다(claim + start).
 * 예전에는 카드 → 모달 → 경기 상세 → '시작' 버튼, 탭 3번이 강제됐다.
 * 다른 경기를 골라 시작하고 싶을 때만 대기 줄을 펼친다 — 기본 동작은
 * 한 번, 예외 동작은 두 번(docs/design.md).
 *
 * 코트를 아직 안 정한 경기(공용 대기)는 **코트마다 세지 않는다.** 코트가
 * 넷이고 공용 대기가 2경기면, 먼저 비는 코트 하나가 그 2경기를 집어갈
 * 뿐이지 코트마다 2경기씩 있는 게 아니다 — 그래서 여기서 한 번만 계산해
 * 목록 아래 한 줄로 보여준다.
 */
export function CourtBoard({
  tournamentId,
  courts,
  matches,
  myDisplayName,
  canScore,
}: CourtBoardProps) {
  if (courts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        등록된 코트가 없습니다. 관리에서 코트를 먼저 만들어 주세요.
      </p>
    )
  }

  const shared = unassignedQueue(matches)

  return (
    <div className="flex flex-col gap-2.5">
      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          matches={matches}
          shared={shared}
          tournamentId={tournamentId}
          myDisplayName={myDisplayName}
          canScore={canScore}
        />
      ))}

      {/*
        공용 대기는 코트 카드 안이 아니라 여기, 한 번만.
        "이 코트에 N경기 있다" 가 아니라 "코트를 아직 안 정한 경기가 N개
        있고, 먼저 비는 코트가 집어간다" 는 사실을 그대로 말한다.
      */}
      {shared.length > 0 && (
        <p className="px-1 text-xs text-ink-3">
          코트 미정 {shared.length}경기 · 빈 코트를 누르면 시작됩니다
        </p>
      )}
    </div>
  )
}

/** 이 사람이 이 경기를 시작/채점할 수 있나 — 관리자·모임 전체 허용, 아니면 지정 심판만 */
function canRun(m: MatchOverviewRow, canScore: boolean, myDisplayName: string | undefined) {
  const iAmReferee = myDisplayName ? Boolean(m.referees?.includes(myDisplayName)) : false
  return (canScore || iAmReferee) && m.status !== 'void'
}

/**
 * 코트 하나.
 *
 * 상태(busy·open·idle)는 courtState 하나가 가른다 — 카드가 직접 갈래를
 * 세면 '빈 코트인데 초록이 아니다' 같은 어긋남이 생긴다.
 */
function CourtCard({
  court,
  matches,
  shared,
  tournamentId,
  myDisplayName,
  canScore,
}: {
  court: CourtRow
  matches: MatchOverviewRow[]
  /** 코트를 아직 안 정한 공용 대기 — CourtBoard 가 한 번만 계산해 내려준다 */
  shared: MatchOverviewRow[]
  tournamentId: string
  myDisplayName: string | undefined
  canScore: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const claim = useClaimCourt(tournamentId)
  const start = useStartMatch(tournamentId)

  const queue = courtQueue(court, matches)
  const state = courtState({ live: queue.live, own: queue.own, sharedCount: shared.length })
  const { live, own, finishedCount } = queue
  // 이 코트 대기가 있으면 그걸 먼저 집는다. 없으면 공용 대기 맨 앞.
  const front = own[0] ?? shared[0] ?? null
  const frontFromShared = own.length === 0 && shared.length > 0
  const frontRunnable = front ? canRun(front, canScore, myDisplayName) : false
  const busy = claim.isPending || start.isPending

  /** 대기 경기를 이 코트에서 바로 시작한다 — 공용 대기면 먼저 코트를 잡는다 */
  async function startAndGo(m: MatchOverviewRow) {
    if (!m.id) return
    setError(null)
    try {
      if (!m.court_id) await claim.mutateAsync({ matchId: m.id, courtId: court.id })
      await start.mutateAsync(m.id)
    } catch (e) {
      setError(toUserMessage(e, '경기를 시작하지 못했습니다'))
      return
    }
    navigate(`/t/${tournamentId}/matches/${m.id}`)
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface-1',
        // 초록은 면적이 아니라 위치로 — 왼쪽 띠 하나만 튄다. 빈 코트가
        // 여러 개여도 화면이 초록 벽이 되지 않는다.
        state === 'open' && frontRunnable
          ? 'border-border-subtle border-l-4 border-l-state-open'
          : 'border-border-subtle',
      )}
    >
      {live ? (
        <LiveHead
          court={court}
          match={live}
          tournamentId={tournamentId}
          myDisplayName={myDisplayName}
          canScore={canScore}
        />
      ) : state === 'open' ? (
        <OpenRow
          court={court}
          count={frontFromShared ? shared.length : own.length}
          fromShared={frontFromShared}
          runnable={frontRunnable}
          loading={busy}
          onStart={() => front && void startAndGo(front)}
        />
      ) : (
        <IdleRow court={court} finishedCount={finishedCount} />
      )}

      {error && (
        <p role="alert" className="px-4 pb-3 text-sm font-medium text-team-b-fg">
          {error}
        </p>
      )}

      {/*
        이 코트에 배정된 대기만 펼친다. 공용 대기는 여기 안 섞는다 —
        섞으면 또 코트마다 같은 공용 경기를 이중으로 세는 셈이 된다.
        busy 상태의 완료 수는 여기 한 줄에 같이 얹는다(같은 정보를
        카드 안에서 두 번 말하지 않는다).
      */}
      {own.length > 0 && (
        <div className="border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`이 코트 대기 ${own.length}경기 ${expanded ? '접기' : '펼치기'}`}
            className="flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left text-sm
                       text-ink-2 transition-colors hover:bg-surface-2
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <ListOrdered className="size-4 shrink-0" aria-hidden />
            {/*
              카드 위쪽(OpenRow)이 이미 "대기 N경기" 를 말했을 수 있다
              (state === 'open' 일 때). 여기서 같은 말을 또 하지 않는다 —
              아이콘 + 숫자만 둔다. busy 카드는 위에서 대기를 언급하지
              않으므로 여기서 온전한 문장으로 말한다.
            */}
            <span className="flex-1 font-semibold">
              {state === 'busy'
                ? `대기 ${own.length}경기${finishedCount > 0 ? ` · 완료 ${finishedCount}` : ''}`
                : own.length}
            </span>
            <ChevronRight
              className={cn('size-4 shrink-0 text-ink-3 transition-transform', expanded && 'rotate-90')}
              aria-hidden
            />
          </button>

          {expanded && (
            <ul className="flex flex-col gap-2 border-t border-border-subtle bg-surface-2/50 p-3">
              {own.map((m, i) => (
                <li key={m.id}>
                  <QueueRow
                    m={m}
                    upNext={i === 1}
                    loading={busy}
                    runnable={canRun(m, canScore, myDisplayName)}
                    onStart={() => void startAndGo(m)}
                  />
                </li>
              ))}
            </ul>
          )}

          {expanded && !canScore && (
            <p className="border-t border-border-subtle px-4 py-2 text-xs text-ink-3">
              심판으로 지정된 경기만 눌러서 시작할 수 있습니다.
            </p>
          )}
        </div>
      )}

      {state === 'busy' && own.length === 0 && finishedCount > 0 && (
        <p className="px-4 pb-2 text-xs text-ink-3">완료 {finishedCount}경기</p>
      )}
    </section>
  )
}

/**
 * 진행 중 — 코트를 진짜 코트처럼. 가로 띠 위에 코트 이름·점수, 그 아래
 * 가운데 세로선(네트)으로 갈린 양 팀. "진행 중" 은 정상 상태라 색을
 * 더 얹지 않는다(docs/design.md).
 */
function LiveHead({
  court,
  match,
  tournamentId,
  myDisplayName,
  canScore,
}: {
  court: CourtRow
  match: MatchOverviewRow
  tournamentId: string
  myDisplayName: string | undefined
  canScore: boolean
}) {
  const runnable = canRun(match, canScore, myDisplayName)
  const iAmReferee = myDisplayName ? Boolean(match.referees?.includes(myDisplayName)) : false

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5">
        <h3 className="truncate text-lg font-black text-ink-1">{court.name}</h3>
        <span className="tabular shrink-0 text-2xl font-black text-ink-1">
          {match.score_a ?? 0} : {match.score_b ?? 0}
        </span>
      </div>
      <div className="flex items-stretch gap-3 px-4 pt-1.5 pb-3.5">
        <TeamNames
          name={match.group_a_name}
          joker={match.group_a_joker}
          players={match.players_a}
          align="left"
        />
        <div aria-hidden className="w-px shrink-0 bg-border-subtle" />
        <TeamNames
          name={match.group_b_name}
          joker={match.group_b_joker}
          players={match.players_b}
          align="right"
        />
      </div>
      {(iAmReferee || (match.referees?.length ?? 0) > 0) && (
        <p className="px-4 pb-3 text-xs text-ink-3">
          심판 {match.referees?.join(', ') || '미지정'}
          {iAmReferee && <span className="ml-1.5 font-bold text-brand-fg">내가 심판</span>}
        </p>
      )}
    </>
  )

  const label = `${court.name} 진행 중 · ${match.score_a ?? 0} 대 ${match.score_b ?? 0}`
  const className = cn(
    'block w-full text-left transition-colors',
    runnable &&
      'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
  )

  if (!runnable) return <div className={className}>{content}</div>
  return (
    <Link to={`/t/${tournamentId}/matches/${match.id}`} aria-label={label} className={className}>
      {content}
    </Link>
  )
}

/**
 * 비었고 잡을 수 있는 경기가 있다 — 한 줄이면 충분하다.
 * 담긴 정보가 "비었다" 뿐인 카드를 진행 중인 카드만큼 키우면 코트 4개가
 * 첫 화면을 넘긴다. 초록은 왼쪽 띠(부모 section)로만 표시한다 — 배경
 * 전체를 칠하면 빈 코트가 여럿일 때 화면이 초록 벽이 되어 오히려 안 튄다.
 *
 * 문구는 **실제로 집는 경기**에 맞춘다 — 이 코트 대기가 있으면 "대기 N경기",
 * 없고 공용 대기뿐이면 "공용 대기 N경기" 라고 밝힌다. 안 그러면 카드는
 * "대기 0" 처럼 보이는데 눌렀을 때 공용 것이 시작되는 모순이 생긴다.
 */
function OpenRow({
  court,
  count,
  fromShared,
  runnable,
  loading,
  onStart,
}: {
  court: CourtRow
  count: number
  fromShared: boolean
  runnable: boolean
  loading: boolean
  onStart: () => void
}) {
  const statusText = `${fromShared ? '공용 대기' : '대기'} ${count}경기`

  if (!runnable) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
        <p className="shrink-0 text-sm font-bold text-state-open-fg">비었습니다 · {statusText}</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={loading}
      aria-label={`${court.name} 비었습니다. 눌러서 ${fromShared ? '공용 대기' : '대기'} 맨 앞 경기 바로 시작`}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left
                 transition-colors hover:bg-surface-2 disabled:opacity-60
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-open"
    >
      <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
      <p className="flex shrink-0 items-center gap-1.5 text-sm font-black text-state-open-fg">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
        비었습니다 · {statusText}
      </p>
    </button>
  )
}

/** 비었고 잡을 것도 없다 — 넣을 게 없으니 조용히 둔다. 초록으로 튀지 않는다. 한 줄 */
function IdleRow({ court, finishedCount }: { court: CourtRow; finishedCount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
      <p className="shrink-0 text-sm text-ink-3">
        {finishedCount > 0 ? `비어 있음 · 완료 ${finishedCount}경기` : '비어 있음'}
      </p>
    </div>
  )
}

/** 대기 줄을 펼쳤을 때 경기 하나. 눌러서 이 코트에서 바로 시작한다 */
function QueueRow({
  m,
  upNext,
  loading,
  runnable,
  onStart,
}: {
  m: MatchOverviewRow
  /** 대기 2번째 — 곧 차례다. 매치포인트와 같은 뜻으로 주황 */
  upNext: boolean
  loading: boolean
  runnable: boolean
  onStart: () => void
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        {upNext && (
          <span className="mb-1 inline-flex items-center rounded-full bg-state-soon/12 px-2 py-0.5 text-xs font-bold text-state-soon-fg">
            곧 차례
          </span>
        )}
        <p className="truncate text-sm font-bold text-ink-1">{matchTitle(m)}</p>
        {(m.referees?.length ?? 0) > 0 && (
          <p className="mt-1 text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
        )}
      </div>
      {runnable &&
        (loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
        ))}
    </>
  )

  const className = cn(
    'flex min-h-14 w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 text-left',
    runnable &&
      'transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
  )

  if (!runnable) return <div className={className}>{inner}</div>
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={loading}
      aria-label={`${matchTitle(m)} 시작`}
      className={className}
    >
      {inner}
    </button>
  )
}

function TeamNames({
  name,
  joker,
  players,
  align,
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  align: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className="truncate text-sm font-bold text-ink-1">
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? players?.join(' · ') ?? '—'}
      </p>
      {name && players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}
