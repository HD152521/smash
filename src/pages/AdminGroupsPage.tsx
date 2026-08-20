import { useParams } from 'react-router-dom'
import { AdminScreen } from '@/features/admin/AdminScreen'
import { GroupManager } from '@/features/admin/GroupManager'
import { useGroups } from '@/features/tournament/queries'

export function AdminGroupsPage() {
  const { id } = useParams<{ id: string }>()
  const groups = useGroups(id)

  return (
    <AdminScreen tournamentId={id!} title="조" pending={!groups.data}>
      <GroupManager tournamentId={id!} groups={groups.data ?? []} />
    </AdminScreen>
  )
}
