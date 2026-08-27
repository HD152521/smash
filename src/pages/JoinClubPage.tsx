import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { Button } from '@/components/ui/Button'
import { useJoinClub } from '@/features/club/queries'
import { useProfileName } from '@/features/tournament/queries'
import {
  CODE_LENGTH,
  hasConfusableChar,
  isCompleteCode,
  normalizeCode,
} from '@/features/tournament/inviteCode'
import { toUserMessage } from '@/lib/errors'

/**
 * 동아리 코드로 들어오기.
 *
 * `JoinTournamentPage` 와 화면이 거의 같지만 **일부러 따로 둔다.** 초대 코드가
 * 동아리·대회 두 종류가 됐고 둘 다 같은 모양의 6자리라, 한 칸에서 둘 다 받으면
 * 어느 쪽에 들어가는지 누르기 전에 알 수 없다. 들어갈 곳이 다르면 화면도 다르다.
 *
 * 대신 잘못 찾아온 사람을 위해 반대쪽으로 가는 길을 아래에 남긴다.
 */
export function JoinClubPage() {
  const navigate = useNavigate()
  const join = useJoinClub()
  const { data: profileName } = useProfileName()

  const [raw, setRaw] = useState('')
  const [displayName, setDisplayName] = useState('')
  const code = normalizeCode(raw)
  const showConfusableHint = hasConfusableChar(raw)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isCompleteCode(code)) return
    try {
      const club = await join.mutateAsync({
        code,
        displayName: displayName.trim() || profileName || undefined,
      })
      navigate(`/c/${club.id}`, { replace: true })
    } catch {
      // 오류는 join.error 로 화면에 뿌린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-6 pb-16">
      <BackBar to="/clubs" label="내 동아리" />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">동아리 들어가기</h1>
      <p className="mt-2 text-sm text-ink-2">
        운영진에게 받은 <b>동아리 코드</b> {CODE_LENGTH}자리를 입력하세요.
      </p>

      <form onSubmit={handleSubmit} className="mt-8">
        <label className="block">
          <span className="sr-only">동아리 코드</span>
          <input
            value={code}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-label="동아리 코드"
            placeholder="XXXXXX"
            className="tabular w-full rounded-2xl border-2 border-border-subtle bg-surface-1
                       py-5 text-center text-4xl font-black tracking-[0.3em] text-ink-1
                       uppercase outline-none transition-colors placeholder:text-ink-3/40
                       focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </label>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className={code.length === CODE_LENGTH ? 'text-brand-fg' : 'text-ink-3'}>
            {code.length} / {CODE_LENGTH}
          </span>
          {showConfusableHint && (
            <span className="text-warn-fg">
              코드에 <b>I · L · O · 0 · 1</b> 은 쓰이지 않습니다
            </span>
          )}
        </div>

        <details className="mt-6 group">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink-2 hover:text-ink-1">
            동아리에서 쓸 이름 바꾸기
            {profileName && <span className="ml-1 text-ink-3">(현재: {profileName})</span>}
          </summary>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={profileName ?? '이름'}
            maxLength={20}
            className="mt-2 h-11 w-full rounded-xl border border-border-subtle bg-surface-1 px-3.5
                       text-ink-1 outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          <p className="mt-1.5 text-xs text-ink-3">
            동아리 밑에 열리는 대회의 명단에 이 이름으로 들어갑니다.
          </p>
        </details>

        {/*
          문구는 전부 `lib/club.ts` 의 parseJoinResult 에서 온다.
          여기서 다시 만들지 않는다 — 특히 '너무 많이 입력했습니다' 는 동아리
          코드만 세는 게 아니라 대회 코드 실패까지 함께 세는 카운터라
          (`join_attempts` 를 두 코드가 공유한다), '동아리 코드를 10번' 이라고
          적으면 대회 코드를 틀려서 막힌 사람이 영문을 모르게 된다.
        */}
        {join.error && (
          <p role="alert" className="mt-5 text-sm font-medium text-team-b-fg">
            {toUserMessage(join.error, '동아리에 들어가지 못했습니다')}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          className="mt-6 w-full"
          loading={join.isPending}
          disabled={!isCompleteCode(code)}
        >
          들어가기
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-3">
        대회 초대 코드를 받으셨다면{' '}
        <Link
          to="/join"
          className="font-semibold text-brand-fg underline underline-offset-2
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          대회 참가
        </Link>
        로 가세요.
      </p>
    </main>
  )
}
