import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CloudOff, Loader2, Play, RotateCcw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMatchScoring } from '@/features/scoring/useMatchScoring'
import { finishMatch, startMatch, undoScore } from '@/features/scoring/api'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { decideWinner, isMatchPoint, pointsToWin } from '@/lib/rules'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { TeamSide } from '@/types/database'

/**
 * 심판 화면.
 *
 * 설계 원칙:
 *  - 한 손으로, 코트를 보면서 누른다 → 패널 전체가 버튼이다
 *  - 잘못 누르는 건 상수다 → 취소가 항상 한 번에 닿는 자리에 있다
 *  - 목표 점수가 팀마다 다르다 → 양쪽에 항상 목표를 띄운다
 *  - 네트워크가 끊긴다 → 대기 중인 점수 개수를 숨기지 않는다
 */
export function MatchScorePage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>()
  const navigate = useNavigate()
  const scoring = useMatchScoring(matchId)
  const m = scoring.match
  const isLive = m?.status === 'live'
  useWakeLock(isLive)
  // 관리자가 다른 기기에서 경기를 무효 처리하거나 재개할 수 있다
  useRealtimeMatches(id)

  const [actionError, setActionError] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: () => startMatch(matchId!),
    onSuccess: () => void scoring.refetch(),
    onError: (e) => setActionError(toUserMessage(e, '경기를 시작하지 못했습니다')),
  })

  const undo = useMutation({
    mutationFn: async () => {
      // 대기 중인 게 있으면 먼저 서버에 반영해야 "마지막 한 점" 이 무엇인지 맞는다
      await scoring.flush()
      return undoScore(matchId!)
    },
    onSuccess: () => {
      void scoring.refetch()
      setActionError(null)
    },
    onError: (e) => setActionError(toUserMessage(e, '되돌리지 못했습니다')),
  })

  const finish = useMutation({
    mutationFn: async (winner?: TeamSide) => {
      await scoring.flush()
      return finishMatch(matchId!, winner)
    },
    onSuccess: () => {
      void scoring.refetch()
      setActionError(null)
    },
    onError: (e) => setActionError(toUserMessage(e, '종료하지 못했습니다')),
  })

  if (scoring.error) {
    return (
      <Wrap>
        <p role="alert" className="p-6 text-center text-sm text-team-b">
          {toUserMessage(scoring.error, '경기를 불러오지 못했습니다')}
        </p>
      </Wrap>
    )
  }

  if (!m) {
    return (
      <Wrap>
        <div className="grid h-dvh place-items-center">
          <Loader2 className="size-8 animate-spin text-ink-3" aria-hidden />
        </div>
      </Wrap>
    )
  }

  const targetA = m.target_a ?? 21
  const targetB = m.target_b ?? 21
  const s = scoring.displayScore
  const winner = m.winner_side ?? decideWinner(s, targetA, targetB)
  const matchPoint = isLive && isMatchPoint(s, targetA, targetB)

  return (
    <Wrap>
      {/* 상단 바 */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link
          to={`/t/${id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
        >
          <ArrowLeft className="size-4" aria-hidden />
          나가기
        </Link>

        <div className="flex items-center gap-2 text-xs font-semibold">
          {m.court_name && <span className="text-ink-2">{m.court_name}</span>}
          {scoring.pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-1 text-warn">
              <CloudOff className="size-3.5" aria-hidden />
              {scoring.pendingCount}개 전송 대기
            </span>
          )}
          {matchPoint && (
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-1 text-live">
              <Zap className="size-3.5" aria-hidden />
              매치포인트
            </span>
          )}
        </div>
      </header>

      {scoring.pendingCount > 0 && (
        <p className="mx-4 rounded-xl bg-warn/10 p-3 text-sm font-medium text-warn">
          점수 {scoring.pendingCount}개가 아직 전송되지 않았습니다. 연결이 회복되면 자동으로
          보냅니다. 지금 경기를 끝내면 이 점수가 빠집니다.
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="mx-4 rounded-xl bg-team-b/10 p-3 text-sm font-medium text-team-b"
        >
          {actionError}
        </p>
      )}

      {/* 점수 패널 — 세로 분할. 심판이 코트 옆에서 폰을 세워 든다. */}
      <div className="grid flex-1 grid-rows-2 gap-2 p-2">
        <ScorePanel
          side="A"
          groupName={m.group_a_name ?? 'A팀'}
          isJoker={Boolean(m.group_a_joker)}
          players={m.players_a ?? []}
          score={s.a}
          target={targetA}
          isWinner={winner === 'A'}
          disabled={!isLive}
          onScore={() => scoring.score('A')}
        />
        <ScorePanel
          side="B"
          groupName={m.group_b_name ?? 'B팀'}
          isJoker={Boolean(m.group_b_joker)}
          players={m.players_b ?? []}
          score={s.b}
          target={targetB}
          isWinner={winner === 'B'}
          disabled={!isLive}
          onScore={() => scoring.score('B')}
        />
      </div>

      {/* 하단 조작 */}
      <footer className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
        {m.status === 'scheduled' && (
          <Button
            size="xl"
            className="w-full"
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            <Play className="size-5" aria-hidden />
            경기 시작
          </Button>
        )}

        {isLive && (
          <>
            <Button
              variant="secondary"
              size="lg"
              loading={undo.isPending}
              onClick={() => undo.mutate()}
              className="shrink-0"
            >
              <RotateCcw className="size-4" aria-hidden />
              취소
            </Button>
            <Button
              size="lg"
              className="flex-1"
              loading={finish.isPending}
              onClick={() => finish.mutate(undefined)}
            >
              경기 종료
            </Button>
          </>
        )}

        {m.status === 'finished' && (
          <div className="flex w-full items-center gap-3">
            <p className="tabular flex-1 text-sm font-bold text-ink-1">
              {m.winner_side === 'A' ? m.group_a_name : m.group_b_name} 승 · {m.score_a ?? 0} :{' '}
              {m.score_b ?? 0}
            </p>
            {/* 마지막 한 점이 경기를 끝내버린 경우를 위해. 서버가 2분 안쪽만 허용한다. */}
            <Button
              variant="ghost"
              size="sm"
              loading={undo.isPending}
              onClick={() => undo.mutate()}
            >
              <RotateCcw className="size-4" aria-hidden />
              마지막 점수 취소
            </Button>
          </div>
        )}

        {m.status === 'void' && (
          <p className="w-full text-center text-sm font-semibold text-ink-3">
            무효 처리된 경기입니다
          </p>
        )}
      </footer>

      {m.status === 'finished' && (
        <div className="px-4 pb-4">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(`/t/${id}`)}>
            대회로 돌아가기
          </Button>
        </div>
      )}
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  // 심판 화면은 어두운 배경으로 고정한다 — 체육관 조명 아래에서 점수가 가장 잘 읽힌다
  return (
    <div data-theme="dark" className="no-touch-callout flex min-h-dvh flex-col bg-surface-0">
      {children}
    </div>
  )
}

interface ScorePanelProps {
  side: TeamSide
  groupName: string
  isJoker: boolean
  players: string[]
  score: number
  target: number
  isWinner: boolean
  disabled: boolean
  onScore: () => void
}

function ScorePanel({
  side,
  groupName,
  isJoker,
  players,
  score,
  target,
  isWinner,
  disabled,
  onScore,
}: ScorePanelProps) {
  const remaining = pointsToWin({ a: score, b: 0 }, 'A', target)

  return (
    <button
      type="button"
      onClick={onScore}
      disabled={disabled}
      aria-label={`${groupName} 득점, 현재 ${score}점, 목표 ${target}점`}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-3xl px-4 py-6',
        'transition-[transform,background-color] duration-100 active:scale-[0.99]',
        'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white/40',
        'disabled:active:scale-100',
        side === 'A' ? 'bg-team-a/20' : 'bg-team-b/20',
        isWinner && 'ring-4 ring-brand-500',
      )}
    >
      <span className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-lg font-black text-ink-1">{groupName}</span>
        {isJoker && (
          <span className="rounded-full bg-joker px-2 py-0.5 text-xs font-black text-joker-ink">
            🃏 조커
          </span>
        )}
      </span>

      {players.length > 0 && (
        <span className="mt-1 block truncate text-sm font-medium text-ink-2">
          {players.join(' · ')}
        </span>
      )}

      <output className="tabular mt-2 text-[clamp(4rem,22vw,9rem)] leading-none font-black text-ink-1">
        {score}
      </output>

      <span className="tabular mt-1 block text-sm font-bold text-ink-3">
        목표 {target}점
        {!isWinner && remaining > 0 && remaining <= 3 && (
          <span className="ml-2 text-live">{remaining}점 남음</span>
        )}
      </span>

      {isWinner && (
        <span className="mt-2 rounded-full bg-brand-500 px-3 py-1 text-sm font-black text-white">
          승리
        </span>
      )}
    </button>
  )
}
