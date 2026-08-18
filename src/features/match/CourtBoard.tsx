import { Link } from 'react-router-dom'
import { ChevronRight, CircleDot } from 'lucide-react'
import { LiveBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
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
  const unassigned = matches.filter((m) => !m.court_id && m.status !== 'finished')

  if (courts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        등록된 코트가 없습니다. 관리에서 코트를 먼저 만들어 주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {courts.map((court) => {
        const onCourt = matches.filter((m) => m.court_id === court.id)
        const live = onCourt.find((m) => m.status === 'live')
        const queued = onCourt.filter((m) => m.status === 'scheduled')
        const finishedCount = onCourt.filter((m) => m.status === 'finished').length

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
                  className={cn('size-4', live ? 'text-live' : 'text-ink-3')}
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
                <p className="px-4 pt-2.5 text-xs font-bold tracking-wide text-ink-3">다음</p>
                {queued.map((m) => (
                  <MatchRow
                    key={m.id}
                    m={m}
                    tournamentId={tournamentId}
                    myDisplayName={myDisplayName}
                    canScore={canScore}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {unassigned.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-dashed border-border-subtle">
          <header className="border-b border-border-subtle px-4 py-2.5">
            <h3 className="font-bold text-ink-2">코트 미배정</h3>
          </header>
          {unassigned.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              tournamentId={tournamentId}
              myDisplayName={myDisplayName}
              canScore={canScore}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function MatchRow({
  m,
  tournamentId,
  myDisplayName,
  canScore,
  emphasis = false,
}: {
  m: MatchOverviewRow
  tournamentId: string
  myDisplayName: string | undefined
  canScore: boolean
  emphasis?: boolean
}) {
  const iAmReferee = myDisplayName ? Boolean(m.referees?.includes(myDisplayName)) : false
  const clickable = (canScore || iAmReferee) && m.status !== 'void'

  const inner = (
    <>
      <div className="min-w-0 flex-1">
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
            {iAmReferee && <span className="ml-1.5 font-bold text-brand-600">내가 심판</span>}
          </p>
        )}
      </div>
      {clickable && <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />}
    </>
  )

  const className = cn(
    'flex items-center gap-3 px-4',
    emphasis ? 'py-4' : 'py-3',
    clickable && 'transition-colors hover:bg-surface-2',
  )

  return clickable ? (
    <Link to={`/t/${tournamentId}/matches/${m.id}`} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
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
          won ? 'text-brand-600' : 'text-ink-1',
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
