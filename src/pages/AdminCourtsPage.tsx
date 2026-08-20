import { useParams } from 'react-router-dom'
import { AdminScreen } from '@/features/admin/AdminScreen'
import { CourtManager } from '@/features/admin/CourtManager'
import { useCourts, useMatches } from '@/features/tournament/queries'

export function AdminCourtsPage() {
  const { id } = useParams<{ id: string }>()
  const courts = useCourts(id)
  const matches = useMatches(id)

  return (
    <AdminScreen tournamentId={id!} title="코트" pending={!courts.data}>
      <CourtManager tournamentId={id!} courts={courts.data ?? []} matches={matches.data ?? []} />
    </AdminScreen>
  )
}
