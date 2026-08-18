import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuth, type SocialProvider } from '@/features/auth/useAuth'
import { useAuthSettings } from '@/features/auth/useAuthSettings'
import { enabledSocialProviders } from '@/features/auth/providers'

type Mode = 'signin' | 'signup'

const SOCIAL_LABEL: Record<SocialProvider, string> = {
  kakao: '카카오로 시작하기',
  google: 'Google로 시작하기',
}

const SOCIAL_STYLE: Record<SocialProvider, string> = {
  kakao: 'border-transparent bg-[#FEE500] text-[#191600] hover:bg-[#F2DA00]',
  google: '',
}

export function LoginPage() {
  const { user, ready, signInWithPassword, signUpWithPassword, signInWithSocial } = useAuth()
  const { data: settings } = useAuthSettings()
  const socials = enabledSocialProviders(settings)

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
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
        await signUpWithPassword(email, password, name.trim())
        // 이메일 확인이 켜져 있으면 가입 직후 세션이 안 생긴다.
        // 아무 반응이 없는 것처럼 보이므로 무슨 일이 일어났는지 알려준다.
        if (!settings?.mailer_autoconfirm) {
          setNotice('가입 확인 메일을 보냈습니다. 메일함에서 링크를 눌러주세요.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다')
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
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8">
          <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase">SMASH</p>
          <h1 className="mt-1 text-4xl leading-tight font-black tracking-tight text-ink-1">
            코트에서
            <br />
            바로 쓰는 대회 운영
          </h1>
          <p className="mt-3 text-sm text-ink-2">대진표, 실시간 점수, 조별 순위를 한곳에서.</p>
        </header>

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
            <Field
              label="이름"
              value={name}
              onChange={setName}
              autoComplete="name"
              placeholder="대회에서 보일 이름"
              required
            />
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
            <p role="alert" className="text-sm font-medium text-team-b">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm font-medium text-brand-600">
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
            className="font-semibold text-brand-600 underline-offset-4 hover:underline"
          >
            {mode === 'signin' ? '가입하기' : '로그인'}
          </button>
        </p>
      </div>
    </main>
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
        className="h-11 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-ink-1
                   outline-none transition-colors placeholder:text-ink-3
                   focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
      />
    </label>
  )
}
