import { useState, type FormEvent } from 'react'
import { BackBar } from '@/components/ui/BackBar'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useJoinTournament, useProfileName } from '@/features/tournament/queries'
import {
  CODE_LENGTH,
  hasConfusableChar,
  isCompleteCode,
  normalizeCode,
} from '@/features/tournament/inviteCode'
import { toUserMessage } from '@/lib/errors'

export function JoinTournamentPage() {
  const navigate = useNavigate()
  const join = useJoinTournament()
  const { data: profileName } = useProfileName()

  const [raw, setRaw] = useState('')
  const [displayName, setDisplayName] = useState('')
  const code = normalizeCode(raw)
  const showConfusableHint = hasConfusableChar(raw)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isCompleteCode(code)) return
    try {
      const tournament = await join.mutateAsync({
        code,
        displayName: displayName.trim() || profileName || undefined,
      })
      navigate(`/t/${tournament.id}`, { replace: true })
    } catch {
      // 오류는 mutation.error 로 화면에 뿌린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-6 pb-16">
      <BackBar to="/" label="메인으로" />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">대회 참가</h1>
      <p className="mt-2 text-sm text-ink-2">
        주최자에게 받은 {CODE_LENGTH}자리 코드를 입력하세요.
      </p>

      <form onSubmit={handleSubmit} className="mt-8">
        <label className="block">
          <span className="sr-only">초대 코드</span>
          <input
            value={code}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-label="초대 코드"
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
            대회에서 쓸 이름 바꾸기
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
            대진표와 순위표에 이 이름으로 표시됩니다. 동명이인이 있으면 구분되게 적어주세요.
          </p>
        </details>

        {join.error && (
          <p role="alert" className="mt-5 text-sm font-medium text-team-b-fg">
            {toUserMessage(join.error, '참가하지 못했습니다')}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          className="mt-6 w-full"
          loading={join.isPending}
          disabled={!isCompleteCode(code)}
        >
          참가하기
        </Button>
      </form>

      {/*
        초대 코드가 동아리·대회 두 종류가 됐고 둘 다 같은 6자리다.
        동아리 코드를 여기 넣으면 '찾을 수 없습니다' 만 보고 끝나므로
        반대쪽으로 가는 길을 남긴다. 한 칸에서 둘 다 받지는 않는다 —
        누르기 전에 어디로 들어가는지 알 수 없게 된다.
      */}
      <p className="mt-8 text-center text-sm text-ink-3">
        동아리 코드를 받으셨다면{' '}
        <Link
          to="/clubs/join"
          className="font-semibold text-brand-fg underline underline-offset-2
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          동아리 들어가기
        </Link>
        로 가세요.
      </p>
    </main>
  )
}
