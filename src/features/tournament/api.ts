import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { GroupRow, MemberRole, TournamentRow, TournamentStatus } from '@/types/database'

export interface CreateTournamentInput {
  name: string
  description?: string | null
  groupCount: number
  jokerGroupCount: number
  displayName: string
  normalPoints?: number
  jokerPoints?: number
}

export async function createTournament(input: CreateTournamentInput): Promise<TournamentRow> {
  const res = await supabase.rpc('create_tournament', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_group_count: input.groupCount,
    p_joker_group_count: input.jokerGroupCount,
    p_display_name: input.displayName,
    p_normal_points: input.normalPoints ?? 21,
    p_joker_points: input.jokerPoints ?? 11,
  })
  return unwrap(res) as TournamentRow
}

export async function joinTournament(code: string, displayName?: string): Promise<TournamentRow> {
  const res = await supabase.rpc('join_tournament', {
    p_code: code,
    p_display_name: displayName ?? null,
  })
  return unwrap(res) as TournamentRow
}

/** 내 대회 모음에 필요한 만큼만 */
export interface MyTournament {
  id: string
  name: string
  description: string | null
  status: TournamentStatus
  inviteCode: string
  role: MemberRole
  groupId: string | null
  joinedAt: string
}

interface MembershipRow {
  role: MemberRole
  group_id: string | null
  joined_at: string
  tournaments: {
    id: string
    name: string
    description: string | null
    status: TournamentStatus
    invite_code: string
  } | null
}

export async function fetchMyTournaments(userId: string): Promise<MyTournament[]> {
  const res = await supabase
    .from('tournament_members')
    .select('role, group_id, joined_at, tournaments(id, name, description, status, invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  const rows = unwrap(res) as unknown as MembershipRow[]

  return rows
    .filter((r): r is MembershipRow & { tournaments: NonNullable<MembershipRow['tournaments']> } =>
      Boolean(r.tournaments),
    )
    .map((r) => ({
      id: r.tournaments.id,
      name: r.tournaments.name,
      description: r.tournaments.description,
      status: r.tournaments.status,
      inviteCode: r.tournaments.invite_code,
      role: r.role,
      groupId: r.group_id,
      joinedAt: r.joined_at,
    }))
}

export async function fetchGroups(tournamentId: string): Promise<GroupRow[]> {
  const res = await supabase
    .from('groups')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  return unwrap(res) as GroupRow[]
}

export async function fetchProfileName(userId: string): Promise<string> {
  const res = await supabase.from('profiles').select('name').eq('id', userId).single()
  const row = unwrap(res) as { name: string }
  return row.name
}

export async function fetchTournament(id: string): Promise<TournamentRow> {
  const res = await supabase.from('tournaments').select('*').eq('id', id).single()
  return unwrap(res) as unknown as TournamentRow
}

export interface MemberSummary {
  id: string
  userId: string
  displayName: string
  role: MemberRole
  groupId: string | null
}

export async function fetchMembers(tournamentId: string): Promise<MemberSummary[]> {
  const res = await supabase
    .from('tournament_members')
    .select('id, user_id, display_name, role, group_id')
    .eq('tournament_id', tournamentId)
    .order('display_name')

  const rows = unwrap(res) as {
    id: string
    user_id: string
    display_name: string
    role: MemberRole
    group_id: string | null
  }[]

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    role: r.role,
    groupId: r.group_id,
  }))
}

export async function setMyGroup(tournamentId: string, groupId: string | null) {
  const res = await supabase.rpc('set_my_group', {
    p_tournament_id: tournamentId,
    p_group_id: groupId,
  })
  return unwrap(res)
}
