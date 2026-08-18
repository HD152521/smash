import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import { GroupPicker } from '@/features/tournament/GroupPicker'
import { useGroups, useMembers, useSetMyGroup, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 참가 직후 한 번 지나가는 온보딩 — 조 선택.
 *
 * 대회 메인에 계속 붙여두면 매번 보게 되고, 실수로 다시 누를 여지도 생긴다.
 * 한 번 고르고 넘어간 뒤에는 설정에서만 바꾸게 한다.
 */
export function TournamentSetupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const setGroup = useSetMyGroup(id ?? '')

  const me = members.data?.find((m) => m.userId === user?.id)

  /**
   * 이미 조가 있는 사람이 주소로 직접 들어온 경우만 대회 페이지로 돌려보낸다.
   *
   * 단순히 `me?.groupId` 로 튕기면, 여기서 조를 고르는 순간 값이 채워져
   * 곧바로 넘어가 버린다. 그러면 "다음" 을 누를 새가 없고 사용자는 자기가
   * 뭘 골랐는지 확인하지 못한 채 화면이 바뀐다.
   * mutation 성공 여부가 "이 화면에서 골랐는가" 를 정확히 말해 준다.
   */
  const pickedHere = setGroup.isSuccess
  if (me?.groupId && !pickedHere) return <Navigate to={`/t/${id}`} replace />

  if (!tournament.data || !groups.data || !members.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const config = tournament.data.config

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-28">
      <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">
        {tournament.data.name}
      </p>
      <h1 className="mt-2 text-3xl leading-tight font-black tracking-tight text-ink-1">
        어느 조로 뛰시나요?
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        조끼리 맞붙습니다. 🃏 조커조는 {config.jokerPoints}점만 내면 이기지만 승점은 절반(
        {config.jokerWinPoints}점)입니다.
      </p>

      {setGroup.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-team-b">
          {toUserMessage(setGroup.error, '조를 고르지 못했습니다')}
        </p>
      )}

      <div className="mt-8">
        <GroupPicker
          groups={groups.data}
          members={members.data}
          config={config}
          selectedGroupId={me?.groupId ?? null}
          onSelect={(groupId) => setGroup.mutate(groupId)}
          disabled={setGroup.isPending}
        />
      </div>

      {/* 폰에서 스크롤이 길어지면 다음 버튼을 찾기 어렵다. 바닥에 고정한다. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-0/90 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <p className="flex-1 text-sm text-ink-2">
            {me?.groupId ? '선택 완료' : '조를 하나 골라주세요'}
          </p>
          <Button
            size="lg"
            disabled={!me?.groupId || setGroup.isPending}
            onClick={() => navigate(`/t/${id}`, { replace: true })}
          >
            다음
          </Button>
        </div>
      </div>
    </main>
  )
}
