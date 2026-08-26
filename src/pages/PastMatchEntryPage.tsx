import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const manual = useRecordManualMatch(id ?? '')

  const config = tournament.data?.config
  const squadSize = config?.format === 'singles' ? 1 : 2

  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const teams = useMatchTeams({ squadSize })

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
        <>
          앱 없이 치른 경기의 결과만 넣습니다. 점수가 한 점씩 들어온 기록은 남지 않으므로
          <b className="text-ink-1"> 직접 입력</b>으로 표시됩니다.
        </>
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
