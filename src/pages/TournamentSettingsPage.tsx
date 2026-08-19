import { useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Lock } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { GroupPicker } from '@/features/tournament/GroupPicker'
import { PushToggle } from '@/features/notifications/PushToggle'
import { useGroups, useMembers, useSetMyGroup, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 대회 설정 — 지금은 내 조 변경만.
 *
 * 조 변경은 참가자 스스로 하는 게 맞지만, 대회가 시작된 뒤에는
 * 대진표가 이미 짜여 있으므로 관리자만 손댈 수 있어야 한다.
 * 그 규칙은 서버(set_my_group)가 강제하고, 여기서는 왜 막혔는지만 설명한다.
 */
export function TournamentSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const setGroup = useSetMyGroup(id ?? '')

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const isDraft = tournament.data?.status === 'draft'
  const canChangeGroup = isDraft || isAdmin

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to={`/t/${id}`}>대회로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">설정</h1>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-ink-1">내 조</h2>

        {canChangeGroup ? (
          <p className="mt-1 text-sm text-ink-2">
            {isDraft
              ? '대회가 시작되기 전까지 바꿀 수 있습니다.'
              : '대회가 시작됐지만 관리자 권한으로 바꿀 수 있습니다.'}
          </p>
        ) : (
          <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-border-subtle bg-surface-2 p-4">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink-1">대회가 시작되어 잠겼습니다</p>
              <p className="mt-1 text-sm text-ink-2">
                대진표가 이미 짜여 있어서, 조를 바꾸려면 관리자에게 요청해 주세요.
              </p>
            </div>
          </div>
        )}

        {setGroup.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
            {toUserMessage(setGroup.error, '조를 바꾸지 못했습니다')}
          </p>
        )}

        {groups.data && members.data && (
          <div className="mt-4">
            <GroupPicker
              groups={groups.data}
              members={members.data}
              config={tournament.data?.config}
              selectedGroupId={me?.groupId ?? null}
              onSelect={(groupId) => setGroup.mutate(groupId)}
              disabled={!canChangeGroup || setGroup.isPending}
            />
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink-1">알림</h2>
        <p className="mt-1 mb-3 text-sm text-ink-2">
          내 경기가 잡히면 알려드립니다. 이 기기에만 적용됩니다.
        </p>
        <PushToggle />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink-1">내 표시 이름</h2>
        <p className="mt-1 text-sm text-ink-2">
          대진표와 순위표에 보이는 이름입니다.{' '}
          <span className="text-ink-3">({me?.displayName ?? '—'})</span>
        </p>
        <p className="mt-3 text-sm text-ink-3">이름 변경은 다음 단계에서 붙습니다.</p>
      </section>
    </main>
  )
}
