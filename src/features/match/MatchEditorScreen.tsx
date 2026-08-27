import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { useAdminGate } from '@/features/admin/useAdminGate'
import { cn } from '@/lib/utils'

interface MatchEditorScreenProps {
  tournamentId: string
  /** 이 화면이 지는 책임 한 줄 — 들어온 사람이 제목만 보고 알아야 한다 */
  title: string
  description?: ReactNode
  backTo: string
  backLabel: string
  /** 같은 화면에 머무르며 반복하는 곳은 부모를 못 박는다 (히스토리가 쌓인다) */
  fixedBack?: boolean
  /** 이 화면이 따로 기다리는 데이터가 아직 없다 */
  pending?: boolean
  children: ReactNode
  /** 저장 바. 있으면 화면 아래를 가리므로 여백을 더 준다 */
  bottomBar?: ReactNode
}

/**
 * 경기를 만들고 고치는 화면 셋의 공통 껍데기 — 권한 · 뒤로 · 제목 · 로딩.
 *
 * 한 화면에 mode 토글로 겹쳐 있던 것을 셋으로 가르면서, 세 화면이 똑같은
 * 껍데기를 갖게 됐다. 관리 하위 화면(AdminScreen)과 같은 자리의 것이지만
 * 저쪽은 저장 바도 pb 도 없다 — 억지로 합치면 두 쪽 다 조건문이 는다.
 *
 * 권한은 여기서 한 번만 본다. 세 화면이 각자 판단하면 한 곳이 어긋나는 날
 * 그 화면만 관리자가 아닌 사람에게 열린다. 진짜 벽은 RLS 다.
 */
export function MatchEditorScreen({
  tournamentId,
  title,
  description,
  backTo,
  backLabel,
  fixedBack = false,
  pending = false,
  children,
  bottomBar,
}: MatchEditorScreenProps) {
  const gate = useAdminGate(tournamentId)

  if (gate.denied) return <Navigate to={`/t/${tournamentId}`} replace />

  const loading = gate.loading || pending

  return (
    <main className={cn('mx-auto w-full max-w-2xl px-5 pt-6', bottomBar ? 'pb-40' : 'pb-16')}>
      <BackBar to={backTo} label={backLabel} fixed={fixedBack} />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">{title}</h1>
      {description && <div className="mt-2 text-sm text-ink-2">{description}</div>}

      {loading ? (
        <div className="mt-8 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        children
      )}

      {!loading && bottomBar}
    </main>
  )
}
