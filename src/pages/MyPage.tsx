import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BackBar } from '@/components/ui/BackBar'
import { Button } from '@/components/ui/Button'
import { GradePicker } from '@/components/ui/GradePicker'
import { GenderPicker } from '@/components/ui/GenderPicker'
import { useAuth } from '@/features/auth/useAuth'
import { useMyProfile, useUpdateMyProfile } from '@/features/profile/queries'
import { toUserMessage } from '@/lib/errors'
import type { MyProfilePatch } from '@/features/profile/api'

/** 서버가 이름을 1~20자로 강제한다(set_display_name 과 같은 규칙) */
const NAME_MAX = 20

/**
 * 마이페이지 — **나에 관한 것을 모아 둔 자리.**
 *
 * ## 왜 이 화면이 생겼나
 *
 * 급수는 가입할 때 한 번 물어보고 **고칠 화면이 없었다.** 그래서 가입 폼은
 * "나중에 바꿀 수 있다" 고 말하지 못했고(LoginPage 의 옛 주석), 오타로
 * 고른 사람은 되돌릴 길이 아예 없었다. 성별을 같은 처지로 만들면 안 된다 —
 * 성별은 비면 **종목 편성에서 통째로 빠지므로**(`matchKindOf`) 고칠 수
 * 없다는 것이 곧 "영영 남복·여복에 못 들어간다" 가 된다.
 *
 * ## ⚠ 여기서 바꾼 값은 이미 들어간 명단으로 안 따라간다
 *
 * `tournament_members.grade` · `.gender` 는 명단에 들어올 때 찍히는
 * **스냅샷**이다(20260901000001 · 20260902000001). 지난 대회 기록의 편성
 * 근거가 소급해 바뀌면 안 되기 때문인데, 그 대가로 "프로필을 고쳤는데
 * 오늘 모임 명단은 그대로" 인 구간이 생긴다. 그래서 화면이 그 사실을
 * **먼저 말한다** — 안 말하면 사용자는 저장이 안 된 줄 안다. 오늘 명단은
 * 명단 화면에서 직접 고친다(본인 행도 고칠 수 있다).
 *
 * ## 알림과 로그아웃이 여기로 온 이유
 *
 * 둘 다 메인 맨 아래에 흩어져 있었다. 메인의 책임은 "오늘을 보여준다" 인데
 * 계정 설정이 거기 끼어 있으면 매일 보는 것(오늘)이 그만큼 밀린다.
 * 알림은 대회가 아니라 **이 사람과 이 브라우저**에 붙는 것이고, 로그아웃도
 * 계정에 대한 동작이라 둘 다 나에 관한 것이다.
 *
 * ## 저장은 버튼 하나다
 *
 * 고른 즉시 저장하지 않는다. 이름은 글자를 치는 칸이라 어차피 확정 시점이
 * 필요하고, 칸마다 저장 방식이 다르면 (급수는 즉시 · 이름은 버튼) 같은
 * 폼 안에서 규칙이 둘이 된다. 바꾼 것이 없으면 버튼이 안 눌린다.
 */
