import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { ChevronRight } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { useMyClubs } from '@/features/club/queries'
import { useMyTournaments } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MemberRole, TournamentKind, TournamentStatus } from '@/types/database'

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

  /*
   * 소속 동아리 이름은 내 동아리 목록에서 찾는다.
   *
   * 대회 행에는 `club_id` 만 실려 온다. 이름을 같이 끌어오려면 대회 조회에
   * 동아리 조인을 하나 더 얹어야 하는데, 그건 앱에서 가장 자주 도는 조회에
   * 새 테이블을 물리는 일이다. 어차피 `clubs_select` 가 `is_club_member` 라
   * 내가 회원이 아닌 동아리의 이름은 조인해도 null 로 온다 — 결과가 같다면
   * 이미 있는 목록에서 찾는 편이 안전하다.
   *
   * 그래서 배지는 **내가 회원인 동아리**일 때만 뜬다. 소속이 없거나 이름을
   * 못 찾으면 아예 그리지 않는다 (빈 배지는 고장으로 읽힌다).
   */
  const { data: myClubs } = useMyClubs()
  const clubNames = useMemo(() => new Map((myClubs ?? []).map((c) => [c.id, c.name])), [myClubs])

  /*
   * 어느 쪽을 먼저 보여줄까.
   *
   * 모임이 하나라도 있으면 모임이다 — 모임을 쓰는 사람은 매주 여기 온다.
   * 대회만 있는 사람에게 빈 '모임' 칸을 먼저 보여줄 이유는 없다.
   */
  const hasSession = (data ?? []).some((t) => t.kind === 'session')
  const [picked, setPicked] = useState<TournamentKind | null>(null)
  const kind: TournamentKind = picked ?? (hasSession ? 'session' : 'tournament')
  const setKind = setPicked

  const shown = (data ?? []).filter((t) => t.kind === kind)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to="/">메인으로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">내 목록</h1>

      {/*
        대회와 모임을 섞어 놓으면 '지난 3월 정기전' 과 '지난 화요일 모임' 이
        같은 줄에 서서, 매주 열리는 모임이 목록을 밀어내 버린다.
        모임을 위에 둔다 — 다시 여는 쪽은 늘 최근 모임이다.
      */}
      {data && data.length > 0 && (
        <div className="mt-3 flex gap-1.5">
          {(['session', 'tournament'] as const).map((k) => {
            const n = data.filter((t) => t.kind === k).length
            if (n === 0) return null
            return (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  kind === k
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-2 text-ink-2 transition-colors hover:text-ink-1',
                )}
              >
                {k === 'session' ? '모임' : '대회'}
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 text-xs font-black',
                    kind === k ? 'bg-white/25' : 'bg-surface-1 text-ink-3',
                  )}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {isPending && (
        <div className="mt-8 flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '대회 목록을 불러오지 못했습니다')}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="mt-10 rounded-3xl border border-dashed border-border-subtle px-6 py-12 text-center">
          <p className="text-lg font-bold text-ink-1">아직 참가한 대회나 모임이 없습니다</p>
          <p className="mt-1.5 text-sm text-ink-2">
            초대 코드를 받으셨다면 참가하고, 오늘 모여서 치는 날이면 모임을 여세요.
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
              to="/new/session"
              className="inline-flex h-11 items-center justify-center rounded-xl border
                         border-border-subtle px-4 text-[0.95rem] font-semibold text-ink-1
                         transition-colors hover:bg-surface-2"
            >
              모임 열기
            </Link>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {shown.map((t) => (
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
                    {t.clubId && clubNames.has(t.clubId) && (
                      <Badge tone="neutral">{clubNames.get(t.clubId)}</Badge>
                    )}
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

                  {t.kind !== 'session' &&
                    t.role === 'member' &&
                    !t.groupId &&
                    t.status === 'draft' && (
                    <p className="mt-2 text-xs font-semibold text-warn-fg">
                      조를 아직 고르지 않았습니다
                    </p>
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
