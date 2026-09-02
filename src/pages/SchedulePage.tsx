import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, CircleDot, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/brand/EmptyState'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import {
  useCourts,
  useDeleteMatch,
  useMatches,
  useSetCourtQueue,
  useStartMatch,
  useTournament,
} from '@/features/tournament/queries'
import { useTournamentNav } from '@/features/tournament/useTournamentNav'
import { useDragQueue, type DropTarget } from '@/features/schedule/useDragQueue'
import {
  buildSchedule,
  isUpNext,
  matchEditPath,
  matchTitle,
  myMatchRole,
  type MyMatchRole,
} from '@/lib/schedule'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 대진표 — 앞으로 할 경기 목록.
 *
 * 코트별 줄을 먼저, 코트 미배정을 맨 아래에 둔다.
 * 체육관에서 실제로 눈이 가는 건 '지금 어느 코트에 뭐가 걸려 있나' 이고,
 * 미배정은 아직 판에 오르지 않은 대기 물량이다.
 *
 * 관리자는 손잡이를 끌어 코트와 순서를 바꾼다. 예전에는 코트 칩을 눌렀는데,
 * 그 방식으로는 '몇 번째로 뛸지' 를 정할 수 없었다.
 */
export function SchedulePage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatches(id)
  const courts = useCourts(id)
  const removeMatch = useDeleteMatch(id ?? '')
  const setQueue = useSetCourtQueue(id ?? '')
  /*
   * 모임의 '시작' 은 여기서 끝난다. 대회는 점수판으로 가므로 이 뮤테이션을
   * 안 쓴다 — 시작하자마자 채점을 시작하기 때문이다.
   */
  const startMatch = useStartMatch(id ?? '')
  const tournament = useTournament(id)
  const nav = useTournamentNav(id)
  const isAdmin = nav.isAdmin
  const myName = nav.myName
  /*
   * 빈 대진표에서 "경기 짜기" 버튼을 보여줄지.
   *
   * 관리자는 대회·모임 어디서든 짤 수 있다. 모임은 관리자가 아니어도
   * 짤 수 있다 — `create_session_match` 가 '뛰는 사람 본인' 을 허용하고,
   * 그래서 `TournamentPage` 의 하단 고정 '경기 짜기' 버튼도 모임에서는
   * 회원 전원에게 뜬다(같은 조건을 그대로 옮긴다). 대회의 일반 참가자는
   * 짤 수 없다 — 그 사람에게는 안내만 하고 버튼을 안 둔다.
   */
  const canCreateMatch = isAdmin || (nav.isSession && Boolean(myName))

  // 코트에 나가야 할 사람은 자기 경기만 보면 된다. 기본은 전체 — 운영자가 더 오래 본다.
  const [onlyMine, setOnlyMine] = useState(false)

  // 접어 둔 코트. 기본은 전부 펼침 — 처음 들어온 사람이 빈 화면을 보면 안 된다.
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  function toggleCourt(courtId: string) {
    setClosed((prev) => ({ ...prev, [courtId]: !prev[courtId] }))
  }

  // '곧 차례' 알림이 나간 자리를 화면에도 똑같이 표시한다. 폰을 못 본 사람도
  // 대진표만 보면 준비할 때가 됐는지 안다.
  const readyPosition = tournament.data?.config.readyQueuePosition ?? 2

  const s = buildSchedule(matches.data ?? [], courts.data ?? [])
  const loading = matches.isPending || courts.isPending
  const error = matches.error ?? courts.error

  /** 그 줄의 현재 목록 (코트별 대기 / 미배정) */
  function listOf(courtId: string | null): MatchOverviewRow[] {
    if (courtId === null) return s.unassigned
    return s.courts.find((c) => c.court.id === courtId)?.waiting ?? []
  }

  /**
   * 화면에 뿌릴 줄. 순번은 거르기 전에 매긴다 —
   * 필터를 걸었다고 '세 번째로 뛴다' 가 1번으로 바뀌면 안 된다.
   */
  function rowsOf(list: readonly MatchOverviewRow[], numbered: boolean): QueueRow[] {
    return list
      .map((m, i) => ({
        m,
        order: numbered ? i + 1 : undefined,
        // 코트에 올라간 줄에만 순번이 있다. 미배정은 아직 차례라는 게 없다.
        upNext: numbered && isUpNext(i + 1, readyPosition),
        mine: myMatchRole(m, myName),
      }))
      .filter((r) => !onlyMine || r.mine !== null)
  }

  const mineCount = myName
    ? [...s.unassigned, ...s.courts.flatMap((c) => c.waiting)].filter(
        (m) => myMatchRole(m, myName) !== null,
      ).length
    : 0

  /*
   * 걸러 놓은 목록 위에서 끌면 안 보이는 경기 사이에 끼워 넣게 된다.
   * 순서가 조용히 망가지느니 필터를 켜는 동안은 정렬을 잠근다.
   *
   *   전체            내 경기만
   *   1 김 vs 이
   *   2 나 vs 박  →   1 나 vs 박
   *   3 최 vs 정
   *   4 나 vs 홍  →   2 나 vs 홍
   *
   * 오른쪽에서 1·2 사이에 놓으면 실제로는 1·3 사이 어딘가에 들어간다.
   *
   * ⚠ **이건 빚이 아니라 결정이다** (2026-08-26 확인). "보기 필터와 순서
   * 편집이 한 화면에 있는데 동시에 켤 수 없다" 는 화면을 갈라야 한다는
   * 신호로 읽히기 쉬운데, 운영 중 실제 동작은 **보면서 바로 옮기는 것**이라
   * 화면을 가르면 그쪽이 더 불편해진다. 거르는 동안 못 옮기게 하는 쪽을
   * 택했다.
   *
   * 그래서 **거르는 수단을 새로 더하면 반드시 이 조건에도 넣어야 한다.**
   * 조 필터든 코트 필터든, 빠뜨리면 잠금 없이 걸러진 목록 위에서 끌게 되고
   * 그때는 아무 경고 없이 순서만 틀어진다. (코트 접기는 여기 없어도 된다 —
   * 끌기 시작하면 전부 펴진다. 아래 `open` 참고)
   */
  const canDrag = isAdmin && !onlyMine

  function handleDrop(matchId: string, t: DropTarget) {
    const next = listOf(t.courtId)
      .map((m) => m.id)
      .filter((x): x is string => Boolean(x) && x !== matchId)
    // 자기 자리를 뺀 뒤 끼워 넣는다. 같은 줄 안에서 옮기든 다른 줄에서 오든 같다.
    next.splice(Math.min(t.index, next.length), 0, matchId)
    setQueue.mutate({ courtId: t.courtId, matchIds: next })
  }

  const drag = useDragQueue(handleDrop)

  return (
    <main
      className="mx-auto w-full max-w-2xl px-5 pt-6"
      // 하단탭에 가려지지 않을 여백. 근거는 TournamentPage 의 Shell 주석.
      style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
    >
      <TournamentNav id={id!} active="schedule" />
      <h2 className="sr-only">대진표</h2>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '대진표를 불러오지 못했습니다')}
        </p>
      )}
      {/*
        모임의 '시작' 은 이 화면에 남으므로, 실패하면 여기서 말해야 한다.
        대회는 점수판으로 넘어가 그쪽이 자기 오류를 띄운다.
      */}
      {startMatch.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(startMatch.error, '경기를 시작하지 못했습니다')}
        </p>
      )}
      {setQueue.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(setQueue.error, '순서를 바꾸지 못했습니다')}
        </p>
      )}
      {removeMatch.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(removeMatch.error, '경기를 지우지 못했습니다')}
        </p>
      )}

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : s.scheduledCount === 0 ? (
        <EmptyState
          icon="court"
          className="mt-8"
          title="예정된 경기가 없습니다"
          description={canCreateMatch ? undefined : '운영진이 편성하면 여기 뜹니다.'}
          action={
            canCreateMatch && (
              <Link
                to={`/t/${id}/matches/${nav.isSession ? 'new-session' : 'new'}`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600
                           px-5 text-[0.95rem] font-semibold text-white shadow-sm
                           transition-colors hover:bg-brand-700
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                경기 짜기
              </Link>
            )
          }
        />
      ) : (
        <>
          <p className="mt-5 text-sm font-semibold text-ink-1">
            예정 {s.scheduledCount}경기
            {s.liveCount > 0 && <span className="ml-2 text-live-fg">· 진행 중 {s.liveCount}</span>}
          </p>
          {canDrag && (
            <p className="mt-1 text-xs text-ink-3">
              손잡이를 끌어 코트와 순서를 바꿉니다. 위에 있을수록 먼저 뜁니다.
            </p>
          )}

          {myName && (
            <label
              className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-xl border
                         border-border-subtle bg-surface-1 py-2 pr-3 pl-2.5 text-sm font-bold text-ink-1
                         focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600"
            >
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="size-4 accent-brand-600"
              />
              내 경기만 보기
              <span className="tabular text-xs font-black text-ink-3">{mineCount}</span>
            </label>
          )}

          {isAdmin && onlyMine && (
            <p className="mt-1 text-xs text-ink-3">필터를 켜는 동안에는 순서를 바꿀 수 없습니다.</p>
          )}

          {onlyMine && mineCount === 0 && (
            <p className="mt-4 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
              예정된 내 경기가 없습니다.
            </p>
          )}

          {/* 코트별 줄 — 지금 돌아가는 판 */}
          {s.courts.map((q) => {
            const rows = rowsOf(q.waiting, true)
            const liveMine = q.live ? myMatchRole(q.live, myName) : null
            // 걸러서 아무것도 안 남은 코트는 통째로 접는다. 빈 줄만 늘어놓으면 못 읽는다.
            if (onlyMine && rows.length === 0 && liveMine === null) return null

            /*
             * 끌고 있는 동안에는 접어 둔 코트도 편다.
             * 놓을 자리를 화면에서 찾는 방식이라(elementFromPoint), 접혀 있으면
             * 그 코트로는 아예 옮길 수 없게 된다.
             */
            const open = !closed[q.court.id] || Boolean(drag.dragging)
            const panelId = `court-panel-${q.court.id}`

            return (
              <section key={q.court.id} className="mt-5">
                <h3>
                  <button
                    type="button"
                    onClick={() => toggleCourt(q.court.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-sm
                               font-bold text-ink-2 transition-colors hover:text-ink-1
                               focus-visible:outline-2 focus-visible:outline-offset-2
                               focus-visible:outline-brand-600"
                  >
                    <CircleDot
                      className={cn('size-4 shrink-0', q.live ? 'text-live-fg' : 'text-ink-3')}
                      aria-hidden
                    />
                    {q.court.name}
                    <span className="text-ink-3">대기 {rows.length}</span>
                    {q.live && <span className="text-xs font-black text-live-fg">진행 중</span>}
                    {liveMine && <MineTag mine={liveMine} />}
                    <ChevronDown
                      className={cn(
                        'ml-auto size-4 shrink-0 text-ink-3 transition-transform',
                        !open && '-rotate-90',
                      )}
                      aria-hidden
                    />
                  </button>
                </h3>
                <div id={panelId} hidden={!open}>
                  <Queue
                    courtId={q.court.id}
                    rows={rows}
                    emptyText={
                      onlyMine ? '이 코트에 내 경기가 없습니다.' : '대기 중인 경기가 없습니다.'
                    }
                    tournamentId={id!}
                    isAdmin={isAdmin}
                    session={nav.isSession}
                    canDrag={canDrag}
                    drag={drag}
                    onDelete={(mid) => removeMatch.mutate(mid)}
                    onStart={(mid) => startMatch.mutate(mid)}
                    startingId={startMatch.isPending ? (startMatch.variables ?? null) : null}
                    pendingDelete={removeMatch.isPending}
                  />
                </div>
              </section>
            )
          })}

          {/* 코트에 아직 안 올린 경기는 맨 아래 */}
          {(() => {
            const rows = rowsOf(s.unassigned, false)
            if (onlyMine && rows.length === 0) return null

            return (
              <section className="mt-8">
                <h3 className="text-sm font-bold text-ink-2">
                  코트 미배정 <span className="text-ink-3">{rows.length}</span>
                </h3>
                <Queue
                  courtId={null}
                  rows={rows}
                  emptyText="모든 경기가 코트에 배정됐습니다."
                  tournamentId={id!}
                  isAdmin={isAdmin}
                  session={nav.isSession}
                  canDrag={canDrag}
                  drag={drag}
                  onDelete={(mid) => removeMatch.mutate(mid)}
                  onStart={(mid) => startMatch.mutate(mid)}
                  startingId={startMatch.isPending ? (startMatch.variables ?? null) : null}
                  pendingDelete={removeMatch.isPending}
                />
              </section>
            )
          })()}
        </>
      )}

      {/* 끌고 있는 카드를 손가락 아래에 띄운다 — 어디로 가는지 보이지 않으면 못 놓는다 */}
      {drag.dragging && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2
                     rounded-xl border border-brand-600 bg-surface-1 px-3 py-2 shadow-card"
          style={{ left: drag.dragging.x, top: drag.dragging.y }}
        >
          <span className="text-sm font-bold text-ink-1">
            {matchTitle(
              (matches.data ?? []).find((m) => m.id === drag.dragging?.matchId) ??
                ({} as MatchOverviewRow),
            )}
          </span>
        </div>
      )}
    </main>
  )
}

