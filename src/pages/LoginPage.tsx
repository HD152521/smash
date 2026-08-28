import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { GradePicker } from '@/components/ui/GradePicker'
import { CourtMotif } from '@/components/brand/CourtMotif'
import { Shuttlecock } from '@/components/brand/Shuttlecock'
import { useAuth, type SocialProvider } from '@/features/auth/useAuth'
import { useAuthSettings } from '@/features/auth/useAuthSettings'
import { enabledSocialProviders } from '@/features/auth/providers'
import type { PlayerGrade } from '@/types/database'

type Mode = 'signin' | 'signup'

const SOCIAL_LABEL: Record<SocialProvider, string> = {
  kakao: '카카오로 시작하기',
  google: 'Google로 시작하기',
}

const SOCIAL_STYLE: Record<SocialProvider, string> = {
  kakao: 'border-transparent bg-[#FEE500] text-[#191600] hover:bg-[#F2DA00]',
  google: '',
}

/**
 * 로그인 — 앱과 같은 세계로.
 *
 * 예전엔 배경이 거의 검정이라 로그인 다음에 뜨는 흰 홈 화면과 다른
 * 제품처럼 보였다(docs/design.md '로그인은 거의 검정, 앱은 거의
 * 흰색'). 체육관 조명 아래에서는 밝은 화면이 읽히므로 여기도 홈과
 * 같은 `bg-surface-0` 을 명시하고, 같은 머리(Smash 표식)를 얹는다 —
 * 다음 화면과 이어지는 첫인상을 준다.
 */
export function LoginPage() {
  const { user, ready, signInWithPassword, signUpWithPassword, signInWithSocial } = useAuth()
  const { data: settings } = useAuthSettings()
  const socials = enabledSocialProviders(settings)

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  /*
   * 급수는 **선택**이다. 기본값은 '안 골랐다'(null)이지 초심이 아니다 —
   * 안 고른 사람과 진짜 초심인 사람은 다른 사람이고, 서버도 그 둘을
   * null 과 'beginner' 로 나눠 저장한다(20260901000001).
   */
  const [grade, setGrade] = useState<PlayerGrade | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<'local' | SocialProvider | null>(null)

  if (ready && user) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy('local')
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password)
      } else {
        await signUpWithPassword(email, password, name.trim(), grade)
        // 이메일 확인이 켜져 있으면 가입 직후 세션이 안 생긴다.
        // 아무 반응이 없는 것처럼 보이므로 무슨 일이 일어났는지 알려준다.
        if (!settings?.mailer_autoconfirm) {
          setNotice('가입 확인 메일을 보냈습니다. 메일함에서 링크를 눌러주세요.')
        }
      }
    } catch (err) {
      const fallback = mode === 'signin' ? '로그인에 실패했습니다' : '가입하지 못했습니다'
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(null)
    }
  }

  async function handleSocial(provider: SocialProvider) {
    setError(null)
    setBusy(provider)
    try {
      await signInWithSocial(provider)
      // 성공하면 브라우저가 provider 로 이동하므로 여기로 돌아오지 않는다
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다')
      setBusy(null)
    }
  }

  return (
    <div className="min-h-dvh bg-surface-0">
      {/* 홈과 같은 표식 — 로그인 다음에 오는 화면과 같은 제품임을 바로 보여준다 */}
      <header className="flex items-center gap-2 px-5 pt-6">
        <Shuttlecock size={20} className="text-ident-navy-fg" />
        <span className="text-sm font-black tracking-[0.25em] text-ink-1 uppercase">Smash</span>
      </header>

      {/*
        코트 라인 모티프 — 첫인상에 정체성을 얹는다. 배경 레이어라 히어로
        문구 높이에 관여하지 않는다(relative 부모 + absolute 모티프).
        아주 옅게(opacity 0.07, CourtMotif 기본값) — 읽는 걸 방해하면 실패다.
      */}
      <main className="relative mx-auto w-full max-w-sm px-5 pt-8 pb-10">
        {/*
          `position` 이 있어도 z-index 를 안 주면 절대 위치 자식이 정적(static)
          형제보다 위에 그려진다 — 배경으로 깔리려면 반대로 **내용 쪽**에
          `relative z-10` 을 얹어야 한다(코트 카드 `CourtLines` 와 같은 방식).
        */}
        <CourtMotif className="absolute inset-x-0 top-0 h-44" />
        <div className="relative z-10">
          <h1 className="text-3xl leading-tight font-black tracking-tight text-ink-1">
            코트에서 바로 쓰는
            <br />
            대회 운영
          </h1>
          <p className="mt-2 text-sm text-ink-2">대진표, 실시간 점수, 조별 순위를 한곳에서.</p>
        </div>

        <div className="mt-8">
          {socials.length > 0 && (
            <>
              <div className="flex flex-col gap-2.5">
                {socials.map((provider) => (
                  <Button
                    key={provider}
                    size="lg"
                    variant="secondary"
                    loading={busy === provider}
                    disabled={busy !== null && busy !== provider}
                    onClick={() => handleSocial(provider)}
                    className={`w-full ${SOCIAL_STYLE[provider]}`}
                  >
                    {SOCIAL_LABEL[provider]}
                  </Button>
                ))}
              </div>

              <div className="my-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-border-subtle" />
                <span className="text-xs font-medium text-ink-3">또는 이메일로</span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === 'signup' && (
              <>
                <Field
                  label="이름"
                  value={name}
                  onChange={setName}
                  autoComplete="name"
                  placeholder="대회에서 보일 이름"
                  required
                />
                {/*
                  ⚠ **필수로 만들지 않는다.** 가입을 막는 칸을 하나 늘릴
                  때마다 사람이 샌다. 급수를 모르는 채로도 앱은 전부
                  동작하므로(배지를 안 그릴 뿐이다) 지금 반드시 답을 받아야
                  할 이유가 없다 — 서버도 profiles.grade 를 nullable 로 둬서
                  같은 판단을 구조로 못 박아 뒀다(20260901000001).

                  안내 문구로 "나중에 바꿀 수 있다" 고 말하지 않는다.
                  프로필에서 급수를 고치는 화면이 아직 없어서 그건 거짓말이
                  된다. 그 화면이 생기면 그때 이 문구를 고친다.
                */}
                <GradePicker
                  value={grade}
                  onChange={setGrade}
                  disabled={busy !== null}
                  hint="선택입니다 — 안 고르셔도 가입됩니다."
                />
              </>
            )}
            <Field
              label="이메일"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="비밀번호"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />

            {error && (
              <p role="alert" className="text-sm font-medium text-team-b-fg">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm font-medium text-brand-fg">
                {notice}
              </p>
            )}

            <Button type="submit" size="lg" loading={busy === 'local'} className="mt-1 w-full">
              {mode === 'signin' ? '로그인' : '가입하기'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-2">
            {mode === 'signin' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
                setNotice(null)
              }}
              className="rounded px-1 py-2 font-semibold text-brand-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {mode === 'signin' ? '가입하기' : '로그인'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
  required?: boolean
  minLength?: number
}

function Field({ label, value, onChange, ...rest }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-ink-3/40 bg-surface-1 px-3.5 text-ink-1
                   outline-none transition-colors placeholder:text-ink-3
                   focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
      />
    </label>
  )
}
