import { useState } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/useAuth'
import {
  useCourts,
  useCreateMatch,
  useGroups,
  useMembers,
  useRecordManualMatch,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow, TournamentConfig } from '@/types/database'

/**
 * 경기 편성 — 조 vs 조.
 *
 * 목표 점수와 승점은 여기서 보내지 않는다. 서버가 조의 is_joker 와
 * 대회 설정에서 계산해 스냅샷으로 굳힌다. 화면은 그 결과를 미리 보여줄 뿐이다.
 */
export function MatchCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const courts = useCourts(id)
  const create = useCreateMatch(id ?? '')
  const manual = useRecordManualMatch(id ?? '')

  /**
   * 두 가지 일을 한 화면에서 한다:
   *   schedule — 앞으로 할 경기를 코트에 올린다
   *   manual   — 앱 없이 이미 치른 경기의 결과만 넣는다
   * 선수 고르는 절차가 똑같아서 화면을 나누면 같은 코드가 두 벌이 된다.
   */
  const [mode, setMode] = useState<'schedule' | 'manual'>('schedule')
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  /**
   * 대진표의 빈 칸에서 넘어오면 두 조가 이미 정해져 있다 (?a=&b=).
   * 첫 렌더에서 한 번만 읽는다 — 이후 사용자가 바꾼 선택을 주소가 되돌리면 안 된다.
   * 없는 조 id 가 들어와도 그 조의 선수 목록이 비어 편성 자체가 막히므로 따로 막지 않는다.
   */
  const [searchParams] = useSearchParams()
  const [courtId, setCourtId] = useState<string>('')
  const [groupA, setGroupA] = useState<string>(() => searchParams.get('a') ?? '')
  const [groupB, setGroupB] = useState<string>(() => searchParams.get('b') ?? '')
  const [playersA, setPlayersA] = useState<string[]>([])
  const [playersB, setPlayersB] = useState<string[]>([])
  const [referees, setReferees] = useState<string[]>([])

  if (members.data && !isAdmin) return <Navigate to={`/t/${id}`} replace />

  if (!tournament.data || !groups.data || !members.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const config = tournament.data.config as TournamentConfig
  const squadSize = config.format === 'singles' ? 1 : 2

  const gA = groups.data.find((g) => g.id === groupA)
  const gB = groups.data.find((g) => g.id === groupB)
  const targetA = gA?.is_joker ? config.jokerPoints : config.normalPoints
  const targetB = gB?.is_joker ? config.jokerPoints : config.normalPoints

  const playing = new Set([...playersA, ...playersB])
  const teamsReady =
    Boolean(groupA) &&
    Boolean(groupB) &&
    groupA !== groupB &&
    playersA.length === squadSize &&
    playersB.length === squadSize
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
  const ready = mode === 'schedule' ? teamsReady : teamsReady && scoresValid

  function togglePlayer(side: 'A' | 'B', memberId: string) {
    const [list, setList] = side === 'A' ? [playersA, setPlayersA] : [playersB, setPlayersB]
    const next = list.includes(memberId)
      ? list.filter((x) => x !== memberId)
      : // 정원을 넘기면 가장 오래된 선택을 밀어낸다 — 해제 후 재선택을 강요하지 않는다
        [...list, memberId].slice(-squadSize)
    ;(setList as (v: string[]) => void)(next)
    // 뛰는 사람은 그 경기 심판을 볼 수 없다 (서버도 거부한다)
    setReferees((r) => r.filter((x) => !next.includes(x)))
  }

  async function handleSubmit() {
    try {
      if (mode === 'schedule') {
        await create.mutateAsync({
          courtId: courtId || null,
          groupA,
          playersA,
          groupB,
          playersB,
          referees,
        })
      } else {
        await manual.mutateAsync({
          groupA,
          playersA,
          scoreA: nA,
          groupB,
          playersB,
          scoreB: nB,
        })
      }
      navigate(`/t/${id}`, { replace: true })
    } catch {
      // mutation.error 로 화면에 뿌린다
    }
  }

  return (
    <main className={cn('mx-auto w-full max-w-2xl px-5 pt-6', ready ? 'pb-40' : 'pb-16')}>
      <BackLink to={`/t/${id}/admin`}>관리로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">
        {mode === 'schedule' ? '경기 편성' : '지난 결과 입력'}
      </h1>

      <div
        role="group"
        aria-label="편성 방식"
        className="mt-4 flex rounded-xl border border-border-subtle p-1"
      >
        {(['schedule', 'manual'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            aria-pressed={mode === v}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-bold transition-colors',
              mode === v ? 'bg-brand-600 text-white' : 'text-ink-2 hover:text-ink-1',
            )}
          >
            {v === 'schedule' ? '앞으로 할 경기' : '이미 끝난 경기'}
          </button>
        ))}
      </div>

      {mode === 'manual' && (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-ink-2">
          앱 없이 치른 경기의 결과만 넣습니다. 점수가 한 점씩 들어온 기록은 남지 않으므로
          <b className="text-ink-1"> 직접 입력</b>으로 표시됩니다.
        </p>
      )}

      {/* 코트 */}
      <section className={cn('mt-8', mode === 'manual' && 'hidden')}>
        <h2 className="text-sm font-semibold text-ink-2">
          코트 <span className="font-normal text-ink-3">(나중에 정해도 됩니다)</span>
        </h2>
        {/* 코트를 안 정하면 대진표의 '코트 미배정' 에 모인다.
            비는 코트를 보고 그때 배정하는 게 실제 운영 순서다. */}
        <p className="mt-1 text-sm text-ink-3">
          지금 고르지 않고 넘어가도 됩니다. 대진표에서 비는 코트를 보고 배정할 수 있고, 선수와
          심판에게는 코트가 정해지는 순간 알림이 갑니다.
        </p>
        {courts.data && courts.data.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.data.map((c) => (
              <Chip
                key={c.id}
                active={courtId === c.id}
                onClick={() => setCourtId(c.id === courtId ? '' : c.id)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-3">
            등록된 코트가 없습니다. 코트 없이도 편성할 수 있습니다.
          </p>
        )}
      </section>

      {/* A / B 팀 */}
      <TeamSection
        side="A"
        label="A팀"
        groups={groups.data}
        members={members.data}
        selectedGroup={groupA}
        disabledGroup={groupB}
        onSelectGroup={(g) => {
          setGroupA(g)
          setPlayersA([])
        }}
        selectedPlayers={playersA}
        onTogglePlayer={(m) => togglePlayer('A', m)}
        squadSize={squadSize}
        target={targetA}
        isJoker={Boolean(gA?.is_joker)}
      />

      <TeamSection
        side="B"
        label="B팀"
        groups={groups.data}
        members={members.data}
        selectedGroup={groupB}
        disabledGroup={groupA}
        onSelectGroup={(g) => {
          setGroupB(g)
          setPlayersB([])
        }}
        selectedPlayers={playersB}
        onTogglePlayer={(m) => togglePlayer('B', m)}
        squadSize={squadSize}
        target={targetB}
        isJoker={Boolean(gB?.is_joker)}
      />

      {/* 점수 (지난 결과 입력) */}
      {mode === 'manual' && teamsReady && (
        <section className="mt-8">
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

      {/* 심판 */}
      <section className={cn('mt-8', mode === 'manual' && 'hidden')}>
        <h2 className="text-sm font-semibold text-ink-2">
          심판 <span className="font-normal text-ink-3">(선택 · 점수를 기록할 사람)</span>
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {members.data
            .filter((m) => !playing.has(m.id))
            .map((m) => (
              <Chip
                key={m.id}
                active={referees.includes(m.id)}
                onClick={() =>
                  setReferees((r) =>
                    r.includes(m.id) ? r.filter((x) => x !== m.id) : [...r, m.id],
                  )
                }
              >
                {m.displayName}
              </Chip>
            ))}
        </div>
        {referees.length === 0 && (
          <p className="mt-2 text-xs text-ink-3">
            심판을 지정하지 않으면 관리자만 점수를 기록할 수 있습니다.
          </p>
        )}
      </section>

      {(create.error || manual.error) && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(create.error ?? manual.error, '경기를 저장하지 못했습니다')}
        </p>
      )}

      {/*
        요약 바는 편성이 끝났을 때만 띄운다.
        항상 띄워 두면 폰에서 화면 아래 90px 을 계속 가려서, 그 자리에 온
        조·선수 버튼을 눌러도 바가 대신 먹는다 (히트 테스트로 확인함).
        선택 중에는 바에 보여줄 쓸모 있는 정보도 없다.
      */}
      {!ready && (
        <p className="mt-10 rounded-2xl border border-dashed border-border-subtle p-4 text-center text-sm text-ink-3">
          양 팀의 조와 선수 {squadSize}명씩
          {mode === 'manual' ? ', 그리고 최종 점수를' : '을'} 입력하면 저장할 수 있습니다
        </p>
      )}

      {ready && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-0/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            <p className="tabular min-w-0 flex-1 truncate text-sm text-ink-2">
              <b className="text-ink-1">{gA?.name}</b>
              {gA?.is_joker && ' 🃏'} {targetA}점<span className="mx-1.5 text-ink-3">vs</span>
              <b className="text-ink-1">{gB?.name}</b>
              {gB?.is_joker && ' 🃏'} {targetB}점
            </p>
            <Button
              size="lg"
              loading={create.isPending || manual.isPending}
              onClick={() => void handleSubmit()}
            >
              {mode === 'schedule' ? '경기 만들기' : '결과 저장'}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

interface TeamSectionProps {
  side: 'A' | 'B'
  label: string
  groups: GroupRow[]
  members: MemberSummary[]
  selectedGroup: string
  disabledGroup: string
  onSelectGroup: (groupId: string) => void
  selectedPlayers: string[]
  onTogglePlayer: (memberId: string) => void
  squadSize: number
  target: number
  isJoker: boolean
}

function TeamSection({
  side,
  label,
  groups,
  members,
  selectedGroup,
  disabledGroup,
  onSelectGroup,
  selectedPlayers,
  onTogglePlayer,
  squadSize,
  target,
  isJoker,
}: TeamSectionProps) {
  const roster = members.filter((m) => m.groupId === selectedGroup)

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink-2">
          <span className={cn('font-black', side === 'A' ? 'text-team-a' : 'text-team-b-fg')}>
            {label}
          </span>
        </h2>
        {selectedGroup && (
          <span className="tabular text-xs font-bold text-ink-3">
            {isJoker && '🃏 '}
            목표 {target}점
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {groups.map((g) => (
          <Chip
            key={g.id}
            active={selectedGroup === g.id}
            disabled={disabledGroup === g.id}
            onClick={() => onSelectGroup(g.id)}
          >
            {g.name}
            {g.is_joker && ' 🃏'}
          </Chip>
        ))}
      </div>

      {selectedGroup && (
        <>
          <p className="mt-3 text-xs text-ink-3">
            {selectedPlayers.length} / {squadSize}명 선택
          </p>
          {roster.length === 0 ? (
            <p className="mt-2 text-sm text-warn-fg">이 조에 배정된 참가자가 없습니다.</p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roster.map((m) => {
                const on = selectedPlayers.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onTogglePlayer(m.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition-colors',
                      on
                        ? side === 'A'
                          ? 'border-team-a bg-team-a-soft text-ink-1'
                          : 'border-team-b bg-team-b-soft text-ink-1'
                        : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Chip({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:opacity-30',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
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
