import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight, Check } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import {
  useCourts,
  useCreateSessionMatch,
  useMatches,
  useMembers,
  useTournament,
} from '@/features/tournament/queries'
import { isSession } from '@/lib/session'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'

/**
 * 모임 경기 짜기 — 조 대신 사람을 고른다.
 *
 * 대회 편성(MatchCreatePage)과 나눠 둔다. 저쪽은 조를 먼저 고르고 그 조에서
 * 선수를 고르는 두 단계인데, 모임에는 조가 없어서 그 단계 자체가 없다.
 *
 * 화면의 규칙 하나: **지금 뛰고 있는 사람은 고를 수 없다.** 코트에서 내려오지
 * 않은 사람을 다음 경기에 넣어 두면, 시작하려는 순간 서버가 거절하고
 * (한 코트 한 경기) 그때야 다시 짜게 된다. 고를 때 막는 게 낫다.
 */
export function SessionMatchCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const tournament = useTournament(id)
  const members = useMembers(id)
  const courts = useCourts(id)
  const matches = useMatches(id)
  const create = useCreateSessionMatch(id ?? '')

  const [picked, setPicked] = useState<string[]>([])
  const [courtId, setCourtId] = useState<string | null>(null)

  const squad = tournament.data?.config.format === 'singles' ? 1 : 2
  const need = squad * 2

  /*
   * 지금 코트에 있는 사람.
   *
   * 이름으로 맞춘다 — match_overview 가 내려주는 건 display_name 뿐이다.
   * 이 앱의 다른 곳(myMatchRole · 머리말의 심판 배지)도 같은 기준을 쓴다.
   * 같은 이름이 둘 있으면 둘 다 목록에서 빠진다. 모임 명단에서 동명이인은
   * '김철수(A)' 처럼 구분해 넣는 것이 맞다.
   */
  const playingNames = new Set(
    (matches.data ?? [])
      .filter((m) => m.status === 'live')
      .flatMap((m) => [...(m.players_a ?? []), ...(m.players_b ?? [])]),
  )

  const roster = (members.data ?? []).filter((m) => !playingNames.has(m.displayName))

  function toggle(memberId: string) {
    setPicked((prev) =>
      prev.includes(memberId)
        ? prev.filter((x) => x !== memberId)
        : prev.length >= need
          ? prev // 다 찼으면 더 안 받는다. 조용히 앞을 밀어내면 누가 빠졌는지 모른다
          : [...prev, memberId],
    )
  }

  /** 고른 순서대로 앞 절반이 A, 뒤 절반이 B */
  const teamA = picked.slice(0, squad)
  const teamB = picked.slice(squad, need)
  const ready = picked.length === need

  async function submit() {
    try {
      await create.mutateAsync({ courtId, playersA: teamA, playersB: teamB })
      navigate(`/t/${id}`)
    } catch {
      // create.error 로 화면에 뿌린다
    }
  }

  // 대회 경기는 편성 규칙이 다르다 (조 · 심판 · 조커). 그쪽 화면으로 보낸다.
  if (tournament.data && !isSession(tournament.data.kind)) {
    return <Navigate to={`/t/${id}/matches/new`} replace />
  }

  const nameOf = (memberId: string) =>
    members.data?.find((m) => m.id === memberId)?.displayName ?? '?'

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-32">
      <BackLink to={`/t/${id}`}>모임으로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">경기 짜기</h1>
      <p className="mt-2 text-sm text-ink-2">
        {need}명을 고르면 앞 {squad}명이 한 편, 뒤 {squad}명이 다른 편이 됩니다.
      </p>

      {/* 고른 사람을 대진 모양으로 먼저 보여준다 — 편이 어떻게 갈렸는지 */}
      <section
        aria-label="고른 사람"
        className="mt-5 rounded-2xl border border-border-subtle bg-surface-1 p-4"
      >
        <div className="flex items-center gap-3">
          <TeamSlot names={teamA.map(nameOf)} size={squad} />
          <ArrowLeftRight className="size-5 shrink-0 text-ink-3" aria-hidden />
          <TeamSlot names={teamB.map(nameOf)} size={squad} align="right" />
        </div>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => setPicked([])}
            className="mt-3 rounded-lg px-1 py-0.5 text-xs font-semibold text-ink-3 underline
                       underline-offset-2 transition-colors hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            다시 고르기
          </button>
        )}
      </section>

      {/* 코트 — 안 정해도 된다. 공용 대기에 두면 먼저 비는 코트가 집어간다 */}
      <section aria-label="코트" className="mt-6">
        <h2 className="text-sm font-semibold text-ink-2">코트</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={courtId === null} onClick={() => setCourtId(null)}>
            나중에 (공용 대기)
          </Chip>
          {(courts.data ?? []).map((c) => (
            <Chip key={c.id} active={courtId === c.id} onClick={() => setCourtId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </section>

      <section aria-label="참가자" className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-2">누가 칠까요</h2>
          <span className="tabular text-xs font-black text-ink-3">
            {picked.length} / {need}
          </span>
        </div>

        {roster.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
            고를 수 있는 사람이 없습니다. 전부 코트에 나가 있거나, 아직 아무도 안 들어왔습니다.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {roster.map((m) => (
              <li key={m.id}>
                <PersonButton
                  member={m}
                  order={picked.indexOf(m.id)}
                  squad={squad}
                  onClick={() => toggle(m.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {playingNames.size > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            지금 뛰고 있는 {playingNames.size}명은 목록에 없습니다.
          </p>
        )}
      </section>

      {create.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(create.error, '경기를 만들지 못했습니다')}
        </p>
      )}

      {/* 사람을 고르려면 목록을 내려야 한다. 버튼이 목록 끝에 있으면 못 찾는다 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-1/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            size="xl"
            className="w-full"
            loading={create.isPending}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {ready ? '경기 만들기' : `${need - picked.length}명 더 고르기`}
          </Button>
        </div>
      </div>
    </main>
  )
}

/** 한 편의 자리. 아직 안 고른 자리는 빈칸으로 남겨 몇 명이 필요한지 보인다 */
function TeamSlot({
  names,
  size,
  align = 'left',
}: {
  names: string[]
  size: number
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      {Array.from({ length: size }, (_, i) => (
        <p
          key={i}
          className={cn(
            'truncate font-bold',
            names[i] ? 'text-ink-1' : 'text-ink-3/50',
          )}
        >
          {names[i] ?? '비어 있음'}
        </p>
      ))}
    </div>
  )
}

function PersonButton({
  member,
  order,
  squad,
  onClick,
}: {
  member: MemberSummary
  /** 몇 번째로 골랐나. -1 이면 안 골랐다 */
  order: number
  squad: number
  onClick: () => void
}) {
  const picked = order >= 0
  // 앞쪽 절반은 A편, 뒤쪽은 B편. 색으로 어느 편인지 바로 보이게 한다
  const sideA = picked && order < squad

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={picked}
      className={cn(
        'flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-left',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        !picked && 'border-border-subtle bg-surface-1 hover:bg-surface-2',
        picked && sideA && 'border-team-a bg-team-a/10',
        picked && !sideA && 'border-team-b bg-team-b/10',
      )}
    >
      <span className="min-w-0 flex-1 truncate font-bold text-ink-1">{member.displayName}</span>
      {/* 앱에 안 들어온 사람(게스트·명단만)은 알림을 못 받는다 */}
      {!member.userId && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
          명단만
        </span>
      )}
      {picked && <Check className="size-4 shrink-0 text-brand-fg" aria-hidden />}
    </button>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-lg border px-3 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
