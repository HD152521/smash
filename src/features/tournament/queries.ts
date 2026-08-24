import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { kickPushSender } from '@/features/notifications/push'
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
  fetchScoreEvents,
  setDisplayName,
  addRosterMember,
  removeMember,
  linkMemberAccount,
  deleteMatch,
  renameCourt,
  renameGroup,
  renameTournament,
  setCourtQueue,
  updateMatch,
  moveCourt,
  fetchMatches,
  fetchStandings,
  fetchAuditLog,
  recordManualMatch,
  regenerateInviteCode,
  setMemberGroup,
  setMemberRole,
  setTournamentStatus,
  updateTournamentConfig,
  type CreateMatchInput,
  type UpdateMatchInput,
  type ManualMatchInput,
  type CreateTournamentInput,
} from './api'
import type { TournamentConfigPatch, TournamentStatus } from '@/types/database'

const tournamentKeys = {
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

/**
 * 대회 설정 바꾸기.
 *
 * 아직 시작 안 한 경기의 목표 점수·듀스가 서버에서 다시 굳는다. 대진표와
 * 코트 현황이 그 값을 그려 쓰므로 경기 목록도 함께 무효화한다.
 */
export function useUpdateTournamentConfig(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: TournamentConfigPatch) => updateTournamentConfig(tournamentId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId] })
      void qc.invalidateQueries({ queryKey: tournamentKeys.mine })
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] }),
  })
}

export function useDeleteCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courtId: string) => deleteCourt(courtId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] }),
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
      // 코트를 지정해서 편성했다면 여기서 이미 알림이 생긴다.
      // 실패해도 무시한다 — 아웃박스에 남아 다음 호출 때 함께 나간다.
      void kickPushSender()
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
    },
  })
}

export function useVoidMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason?: string }) =>
      voidMatch(matchId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] }),
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

/** 한 경기의 득점 순서. 끝난 경기는 더 안 바뀌므로 오래 캐시해도 된다. */
export function useScoreEvents(matchId: string | undefined) {
  return useQuery({
    queryKey: ['matches', matchId, 'events'],
    queryFn: () => fetchScoreEvents(matchId!),
    enabled: Boolean(matchId),
    staleTime: 60_000,
  })
}

export function useSetDisplayName(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, name }: { memberId: string; name: string }) =>
      setDisplayName(memberId, name),
    onSuccess: () => {
      // 이름은 이 대회의 여러 화면에 흩어져 있다 (참가자 · 대진표 · 순위 · 심판).
      // 계정 프로필은 건드리지 않으므로 여기서 지울 것도 없다.
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'members'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

function useRosterMutation<T>(tournamentId: string, fn: (input: T) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // 명단이 바뀌면 조 구성·경기 편성 후보가 함께 바뀐다
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'members'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

export function useLinkMemberAccount(tournamentId: string) {
  return useRosterMutation(
    tournamentId,
    ({ rosterId, accountId }: { rosterId: string; accountId: string }) =>
      linkMemberAccount(rosterId, accountId),
  )
}

export function useAddRosterMember(tournamentId: string) {
  return useRosterMutation(tournamentId, (name: string) => addRosterMember(tournamentId, name))
}

export function useRemoveMember(tournamentId: string) {
  return useRosterMutation(tournamentId, (memberId: string) => removeMember(memberId))
}

export function useRenameCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courtId, name }: { courtId: string; name: string }) =>
      renameCourt(courtId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
      // 코트 이름은 경기 목록(match_overview)에도 박혀 나온다
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

export function useUpdateMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMatchInput) => updateMatch(input),
    onSuccess: () => {
      void kickPushSender()
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

export function useDeleteMatch(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => deleteMatch(matchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] }),
  })
}

export function useRenameTournament(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => renameTournament(tournamentId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId] })
      void qc.invalidateQueries({ queryKey: tournamentKeys.mine })
    },
  })
}

export function useRenameGroup(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      renameGroup(groupId, name),
    onSuccess: () => {
      // 조 이름은 순위·대진표·참가자 화면에 모두 박혀 나온다
      void qc.invalidateQueries({ queryKey: tournamentKeys.groups(tournamentId) })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'standings'] })
    },
  })
}

export function useSetCourtQueue(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courtId, matchIds }: { courtId: string | null; matchIds: string[] }) =>
      setCourtQueue(tournamentId, courtId, matchIds),
    onSuccess: () => {
      // 코트가 새로 정해진 경기가 있으면 알림이 생긴다
      void kickPushSender()
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

export function useAssignCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, courtId }: { matchId: string; courtId: string | null }) =>
      assignCourt(matchId, courtId),
    onSuccess: () => {
      // 알림은 코트가 배정되는 순간 생긴다. 여기서 안 깨우면 다음 편성 때까지 안 나간다.
      void kickPushSender()
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}

export function useClaimCourt(tournamentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ matchId, courtId }: { matchId: string; courtId: string }) =>
      claimCourt(matchId, courtId),
    onSuccess: () => {
      void kickPushSender()
      void qc.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] })
    },
  })
}
