import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ScoreChart } from '@/features/records/ScoreChart'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { useMatches, useMembers, useScoreEvents, useVoidMatch } from '@/features/tournament/queries'
import { buildProgress, type ScoreEvent } from '@/lib/scoreProgress'
import { buildRematchPrefill } from '@/lib/rematch'
import { isUnscored } from '@/lib/session'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const matches = useMatches(id)
  const members = useMembers(id)
  const events = useScoreEvents(matchId)
  const voidMatch = useVoidMatch(id ?? '')

  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')
  // 방금 이 세션에서 무효 처리했나 — 안내 문구만 바꾼다(둘 다 다시 입력은 된다)
  const [justVoided, setJustVoided] = useState(false)

  /*
   * 다른 경기로 넘어오면 이전 경기의 '방금 무효 처리했습니다' 문구가 남지
   * 않게 한다. MatchEditPage 의 filledFrom 과 같은 판단 — 렌더 중에 한 번
   * 맞추면 useEffect 로 인한 한 박자 늦은 깜빡임이 없다.
   */
  const [resetFor, setResetFor] = useState(matchId)
  if (matchId !== resetFor) {
    setResetFor(matchId)
    setJustVoided(false)
    setReason('')
    setReasonOpen(false)
  }

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
      <BackBar to={`/t/${id}/records`} label="경기 기록" />
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
              {/*
                모임 경기는 점수를 안 세고 끝날 수 있다. 그때 '0 : 0' 을 크게
                띄우면 0대 0으로 끝난 경기처럼 읽힌다 — 안 센 것과 0점은 다른
                이야기다(MatchRecordsPage 의 목록 카드와 같은 판단).
              */}
              {isUnscored(m) ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-ink-3">
                  점수 없음
                </span>
              ) : (
                <span className="tabular shrink-0 text-3xl font-black text-ink-1">
                  {m.score_a ?? 0} : {m.score_b ?? 0}
                </span>
              )}
              <TeamName
                name={m.group_b_name}
                joker={m.group_b_joker}
                players={m.players_b}
                won={m.winner_side === 'B'}
                align="right"
              />
            </div>
          </header>

          {/*
            그래프. 점수를 안 센 경기에는 그릴 것이 없다 — 빈 축만 남은
            '점수 진행' 은 바로 위 '점수 없음' 과 서로 반대되는 말을 한다.
          */}
          {!isUnscored(m) && (
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
          )}

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
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setReasonOpen(true)}
              >
                경기 무효 처리
              </Button>
            </div>
          )}

          {/*
            끊긴 링크를 여기서 잇는다. 무효 처리 직후에도, 나중에 이 경기를
            다시 들어와도 같은 자리에서 다시 입력을 시작할 수 있다.
            강제로 넘기지 않는다 — 다시 입력을 원치 않을 수도 있다.
          */}
          {isAdmin && m.status === 'void' && (
            <div className="mt-8 rounded-2xl border border-border-subtle bg-surface-2 p-4">
              <p className="font-bold text-ink-1">
                {justVoided ? '무효 처리했습니다.' : '무효 처리된 경기입니다.'}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                조·선수·점수를 채운 채로 다시 입력할 수 있습니다. 기존 경기를 고치는 게 아니라{' '}
                <b className="text-ink-1">새 경기로 다시 기록</b>됩니다.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() =>
                  navigate(`/t/${id}/matches/record`, { state: buildRematchPrefill(m) })
                }
              >
                다시 입력하기
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={reasonOpen} onClose={() => setReasonOpen(false)} title="경기 무효 처리">
        <p className="text-sm text-ink-2">
          사유는 남기지 않아도 됩니다 — 남기면 변경 기록에 함께 남습니다.
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-ink-2">무효 사유</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 심판 착오 (생략 가능)"
            className="mt-1.5 h-12 w-full rounded-xl border border-border-subtle bg-surface-1 px-3.5
                       text-ink-1 outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>
        {voidMatch.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
            {toUserMessage(voidMatch.error, '무효 처리하지 못했습니다')}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReasonOpen(false)}>
            취소
          </Button>
          <Button
            variant="secondary"
            loading={voidMatch.isPending}
            onClick={() => {
              voidMatch.mutate(
                { matchId: matchId!, reason: reason.trim() || undefined },
                {
                  onSuccess: () => {
                    setReasonOpen(false)
                    setJustVoided(true)
                    setReason('')
                  },
                },
              )
            }}
          >
            무효 처리
          </Button>
        </div>
      </Modal>
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
