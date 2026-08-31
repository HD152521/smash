import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, ListOrdered, Loader2, Play } from 'lucide-react'
import { useClaimCourt, useDeleteMatch, useStartMatch } from '@/features/tournament/queries'
import { AutoQueueRow } from './AutoQueueRow'
import { AutoQueueToggle } from './AutoQueueToggle'
import { CourtBadge } from './CourtBadge'
import { LiveCourtBody } from './LiveCourtBody'
import { SessionLiveCard } from './SessionLiveCard'
import { matchTitle } from '@/lib/schedule'
import { courtQueue, courtState, unassignedQueue } from '@/lib/court'
import { isAutoQueued } from '@/lib/autoQueue'
import { canRunMatch, type MatchRunAccess } from '@/lib/matchAccess'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import type { CourtRow, MatchOverviewRow } from '@/types/database'

interface CourtBoardProps {
  tournamentId: string
  courts: CourtRow[]
  matches: MatchOverviewRow[]
  myDisplayName: string | undefined
  isAdmin: boolean
  /**
   * 모임인가.
   *
   * 진행 중인 코트의 **기본 동작이 갈리는 유일한 지점**이다. 대회는 카드를
   * 누르면 심판용 점수판으로 가고, 모임은 그 자리에서 경기가 끝난다.
   * 모임은 점수를 안 세므로 점수판이 기본 경로에 있을 이유가 없다
   * (docs/이어서시작.md '대회와 모임').
   */
  isSession: boolean
  /**
   * 자동 예약 스위치. **모임장에게만** 내려온다 — null 이면 스위치를 안
   * 그린다(`AutoQueueToggle` 주석). 자동 예약을 실제로 돌리는 것은
   * 이 화면이 아니라 `useAutoQueue` 를 부르는 `TournamentPage` 다.
   */
  autoQueue?: {
    enabled: boolean
    onChange: (v: boolean) => void
    /**
     * 자동으로 걸린 경기를 지웠다. 자동 예약에게 **같은 편성을 다시 걸지
     * 말라**고 알린다 — 안 알리면 지운 순간 똑같은 넷이 곧바로 다시 걸려
     * × 가 아무 일도 안 하는 것처럼 보인다 (`useAutoQueue` 의 declineMatch).
     */
    onDeleted: (m: MatchOverviewRow) => void
  } | null
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
  isAdmin,
  isSession,
  autoQueue = null,
}: CourtBoardProps) {
  if (courts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        등록된 코트가 없습니다. 관리에서 코트를 먼저 만들어 주세요.
      </p>
    )
  }

  const shared = unassignedQueue(matches)
  // 서버의 can_run_match 와 같은 판단을 카드마다 다시 세지 않고 한 번만 묶는다
  const access: MatchRunAccess = { isAdmin, isSession, myName: myDisplayName }

  return (
    <div className="flex flex-col gap-2.5">
      {autoQueue && (
        <AutoQueueToggle enabled={autoQueue.enabled} onChange={autoQueue.onChange} />
      )}

      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          matches={matches}
          shared={shared}
          tournamentId={tournamentId}
          access={access}
          onAutoDeleted={autoQueue?.onDeleted}
        />
      ))}

      {/*
        공용 대기는 코트 카드 안이 아니라 여기, 한 번만 — 그리고 숫자로만
        뭉개지 않고 실제 경기를 보여준다.
        (코디네이터 피드백 2026-08-27 '빈 공간') 예전엔 이 자리가 "코트
        미정 N경기" 한 줄뿐이라 화면 아래 절반이 비었다. 운영진이 코트
        화면에서 다음으로 알고 싶은 건 "대기에 뭐가 있나" 인데 그걸 보려면
        대진표 탭으로 넘어가야 했다 — 타다의 "찔러보지 않고 안다" 원칙과
        반대다. 여기서 곧바로 누구 vs 누구인지 몇 줄 보여주면 코트 화면
        하나로 "지금 뭐가 돌고 다음에 뭐가 있나" 가 다 읽힌다.

        읽기 전용이다 — 눌러서 시작하는 자리는 위 코트 카드다. 이 목록의
        경기 하나가 정확히 어느 코트로 갈지는 아직 안 정해졌으므로(먼저
        비는 코트가 집어간다), 여기서 시작 버튼을 달면 "어느 코트로
        가나" 라는 새 질문이 생긴다.
      */}
      {shared.length > 0 && (
        <section className="mt-1">
          <h3 className="px-1 text-xs font-bold text-ink-3">
            코트 미정 {shared.length}경기 · 빈 코트를 누르면 시작됩니다
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {shared.map((m) => (
              <li key={m.id}>
                <SharedQueueRow m={m} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** 코트 미정 대기 한 줄 — 누르지 않는다, 그냥 읽는다(찔러보지 않고 안다) */
function SharedQueueRow({ m }: { m: MatchOverviewRow }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-1">{matchTitle(m)}</p>
        {(m.referees?.length ?? 0) > 0 && (
          <p className="mt-0.5 truncate text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
        )}
      </div>
    </div>
  )
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
  access,
  onAutoDeleted,
}: {
  court: CourtRow
  matches: MatchOverviewRow[]
  /** 코트를 아직 안 정한 공용 대기 — CourtBoard 가 한 번만 계산해 내려준다 */
  shared: MatchOverviewRow[]
  tournamentId: string
  access: MatchRunAccess
  /** 자동 예약을 지웠을 때 — 같은 편성이 되살아나지 않게 알린다 */
  onAutoDeleted?: (m: MatchOverviewRow) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const claim = useClaimCourt(tournamentId)
  const start = useStartMatch(tournamentId)
  const remove = useDeleteMatch(tournamentId)

  const queue = courtQueue(court, matches)
  const state = courtState({ live: queue.live, own: queue.own, sharedCount: shared.length })
  const { live, own, finishedCount } = queue
  /*
   * 자동으로 걸린 경기는 접히는 대기 줄에서 빼서 카드 위에 그대로 내놓는다
   * (`AutoQueueRow` 주석 — 앱이 묶어 둔 네 명은 보이는 자리에 있어야 한다).
   * 대신 접히는 줄에서는 빼야 한 경기가 두 번 보이지 않는다.
   */
  const autoWaiting = own.filter(isAutoQueued)
  const manualWaiting = own.filter((m) => !isAutoQueued(m))
  // 이 코트 대기가 있으면 그걸 먼저 집는다. 없으면 공용 대기 맨 앞.
  const front = own[0] ?? shared[0] ?? null
  const frontFromShared = own.length === 0 && shared.length > 0
  const frontRunnable = front ? canRunMatch(front, access) : false
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
    /*
     * 대회만 점수판으로 넘어간다 — 시작한 사람이 곧 점수를 넣을 심판이다.
     * 모임은 코트 화면에 남는다. 점수를 안 세는데 점수판으로 끌고 가면
     * 시작할 때마다 '나가기' 를 한 번씩 더 누르게 된다.
     */
    if (!access.isSession) navigate(`/t/${tournamentId}/matches/${m.id}`)
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
      {/*
        머리(진행 중·비었음·비어 있음) 자리에만 코트 마킹을 깐다 — 대기
        줄이 펼쳐져도 그 안까지 늘어나지 않게 여기서만 감싼다(높이가 늘어도
        선이 함께 늘어지면 '위에서 본 코트' 가 아니라 벽지가 된다).
      */}
      <div className="relative">
        <CourtLines />
        <div className="relative z-10">
          {live ? (
            access.isSession ? (
              <SessionLiveCard
                tournamentId={tournamentId}
                courtName={court.name}
                match={live}
                myDisplayName={access.myName}
                runnable={canRunMatch(live, access)}
              />
            ) : (
              <LiveHead court={court} match={live} tournamentId={tournamentId} access={access} />
            )
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
        </div>
      </div>

      {autoWaiting.map((m) => (
        <AutoQueueRow
          key={m.id}
          match={m}
          canDelete={access.isAdmin}
          deleting={remove.isPending}
          onDelete={() => {
            if (!m.id) return
            setError(null)
            /*
             * 먼저 알리고 지운다. 지운 뒤에 알리면 그 사이 경기 목록이
             * 갱신되며 자동 예약이 같은 편성을 다시 걸어 버린다.
             */
            onAutoDeleted?.(m)
            remove.mutate(m.id, {
              onError: (e) => setError(toUserMessage(e, '경기를 지우지 못했습니다')),
            })
          }}
        />
      ))}

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
      {manualWaiting.length > 0 && (
        <div className="border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`이 코트 대기 ${manualWaiting.length}경기 ${expanded ? '접기' : '펼치기'}`}
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
                ? `대기 ${manualWaiting.length}경기${finishedCount > 0 ? ` · 완료 ${finishedCount}` : ''}`
                : manualWaiting.length}
            </span>
            <ChevronRight
              className={cn(
                'size-4 shrink-0 text-ink-3 transition-transform',
                expanded && 'rotate-90',
              )}
              aria-hidden
            />
          </button>

          {expanded && (
            <ul className="flex flex-col gap-2 border-t border-border-subtle bg-surface-2/50 p-3">
              {manualWaiting.map((m, i) => (
                <li key={m.id}>
                  <QueueRow
                    m={m}
                    upNext={i === 1}
                    loading={busy}
                    runnable={canRunMatch(m, access)}
                    onStart={() => void startAndGo(m)}
                  />
                </li>
              ))}
            </ul>
          )}

          {/*
            눌러도 안 되는 이유를 미리 말한다. 모임과 대회가 서로 다른
            이유로 막히므로 문장도 갈린다(can_run_match 와 같은 판단).
          */}
          {expanded && !access.isAdmin && (
            <p className="border-t border-border-subtle px-4 py-2 text-xs text-ink-3">
              {access.isSession
                ? '내가 뛰는 경기만 눌러서 시작할 수 있습니다.'
                : '심판으로 지정된 경기만 눌러서 시작할 수 있습니다.'}
            </p>
          )}
        </div>
      )}

      {state === 'busy' && manualWaiting.length === 0 && finishedCount > 0 && (
        <p className="px-4 pb-2 text-xs text-ink-3">완료 {finishedCount}경기</p>
      )}
    </section>
  )
}

/**
 * 진행 중 — **대회**의 코트 카드. 카드 전체가 심판용 점수판으로 가는 링크다.
 *
 * 대회는 점수가 필수다. 그래서 코트 이름 오른쪽 가장 큰 자리에 점수가
 * 앉고, 누르면 점수를 넣는 화면으로 간다. 모임은 같은 자리에서 다른 일을
 * 하므로 카드도 따로다(SessionLiveCard) — 여기에 `if (session)` 을 넣어
 * 둘을 겹치지 않는다.
 *
 * "진행 중" 은 정상 상태라 색을 더 얹지 않는다(docs/design.md).
 */
function LiveHead({
  court,
  match,
  tournamentId,
  access,
}: {
  court: CourtRow
  match: MatchOverviewRow
  tournamentId: string
  access: MatchRunAccess
}) {
  const runnable = canRunMatch(match, access)

  const content = (
    <LiveCourtBody
      courtName={court.name}
      match={match}
      myDisplayName={access.myName}
      trailing={
        <span className="tabular shrink-0 text-2xl font-black text-ink-1">
          {match.score_a ?? 0} : {match.score_b ?? 0}
        </span>
      }
    />
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
 * 문구는 **이 코트만** 말한다 — 이 코트 대기가 있으면 "대기 N경기" 를
 * 밝힌다. 공용 대기뿐일 때는 카드에 숫자를 또 안 찍는다 — 그 숫자는
 * 코트 목록 아래 요약(그리고 이제 목록)이 이미 한 번 말했다. 코트가
 * 셋 넷일 때 "공용 대기 2경기" 가 카드마다 반복돼 화면이 시끄러웠다
 * (코디네이터 피드백 2026-08-27 '[반복]').
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
  // 이 코트 자기 대기만 카드에 적는다. 공용 대기뿐이면 "비었습니다" 만.
  const statusText = fromShared ? '비었습니다' : `비었습니다 · 대기 ${count}경기`
  // 화면 글자는 줄여도 스크린리더에게는 어디서 오는 경기인지 그대로 알려준다.
  const startLabel = `${court.name} 비었습니다. 눌러서 ${fromShared ? '공용 대기' : '대기'} 맨 앞 경기 바로 시작`

  if (!runnable) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <CourtBadge faint={false} />
          <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
        </div>
        <p className="shrink-0 text-sm font-bold text-state-open-fg">{statusText}</p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={loading}
      aria-label={startLabel}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left
                 transition-colors hover:bg-surface-2 disabled:opacity-60
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-state-open"
    >
      <div className="flex min-w-0 items-center gap-2">
        <CourtBadge faint={false} />
        <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
      </div>
      <p className="flex shrink-0 items-center gap-1.5 text-sm font-black text-state-open-fg">
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
        {statusText}
      </p>
    </button>
  )
}

/** 비었고 잡을 것도 없다 — 넣을 게 없으니 조용히 둔다. 초록으로 튀지 않는다. 한 줄 */
function IdleRow({ court, finishedCount }: { court: CourtRow; finishedCount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <CourtBadge faint={false} />
        <h3 className="truncate text-base font-black text-ink-1">{court.name}</h3>
      </div>
      <p className="shrink-0 text-sm text-ink-3">
        {finishedCount > 0 ? `비어 있음 · 완료 ${finishedCount}경기` : '비어 있음'}
      </p>
    </div>
  )
}

/**
 * 코트 카드 머리 배경의 네트 — 가운데를 가르는 두 줄.
 *
 * docs/design.md '코트 카드 — 위에서 본 코트'. 배경 레이어라 카드 높이에
 * 한 픽셀도 관여하지 않는다(부모가 relative, 이 SVG 는 absolute inset-0).
 * 내용은 그 위에 z-10 으로 따로 얹는다 — 이름·점수가 항상 먼저 읽혀야 한다.
 *
 * v6 에서 서비스 박스를 네트 쪽으로 당기고 카드 테두리를 경계로 재사용해
 * 봤지만(v7), 카드가 5:1 에 가까운 가로로 긴 비율이라 그래도 "빈 표 셀
 * 두 개" 로만 보이고 코트로 안 읽혔다(코디네이터 확인 — 두 번의 시도로
 * 결론 남). **전폭 서비스 박스는 다시 시도하지 않는다.**
 *
 * 그래서 여기 남는 건 이미 잘 읽힌다고 확인받은 네트뿐이다. 정비율이
 * 필요한 나머지 마킹(바깥 경계 · 숏 서비스 라인 · 센터 라인)은 코트
 * 번호 옆의 작은 도형(CourtBadge)이 대신 말한다 — 상태별 진하기 차이도
 * 이제 그쪽 책임이라 여기는 굳이 안 바꾼다(일정한 옅기 하나만 쓴다).
 *
 * 인라인 SVG · currentColor(다크 모드는 --court-line 토큰이 대신 바뀐다)
 * · non-scaling-stroke(카드 크기가 달라도 선 두께는 그대로).
 */
function CourtLines() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full text-court-line opacity-[0.1]"
    >
      {/* 네트 — 두께가 있는 띠라 한 줄이 아니라 가까운 두 줄로 그려야 '네트'로 읽힌다 */}
      <line
        x1="48.3"
        y1="10"
        x2="48.3"
        y2="90"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="51.7"
        y1="10"
        x2="51.7"
        y2="90"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
