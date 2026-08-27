import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useTournament } from './queries'
import { isSession } from '@/lib/session'

/**
 * 대회에서만 열리는 화면을 감싼다. 모임이면 코트 화면으로 돌려보낸다.
 *
 * 지금 이걸 쓰는 곳은 점수판 하나다. **모임에는 점수판이 없다** — 모임에서
 * 하는 일은 코트에 들어가고 나오는 것 둘뿐이라(`docs/이어서시작.md` 의
 * 「대회와 모임」), 목표 점수·듀스·코트 체인지·되돌리기가 붙은 화면은
 * 거기서 뜻이 없다.
 *
 * ── 왜 화면 안이 아니라 여기서 막나 ────────────────────────────────
 *
 * 점수판은 `useWakeLock` · `useScreenRotation` · `useMutation` 을 여럿
 * 부른다. 그 화면 안에서 `if (모임) return <Navigate/>` 를 하면 훅이
 * 조건부로 불려 규칙 위반이다(실제로 걸렸다). 가드는 **훅을 부르기 전에**
 * 서야 하고, 그 자리는 라우트 층이다 — `RequireAuth` 와 같은 자리다.
 *
 * ── 왜 링크를 지우는 것으로 부족한가 ────────────────────────────────
 *
 * 주소를 직접 치거나, 예전에 열어 둔 탭을 새로고침하거나, 누가 링크를
 * 카톡으로 보내면 그대로 열린다. 들어가는 문을 다 막았다고 방이 없어지는
 * 것은 아니다.
 *
 * ── 모르는 동안에는 판단하지 않는다 ─────────────────────────────────
 *
 * `kind` 가 아직 안 왔을 때 '대회다' 로 넘겨짚고 통과시키면 잠깐 점수판이
 * 그려졌다 사라진다. 반대로 '모임이다' 로 넘겨짚고 내보내면 회선이 느린
 * 체육관에서 대회 심판이 자기 화면에서 튕긴다. 그래서 **올 때까지 아무것도
 * 그리지 않는다.**
 */
export function TournamentOnly({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const tournament = useTournament(id)

  if (!tournament.data) return null
  if (isSession(tournament.data.kind)) return <Navigate to={`/t/${id}`} replace />
  return <>{children}</>
}
