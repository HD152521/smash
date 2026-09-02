import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CourtPicker } from '@/features/match/CourtPicker'
import { MatchEditorScreen } from '@/features/match/MatchEditorScreen'
import { MatchSubmitBar } from '@/features/match/MatchSubmitBar'
import { RefereePicker } from '@/features/match/RefereePicker'
import { TeamSection } from '@/features/match/TeamSection'
import { targetPoints, useMatchTeams } from '@/features/match/useMatchTeams'
import {
  useCourts,
  useGroups,
  useMatches,
  useMembers,
  useTournament,
  useUpdateMatch,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { matchEditPath } from '@/lib/schedule'
import { isSession } from '@/lib/session'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 경기 고치기 — 이미 편성한 한 경기의 편성을 바로잡는다. 한 건짜리 일이다.
 *
 * 새로 만들지 않는다. 여기에 **'하나 더 만들기' 를 붙이지 말 것** — 고치러
 * 들어온 사람에게 만들기를 겸하게 하면, 고친 줄 알았는데 한 판이 더 생긴다.
 * 새로 짜는 일은 `/matches/new` 가 받는다.
 *
 * 예정 경기만 대상이다. 이미 시작했거나 끝난 경기는 서버가 거절한다 —
 * 조를 바꾸면 목표 점수 스냅샷까지 다시 계산해야 하기 때문이다.
 */
export function MatchEditPage() {
  const { id, matchId } = useParams<{ id: string; matchId: string }>()
  const navigate = useNavigate()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const courts = useCourts(id)
  const matches = useMatches(id)
  const update = useUpdateMatch(id ?? '')

  const config = tournament.data?.config
  const squadSize = config?.format === 'singles' ? 1 : 2

  const [courtId, setCourtId] = useState('')
  const [referees, setReferees] = useState<string[]>([])

  const teams = useMatchTeams({
    squadSize,
    // 뛰는 사람은 그 경기 심판을 볼 수 없다 (서버도 거부한다)
    onPlayersChange: (picked) => setReferees((r) => r.filter((x) => !picked.includes(x))),
  })

  const editing = (matches.data ?? []).find((m) => m.id === matchId)
  const [filledFrom, setFilledFrom] = useState<MatchOverviewRow | null>(null)

  /*
   * 서버에서 온 편성으로 폼을 채운다.
   *
   * useEffect 로 채우면 빈 폼이 한 번 그려진 뒤에 값이 들어와 입력칸이
   * 껌뻑인다. 전에는 데이터가 도착한 뒤에 key 로 폼을 통째로 새로
   * 마운트해 피했는데, 그 우회는 화면이 하나뿐이라 필요했던 것이다.
   * 지금은 이 화면이 수정만 하므로 렌더 중에 한 번 맞추면 끝난다.
   *
   * react-query 는 내용이 같으면 같은 객체를 돌려주므로(structural sharing)
   * 다시 받아왔다는 이유만으로는 여기 안 걸린다. 다른 관리자가 같은 경기를
   * 바꿨을 때만 폼이 서버 값으로 맞춰진다.
   *
   * 이름은 화면에 나오지만 서버는 멤버 id 를 받으므로 이름으로 되짚는다.
   * 그래서 명단이 도착하기 전에는 채우지 않는다 — 채우면 선수와 심판이
   * 통째로 비어 버리고, 그 뒤로는 다시 채울 계기가 없다.
   */
  if (editing && members.data && editing !== filledFrom) {
    const idsOf = (names: string[] | null) =>
      (names ?? [])
        .map((n) => members.data?.find((m) => m.displayName === n)?.id)
        .filter((x): x is string => Boolean(x))

    setFilledFrom(editing)
    setCourtId(editing.court_id ?? '')
    teams.fill({
      groupA: editing.group_a_id ?? '',
      groupB: editing.group_b_id ?? '',
      playersA: idsOf(editing.players_a),
      playersB: idsOf(editing.players_b),
    })
    setReferees(idsOf(editing.referees))
  }

  /*
   * 모임 경기는 이 화면으로 못 고친다 — 사람을 고르는 화면으로 보낸다.
   *
   * 여기는 조를 먼저 고르고 그 조에서 선수를 고르는 화면인데, 모임에는 조가
   * 한 개도 없다. 실제로 열어 보면 A팀·B팀 칸이 **통째로 비어** 있고
   * (고를 조가 없으니 선수 목록도 안 나온다) 아래에는 "양 팀의 조와 선수를
   * 고르면 저장할 수 있습니다" 만 남는다 — 영영 만족할 수 없는 조건이다.
   * 서버도 같은 이유로 거절한다(`update_match` 는 조를 필수로 받는다).
   *
   * 대진표의 연필은 이미 갈라 보내지만(`matchEditPath`), 주소를 직접 치거나
   * 예전 링크를 열면 여기로 온다. 그 길을 여기서 닫는다.
   */
  if (tournament.data && isSession(tournament.data.kind) && matchId) {
    return <Navigate to={matchEditPath(id ?? '', matchId, true)} replace />
  }

  // 지워졌거나 없는 경기 — 고칠 것이 없으니 목록으로 돌려보낸다
  if (matches.data && !editing) return <Navigate to={`/t/${id}/schedule`} replace />

  const groupList = groups.data ?? []
  const roster = members.data ?? []
  const gA = groupList.find((g) => g.id === teams.groupA)
  const gB = groupList.find((g) => g.id === teams.groupB)

  async function handleSubmit() {
    try {
      await update.mutateAsync({
        matchId: matchId ?? '',
        courtId: courtId || null,
        groupA: teams.groupA,
        playersA: teams.playersA,
        groupB: teams.groupB,
        playersB: teams.playersB,
        referees,
      })
      // 한 건짜리 일이다. 고치고 나면 목록으로 돌려보낸다.
      navigate(`/t/${id}/schedule`, { replace: true })
    } catch {
      // update.error 로 화면에 뿌린다
    }
  }

  return (
    <MatchEditorScreen
      tournamentId={id ?? ''}
      title="경기 고치기"
      description="아직 시작하지 않은 경기만 고칠 수 있습니다. 코트와 심판 지정은 그대로 남습니다."
      backTo={`/t/${id}/schedule`}
      backLabel="대진표로"
      pending={!config || !groups.data || !filledFrom}
      bottomBar={
        teams.ready && (
          <MatchSubmitBar
            groupA={gA}
            groupB={gB}
            targetA={targetPoints(gA, config)}
            targetB={targetPoints(gB, config)}
            label="고치기"
            loading={update.isPending}
            onSubmit={() => void handleSubmit()}
          />
        )
      }
    >
      <CourtPicker courts={courts.data} value={courtId} onChange={setCourtId} />

      <TeamSection
        side="A"
        label="A팀"
        groups={groupList}
        members={roster}
        selectedGroup={teams.groupA}
        disabledGroup={teams.groupB}
        onSelectGroup={(g) => teams.selectGroup('A', g)}
        selectedPlayers={teams.playersA}
        onTogglePlayer={(m) => teams.togglePlayer('A', m)}
        squadSize={squadSize}
        target={targetPoints(gA, config)}
        isJoker={Boolean(gA?.is_joker)}
      />

      <TeamSection
        side="B"
        label="B팀"
        groups={groupList}
        members={roster}
        selectedGroup={teams.groupB}
        disabledGroup={teams.groupA}
        onSelectGroup={(g) => teams.selectGroup('B', g)}
        selectedPlayers={teams.playersB}
        onTogglePlayer={(m) => teams.togglePlayer('B', m)}
        squadSize={squadSize}
        target={targetPoints(gB, config)}
        isJoker={Boolean(gB?.is_joker)}
      />

      <RefereePicker
        members={roster}
        playing={teams.playing}
        value={referees}
        onToggle={(m) => setReferees((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m]))}
      />

      {update.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(update.error, '경기를 저장하지 못했습니다')}
        </p>
      )}

      {!teams.ready && (
        <p className="mt-10 rounded-2xl border border-dashed border-border-subtle p-4 text-center text-sm text-ink-3">
          양 팀의 조와 선수 {squadSize}명씩을 고르면 저장할 수 있습니다
        </p>
      )}
    </MatchEditorScreen>
  )
}
