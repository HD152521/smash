import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { useMyTournaments } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import type { MemberRole, TournamentStatus } from '@/types/database'

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '주최자',
  admin: '관리자',
  member: '참가자',
}

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

export function MyTournamentsPage() {
  const { data, isPending, error } = useMyTournaments()

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />
        메인으로
      </Link>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">내 대회 모음</h1>

      {isPending && (
        <div className="mt-8 flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-8 text-sm font-medium text-team-b">
          {toUserMessage(error, '대회 목록을 불러오지 못했습니다')}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="mt-10 rounded-3xl border border-dashed border-border-subtle px-6 py-12 text-center">
          <p className="text-lg font-bold text-ink-1">아직 참가한 대회가 없습니다</p>
          <p className="mt-1.5 text-sm text-ink-2">
            초대 코드를 받으셨다면 참가하고, 직접 열려면 대회를 만드세요.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Link
              to="/join"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600
                         px-4 text-[0.95rem] font-semibold text-white shadow-sm
                         transition-colors hover:bg-brand-700"
            >
              대회 참가하기
            </Link>
            <Link
              to="/new"
              className="inline-flex h-11 items-center justify-center rounded-xl border
                         border-border-subtle px-4 text-[0.95rem] font-semibold text-ink-1
                         transition-colors hover:bg-surface-2"
            >
              대회 만들기
            </Link>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {data.map((t) => (
            <li key={t.id}>
              <Link
                to={`/t/${t.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border-subtle
                           bg-surface-1 p-5 transition-colors hover:bg-surface-2
                           focus-visible:outline-2 focus-visible:outline-offset-2
                           focus-visible:outline-brand-600"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-ink-1">{t.name}</h2>
                    {t.status === 'live' ? (
                      <LiveBadge />
                    ) : (
                      <Badge tone={t.status === 'finished' ? 'neutral' : 'ok'}>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    )}
                    {t.role !== 'member' && <Badge>{ROLE_LABEL[t.role]}</Badge>}
                  </div>

                  {t.description && (
                    <p className="mt-1 truncate text-sm text-ink-2">{t.description}</p>
                  )}

                  {/* 코드는 주최·관리자만 본다. 참가자에게는 이미 쓸모가 없다. */}
                  {t.role !== 'member' && (
                    <p className="tabular mt-2 text-xs font-semibold tracking-widest text-ink-3">
                      초대 코드 {t.inviteCode}
                    </p>
                  )}

                  {t.role === 'member' && !t.groupId && t.status === 'draft' && (
                    <p className="mt-2 text-xs font-semibold text-warn">조를 아직 고르지 않았습니다</p>
                  )}
                </div>

                <ChevronRight
                  className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
