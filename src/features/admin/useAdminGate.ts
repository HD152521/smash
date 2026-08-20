import { useAuth } from '@/features/auth/useAuth'
import { useMembers } from '@/features/tournament/queries'
import type { MemberSummary } from '@/features/tournament/api'

export interface AdminGate {
  /** 아직 판단할 수 없다 — 멤버 목록이 오기 전이다 */
  loading: boolean
  /** 관리자가 아니다 — 대회 화면으로 돌려보낸다 */
  denied: boolean
  me: MemberSummary | undefined
  members: MemberSummary[] | undefined
}

/**
 * 관리 화면들의 공통 판단 — 이 사람이 이 대회의 관리자인가.
 *
 * 관리가 여러 화면으로 나뉘면서 같은 판단을 네 곳에서 하게 됐다. 한 곳이라도
 * 조건이 어긋나면 그 화면만 관리자가 아닌 사람에게 열린다.
 *
 * `loading` 과 `denied` 를 따로 주는 게 핵심이다. 멤버 목록이 오기 전에
 * "관리자가 아니다" 로 판단하면 새로고침할 때마다 대회 화면으로 튕긴다.
 *
 * 이건 UX 다. 진짜 벽은 RLS 다 — 여기를 뚫어도 서버가 아무것도 내주지 않는다.
 */
export function useAdminGate(id: string | undefined): AdminGate {
  const { user } = useAuth()
  const members = useMembers(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  return {
    loading: !members.data,
    denied: Boolean(members.data) && !isAdmin,
    me,
    members: members.data,
  }
}
