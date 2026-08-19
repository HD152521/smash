import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, CircleDot, ListOrdered } from 'lucide-react'
import { LiveBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useClaimCourt } from '@/features/tournament/queries'
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
 * 코트별 경기 현황.
 *
 * 경기는 코트 단위로 돌아간다. 관리자가 "3번 코트 지금 뭐 하지" 를 물을 때
 * 평평한 목록에서 코트 이름을 눈으로 찾게 하면 안 된다.
 *
 * 코트 하나가 카드 하나. 카드 안에는 딱 두 가지만 있다:
 *   지금 진행 중인 경기 하나 (한 코트 한 경기가 규칙이다)
 *   그 다음 대기열
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

  return (
    <div className="flex flex-col gap-3">
      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          matches={matches}
          tournamentId={tournamentId}
          myDisplayName={myDisplayName}
          canScore={canScore}
        />
      ))}

    </div>
  )
}

/**
 * 코트 하나.
 *
 * 대기 경기를 전부 펼쳐 두면 코트가 3~4개일 때 카드가 길어져서
 * 정작 봐야 할 '지금 몇 대 몇' 이 화면 밖으로 밀린다.
 * 그래서 대기열은 개수만 보여주고, 누르면 모달에서 골라 들어간다.
 */
function CourtCard({
  court,
  matches,
  tournamentId,
  myDisplayName,
  canScore,
}: {
  court: CourtRow
  matches: MatchOverviewRow[]
  tournamentId: string
  myDisplayName: string | undefined
  canScore: boolean
}) {
  const [queueOpen, setQueueOpen] = useState(false)
  const navigate = useNavigate()
  const claim = useClaimCourt(tournamentId)

  const onCourt = matches.filter((m) => m.court_id === court.id)
  const live = onCourt.find((m) => m.status === 'live')
  const finishedCount = onCourt.filter((m) => m.status === 'finished').length
  // 코트를 정하지 않은 경기(공용 대기)는 모든 코트의 대기열에 함께 뜬다.
  // 먼저 비는 코트가 집어간다.
  const shared = matches.filter((m) => !m.court_id && m.status === 'scheduled')
  const queued = [...onCourt.filter((m) => m.status === 'scheduled'), ...shared]

  async function open(m: MatchOverviewRow) {
    if (!m.id) return
    // 공용 대기에서 집어가면 그 순간 이 코트에 배정한다
    if (!m.court_id) {
      try {
        await claim.mutateAsync({ matchId: m.id, courtId: court.id })
      } catch {
        return // 오류는 아래 모달에 표시된다
      }
    }
    navigate(`/t/${tournamentId}/matches/${m.id}`)
  }

  return (
          <section
            key={court.id}
            className={cn(
              'overflow-hidden rounded-2xl border',
              live ? 'border-live/40 bg-surface-1' : 'border-border-subtle bg-surface-1',
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
              <div className="flex items-center gap-2">
                <CircleDot
                  className={cn('size-4', live ? 'text-live-fg' : 'text-ink-3')}
                  aria-hidden
                />
                <h3 className="font-black text-ink-1">{court.name}</h3>
                {live && <LiveBadge />}
              </div>
              <span className="text-xs text-ink-3">
                {queued.length > 0 && `대기 ${queued.length}`}
                {queued.length > 0 && finishedCount > 0 && ' · '}
                {finishedCount > 0 && `완료 ${finishedCount}`}
              </span>
            </header>

            {live ? (
              <MatchRow
                m={live}
                tournamentId={tournamentId}
                myDisplayName={myDisplayName}
                canScore={canScore}
                emphasis
              />
            ) : (
              <p className="px-4 py-5 text-center text-sm text-ink-3">비어 있음</p>
            )}

      {queued.length > 0 && (
        <div className="border-t border-border-subtle bg-surface-2/50">
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm
                       font-semibold text-ink-2 transition-colors hover:bg-surface-2
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <ListOrdered className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">대기 {queued.length}경기</span>
            <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
          </button>
        </div>
      )}

      <Modal
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        title={`${court.name} 대기 경기`}
      >
        {claim.error && (
          <p role="alert" className="mb-2 text-sm font-medium text-team-b-fg">
            {toUserMessage(claim.error, '코트를 잡지 못했습니다')}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {queued.map((m) => (
            <li key={m.id}>
              <MatchRow
                m={m}
                tournamentId={tournamentId}
                myDisplayName={myDisplayName}
                canScore={canScore}
                boxed
                shared={!m.court_id}
                onOpen={() => void open(m)}
              />
            </li>
          ))}
        </ul>
        {!canScore && (
          <p className="mt-3 text-xs text-ink-3">
            심판으로 지정된 경기만 눌러서 시작할 수 있습니다.
          </p>
        )}
      </Modal>
    </section>
  )
}

function MatchRow({
  m,
  tournamentId,
  myDisplayName,
  canScore,
  emphasis = false,
  boxed = false,
  shared = false,
  onOpen,
}: {
  m: MatchOverviewRow
  tournamentId: string
  myDisplayName: string | undefined
  canScore: boolean
  emphasis?: boolean
  /** 모달 안에서는 목록 행이 아니라 카드로 보여준다 */
  boxed?: boolean
  /** 코트가 정해지지 않은 공용 대기 경기인가 */
  shared?: boolean
  /** 링크 대신 직접 처리해야 할 때 (공용 대기 → 코트 배정) */
  onOpen?: () => void
}) {
  const iAmReferee = myDisplayName ? Boolean(m.referees?.includes(myDisplayName)) : false
  const clickable = (canScore || iAmReferee) && m.status !== 'void'

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        {shared && (
          <span className="mb-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
            공용 대기 · 이 코트에서 시작
          </span>
        )}
        <div className="flex items-center gap-2">
          <Team
            name={m.group_a_name}
            joker={m.group_a_joker}
            players={m.players_a}
            won={m.status === 'finished' && m.winner_side === 'A'}
            emphasis={emphasis}
          />
          <span
            className={cn(
              'tabular shrink-0 font-black text-ink-1',
              emphasis ? 'text-3xl' : 'text-base',
            )}
          >
            {m.score_a ?? 0} : {m.score_b ?? 0}
          </span>
          <Team
            name={m.group_b_name}
            joker={m.group_b_joker}
            players={m.players_b}
            won={m.status === 'finished' && m.winner_side === 'B'}
            emphasis={emphasis}
            align="right"
          />
        </div>

        {/* 숫자를 그대로 && 앞에 두면 길이가 0일 때 화면에 '0' 이 찍힌다 */}
        {(iAmReferee || (m.referees?.length ?? 0) > 0) && (
          <p className="mt-1.5 text-xs text-ink-3">
            심판 {m.referees?.join(', ') || '미지정'}
            {iAmReferee && <span className="ml-1.5 font-bold text-brand-fg">내가 심판</span>}
          </p>
        )}
      </div>
      {clickable && <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />}
    </>
  )

  const className = cn(
    'flex items-center gap-3 px-4',
    emphasis ? 'py-4' : 'py-3',
    boxed && 'min-h-16 rounded-xl border border-border-subtle bg-surface-1',
    clickable && 'transition-colors hover:bg-surface-2',
    clickable &&
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
  )

  if (!clickable) return <div className={className}>{inner}</div>
  if (onOpen)
    return (
      <button type="button" onClick={onOpen} className={cn(className, 'w-full text-left')}>
        {inner}
      </button>
    )
  return (
    <Link to={`/t/${tournamentId}/matches/${m.id}`} className={className}>
      {inner}
    </Link>
  )
}

function Team({
  name,
  joker,
  players,
  won,
  emphasis,
  align = 'left',
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  won: boolean
  emphasis: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p
        className={cn(
          'truncate font-bold',
          emphasis ? 'text-base' : 'text-sm',
          won ? 'text-brand-fg' : 'text-ink-1',
        )}
      >
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? '—'}
        {won && ' 승'}
      </p>
      {players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}
