import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import {
  createTournament,
  fetchGroups,
  fetchMyTournaments,
  fetchMembers,
  fetchProfileName,
  fetchTournament,
  joinTournament,
  setMyGroup,
  type CreateTournamentInput,
} from './api'

export const tournamentKeys = {
  mine: ['tournaments', 'mine'] as const,
  groups: (id: string) => ['tournaments', id, 'groups'] as const,
  profileName: (uid: string) => ['profile', uid, 'name'] as const,
}

export function useMyTournaments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: tournamentKeys.mine,
    queryFn: () => fetchMyTournaments(user!.id),
    enabled: Boolean(user),
  })
}

/** 대회 참가/생성 시 표시명 기본값으로 쓴다 */
export function useProfileName() {
  const { user } = useAuth()
  return useQuery({
    queryKey: tournamentKeys.profileName(user?.id ?? ''),
    queryFn: () => fetchProfileName(user!.id),
    enabled: Boolean(user),
    staleTime: 10 * 60 * 1000,
  })
}

export function useGroups(tournamentId: string | undefined) {
  return useQuery({
    queryKey: tournamentKeys.groups(tournamentId ?? ''),
    queryFn: () => fetchGroups(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useCreateTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTournamentInput) => createTournament(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.mine }),
  })
}

export function useJoinTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, displayName }: { code: string; displayName?: string }) =>
      joinTournament(code, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.mine }),
  })
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', id],
    queryFn: () => fetchTournament(id!),
    enabled: Boolean(id),
  })
}

export function useMembers(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', tournamentId, 'members'],
    queryFn: () => fetchMembers(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useSetMyGroup(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string | null) => setMyGroup(tournamentId, groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'members'] })
      void qc.invalidateQueries({ queryKey: tournamentKeys.mine })
    },
  })
}
