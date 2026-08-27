import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { MatchEditorScreen } from '@/features/match/MatchEditorScreen'
import { MatchSubmitBar } from '@/features/match/MatchSubmitBar'
import { TeamSection } from '@/features/match/TeamSection'
import { targetPoints, useMatchTeams } from '@/features/match/useMatchTeams'
import {
  useGroups,
  useMembers,
  useRecordManualMatch,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { parseRematchPrefill, resolvePlayerIds } from '@/lib/rematch'

/**
 * 지난 결과 입력 — 앱 없이 이미 치른 경기의 **결과만** 남긴다.
 *
 * 편성과 쓰는 시점이 다르다. 편성은 대회 중에, 이 화면은 대회가 끝난 뒤
 * 정산할 때 연다. 그래서 코트도 심판도 여기 없다 — 이미 끝난 경기에
 * 코트를 물어볼 이유가 없고, 지금 와서 지정할 심판도 없다.
 *
 * 여기에 **코트·심판 칸을 들이지 말 것**. 그 둘이 필요하다는 건 아직 치르지
 * 않은 경기라는 뜻이고, 그건 `/matches/new` 가 받는 일이다.
 *
 * 원장(score_events)은 만들어지지 않는다. 한 점씩 들어온 게 아니라 결과만
 * 아는 것이라, 원장을 지어내면 감사 추적이 거짓말이 된다.
 */
export function PastMatchEntryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const manual = useRecordManualMatch(id ?? '')

  const config = tournament.data?.config
  const squadSize = config?.format === 'singles' ? 1 : 2

  /*
   * 무효 처리한 경기에서 왔다면 조·선수·점수가 이미 채워져 있다.
   * 값을 여기서 한 번 읽는다 — location.state 는 검증이 필요한 남의 입력이라
   * (히스토리 조작 등) `parseRematchPrefill` 을 거친다. 모양이 다르면
   * 조용히 빈 폼으로 취급한다.
   */
  const prefill = parseRematchPrefill(location.state)

  const [scoreA, setScoreA] = useState(prefill?.scoreA != null ? String(prefill.scoreA) : '')
  const [scoreB, setScoreB] = useState(prefill?.scoreB != null ? String(prefill.scoreB) : '')

  const teams = useMatchTeams({ squadSize })

  /*
   * 조·선수는 명단이 와야 이름을 id 로 되짚을 수 있다(MatchEditPage 와 같은
   * 판단). 명단이 오기 전에 채우면 선수 선택이 통째로 비어 버리고, 그 뒤로는
   * 다시 채울 계기가 없다.
   */
  const [prefillApplied, setPrefillApplied] = useState(false)
  if (prefill && members.data && !prefillApplied) {
    setPrefillApplied(true)
    teams.fill({
      groupA: prefill.groupA,
      groupB: prefill.groupB,
      playersA: resolvePlayerIds(prefill.playersANames, members.data),
      playersB: resolvePlayerIds(prefill.playersBNames, members.data),
    })
  }

  const groupList = groups.data ?? []
  const roster = members.data ?? []
  const gA = groupList.find((g) => g.id === teams.groupA)
  const gB = groupList.find((g) => g.id === teams.groupB)

  const nA = Number(scoreA)
  const nB = Number(scoreB)
  const scoresValid =
    scoreA !== '' &&
    scoreB !== '' &&
    Number.isInteger(nA) &&
    Number.isInteger(nB) &&
    nA >= 0 &&
    nB >= 0 &&
    nA !== nB
  const ready = teams.ready && scoresValid

  async function handleSubmit() {
    try {
      await manual.mutateAsync({
        groupA: teams.groupA,
        playersA: teams.playersA,
        scoreA: nA,
        groupB: teams.groupB,
        playersB: teams.playersB,
        scoreB: nB,
      })
      /*
       * 기록으로 보낸다.
       *
       * 편성과 달리 이 화면은 이미 벌어진 일을 옮겨 적는 일이다. 옮겨 적은
       * 것이 제대로 들어갔는지 눈으로 확인할 곳이 기록 화면이다.
       */
      navigate(`/t/${id}/records`)
    } catch {
      // manual.error 로 화면에 뿌린다
    }
  }

  return (
    <MatchEditorScreen
      tournamentId={id ?? ''}
      title="지난 결과 입력"
      description={
        prefill ? (
          <>
            무효 처리한 경기를 <b className="text-ink-1">다시 기록합니다</b>. 기존 경기를 고치는 게
            아니라 새 경기로 남습니다 — 조·선수·점수는 그대로 채워 뒀으니 바뀐 값만 고치세요.
          </>
        ) : (
          <>
            앱 없이 치른 경기의 결과만 넣습니다. 점수가 한 점씩 들어온 기록은 남지 않으므로
            <b className="text-ink-1"> 직접 입력</b>으로 표시됩니다.
          </>
        )
      }
      backTo={`/t/${id}/admin`}
      backLabel="관리로"
      pending={!config || !groups.data}
      bottomBar={
        ready && (
          <MatchSubmitBar
            groupA={gA}
            groupB={gB}
            targetA={targetPoints(gA, config)}
            targetB={targetPoints(gB, config)}
            label="결과 저장"
            loading={manual.isPending}
            onSubmit={() => void handleSubmit()}
          />
        )
      }
    >
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

      {/* 점수는 양 팀이 다 정해진 뒤에 묻는다 — 누구의 점수인지 이름으로 말해야 한다 */}
      {teams.ready && (
        <section aria-label="최종 점수" className="mt-8">
          <h2 className="text-sm font-semibold text-ink-2">최종 점수</h2>
          <div className="mt-2 flex items-center gap-3">
            <ScoreInput label={`${gA?.name ?? 'A팀'} 점수`} value={scoreA} onChange={setScoreA} />
            <span className="text-2xl font-black text-ink-3">:</span>
            <ScoreInput label={`${gB?.name ?? 'B팀'} 점수`} value={scoreB} onChange={setScoreB} />
          </div>
          {scoreA !== '' && scoreB !== '' && nA === nB && (
            <p className="mt-2 text-sm font-medium text-warn-fg">동점으로는 기록할 수 없습니다.</p>
          )}
        </section>
      )}

      {manual.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(manual.error, '경기를 저장하지 못했습니다')}
        </p>
      )}

      {!ready && (
        <p className="mt-10 rounded-2xl border border-dashed border-border-subtle p-4 text-center text-sm text-ink-3">
          양 팀의 조와 선수 {squadSize}명씩, 그리고 최종 점수를 입력하면 저장할 수 있습니다
        </p>
      )}
    </MatchEditorScreen>
  )
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex-1">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="tabular h-16 w-full rounded-2xl border-2 border-border-subtle bg-surface-1
                   text-center text-3xl font-black text-ink-1 outline-none
                   focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      />
    </label>
  )
}
