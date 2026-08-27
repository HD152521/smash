import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { ClubPicker } from '@/features/club/ClubPicker'
import { useStaffClubs } from '@/features/club/queries'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { useCreateSession, useProfileName } from '@/features/tournament/queries'
import { defaultSessionName } from '@/lib/session'
import { startsAtFromInput, startsAtLabel } from '@/lib/rsvp'
import { toUserMessage } from '@/lib/errors'

const MIN_COURTS = 1
const MAX_COURTS = 20

/**
 * 모임 열기.
 *
 * 대회 만들기와 나란히 두지 않고 화면을 따로 준다. 대회는 조 개수 · 조커 ·
 * 목표 점수를 정해야 시작할 수 있는데, 모임에서 물어야 할 것은 세 가지뿐이다 —
 * 이름과 코트 개수, 그리고 **언제 모이나**.
 *
 * 이름은 미리 채워 둔다. 매주 열면서 매번 이름을 지어내게 하면 목록에
 * '모임', '모임2' 가 쌓여서 어느 날인지 알 수 없게 된다.
 */
export function CreateSessionPage() {
  const navigate = useNavigate()
  const create = useCreateSession()
  const { data: profileName } = useProfileName()

  // 페이지를 여는 순간의 날짜로 한 번만 정한다. 매 렌더마다 new Date() 를
  // 부르면 자정을 넘기는 순간 입력칸이 사용자 앞에서 바뀐다.
  const [name, setName] = useState(() => defaultSessionName(new Date()))
  const [courtCount, setCourtCount] = useState(2)

  /*
   * 모임 시각. **빈 칸이 기본값이고, 빈 칸은 즉석 모임(NULL)이다.**
   *
   * 미리 채워 두지 않는다. 그럴듯한 시각(오늘 20:00 같은)을 넣어 두면
   * 그대로 두고 만든 사람이 "지금 모여서 치는 날" 을 열었다고 생각하는데
   * 화면은 저녁까지 참가 신청만 보여준다. 안 채운 칸은 안 채운 대로
   * 읽히는 게 낫다.
   */
  const [startsAtInput, setStartsAtInput] = useState('')
  const startsAt = startsAtFromInput(startsAtInput)
  const startsLabel = startsAtLabel(startsAt)

  // 소속 동아리 — 기본값은 '동아리 없음'. 판단은 CreateTournamentPage 와 같다.
  const [searchParams] = useSearchParams()
  const staffClubs = useStaffClubs()
  const [wantedClubId, setWantedClubId] = useState<string | null>(() => searchParams.get('club'))
  const clubId = staffClubs.some((c) => c.id === wantedClubId) ? wantedClubId : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const session = await create.mutateAsync({
        name: name.trim(),
        displayName: profileName ?? '모임장',
        courtCount,
        clubId,
        startsAt,
      })
      navigate(`/t/${session.id}`, { replace: true })
    } catch {
      // create.error 로 화면에 뿌린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 pt-6 pb-16">
      <BackBar to="/" label="메인으로" />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">모임 열기</h1>
      <p className="mt-2 text-sm text-ink-2">
        조도 순위도 없습니다. 누가 어느 코트에서 치고 있는지만 봅니다. 점수는 세고 싶은 경기에만
        넣으면 됩니다.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-7">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">모임 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">모임 시각</span>
          <input
            type="datetime-local"
            value={startsAtInput}
            onChange={(e) => setStartsAtInput(e.target.value)}
            className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          {/*
            비워 두면 어떻게 되는지를 만들기 전에 말해 준다. 만든 뒤에야
            "왜 참가 신청 화면이 안 뜨지" 를 알게 되면 되돌릴 길이 없다.
          */}
          {startsLabel ? (
            <span className="text-xs text-ink-3">
              {startsLabel} 에 시작합니다. 그전까지는 참가 신청 화면이 보이고, 시각이 지나면 코트
              현황으로 바뀝니다.
            </span>
          ) : (
            <span className="text-xs text-ink-3">
              <b className="font-bold text-ink-2">비워 두면 즉석 모임</b>으로 열립니다 — 참가 신청
              없이 곧바로 코트 현황이 보입니다.
            </span>
          )}
          {startsAtInput && (
            <button
              type="button"
              onClick={() => setStartsAtInput('')}
              className="min-h-11 self-start rounded-lg px-1 text-xs font-semibold text-ink-3
                         underline underline-offset-2 transition-colors hover:text-ink-1
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              시각 지우고 즉석 모임으로 열기
            </button>
          )}
        </label>

        <ClubPicker
          clubs={staffClubs}
          value={clubId}
          onChange={setWantedClubId}
          disabled={create.isPending}
        />

        <Stepper
          label="코트 개수"
          hint="나중에 관리에서 추가하거나 이름을 바꿀 수 있습니다"
          value={courtCount}
          min={MIN_COURTS}
          max={MAX_COURTS}
          onChange={setCourtCount}
        />

        <section aria-label="코트 미리보기">
          <p className="mb-2 text-sm font-semibold text-ink-2">이렇게 만들어집니다</p>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-surface-2 p-3">
            {Array.from({ length: courtCount }, (_, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-lg bg-surface-1 px-2.5 py-1.5 text-sm
                           font-bold text-ink-1 ring-1 ring-border-subtle"
              >
                {i + 1}번 코트
              </span>
            ))}
          </div>
        </section>

        {create.error && (
          <p role="alert" className="text-sm font-medium text-team-b-fg">
            {toUserMessage(create.error, '모임을 열지 못했습니다')}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          className="w-full"
          loading={create.isPending}
          disabled={!name.trim()}
        >
          모임 열기
        </Button>
      </form>
    </main>
  )
}
