import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeftRight, CloudOff, Loader2, Play, RotateCcw, RotateCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMatchScoring } from '@/features/scoring/useMatchScoring'
import { finishMatch, startMatch, undoScore } from '@/features/scoring/api'
import { useTournament } from '@/features/tournament/queries'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useScreenRotation } from '@/hooks/useScreenRotation'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import {
  courtChangeScore,
  decideWinner,
  isMatchPoint,
  pointsToWin,
  sideRuleFrom,
  type SideRule,
} from '@/lib/rules'
import { toUserMessage } from '@/lib/errors'
import { BackLink } from '@/components/ui/BackLink'
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
 *  - 가로로 들면 코트 배치와 좌우가 맞는다 → 화면 돌리기 버튼을 둔다
 */
export function MatchScorePage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>()
  const navigate = useNavigate()
  const scoring = useMatchScoring(matchId)
  const tournament = useTournament(id)

  const m = scoring.match
  const isLive = m?.status === 'live'
  useWakeLock(isLive)
  const rotation = useScreenRotation()
  // 관리자가 다른 기기에서 경기를 무효 처리하거나 재개할 수 있다
  useRealtimeMatches(id)

  const [actionError, setActionError] = useState<string | null>(null)
  const [courtChanged, setCourtChanged] = useState(false)
  const [wasChangeDue, setWasChangeDue] = useState(false)

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

  // 규칙은 편성 시점 스냅샷에서 온다. 대회 설정을 도중에 바꿔도 이미 잡힌
  // 경기의 판정 근거는 그대로다.
  const ruleA = sideRuleFrom(m?.target_a ?? null, m?.deuce_a ?? null, m?.max_a ?? null)
  const ruleB = sideRuleFrom(m?.target_b ?? null, m?.deuce_b ?? null, m?.max_b ?? null)
  const s = scoring.displayScore

  const config = tournament.data?.config
  const changeA = config ? courtChangeScore(ruleA, config) : null
  const changeB = config ? courtChangeScore(ruleB, config) : null
  const changeDue = (changeA !== null && s.a >= changeA) || (changeB !== null && s.b >= changeB)

  /*
   * '바꿨어요' 를 누르면 안내를 내린다. 점수가 다시 내려가면(취소) 아직 안 바꾼
   * 상태로 돌아가므로 같이 초기화한다.
   *
   * 이걸 useEffect 로 하면 렌더가 한 번 더 돈다 — 득점 버튼을 누르는 화면에서
   * 렌더가 겹치면 숫자가 한 박자 늦게 바뀐다. 렌더 중에 직접 맞추면 그 한 번이
   * 없다 (React 가 권하는 '이전 렌더 값과 비교하기' 패턴).
   */
  if (wasChangeDue !== changeDue) {
    setWasChangeDue(changeDue)
    if (!changeDue) setCourtChanged(false)
  }

  if (scoring.error) {
    return (
      <Wrap rotated={false}>
        <p role="alert" className="p-6 text-center text-sm text-team-b-fg">
          {toUserMessage(scoring.error, '경기를 불러오지 못했습니다')}
        </p>
      </Wrap>
    )
  }

  if (!m) {
    return (
      <Wrap rotated={false}>
        <div className="grid h-dvh place-items-center">
          <Loader2 className="size-8 animate-spin text-ink-3" aria-hidden />
        </div>
      </Wrap>
    )
  }

  const winner = m.winner_side ?? decideWinner(s, ruleA, ruleB)
  const matchPoint = isLive && isMatchPoint(s, ruleA, ruleB)
  const wide = rotation.landscape

  return (
    <Wrap rotated={rotation.rotated}>
      {/* 상단 바 */}
      <header
        className={cn('flex items-center justify-between gap-3 px-4', wide ? 'py-1.5' : 'py-3')}
      >
        {/*
          점수판을 떠나는 **유일한 길**이다 — 이 화면에는 하단탭이 없다
          (전체화면이라 일부러 없앴다: 점수를 세는 중에 탭이 눌리면 안 된다).

          여기만 `BackBar`(고정 머리말)를 쓰지 않는다. 이 화면은 스크롤이
          없다 — `Wrap` 이 화면 높이에 맞춰 세로로 꽉 채우고, 가로 모드에서는
          `fixed` + `rotate-90` 으로 통째로 돌린다. `sticky` 는 그 안에서
          기준이 뒤틀리고, 애초에 출구가 사라질 일이 없다.

          글자는 '나가기' 가 아니라 목적지다. '나가기' 는 어디로 나가는지
          말하지 않는데, 심판이 이걸 누르는 이유는 대개 "다음 경기를 보러"
          라서 어디에 떨어지는지가 중요하다.
        */}
        <BackLink to={`/t/${id}`}>대회로</BackLink>

        <div className="flex items-center gap-2 text-xs font-semibold">
          {m.court_name && <span className="text-ink-2">{m.court_name}</span>}
          {scoring.pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-1 text-warn-fg">
              <CloudOff className="size-3.5" aria-hidden />
              {scoring.pendingCount}개 전송 대기
            </span>
          )}
          {matchPoint && (
            <span className="inline-flex items-center gap-1 rounded-full bg-live/15 px-2 py-1 text-live-fg">
              <Zap className="size-3.5" aria-hidden />
              매치포인트
            </span>
          )}
          <button
            type="button"
            onClick={rotation.toggle}
            aria-pressed={wide}
            aria-label={wide ? '세로로 되돌리기' : '화면 가로로 돌리기'}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-ink-2
                       transition-colors hover:bg-surface-2 hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <RotateCw
              className={cn('size-5 transition-transform', wide && 'rotate-90')}
              aria-hidden
            />
          </button>
        </div>
      </header>

      {scoring.pendingCount > 0 && (
        <p className="mx-4 rounded-xl bg-warn/10 p-3 text-sm font-medium text-warn-fg">
          점수 {scoring.pendingCount}개가 아직 전송되지 않았습니다. 연결이 회복되면 자동으로
          보냅니다. 지금 경기를 끝내면 이 점수가 빠집니다.
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="mx-4 rounded-xl bg-team-b/10 p-3 text-sm font-medium text-team-b-fg"
        >
          {actionError}
        </p>
      )}

      {/*
        코트 체인지 안내.
        점수판을 덮지 않고 위에 한 줄로 끼운다 — 가리면 다음 랠리 점수를 못 누른다.
      */}
      {isLive && changeDue && !courtChanged && (
        <div className="mx-2 mb-1 flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-white">
          <ArrowLeftRight className="size-5 shrink-0" aria-hidden />
          <p className="flex-1 text-sm font-black">코트를 바꿀 시간입니다</p>
          <button
            type="button"
            onClick={() => setCourtChanged(true)}
            className="h-9 shrink-0 rounded-lg bg-white/20 px-3 text-sm font-bold
                       transition-colors hover:bg-white/30
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            바꿨어요
          </button>
        </div>
      )}

      {/*
        점수 패널.
        세로면 위아래, 가로면 좌우로 나눈다 — 가로일 때 위아래로 나누면
        한 칸이 손가락 두 개 높이가 된다.
      */}
      <div className={cn('grid flex-1 gap-2 p-2', wide ? 'grid-cols-2' : 'grid-rows-2')}>
        <ScorePanel
          side="A"
          groupName={m.group_a_name ?? 'A팀'}
          isJoker={Boolean(m.group_a_joker)}
          players={m.players_a ?? []}
          score={s.a}
          opponentScore={s.b}
          rule={ruleA}
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
          opponentScore={s.a}
          rule={ruleB}
          isWinner={winner === 'B'}
          disabled={!isLive}
          onScore={() => scoring.score('B')}
        />
      </div>

      {/* 하단 조작 */}
      <footer
        className={cn(
          'flex items-center gap-2 border-t border-border-subtle px-4',
          wide ? 'py-2' : 'py-3',
        )}
      >
        {m.status === 'scheduled' && (
          <Button
            size={wide ? 'lg' : 'xl'}
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

      {m.status === 'finished' && !wide && (
        <div className="px-4 pb-4">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(`/t/${id}`)}>
            대회로 돌아가기
          </Button>
        </div>
      )}
    </Wrap>
  )
}

