import { useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Badge } from '@/components/ui/Badge'
import { ScoreChart } from '@/features/records/ScoreChart'
import { useMatches, useScoreEvents } from '@/features/tournament/queries'
import { buildProgress, type ScoreEvent } from '@/lib/scoreProgress'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * 경기 하나를 되짚어 보는 화면.
 *
 * 최종 점수만 보면 21:19 도 21:5 도 그냥 '이겼다' 다. 실제로 궁금한 건
 * "언제 벌어졌고 언제 따라붙었나" 이고, 그건 득점 순서에만 남아 있다.
 */
export function MatchDetailPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>()
  const matches = useMatches(id)
  const events = useScoreEvents(matchId)

  const m = matches.data?.find((x) => x.id === matchId)
  const loading = matches.isPending || events.isPending
  const error = matches.error ?? events.error

  const rows = (events.data ?? []) as unknown as ScoreEvent[]
  const progress = buildProgress(rows)
  const voidedCount = rows.filter((e) => e.voided).length

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to={`/t/${id}/records`}>경기 기록</BackLink>
      <h1 className="sr-only">경기 상세</h1>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '경기를 불러오지 못했습니다')}
        </p>
      )}

      {loading ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : !m ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
          경기를 찾을 수 없습니다.
        </p>
      ) : (
        <>
          {/* 결과 */}
          <header className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {m.court_name && <Badge>{m.court_name}</Badge>}
              {m.status === 'void' && <Badge tone="neutral">무효</Badge>}
              {m.finished_at && (
                <span className="text-xs text-ink-3">
                  {new Date(m.finished_at).toLocaleString('ko-KR')}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <TeamName
                name={m.group_a_name}
                joker={m.group_a_joker}
                players={m.players_a}
                won={m.winner_side === 'A'}
              />
              <span className="tabular shrink-0 text-3xl font-black text-ink-1">
                {m.score_a ?? 0} : {m.score_b ?? 0}
              </span>
              <TeamName
                name={m.group_b_name}
                joker={m.group_b_joker}
                players={m.players_b}
                won={m.winner_side === 'B'}
                align="right"
              />
            </div>
          </header>

          {/* 그래프 */}
          <section className="mt-7">
            <h2 className="text-sm font-bold text-ink-2">점수 진행</h2>
            <div className="mt-3">
              <ScoreChart
                progress={progress}
                nameA={m.group_a_name ?? 'A팀'}
                nameB={m.group_b_name ?? 'B팀'}
                target={Math.max(m.target_a ?? 0, m.target_b ?? 0) || undefined}
              />
            </div>
          </section>

          {/* 흐름 요약 */}
          {progress.rallies.length > 0 && (
            <section className="mt-7">
              <h2 className="text-sm font-bold text-ink-2">경기 흐름</h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="총 랠리" value={`${progress.rallies.length}`} />
                <Stat label="역전" value={`${progress.leadChanges}회`} />
                <Stat label="동점" value={`${progress.ties}회`} />
                <Stat
                  label="최다 연속"
                  value={`${Math.max(progress.longestRunA, progress.longestRunB)}점`}
                />
              </dl>
              {voidedCount > 0 && (
                <p className="mt-3 text-xs text-ink-3">
                  취소된 득점 {voidedCount}개는 그래프에서 뺐습니다.
                </p>
              )}
            </section>
          )}

          {m.referees && m.referees.length > 0 && (
            <p className="mt-7 text-sm text-ink-3">심판 {m.referees.join(', ')}</p>
          )}
        </>
      )}
    </main>
  )
}

function TeamName({
  name,
  joker,
  players,
  won,
  align = 'left',
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  won: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className={cn('truncate font-bold', won ? 'text-brand-fg' : 'text-ink-1')}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 font-black text-ink-1">{value}</dd>
    </div>
  )
}
