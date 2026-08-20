import { useParams } from 'react-router-dom'
import { AdminScreen } from '@/features/admin/AdminScreen'
import { MemberManager } from '@/features/admin/MemberManager'
import { useAdminGate } from '@/features/admin/useAdminGate'
import { useGroups, useMatches } from '@/features/tournament/queries'

export function AdminMembersPage() {
  const { id } = useParams<{ id: string }>()
  const gate = useAdminGate(id)
  const groups = useGroups(id)
  const matches = useMatches(id)

  return (
    <AdminScreen tournamentId={id!} title="참가자" pending={!groups.data || !gate.members}>
      <MemberManager
        tournamentId={id!}
        members={gate.members ?? []}
        matches={matches.data ?? []}
        groups={groups.data ?? []}
        myMemberId={gate.me?.id}
      />
    </AdminScreen>
  )
}
