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
  createCourt,
  createMatch,
  deleteCourt,
  voidMatch,
  fetchCourts,
  assignCourt,
  claimCourt,
  moveCourt,
  fetchMatches,
  fetchStandings,
  fetchAuditLog,
  recordManualMatch,
  regenerateInviteCode,
  setMemberGroup,
  setMemberRole,
  setTournamentStatus,
  type CreateMatchInput,
  type ManualMatchInput,
  type CreateTournamentInput,
} from './api'
import type { TournamentStatus } from '@/types/database'

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

// ── 관리자 ───────────────────────────────────────────────────────────

function useTournamentInvalidator(tournamentId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId] })
    void qc.invalidateQueries({ queryKey: tournamentKeys.mine })
  }
}

export function useSetMemberRole(tournamentId: string) {
  const invalidate = useTournamentInvalidator(tournamentId)
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) =>
      setMemberRole(memberId, role),
    onSuccess: invalidate,
  })
}

export function useSetMemberGroup(tournamentId: string) {
  const invalidate = useTournamentInvalidator(tournamentId)
  return useMutation({
    mutationFn: ({ memberId, groupId }: { memberId: string; groupId: string | null }) =>
      setMemberGroup(memberId, groupId),
    onSuccess: invalidate,
  })
}

export function useSetTournamentStatus(tournamentId: string) {
  const invalidate = useTournamentInvalidator(tournamentId)
  return useMutation({
    mutationFn: (status: TournamentStatus) => setTournamentStatus(tournamentId, status),
    onSuccess: invalidate,
  })
}

export function useRegenerateInviteCode(tournamentId: string) {
  const invalidate = useTournamentInvalidator(tournamentId)
  return useMutation({
    mutationFn: () => regenerateInviteCode(tournamentId),
    onSuccess: invalidate,
  })
}

// ── 코트 ─────────────────────────────────────────────────────────────

export function useCourts(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', tournamentId, 'courts'],
    queryFn: () => fetchCourts(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useCreateCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, sortOrder }: { name: string; sortOrder: number }) =>
      createCourt(tournamentId, name, sortOrder),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] }),
  })
}

export function useDeleteCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courtId: string) => deleteCourt(courtId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] }),
  })
}

// ── 경기 ─────────────────────────────────────────────────────────────

export function useMatches(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', tournamentId, 'matches'],
    queryFn: () => fetchMatches(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useCreateMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreateMatchInput, 'tournamentId'>) =>
      createMatch({ ...input, tournamentId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
    },
  })
}

export function useVoidMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason?: string }) => voidMatch(matchId, reason),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] }),
  })
}

export function useStandings(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', tournamentId, 'standings'],
    queryFn: () => fetchStandings(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useRecordManualMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<ManualMatchInput, 'tournamentId'>) =>
      recordManualMatch({ ...input, tournamentId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'standings'] })
    },
  })
}

export function useAuditLog(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['tournaments', tournamentId, 'audit'],
    queryFn: () => fetchAuditLog(tournamentId!),
    enabled: Boolean(tournamentId),
  })
}

export function useMoveCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courtId, direction }: { courtId: string; direction: -1 | 1 }) =>
      moveCourt(courtId, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] }),
  })
}

export function useAssignCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, courtId }: { matchId: string; courtId: string | null }) =>
      assignCourt(matchId, courtId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] }),
  })
}

export function useClaimCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, courtId }: { matchId: string; courtId: string }) =>
      claimCourt(matchId, courtId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] }),
  })
}