/** 대진표 한 줄 — 경기 + 대기 순번 + 나와의 관계 */
interface QueueRow {
  m: MatchOverviewRow
  order?: number
  /** '곧 차례' 알림이 나간 자리인가 */
  upNext: boolean
  mine: MyMatchRole
}

function Queue({
  courtId,
  rows,
  emptyText,
  tournamentId,
  isAdmin,
  session,
  canDrag,
  drag,
  onDelete,
  onStart,
  startingId,
  pendingDelete,
}: {
  courtId: string | null
  rows: QueueRow[]
  emptyText: string
  tournamentId: string
  isAdmin: boolean
  /** 모임인가 — 모임의 '시작' 은 점수판으로 가지 않고 이 자리에서 끝난다 */
  session: boolean
  onStart: (matchId: string) => void
  /** 지금 시작 중인 경기 — 두 번 눌리지 않게 */
  startingId: string | null
  /** 끌어서 옮길 수 있나. 관리자여도 필터를 켜면 잠긴다 */
  canDrag: boolean
  drag: ReturnType<typeof useDragQueue>
  onDelete: (matchId: string) => void
  pendingDelete: boolean
}) {
  // 놓을 자리를 만들 수 없는 경우다. 관리자면 시작·수정·삭제는 그대로 두고 손잡이만 뺀다.
  if (!canDrag) {
    return rows.length === 0 ? (
      <p className="mt-2 text-sm text-ink-3">{emptyText}</p>
    ) : (
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.m.id}>
            <MatchCard
              m={r.m}
              tournamentId={tournamentId}
              order={r.order}
              upNext={r.upNext}
              mine={r.mine}
              admin={isAdmin}
              onDelete={() => r.m.id && onDelete(r.m.id)}
              pendingDelete={pendingDelete}
            />
          </li>
        ))}
      </ul>
    )
  }

  const active = (i: number) => drag.target?.courtId === courtId && drag.target.index === i

  return (
    <ul className="mt-2 flex flex-col">
      {rows.map((r, i) => (
        <li key={r.m.id}>
          <Slot {...drag.slotProps(courtId, i)} active={active(i)} />
          <MatchCard
            m={r.m}
            tournamentId={tournamentId}
            order={r.order}
            upNext={r.upNext}
            mine={r.mine}
            admin
            session={session}
            onStart={() => r.m.id && onStart(r.m.id)}
            starting={startingId !== null && startingId === r.m.id}
            onDelete={() => r.m.id && onDelete(r.m.id)}
            pendingDelete={pendingDelete}
            handleProps={r.m.id ? drag.handleProps(r.m.id, courtId) : undefined}
            dimmed={drag.dragging?.matchId === r.m.id}
          />
        </li>
      ))}
      {/* 맨 끝 자리 — 빈 줄에도 놓을 수 있어야 한다 */}
      <li>
        <Slot {...drag.slotProps(courtId, rows.length)} active={active(rows.length)} last />
      </li>
      {rows.length === 0 && !drag.dragging && (
        <li className="mt-1 text-sm text-ink-3">{emptyText}</li>
      )}
    </ul>
  )
}

