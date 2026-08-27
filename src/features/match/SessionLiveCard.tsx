import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useFinishMatch } from '@/features/tournament/queries'
import { LiveCourtBody } from './LiveCourtBody'
import { matchTitle } from '@/lib/schedule'
import { toUserMessage } from '@/lib/errors'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 모임에서 진행 중인 코트 — **카드 전체가 '끝내기' 다.**
 *
 * 모임은 점수를 안 센다. 코트에 들어가고 나오는 것만 있으면 되는데,
 * 예전엔 이 카드를 누르면 심판용 점수판(MatchScorePage)이 통째로 떴다 —
 * 목표 점수 · 듀스 · 코트 체인지 · 화면 회전까지. 거기서 '경기 종료' 를
 * 누르고, 다시 '나가기' 를 눌러야 코트 화면으로 돌아왔다(탭 3번).
 * 지금은 카드 → 확인, 탭 2번이고 화면을 떠나지 않는다.
 *
 * 확인 한 단계는 남긴다. 카드 전체가 버튼이라 스크롤 중에 손끝이 스치는
 * 자리이고, 잘못 누르면 **남의 경기**가 끝난다.
 *
 * ⚠ **모임에는 점수판이 없다.** 한때 '점수를 세고 싶은 사람' 을 위해 이
 * 카드 아래 보조 링크를 뒀었는데, 그것도 빼라는 지시로 사라졌다 —
 * "정기모임은 그냥 시작 종료만 한다". 링크만 지우면 주소로 열리므로
 * 라우트(`TournamentOnly`)에서도 막는다.
 *
 * 그러니 여기에 점수로 가는 길을 다시 만들지 마라. 만들면 라우트 가드에
 * 막혀 눌러도 코트 화면으로 되돌아온다.
 */
export function SessionLiveCard({
  tournamentId,
  courtName,
  match,
  myDisplayName,
  runnable,
}: {
  tournamentId: string
  courtName: string
  match: MatchOverviewRow
  myDisplayName: string | undefined
  /** 서버의 can_run_match 와 같은 판단 — 관리자 · 심판 · 그 경기에 뛰는 사람 */
  runnable: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const finish = useFinishMatch(tournamentId)

  /*
   * 점수를 안 센 경기에 `0 : 0` 을 크게 띄우면 '0대 0으로 비기는 중' 처럼
   * 읽힌다 — 안 센 것과 0점은 다른 이야기다(lib/session.ts isUnscored 와
   * 같은 판단이지만, 여기는 아직 끝나지 않아 `scored` 가 답을 못 준다.
   * 그 컬럼은 not null default true 라 진행 중에는 늘 참이다).
   */
  const total = (match.score_a ?? 0) + (match.score_b ?? 0)
  const scoreText = total > 0 ? `${match.score_a ?? 0} : ${match.score_b ?? 0}` : null

  // `match_overview` 는 뷰라 id 가 nullable 이다. 없으면 끝낼 대상을 못 짚는다.
  const matchId = match.id
  if (!runnable || !matchId) {
    return (
      <LiveCourtBody
        courtName={courtName}
        match={match}
        myDisplayName={myDisplayName}
        trailing={
          <span className="tabular shrink-0 text-sm font-bold text-ink-3">
            {scoreText ?? '진행 중'}
          </span>
        }
      />
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`${courtName} 진행 중 · ${matchTitle(match)} · 눌러서 경기 끝내기`}
        className="block w-full text-left transition-colors hover:bg-surface-2
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <LiveCourtBody
          courtName={courtName}
          match={match}
          myDisplayName={myDisplayName}
          trailing={
            <span className="flex shrink-0 items-center gap-2">
              {scoreText && (
                <span className="tabular text-xl font-black text-ink-1">{scoreText}</span>
              )}
              {/*
                초록이 아니다. 초록은 '들어갈 수 있다'(빈 코트)의 뜻이고,
                진행 중인 코트는 중립이다(docs/design.md '색은 상태다').
                색 없이도 읽히도록 글자와 아이콘을 함께 둔다.
              */}
              <span className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm font-black text-ink-1">
                <Flag className="size-4" aria-hidden />
                끝내기
              </span>
            </span>
          }
        />
      </button>

      <FinishConfirm
        open={confirming}
        courtName={courtName}
        match={match}
        pending={finish.isPending}
        error={finish.error}
        onClose={() => setConfirming(false)}
        onConfirm={() => finish.mutate(matchId, { onSuccess: () => setConfirming(false) })}
      />
    </>
  )
}

/** 끝내기 확인 — 무엇을 끝내는지(코트 · 누구 대 누구)를 먼저 보여준다 */
function FinishConfirm({
  open,
  courtName,
  match,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean
  courtName: string
  match: MatchOverviewRow
  pending: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="경기를 끝낼까요?">
      <p className="text-sm font-bold text-ink-1">{courtName}</p>
      <p className="mt-1 text-sm text-ink-2">{matchTitle(match)}</p>
      <p className="mt-3 text-sm text-ink-3">
        코트가 비고 대기 중인 다음 경기가 들어갈 수 있게 됩니다.
      </p>
      {error != null && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '경기를 끝내지 못했습니다')}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button loading={pending} onClick={onConfirm}>
          <Flag className="size-4" aria-hidden />
          끝내기
        </Button>
      </div>
    </Modal>
  )
}