/**
 * 심판 화면 바깥 껍데기.
 *
 * rotated 는 브라우저가 화면을 안 돌려줄 때(회전 잠금이 켜진 아이폰)
 * CSS 로 90도 돌리는 경로다. 그때는 세로 화면 한가운데에 가로 크기의 상자를
 * 놓고 통째로 돌린다 — 폭과 높이를 서로 바꿔 줘야 화면을 꽉 채운다.
 */
function Wrap({ children, rotated }: { children: React.ReactNode; rotated: boolean }) {
  // 심판 화면은 어두운 배경으로 고정한다 — 체육관 조명 아래에서 점수가 가장 잘 읽힌다
  return (
    <div data-theme="dark" className="no-touch-callout bg-surface-0">
      <div
        className={cn(
          'flex flex-col bg-surface-0',
          rotated
            ? 'fixed top-1/2 left-1/2 h-[100vw] w-[100dvh] origin-center -translate-x-1/2 -translate-y-1/2 rotate-90'
            : 'min-h-dvh',
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface ScorePanelProps {
  side: TeamSide
  groupName: string
  isJoker: boolean
  players: string[]
  score: number
  /** 듀스에서는 상대 점수가 '몇 점 남았나' 를 바꾼다 */
  opponentScore: number
  rule: SideRule
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
  opponentScore,
  rule,
  isWinner,
  disabled,
  onScore,
}: ScorePanelProps) {
  const remaining = pointsToWin({ a: score, b: opponentScore }, 'A', rule)

  return (
    <button
      type="button"
      onClick={onScore}
      disabled={disabled}
      aria-label={`${groupName} 득점, 현재 ${score}점, 목표 ${rule.target}점`}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-3xl px-4 py-4',
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

      {/* 세로로 반, 가로로 반 — 어느 쪽이든 칸을 꽉 채우도록 두 축을 다 본다 */}
      <output className="tabular mt-2 text-[clamp(3.5rem,min(22vw,28vh),9rem)] leading-none font-black text-ink-1">
        {score}
      </output>

      <span className="tabular mt-1 block text-sm font-bold text-ink-3">
        목표 {rule.target}점{rule.deuce && <span className="ml-1.5 text-ink-2">듀스</span>}
        {!isWinner && remaining > 0 && remaining <= 3 && (
          <span className="ml-2 text-live-fg">{remaining}점 남음</span>
        )}
      </span>

      {isWinner && (
        <span className="mt-2 rounded-full bg-brand-500 px-3 py-1 text-sm font-black text-brand-900">
          승리
        </span>
      )}
    </button>
  )
}