export function MyPage() {
  const { user, signOut } = useAuth()
  const profile = useMyProfile()
  const save = useUpdateMyProfile()

  /*
   * null 이면 "아직 아무것도 안 고쳤다" 다. 서버 값을 state 로 베끼는
   * 효과(useEffect)를 두지 않으려는 것이다 — 그건 안티패턴이고
   * `react-hooks/set-state-in-effect` 가 막는다. 고치기 시작하는 순간에만
   * 현재 값을 복사한다 (`InlineEdit` 이 쓰는 것과 같은 수법).
   */
  const [draft, setDraft] = useState<MyProfilePatch | null>(null)

  const server: MyProfilePatch | null = profile.data
    ? { name: profile.data.name, grade: profile.data.grade, gender: profile.data.gender }
    : null
  const form = draft ?? server

  function edit(patch: Partial<MyProfilePatch>) {
    if (!form) return
    setDraft({ ...form, ...patch })
    // 새로 고치기 시작했으면 지난 저장 결과 문구를 지운다
    if (save.isSuccess || save.isError) save.reset()
  }

  const trimmed = form?.name.trim() ?? ''
  const nameError = form && (trimmed.length < 1 || trimmed.length > NAME_MAX)
  const dirty =
    draft !== null &&
    server !== null &&
    (trimmed !== server.name || draft.grade !== server.grade || draft.gender !== server.gender)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft || !dirty || nameError) return
    try {
      await save.mutateAsync({ ...draft, name: trimmed })
      // 저장이 끝나면 서버 값이 곧 화면 값이다 — 초안을 놓아 준다
      setDraft(null)
    } catch {
      // 오류는 save.error 로 아래에 그린다
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackBar to="/" label="메인으로" />

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">내 정보</h1>
      <p className="mt-2 text-sm text-ink-2">
        여기서 바꾼 값은 <b className="font-bold text-ink-1">앞으로 들어가는 명단</b>에 적용됩니다.
        오늘 이미 들어간 명단은 그대로 남아요 — 지난 기록의 편성 근거가 나중에 바뀌면 안 되기
        때문입니다.
      </p>

      {profile.isPending ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : profile.error || !form ? (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(profile.error, '내 정보를 불러오지 못했습니다')}
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-2">이름</span>
            <input
              value={form.name}
              onChange={(e) => edit({ name: e.target.value })}
              maxLength={NAME_MAX}
              autoComplete="name"
              disabled={save.isPending}
              className="h-11 rounded-xl border border-ink-3/40 bg-surface-1 px-3.5 text-ink-1
                         outline-none transition-colors placeholder:text-ink-3
                         focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            />
          </label>

          <GradePicker
            value={form.grade}
            onChange={(grade) => edit({ grade })}
            disabled={save.isPending}
            hint="'모름' 을 고르면 비워집니다."
          />

          {/*
            성별과 급수의 안내 문구가 다른 이유: 급수가 비면 짝이 덜 맞을
            뿐이지만, 성별이 비면 남복·여복·혼복 **어디에도 못 들어간다.**
            비워 둘 자유는 그대로 두되 그 결과는 말해 준다.
          */}
          <GenderPicker
            value={form.gender}
            onChange={(gender) => edit({ gender })}
            disabled={save.isPending}
            hint="비어 있으면 남복·여복·혼복 편성에서 빠집니다."
          />

          {nameError && (
            <p role="alert" className="text-sm font-medium text-team-b-fg">
              이름은 1~{NAME_MAX}자로 입력해 주세요
            </p>
          )}
          {save.error && (
            <p role="alert" className="text-sm font-medium text-team-b-fg">
              {toUserMessage(save.error, '저장하지 못했습니다')}
            </p>
          )}
          {/* 바꾼 것이 없어진(저장이 끝난) 순간에만 뜬다 — 저장 중에는 아니다 */}
          {save.isSuccess && !dirty && (
            <p role="status" className="text-sm font-medium text-brand-fg">
              저장했습니다.
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={save.isPending}
            disabled={!dirty || Boolean(nameError)}
            className="w-full"
          >
            저장
          </Button>
        </form>
      )}

      {/*
        나에 관한 나머지. 링크 하나뿐이라 목록처럼 안 보이게 같은 카드
        문법(둥근 테두리 한 칸)만 빌린다.
      */}
      <nav className="mt-8 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
        <Link
          to="/settings/alerts"
          className="flex min-h-12 items-center gap-3 px-5 py-2.5 text-sm transition-colors
                     hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2
                     focus-visible:outline-brand-600"
        >
          <span className="min-w-0 flex-1 font-bold text-ink-1">알림</span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
        </Link>
      </nav>

      {/*
        로그인한 계정을 적어 둔다. 한 폰에 계정이 둘인 사람(운영진이 자기
        계정과 동아리 계정을 함께 쓰는 경우)이 로그아웃 전에 확인할 유일한
        곳이다. 이메일이 없는 소셜 계정도 있으므로 없으면 줄을 안 그린다.
      */}
      {user?.email && <p className="mt-6 text-center text-xs text-ink-3">{user.email}</p>}

      {/* 로그아웃은 몇 달에 한 번 누른다. 링크가 아니라 동작이라 목록 밖이다 */}
      <div className="mt-3 flex justify-center">
        <Button size="sm" variant="ghost" onClick={() => void signOut()}>
          로그아웃
        </Button>
      </div>
    </main>
  )
}
