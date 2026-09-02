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
  /** 나가는 길 — 항상 여기로 간다 */
  backTo: string
  /** 그 길에 적히는 글자. 가는 곳의 이름이다 ('뒤로' 가 아니다) */
  backLabel: string
  /** 이 화면이 따로 기다리는 데이터가 아직 없다 */
  pending?: boolean
  children: ReactNode
  /** 저장 바. 있으면 화면 아래를 가리므로 여백을 더 준다 */
  bottomBar?: ReactNode
}

/**
 * 경기를 만들고 고치는 화면 셋의 공통 껍데기 — 권한 · 나가는 길 · 제목 · 로딩.
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
  pending = false,
  children,
  bottomBar,
}: MatchEditorScreenProps) {
  const gate = useAdminGate(tournamentId)

  if (gate.denied) return <Navigate to={`/t/${tournamentId}`} replace />

  const loading = gate.loading || pending

  return (
    <main className={cn('mx-auto w-full max-w-2xl px-5 pt-6', bottomBar ? 'pb-40' : 'pb-16')}>
      {/*
        이 화면들에는 하단탭이 없다 — 작업 중에 탭으로 새면 고르던 것이
        사라지므로 일부러 뺐다(`appTabs.ts`). 그래서 이 링크가 유일한
        출구고, 언제나 `backTo` 로 간다. 한 화면에서 편성을 여러 번 반복한
        뒤에도 한 번에 나간다 — 예전엔 히스토리를 되짚느라 같은 화면을
        몇 번이고 지나야 빠져나왔다(`BackLink` 주석).
      */}
      <BackBar to={backTo} label={backLabel} />

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
