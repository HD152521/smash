import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { useSetMyRsvp } from './queries'
import { useAutoJoin } from './useAutoJoin'
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
  const navigate = useNavigate()

  /*
   * 나간다고 눌렀으면 이 화면에 남아 있을 이유가 없다. 여기서 볼 것은
   * "몇 명 오나" 와 "누가 오나" 뿐인데, 안 가는 사람에게는 둘 다 남의
   * 일이다.
   *
   * `replace` 로 보낸다 — 밀어 넣으면 폰 뒤로가기가 방금 나온 모임으로
   * 도로 데려간다.
   */
  function leave() {
    setRsvp.mutate('declined', {
      onSuccess: () => navigate('/', { replace: true }),
    })
  }

  /*
   * 들어오면 참가로 표시한다. 바꾸는 것은 '미정' 하나뿐이고 한 번만
   * 시도한다 — 근거는 `useAutoJoin` 머리 주석에 있다.
   */
  useAutoJoin({
    rsvp: me?.rsvp,
    enabled: Boolean(me),
    onJoin: () => setRsvp.mutate('going'),
  })

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
          <MyRsvpLine
            rsvp={me.rsvp}
            pending={setRsvp.isPending}
            onGoing={() => setRsvp.mutate('going')}
            onDecline={leave}
          />
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
 * 내 참가 상태 한 줄.
 *
 * ── 큰 버튼 둘을 걷어낸 이유 ────────────────────────────────────────
 *
 * 전에는 `참가할게요` · `안 갈래요` 가 화면 폭을 반씩 차지하는 큰 버튼
 * 둘이었다. 그런데 **여기까지 들어온 사람은 대개 온다.** 모임 화면을
 * 일부러 열었다는 것 자체가 "간다" 는 뜻에 가깝다.
 *
 * 그래서 기본값을 뒤집는다 — 들어오면 **참가**이고, 못 오는 사람만
 * `모임 나가기` 를 누른다. 오는 사람은 아무것도 안 눌러도 되고, 화면은
 * 그만큼 조용해진다.
 *
 * ⚠ **자동으로 바꾸는 것은 '미정'(invited) 일 때뿐이다.** 이미 `불참`
 * 을 누른 사람을 다시 참가로 되돌리면, 그 사람이 화면을 볼 때마다
 * 자기가 누른 것이 뒤집힌다 — 앱이 자기 말을 안 듣는다고 읽는다.
 * 그 판단은 `useAutoJoin` 에 있다.
 *
 * ⚠ **조용히 바꾸지 않는다.** 서버에 쓰는 일을 사람이 모르면 안 되므로
 * 화면이 "참가로 표시했습니다" 라고 먼저 말한다.
 */
function MyRsvpLine({
  rsvp,
  pending,
  onGoing,
  onDecline,
}: {
  rsvp: RsvpStatus
  pending: boolean
  onGoing: () => void
  onDecline: () => void
}) {
  /*
   * 나가기를 누르면 화면을 떠나므로 이 분기는 **다시 들어온 사람**만 본다
   * (마음이 바뀌었거나, 주소를 다시 열었거나). 그래서 여기서 크게 말할
   * 것은 '다시 참가' 하나다.
   */
  if (rsvp === 'declined') {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm font-bold text-ink-2">안 간다고 표시했습니다</p>
        <button
          type="button"
          disabled={pending}
          onClick={onGoing}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4
                     text-sm font-bold text-brand-ink transition-transform active:scale-[0.98]
                     disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-brand-600"
        >
          <Check className="size-4" aria-hidden />
          다시 참가
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm font-bold text-ink-1">
        <Check className="mr-1 inline size-4 align-[-2px] text-brand-fg" aria-hidden />
        참가로 표시했습니다
      </p>
      {/*
        나가기는 조용한 버튼이다. 이 화면에 온 사람 대부분은 오는 사람이고,
        그 사람들 눈에 제일 크게 띄어야 할 것은 "몇 명 오나" 이지 나가는
        문이 아니다.
      */}
      <button
        type="button"
        disabled={pending}
        onClick={onDecline}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm
                   font-semibold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1
                   active:bg-surface-2 disabled:opacity-40 focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <X className="size-4" aria-hidden />
        모임 나가기
      </button>
    </div>
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
