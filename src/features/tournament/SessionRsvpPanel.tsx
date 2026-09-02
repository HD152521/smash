import { Check, X } from 'lucide-react'
import { useSetMyRsvp } from './queries'
import { countRsvp, groupRsvp, rsvpCountsText, rsvpErrorMessage, startsAtLabel } from '@/lib/rsvp'
import { cn } from '@/lib/utils'
import type { MemberSummary } from './api'
import type { RsvpStatus } from '@/types/database'

/**
 * 시작 전 모임 화면 — 시각 · 참가 인원 · 참가/불참 버튼 · 참가자 목록.
 *
 * 시작 시각이 지나면 이 화면은 사라지고 코트 현황이 그 자리에 온다. 두
 * 화면을 한 번에 보여주지 않는다 — 화요일 오후에 필요한 것은 "몇 명이
 * 오나"(코트를 몇 개 빌릴까) 하나뿐이고, 저녁에 필요한 것은 "지금 어느
 * 코트에서 치나" 하나뿐이다.
 *
 * 그래도 코트 현황으로 가는 길은 남겨 둔다. 시각을 잘못 넣은 모임에서
 * 아무것도 못 하는 화면에 갇히면 되돌릴 방법이 없다.
 */
export function SessionRsvpPanel({
  tournamentId,
  startsAt,
  members,
  me,
  onShowCourts,
}: {
  tournamentId: string
  startsAt: string | null
  members: MemberSummary[]
  /** 내 명단 행. 없으면 누를 주체가 없다 (RLS 상 거의 안 생기는 경우) */
  me: MemberSummary | undefined
  onShowCourts: () => void
}) {
  const setRsvp = useSetMyRsvp(tournamentId)
  const counts = countRsvp(members)
  const groups = groupRsvp(members)
  const timeLabel = startsAtLabel(startsAt)

  return (
    <>
      <section
        aria-labelledby="rsvp-heading"
        className="mt-5 rounded-2xl border border-border-subtle bg-surface-1 p-5"
      >
        <p className="text-sm font-semibold text-ink-2">모임 시각</p>
        <h2 id="rsvp-heading" className="mt-1 text-2xl font-black tracking-tight text-ink-1">
          {timeLabel ?? '시각 미정'}
        </h2>

        <p className="tabular mt-3 text-sm font-bold text-ink-1">{rsvpCountsText(counts)}</p>
        {counts.noAccount > 0 && (
          <p className="mt-1 text-xs text-ink-3">
            계정이 없는 명단만 {counts.noAccount}명은 스스로 누를 수 없습니다 — 미정에 넣지 않고
            따로 셉니다.
          </p>
        )}

        {me ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <RsvpButton
                value="going"
                current={me.rsvp}
                pending={setRsvp.isPending}
                onClick={() => setRsvp.mutate('going')}
              >
                <Check className="size-5" aria-hidden />
                참가할게요
              </RsvpButton>
              <RsvpButton
                value="declined"
                current={me.rsvp}
                pending={setRsvp.isPending}
                onClick={() => setRsvp.mutate('declined')}
              >
                <X className="size-5" aria-hidden />안 갈래요
              </RsvpButton>
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {me.rsvp === 'invited'
                ? '아직 안 눌렀습니다. 늦게 눌러도 되고, 눌렀다가 바꿔도 됩니다.'
                : '마음이 바뀌면 다시 누르면 됩니다. 늦게 도착해도 참가를 누를 수 있습니다.'}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-ink-2">
            이 모임 명단에 없어 참가를 누를 수 없습니다. 모임이 열린 뒤에 동아리에 들어왔다면 다음
            모임부터 보입니다.
          </p>
        )}

        {setRsvp.error && (
          <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
            {rsvpErrorMessage(setRsvp.error)}
          </p>
        )}
      </section>

      {/* ── 누가 온다는 건가 ─────────────────────────────────────── */}
      <section aria-label="참가자" className="mt-6">
        <h2 className="text-lg font-bold text-ink-1">참가 {counts.going}명</h2>
        {groups.going.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
            아직 아무도 안 눌렀습니다. 첫 번째로 눌러 보세요.
          </p>
        ) : (
          <NameList members={groups.going} tone="going" />
        )}

        {/*
          미정·불참은 접어 둔다. 모임장이 코트를 빌릴 때 세는 건 참가한
          사람이고, 나머지는 "누구한테 물어볼까" 를 찾을 때만 필요하다.
        */}
        {members.length > groups.going.length && (
          <details className="mt-4">
            <summary
              className="min-h-11 cursor-pointer list-none rounded-lg px-1 py-2 text-sm font-semibold
                         text-ink-2 transition-colors hover:text-ink-1
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              아직 안 온다고 한 사람 {members.length - groups.going.length}명 보기
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {groups.undecided.length > 0 && (
                <Bucket title={`미정 ${groups.undecided.length}명`} members={groups.undecided} />
              )}
              {groups.declined.length > 0 && (
                <Bucket title={`불참 ${groups.declined.length}명`} members={groups.declined} />
              )}
              {groups.noAccount.length > 0 && (
                <Bucket
                  title={`명단만 ${groups.noAccount.length}명`}
                  hint="계정이 없어 누를 수 없는 사람입니다. 경기에는 넣을 수 있습니다."
                  members={groups.noAccount}
                />
              )}
            </div>
          </details>
        )}
      </section>

      <button
        type="button"
        onClick={onShowCourts}
        className="mt-6 min-h-11 rounded-lg px-1 text-sm font-semibold text-ink-3 underline
                   underline-offset-2 transition-colors hover:text-ink-1
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        시작 전이지만 코트 현황 보기
      </button>
    </>
  )
}

/**
 * 참가/불참 한 짝.
 *
 * 지금 고른 쪽을 `aria-pressed` 로 알린다 — 색만으로 표시하면 스크린리더는
 * 두 버튼 중 어느 쪽이 내 답인지 읽어 줄 수 없다. 누르는 동안에도 비활성만
 * 하고 글자는 그대로 둔다. 서버가 멱등이라 한 번 더 눌려도 조용히 통과한다.
 */
function RsvpButton({
  value,
  current,
  pending,
  onClick,
  children,
}: {
  value: Extract<RsvpStatus, 'going' | 'declined'>
  current: RsvpStatus
  pending: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={pending}
      className={cn(
        'flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-4 font-black',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active && value === 'going' && 'border-brand-600 bg-brand-600 text-brand-ink',
        active && value === 'declined' && 'border-ink-3 bg-surface-2 text-ink-1',
        !active && 'border-border-subtle bg-surface-1 text-ink-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function Bucket({
  title,
  hint,
  members,
}: {
  title: string
  hint?: string
  members: MemberSummary[]
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-ink-2">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      <NameList members={members} tone="muted" />
    </div>
  )
}

function NameList({ members, tone }: { members: MemberSummary[]; tone: 'going' | 'muted' }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {members.map((m) => (
        <li
          key={m.id}
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-sm font-bold ring-1',
            tone === 'going'
              ? 'bg-surface-1 text-ink-1 ring-border-subtle'
              : 'bg-surface-2 text-ink-2 ring-transparent',
          )}
        >
          {m.displayName}
        </li>
      ))}
    </ul>
  )
}
