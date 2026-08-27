import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight, X } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import {
  useCourts,
  useCreateSessionMatch,
  useMatches,
  useMembers,
  useTournament,
} from '@/features/tournament/queries'
import { hasAccountContrast, partitionGoing } from '@/lib/rsvp'
import { removePick, splitTeams, togglePick } from '@/lib/matchPicker'
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
 * 화면의 규칙 둘.
 *
 *  1. **지금 뛰고 있는 사람은 고를 수 없다.** 코트에서 내려오지 않은 사람을
 *     다음 경기에 넣어 두면, 시작하려는 순간 서버가 거절하고(한 코트 한 경기)
 *     그때야 다시 짜게 된다. 고를 때 막는 게 낫다.
 *  2. **참가를 누른 사람이 먼저 온다.** 그날 온 사람이 대개 그 사람들이라
 *     스무 명 명단에서 매번 찾아 내려가지 않게 된다. 하지만 참가는
 *     **게이트가 아니다** — 불참·미응답도 그대로 펼쳐 두고 고를 수 있다.
 *     누르지 않으면 못 치게 하는 앱은 동아리에서 미움받는다.
 *
 * 참가자 목록은 **기본이 펼침**이다. 접는 건 예외지 규칙이 아니다 — 아무도
 * 참가를 안 눌렀는데 전원이 숨어 있으면 경기를 짜려고 매번 한 번 더 눌러야
 * 한다. 고른 사람은 하단 고정 바에 편이 갈린 모양으로 계속 보이고, 거기서
 * 바로 뺄 수 있다(타다 패턴 — `docs/design.md`).
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

  /*
   * 참가한 사람 / 그 외.
   *
   * 둘 다 항상 펼쳐서 보여준다 — 각 그룹 안에서는 서버가 이름순으로 내려준
   * 순서를 그대로 쓴다.
   */
  const { going, others } = partitionGoing(roster)

  function toggle(memberId: string) {
    setPicked((prev) => togglePick(prev, memberId, need))
  }

  function remove(memberId: string) {
    setPicked((prev) => removePick(prev, memberId))
  }

  const { teamA, teamB, ready } = splitTeams(picked, squad)

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

  const selectedCourt = courtId ? (courts.data ?? []).find((c) => c.id === courtId) : undefined
  const courtLabel = selectedCourt?.name ?? '나중에'

  // '명단만' 배지는 계정 있는 사람과 없는 사람이 섞여 있을 때만 뜻이 산다 —
  // 참가/그 외 각 목록 안에서 따로 판단한다 (`hasAccountContrast`)
  const showGoingBadge = hasAccountContrast(going)
  const showOthersBadge = hasAccountContrast(others)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-44">
      <BackLink to={`/t/${id}`}>모임으로</BackLink>

      {/*
        코트는 예외적으로만 건드린다 — 안 정해도 된다. 공용 대기에 두면
        먼저 비는 코트가 집어간다. 그래서 두 줄짜리 칩 그리드 대신 한 줄
        요약("코트: 나중에 ▾")만 두고 접어 둔다. (참가자와 반대: 참가자는
        매번 골라야 하니 펼치고, 코트는 대개 안 건드리니 접는다.)
        *
        아래쪽 대신 여기(맨 위)에 둔 이유: 하단에는 이미 고정 바가 화면의
        일부를 차지한다. 참가자가 적은 모임에서는 본문 전체 높이가 뷰포트보다
        살짝만 크거나 작아지는데, 그 경계에서 아래쪽 요소가 스크롤 없이는
        고정 바 뒤에 완전히 가려 버린다(실측으로 확인함). 맨 위, 참가자
        목록보다 먼저 오는 한 줄이면 목록 길이와 상관없이 항상 보인다.
      */}
      <section aria-label="코트" className="mt-5">
        <details>
          <summary
            className="min-h-11 w-fit cursor-pointer list-none rounded-lg px-1 py-2 text-sm
                       font-semibold text-ink-2 transition-colors hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            코트: {courtLabel} <span aria-hidden>▾</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-2 px-1">
            <Chip active={courtId === null} onClick={() => setCourtId(null)}>
              나중에 (공용 대기)
            </Chip>
            {(courts.data ?? []).map((c) => (
              <Chip key={c.id} active={courtId === c.id} onClick={() => setCourtId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </details>
      </section>

      {/*
        사람 고르기가 본 작업이다. 코트 한 줄 다음에 바로 이름이 와야
        스크롤 없이 보인다.
      */}
      <section aria-label="참가자" className="mt-4">
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
          <>
            {going.length > 0 && (
              <>
                <p className="mt-3 text-xs font-bold text-ink-3">참가 {going.length}명</p>
                <PersonGrid
                  members={going}
                  picked={picked}
                  squad={squad}
                  showAccountBadge={showGoingBadge}
                  onToggle={toggle}
                />
              </>
            )}

            {others.length > 0 && (
              <>
                <div
                  className={cn(
                    'flex items-center gap-2 text-xs font-bold text-ink-3',
                    going.length > 0 ? 'mt-5 border-t border-border-subtle pt-4' : 'mt-3',
                  )}
                >
                  <span>그 외 {others.length}명</span>
                  <span className="font-normal text-ink-3/80">
                    · 참가를 안 눌렀어도 고를 수 있습니다
                  </span>
                </div>
                <PersonGrid
                  members={others}
                  picked={picked}
                  squad={squad}
                  showAccountBadge={showOthersBadge}
                  onToggle={toggle}
                />
              </>
            )}
          </>
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

      {/*
        고른 사람을 대진 모양으로 하단에 고정한다 — 목록을 아무리 내려도
        지금까지 고른 편이 그대로 보이고, 잘못 골랐으면 여기서 바로 뺀다.
        제출 버튼도 같은 자리라 엄지 한 번으로 끝난다.
      */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-1/95 px-4 pt-3 pb-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <PickedBar teamA={teamA} teamB={teamB} squad={squad} nameOf={nameOf} onRemove={remove} />
          <Button
            size="xl"
            className="mt-2 w-full"
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

/** 고를 사람 묶음 하나. 참가한 사람과 그 외를 같은 모양으로 그린다 */
function PersonGrid({
  members,
  picked,
  squad,
  showAccountBadge,
  onToggle,
}: {
  members: MemberSummary[]
  picked: string[]
  squad: number
  /** 이 묶음 안에 계정 있는 사람과 없는 사람이 섞여 있을 때만 true (`hasAccountContrast`) */
  showAccountBadge: boolean
  onToggle: (memberId: string) => void
}) {
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {members.map((m) => (
        <li key={m.id}>
          <PersonButton
            member={m}
            order={picked.indexOf(m.id)}
            squad={squad}
            showAccountBadge={showAccountBadge}
            onClick={() => onToggle(m.id)}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * 하단 고정 바의 대진 요약 — 고른 사람은 이름 칩, 안 고른 자리는 번호만.
 *
 * 빈 자리에 "비어 있음" 을 매번 적지 않는다 — 점선 자체가 이미 빈 칸이라고
 * 말하고 있어서 네 칸 모두 같은 글자를 반복하면 잡음만 는다. 대신 번호
 * (1 2 │ 3 4) 를 넣는다 — "앞 둘이 한 편" 규칙이 숫자만으로도 보인다.
 * 고른 사람은 눌러서 바로 뺄 수 있다 — 잘못 고른 사람을 다시 목록까지
 * 스크롤해 찾지 않아도 된다.
 */
function PickedBar({
  teamA,
  teamB,
  squad,
  nameOf,
  onRemove,
}: {
  teamA: string[]
  teamB: string[]
  squad: number
  nameOf: (memberId: string) => string
  onRemove: (memberId: string) => void
}) {
  return (
    <div aria-label="고른 사람" className="flex items-center gap-2">
      <PickedSlots
        ids={teamA}
        squad={squad}
        side="a"
        numberFrom={1}
        nameOf={nameOf}
        onRemove={onRemove}
      />
      <ArrowLeftRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      <PickedSlots
        ids={teamB}
        squad={squad}
        side="b"
        align="right"
        numberFrom={squad + 1}
        nameOf={nameOf}
        onRemove={onRemove}
      />
    </div>
  )
}

function PickedSlots({
  ids,
  squad,
  side,
  align = 'left',
  numberFrom,
  nameOf,
  onRemove,
}: {
  ids: string[]
  squad: number
  side: 'a' | 'b'
  align?: 'left' | 'right'
  /** 이 팀의 첫 자리가 전체에서 몇 번째인가 (A팀 1, B팀 squad+1) */
  numberFrom: number
  nameOf: (memberId: string) => string
  onRemove: (memberId: string) => void
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-1 items-center gap-1.5', align === 'right' && 'justify-end')}
    >
      {Array.from({ length: squad }, (_, i) => {
        const memberId = ids[i]
        const slotNumber = numberFrom + i
        if (!memberId) {
          return (
            <span
              key={i}
              aria-label={`${slotNumber}번 자리 — 비어 있음`}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-xs font-bold',
                side === 'a'
                  ? 'border-team-a/40 text-team-a/60'
                  : 'border-team-b/40 text-team-b/60',
              )}
            >
              {slotNumber}
            </span>
          )
        }
        return (
          <button
            key={memberId}
            type="button"
            onClick={() => onRemove(memberId)}
            aria-label={`${nameOf(memberId)} 빼기`}
            className={cn(
              'flex h-11 min-w-0 items-center gap-1 rounded-lg border pl-2.5 pr-2 text-xs font-bold',
              'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              side === 'a'
                ? 'border-team-a bg-team-a/10 text-team-a hover:bg-team-a/15'
                : 'border-team-b bg-team-b/10 text-team-b hover:bg-team-b/15',
            )}
          >
            <span className="max-w-24 truncate">{nameOf(memberId)}</span>
            <X className="size-3.5 shrink-0" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function PersonButton({
  member,
  order,
  squad,
  showAccountBadge,
  onClick,
}: {
  member: MemberSummary
  /** 몇 번째로 골랐나. -1 이면 안 골랐다 */
  order: number
  squad: number
  /** 이 목록 안에 계정 있는 사람도 섞여 있을 때만 true — 아니면 배지가 아무 정보도 안 준다 */
  showAccountBadge: boolean
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
      {/* 앱에 안 들어온 사람(게스트·명단만)은 알림을 못 받는다 — 이 목록이 섞여 있을 때만 말해 준다 */}
      {showAccountBadge && !member.userId && (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">
          명단만
        </span>
      )}
      {picked && (
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white',
            sideA ? 'bg-team-a' : 'bg-team-b',
          )}
        >
          {order + 1}
        </span>
      )}
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