/**
 * 내 경기 표시.
 *
 * 뛰는 경기는 브랜드색, 심판은 주황이다. 둘을 같은 색으로 두면
 * 라켓을 들고 갈지 호루라기를 들고 갈지 카드를 열어봐야 안다.
 */
function MineTag({ mine }: { mine: Exclude<MyMatchRole, null> }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black text-white',
        mine === 'player' ? 'bg-brand-600' : 'bg-warn',
      )}
    >
      {mine === 'player' ? '내 경기' : '내 심판'}
    </span>
  )
}

/** 놓을 자리. 평소엔 얇은 여백이고 끌고 오면 굵어진다. */
function Slot({ active, last, ...rest }: { active: boolean; last?: boolean }) {
  return (
    <div
      {...rest}
      aria-hidden
      className={cn(
        'rounded-full transition-all',
        active ? 'my-1.5 h-1.5 bg-brand-600' : 'h-2',
        last && 'min-h-6',
      )}
    />
  )
}

function MatchCard({
  m,
  tournamentId,
  order,
  upNext = false,
  mine = null,
  admin = false,
  session = false,
  onStart,
  starting = false,
  onDelete,
  pendingDelete,
  handleProps,
  dimmed = false,
}: {
  m: MatchOverviewRow
  tournamentId: string
  order?: number
  /** 대기 앞줄이라 '곧 차례' 알림이 나간 경기 */
  upNext?: boolean
  /** 내가 뛰거나 심판인 경기면 색으로 튀어나오게 한다 */
  mine?: MyMatchRole
  /** 관리자만 손잡이·수정·삭제를 본다 */
  admin?: boolean
  /** 모임인가 — 모임에는 점수판이 없어서 '시작' 이 이 자리에서 끝난다 */
  session?: boolean
  /** 모임에서 '시작' 을 눌렀을 때. 대회는 점수판으로 간다 */
  onStart?: () => void
  starting?: boolean
  onDelete?: () => void
  pendingDelete?: boolean
  handleProps?: {
    onPointerDown: (e: React.PointerEvent) => void
    style: React.CSSProperties
  }
  dimmed?: boolean
}) {
  const hasPlayers = (m.players_a?.length ?? 0) > 0 || (m.players_b?.length ?? 0) > 0

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-xl border py-2 pr-1 pl-2',
        mine === 'player'
          ? 'border-brand-600 bg-brand-600/10'
          : mine === 'referee'
            ? 'border-warn bg-warn/10'
            : 'border-border-subtle bg-surface-1',
        dimmed && 'opacity-40',
      )}
    >
      {admin && handleProps && (
        <button
          type="button"
          {...handleProps}
          aria-label={`${matchTitle(m)} 순서 바꾸기`}
          className="grid size-10 shrink-0 touch-none place-items-center rounded-lg text-ink-3
                     hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-bold text-ink-1">
          {order !== undefined && (
            <span
              className={cn('tabular text-xs font-black', upNext ? 'text-live-fg' : 'text-ink-3')}
            >
              {order}
            </span>
          )}
          <span className="truncate">
            {m.group_a_joker && <span aria-hidden>🃏 </span>}
            {matchTitle(m)}
            {m.group_b_joker && <span aria-hidden> 🃏</span>}
          </span>
          {mine && <MineTag mine={mine} />}
          {upNext && (
            <span className="shrink-0 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-black text-live-fg">
              곧 차례
            </span>
          )}
        </p>
        {hasPlayers && (
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {m.players_a?.join(' · ')} / {m.players_b?.join(' · ')}
          </p>
        )}
        {(m.referees?.length ?? 0) > 0 && (
          <p className="mt-0.5 truncate text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
        )}
      </div>

      {admin && m.id && (
        <>
          {/*
            대회는 점수판으로 간다 — 시작하자마자 채점을 시작하기 때문이다.
            모임에는 점수판이 없으므로 여기서 시작하고 이 자리에 남는다.
            경기를 여러 개 연달아 올리는 자리라, 매번 화면이 바뀌면
            돌아오는 데만 탭이 하나씩 더 든다.
          */}
          {session ? (
            <button
              type="button"
              disabled={starting}
              onClick={onStart}
              className="shrink-0 px-2 text-sm font-bold text-brand-fg disabled:opacity-40
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              시작
            </button>
          ) : (
            <Link
              to={`/t/${tournamentId}/matches/${m.id}`}
              className="shrink-0 px-2 text-sm font-bold text-brand-fg
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              시작
            </Link>
          )}
          {/*
            대회와 모임은 고치는 화면이 다르다. 대회는 조를 먼저 고르고
            (`MatchEditPage`), 모임에는 조가 없어 사람을 바로 고른다
            (`SessionMatchEditPage`). 여기서 안 가르면 모임 경기가 조를
            고르라는 화면으로 열려 고를 조가 하나도 없다.

            돌아올 자리를 함께 넘긴다 — 대진표에서 여러 판을 손보는 중이면
            코트 화면이 아니라 이 목록으로 돌아와야 스크롤을 다시 안 찾는다.
          */}
          <Link
            to={matchEditPath(tournamentId, m.id, session)}
            state={{ from: `/t/${tournamentId}/schedule` }}
            aria-label={`${matchTitle(m)} 수정`}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-3
                       transition-colors hover:bg-surface-2 hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Pencil className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            disabled={pendingDelete}
            onClick={() => {
              if (confirm(`${matchTitle(m)} 경기를 지울까요?`)) onDelete?.()
            }}
            aria-label={`${matchTitle(m)} 삭제`}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-3
                       transition-colors hover:bg-team-b/10 hover:text-team-b-fg
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
