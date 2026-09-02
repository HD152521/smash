import { Navigate, useParams } from 'react-router-dom'
import { SessionMatchEditor } from '@/features/match/SessionMatchEditor'
import { useTournament } from '@/features/tournament/queries'
import { isSession } from '@/lib/session'

/**
 * 모임 경기 **새로 짜기** — 사람 넷과 코트 하나를 고른다.
 *
 * 고르는 화면 자체는 `SessionMatchEditor` 가 그린다. 고치기
 * (`SessionMatchEditPage`)와 같은 화면이라 한 벌만 있어야 하기 때문이다 —
 * 잠금 규칙과 팀 가르기가 두 벌이 되면 반드시 어긋난다.
 *
 * 이 파일에 남는 것은 **이 주소로 들어온 사람이 맞게 왔는가** 하나다.
 * 모드 토글이 아니라 라우트로 가른다(docs/이어서시작.md '화면 하나에
 * 책임 하나' — `MatchCreatePage` 의 `mode` 로 이미 겪었다).
 */
export function SessionMatchCreatePage() {
  const { id } = useParams<{ id: string }>()
  const tournament = useTournament(id)

  // 대회 경기는 편성 규칙이 다르다 (조 · 심판 · 조커). 그쪽 화면으로 보낸다.
  if (tournament.data && !isSession(tournament.data.kind)) {
    return <Navigate to={`/t/${id}/matches/new`} replace />
  }

  return <SessionMatchEditor tournamentId={id ?? ''} backTo={`/t/${id}`} backLabel="모임으로" />
}
