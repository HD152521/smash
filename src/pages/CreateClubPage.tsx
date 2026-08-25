import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { useCreateClub } from '@/features/club/queries'
import { useProfileName } from '@/features/tournament/queries'
import { CLUB_NAME_MAX, validateClubName } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'

const DESCRIPTION_MAX = 500
const DISPLAY_NAME_MAX = 20

/**
 * 동아리 만들기.
 *
 * 묻는 것은 셋뿐이다 — 이름, 설명, 동아리에서 쓸 내 이름.
 * 코트도 조도 여기서 정하지 않는다. 동아리는 그릇이고, 실제로 치는 것은
 * 그 밑에 여는 대회·모임이다.
 */
export function CreateClubPage() {
  const navigate = useNavigate()
  const create = useCreateClub()
  const { data: profileName } = useProfileName()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [displayName, setDisplayName] = useState('')

  /*
   * 서버도 같은 검사를 하지만(`create_club` 의 22023), 만들기를 누르고 왕복
   * 한 번을 돌고 나서야 "이름을 입력해 주세요" 를 보는 것과 누르기 전에 보는
   * 것은 다르다. 기준은 SQL 제약과 같은 btrim 뒤 길이다 — `lib/club.ts` 한 곳.
   */
  const nameError = validateClubName(name)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (nameError) return
    try {
      const club = await create.mutateAsync({
        name: name.trim(),
        // 비워 두면 서버가 프로필 이름으로 채운다
        displayName: displayName.trim() || profileName || '',
        description: description.trim() || null,
      })
      navigate(`/c/${club.id}`, { replace: true })
    } catch {
      // create.error 로 화면에 뿌린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 pt-6 pb-16">
      <BackLink to="/clubs">내 동아리</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">동아리 만들기</h1>
      <p className="mt-2 text-sm text-ink-2">
        만들면 동아리 코드가 나옵니다. 그 코드로 들어온 사람이 회원이 됩니다.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-7">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">동아리 이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            maxLength={CLUB_NAME_MAX}
            placeholder="예) 수요 배드민턴 클럽"
            className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          {/* 빈 칸에는 아무 말도 안 한다. 아직 아무것도 안 한 사람을 나무라는 꼴이다 */}
          {name.length > 0 && nameError && (
            <span className="text-xs font-medium text-team-b-fg">{nameError}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">
            소개 <span className="font-normal text-ink-3">(선택)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            placeholder="언제 어디서 모이는지 적어 두면 회원이 헷갈리지 않습니다"
            className="rounded-xl border border-border-subtle bg-surface-1 px-3.5 py-3 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">동아리에서 쓸 내 이름</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={DISPLAY_NAME_MAX}
            placeholder={profileName ?? '이름'}
            className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                       outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          {/*
            이 이름이 앞으로 동아리 밑에 여는 대회의 명단에 복사된다.
            대회마다 다시 적는 이름과 달리 한 번 정하면 계속 따라다니므로,
            여기서 무엇에 쓰이는 이름인지 말해 둔다.
          */}
          <span className="text-xs text-ink-3">
            비워 두면 계정 이름을 씁니다. 동아리 밑에 여는 대회의 명단에 이 이름으로 들어갑니다.
          </span>
        </label>

        {create.error && (
          <p role="alert" className="text-sm font-medium text-team-b-fg">
            {toUserMessage(create.error, '동아리를 만들지 못했습니다')}
          </p>
        )}

        <Button
          type="submit"
          size="xl"
          className="w-full"
          loading={create.isPending}
          disabled={Boolean(nameError)}
        >
          동아리 만들기
        </Button>
      </form>
    </main>
  )
}
