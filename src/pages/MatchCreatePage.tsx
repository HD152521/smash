import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CourtPicker } from '@/features/match/CourtPicker'
import { MatchEditorScreen } from '@/features/match/MatchEditorScreen'
import { MatchSubmitBar } from '@/features/match/MatchSubmitBar'
import { RefereePicker } from '@/features/match/RefereePicker'
import { TeamSection } from '@/features/match/TeamSection'
import { targetPoints, useMatchTeams } from '@/features/match/useMatchTeams'
import {
  useCourts,
  useCreateMatch,
  useGroups,
  useMembers,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 경기 편성 — 앞으로 할 경기를 코트에 올린다. 그것 하나만 한다.
 *
 * 목표 점수와 승점은 여기서 보내지 않는다. 서버가 조의 is_joker 와
 * 대회 설정에서 계산해 스냅샷으로 굳힌다. 화면은 그 결과를 미리 보여줄 뿐이다.
 *
 * 여기에 **점수 칸을 들이지 말 것**. 아직 치르지 않은 경기라 넣을 점수가
 * 없다. 이미 치른 경기의 결과는 `/matches/record`, 이미 편성한 경기를
 * 고치는 일은 `/matches/:matchId/edit` 이 받는다. 셋을 한 화면에 토글로
 * 겹쳐 놨던 적이 있는데, 다음 판을 급히 짜러 온 운영자가 '이미 끝난 경기'
 * 가 눌린 채로 들어와 코트 칸을 못 찾았다.
 */
export function MatchCreatePage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const courts = useCourts(id)
  const create = useCreateMatch(id ?? '')

  const config = tournament.data?.config
  const squadSize = config?.format === 'singles' ? 1 : 2

  const [courtId, setCourtId] = useState('')
  const [referees, setReferees] = useState<string[]>([])
  /** 저장한 횟수. 화면에 머무르므로 '저장됐다' 를 눈에 보이게 알려야 한다 */
  const [justSaved, setJustSaved] = useState(0)

  /*
   * 대진표의 빈 칸에서 넘어오면 두 조가 이미 정해져 있다 (?a=&b=).
   * 첫 렌더에서 한 번만 읽는다 — 이후 사용자가 바꾼 선택을 주소가 되돌리면 안 된다.
   * 없는 조 id 가 들어와도 그 조의 선수 목록이 비어 편성 자체가 막히므로 따로 막지 않는다.
   */
  const teams = useMatchTeams({
    squadSize,
    initial: { groupA: searchParams.get('a') ?? '', groupB: searchParams.get('b') ?? '' },
    // 뛰는 사람은 그 경기 심판을 볼 수 없다 (서버도 거부한다)
    onPlayersChange: (picked) => setReferees((r) => r.filter((x) => !picked.includes(x))),
  })

  const groupList = groups.data ?? []
  const roster = members.data ?? []
  const gA = groupList.find((g) => g.id === teams.groupA)
  const gB = groupList.find((g) => g.id === teams.groupB)

  async function handleSubmit() {
    try {
      await create.mutateAsync({
        courtId: courtId || null,
        groupA: teams.groupA,
        playersA: teams.playersA,
        groupB: teams.groupB,
        playersB: teams.playersB,
        referees,
      })
      /*
       * 화면을 떠나지 않는다.
       *
       * 대회 준비는 한 판만 짜고 끝나지 않는다. 저장할 때마다 대회 홈으로
       * 튕기면 다시 관리 → 편성으로 두 번 들어와야 다음 경기를 짠다.
       * 대신 방금 넣은 값을 지워 다음 편성을 바로 시작할 수 있게 한다.
       *
       * 코트는 남긴다 — 같은 코트에 여러 경기를 줄 세우는 일이 잦다.
       */
      teams.clear()
      setReferees([])
      setJustSaved((n) => n + 1)
    } catch {
      // create.error 로 화면에 뿌린다
    }
  }

  return (
    <MatchEditorScreen
      tournamentId={id ?? ''}
      title="경기 편성"
      backTo={`/t/${id}/admin`}
      backLabel="관리로"
      // 편성을 반복하면 히스토리가 이 화면으로 쌓인다. 부모를 못 박는다.
      fixedBack
      pending={!config || !groups.data}
      bottomBar={
        teams.ready && (
          <MatchSubmitBar
            groupA={gA}
            groupB={gB}
            targetA={targetPoints(gA, config)}
            targetB={targetPoints(gB, config)}
            label="경기 만들기"
            loading={create.isPending}
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

      {/* 화면에 그대로 머무르므로 저장됐다는 걸 눈에 보이게 알려야 한다.
          안 그러면 저장이 됐는지 몰라 같은 경기를 두 번 넣는다. */}
      {justSaved > 0 && !create.error && (
        <p role="status" className="mt-6 text-sm font-semibold text-ok-fg">
          저장했습니다 · 이번에 {justSaved}경기 편성 — 이어서 다음 경기를 짜세요
        </p>
      )}

      {create.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(create.error, '경기를 저장하지 못했습니다')}
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
