import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { useAdminGate } from './useAdminGate'

interface AdminScreenProps {
  tournamentId: string
  /** 화면 제목 — 관리 목록에 적힌 이름과 같아야 한다 */
  title: string
  /** 제목 밑 한 줄. 여기서 무엇을 바꾸는지 */
  description?: string
  /** 이 화면이 따로 기다리는 데이터가 아직 없다 */
  pending?: boolean
  children: ReactNode
}

/**
 * 관리 하위 화면의 공통 껍데기 — 권한 확인 · 나가는 길 · 제목 · 로딩.
 *
 * 관리를 화면 하나에 다 얹으면 정작 급할 때 필요한 항목이 스크롤 밑으로
 * 밀린다. 코트 · 참가자 · 조를 각자 화면으로 떼면서 세 화면이 똑같은
 * 껍데기를 갖게 됐고, 그걸 여기 모았다.
 *
 * 나가는 길은 관리 목록으로 못 박는다. 여기 들어오는 문이 관리 목록
 * 하나뿐이라 결과가 같고, 주소로 바로 들어온 사람도 갈 곳이 생긴다.
 * 이 화면들에는 하단탭이 없다 — 이 링크가 유일한 출구다.
 */
export function AdminScreen({
  tournamentId,
  title,
  description,
  pending = false,
  children,
}: AdminScreenProps) {
  const gate = useAdminGate(tournamentId)

  if (gate.denied) return <Navigate to={`/t/${tournamentId}`} replace />

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      {/*
        관리 허브가 아니라 **대회 화면**으로 보낸다.
        허브로 보내면 홈까지 4탭이 된다(관리로 → 대회로 → 동아리 → 홈).
        관리 화면은 대회를 차릴 때 한 번 훑는 곳이지 오래 머무는 곳이
        아니라, 나가는 길이 짧은 쪽이 낫다. 관리 허브로 돌아가야 하면
        대회 화면 하단탭의 '더보기 → 관리' 가 받는다.
      */}
      <BackBar to={`/t/${tournamentId}`} label="대회로" />

      <h1 className="mt-4 text-3xl font-black tracking-tight text-ink-1">{title}</h1>
      {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}

      {gate.loading || pending ? (
        <div className="mt-8 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        <div className="mt-8">{children}</div>
      )}
    </main>
  )
}
