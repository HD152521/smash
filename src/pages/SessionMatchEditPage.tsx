import { Navigate, useLocation, useParams } from 'react-router-dom'
import { SessionMatchEditor } from '@/features/match/SessionMatchEditor'
import { useTournament } from '@/features/tournament/queries'
import { isSession } from '@/lib/session'

/**
 * 모임 경기 **고치기** — 이미 짜 둔 한 경기의 편성을 바로잡는다.
 *
 * 새로 짜기(`SessionMatchCreatePage`)와 **같은 화면**을 쓴다. 모임에서
 * 경기를 짜는 일은 사람 넷과 코트 하나를 고르는 것이고, 고치는 일도 글자
 * 그대로 같기 때문이다. 다른 것은 시작할 때 무엇이 들어 있느냐 하나뿐이라
 * `editMatchId` 만 넘긴다 — 화면 안의 토글이 아니라 **라우트가 가른다.**
 *
 * 여기에 '하나 더 만들기' 를 붙이지 말 것 (`MatchEditPage` 와 같은 규율) —
 * 고치러 들어온 사람에게 만들기를 겸하게 하면, 고친 줄 알았는데 한 판이
 * 더 생긴다.
 *
 * 예정 경기만 대상이다. 이미 시작했거나 끝난 경기는 서버가 거절하고,
 * 화면도 그 길을 안 보인다(판단은 `SessionMatchEditor` 안에 있다).
 */
export function SessionMatchEditPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>()
  const location = useLocation()
  const tournament = useTournament(id)

  /*
   * 대회 경기는 조를 고르는 화면이 맞다 — 그쪽으로 보낸다.
   * 대진표의 연필은 이미 갈라 보내지만, 주소를 직접 치거나 열어 둔 탭을
   * 새로고침하는 길이 남아 있다.
   */
  if (tournament.data && !isSession(tournament.data.kind)) {
    return <Navigate to={`/t/${id}/matches/${matchId}/edit`} replace />
  }

  return (
    <SessionMatchEditor
      tournamentId={id ?? ''}
      editMatchId={matchId}
      backTo={backTo(id, location.state)}
      backLabel="돌아가기"
    />
  )
}

/**
 * 고치고 나서 어디로 돌아가나 — **왔던 자리로.**
 *
 * 들어오는 문이 둘이다: 코트 화면의 자동 경기 줄과 대진표의 연필. 한 곳으로
 * 고정하면 반드시 한쪽이 엉뚱한 화면에 떨어진다. 대진표에서 여러 판을
 * 손보던 사람이 매번 코트 화면으로 튕기면 스크롤 자리를 다시 찾아야 한다.
 *
 * 넘어온 값은 그대로 믿지 않는다 — 이 모임 안의 주소일 때만 쓴다.
 * (링크가 아니라 주소창으로 들어오면 `state` 가 아예 없다.)
 */
function backTo(tournamentId: string | undefined, state: unknown): string {
  const home = `/t/${tournamentId}`
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith(`${home}/`) ? from : home
}
