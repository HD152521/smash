import { useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Badge } from '@/components/ui/Badge'
import { ScoreChart } from '@/features/records/ScoreChart'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { useMatches, useMembers, useScoreEvents, useVoidMatch } from '@/features/tournament/queries'
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
  const { user } = useAuth()
  const matches = useMatches(id)
  const members = useMembers(id)
  const events = useScoreEvents(matchId)
  const voidMatch = useVoidMatch(id ?? '')

  const me = members.data?.find((x) => x.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

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

          {/*
            잘못 기록된 경기를 되돌리는 유일한 길이다.
            심판은 종료 후 2분 안에 마지막 점수만 취소할 수 있고, 그 뒤에는
            관리자 몫이다. 대회 중에 엉뚱한 경기에 점수를 넣는 일은 실제로
            일어나는데, 이 버튼이 없으면 순위가 틀린 채로 대회가 끝난다.

            지우지 않고 무효로 남긴다 — 점수 기록과 누가 뛰었는지는 보존되고
            순위 집계에서만 빠진다. 변경 기록에도 남는다.
          */}
          {isAdmin && m.status !== 'void' && (
            <div className="mt-8 rounded-2xl border border-border-subtle bg-surface-2 p-4">
              <p className="font-bold text-ink-1">이 경기를 무효로 할까요?</p>
              <p className="mt-1 text-sm text-ink-2">
                순위 집계에서 빠집니다. 점수와 출전 기록은 그대로 남고, 변경 기록에도 남습니다.
              </p>
              {voidMatch.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                  {toUserMessage(voidMatch.error, '무효 처리하지 못했습니다')}
                </p>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                loading={voidMatch.isPending}
                onClick={() => {
                  const reason = prompt('무효 사유 (변경 기록에 남습니다)')
                  if (reason === null) return
                  voidMatch.mutate({ matchId: matchId!, reason: reason || undefined })
                }}
              >
                경기 무효 처리
              </Button>
            </div>
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
