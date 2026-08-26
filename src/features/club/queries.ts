import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { isClubStaff } from '@/lib/club'
import {
  createClub,
  deleteClub,
  fetchClub,
  fetchClubMembers,
  fetchClubTournaments,
  fetchMyClubs,
  joinClub,
  removeClubMember,
  renameClub,
  rotateGuestCode,
  setClubMemberRole,
  type CreateClubInput,
  type MyClub,
} from './api'
import type { ClubRole } from '@/types/database'

const clubKeys = {
  mine: ['clubs', 'mine'] as const,
  detail: (id: string) => ['clubs', id] as const,
  members: (id: string) => ['clubs', id, 'members'] as const,
  tournaments: (id: string) => ['clubs', id, 'tournaments'] as const,
}

export function useMyClubs() {
  const { user } = useAuth()
  return useQuery({
    queryKey: clubKeys.mine,
    queryFn: () => fetchMyClubs(user!.id),
    enabled: Boolean(user),
  })
}

/**
 * 대회·모임을 그 밑에 열 수 있는 동아리만.
 *
 * 회원으로만 속한 동아리는 뺀다 — `create_tournament` 이 `is_club_admin` 을
 * 요구하므로, 고를 수 있게 두면 만들기를 누른 뒤에야 "권한이 없습니다" 를 본다.
 * 고를 수 없는 것을 목록에 올리지 않는 게 오류 문구보다 낫다.
 */
export function useStaffClubs(): MyClub[] {
  const { data } = useMyClubs()
  return useMemo(() => (data ?? []).filter((c) => isClubStaff(c.role)), [data])
}

export function useClub(clubId: string | undefined) {
  return useQuery({
    queryKey: clubKeys.detail(clubId ?? ''),
    queryFn: () => fetchClub(clubId!),
    enabled: Boolean(clubId),
  })
}

export function useClubMembers(clubId: string | undefined) {
  return useQuery({
    queryKey: clubKeys.members(clubId ?? ''),
    queryFn: () => fetchClubMembers(clubId!),
    enabled: Boolean(clubId),
  })
}

/** 동아리 밑에 열린 대회·모임 — 내가 볼 수 있는 것만 온다 (api 주석 참고) */
export function useClubTournaments(clubId: string | undefined) {
  return useQuery({
    queryKey: clubKeys.tournaments(clubId ?? ''),
    queryFn: () => fetchClubTournaments(clubId!),
    enabled: Boolean(clubId),
  })
}

export function useCreateClub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateClubInput) => createClub(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: clubKeys.mine }),
  })
}

export function useJoinClub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, displayName }: { code: string; displayName?: string }) =>
      joinClub(code, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: clubKeys.mine }),
  })
}

export function useRenameClub(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => renameClub(clubId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubKeys.detail(clubId) })
      // 목록에도 이름이 박혀 나온다
      void qc.invalidateQueries({ queryKey: clubKeys.mine })
    },
  })
}

/**
 * 운영진 지정·해제.
 *
 * 서버가 산하 대회의 관리자 권한까지 함께 바꾸므로, 이 동아리 것만이 아니라
 * 대회 쪽 캐시(`['tournaments', ...]`)도 통째로 무효화한다. 안 그러면 방금
 * 내려간 사람의 화면에 관리 버튼이 새로고침 전까지 그대로 남는다.
 */
export function useSetClubMemberRole(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Exclude<ClubRole, 'owner'> }) =>
      setClubMemberRole(memberId, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubKeys.members(clubId) })
      void qc.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useRemoveClubMember(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => removeClubMember(memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubKeys.members(clubId) })
      // 스스로 나간 경우라면 내 동아리 목록에서도 빠져야 한다
      void qc.invalidateQueries({ queryKey: clubKeys.mine })
    },
  })
}

/**
 * 게스트 코드 재발급.
 *
 * `ClubPage` 가 보여주는 게스트 링크가 `useClub` 의 캐시(`clubs.guest_code`)
 * 에서 나오므로, 재발급 성공 뒤 그 캐시를 무효화해야 화면이 옛 링크를
 * 계속 보여주지 않는다.
 */
export function useRotateGuestCode(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => rotateGuestCode(clubId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clubKeys.detail(clubId) })
    },
  })
}

export function useDeleteClub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clubId: string) => deleteClub(clubId),
    onSuccess: (_data, clubId) => {
      void qc.invalidateQueries({ queryKey: clubKeys.mine })
      void qc.removeQueries({ queryKey: clubKeys.detail(clubId) })
      // 산하 대회는 남고 소속만 풀린다 — 배지가 사라져야 한다
      void qc.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}
