import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '@/components/nav/AppHeader'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { ChevronRight, KeyRound, Plus, Trophy } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/brand/EmptyState'
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
    <main className="mx-auto w-full max-w-2xl px-5" style={{ paddingBottom: APP_TAB_PADDING }}>
      {/*
        뒤로가기 대신 큰 제목이다 — 이 화면은 하단탭의 목적지라 되짚어
        나갈 위가 없다(`AppHeader` 주석).

        개수는 제목 아래에 안 적는다. 바로 밑의 필터 칩이 이미 종류별로
        세고 있어서, 찍어 보니 '1개' 와 '모임 1' 이 한 뼘 안에 나란히
        섰다 — 같은 숫자를 두 번 말하는 셈이다.
      */}
      <AppHeader title="내 목록" />

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
        <EmptyState
          icon="shuttlecock"
          className="mt-10 rounded-3xl px-6 py-12"
          title="아직 참가한 대회나 모임이 없습니다"
          description="초대 코드를 받으셨다면 참가하고, 오늘 모여서 치는 날이면 모임을 여세요."
        />
      )}

      {data && data.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {shown.map((t) => (
            <li key={t.id}>
              <Link
                to={`/t/${t.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border-subtle
                           bg-surface-1 p-5 shadow-[var(--shadow-card)]
                           transition-transform hover:-translate-y-0.5
                           focus-visible:-translate-y-0.5 focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-brand-600
                           active:translate-y-0 active:scale-[0.99]"
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

      <MakeOrJoin />
    </main>
  )
}

/**
 * 새로 만들거나 코드로 들어오는 문 셋.
 *
 * 원래 메인에 작은 줄로 쌓여 있었다. 메인의 책임이 "오늘을 보여준다"
 * 하나인데 대회 만들기·참가하기가 거기 있으면 매일 보는 것(오늘)이 그만큼
 * 밀린다(`HomePage` 주석). 여기가 제 자리다 — **이 화면이 답하는 질문이
 * "내 대회·모임" 이고, 하나 더 만들거나 새로 들어오는 것은 그 목록을
 * 늘리는 일**이다.
 *
 * 목록이 비었을 때도 같은 줄이 그대로 있다. 빈 상태에만 버튼을 띄우면
 * 화면이 상태에 따라 다른 곳이 되고, 두 번째 대회를 만들려는 사람은
 * 갈 곳을 잃는다.
 */
function MakeOrJoin() {
  return (
    <nav className="mt-6 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <MakeRow to="/new/session" icon={Plus} title="모임 열기" desc="오늘 모여서 치는 날" />
      <MakeRow to="/new" icon={Trophy} title="대회 만들기" desc="조·순위가 있는 대회" />
      <MakeRow to="/join" icon={KeyRound} title="대회 참가하기" desc="초대 코드로 들어가기" last />
    </nav>
  )
}

function MakeRow({
  to,
  icon: Icon,
  title,
  desc,
  last = false,
}: {
  to: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  desc: string
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-h-14 items-center gap-3.5 px-5 py-3 transition-colors',
        // 폰에는 hover 가 없다 — 누르는 순간 반응하는 것은 active 뿐이다
        'hover:bg-surface-2 active:bg-surface-2',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
        last ? '' : 'border-b border-border-subtle',
      )}
    >
      <Icon className="size-5 shrink-0 text-ink-2" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-1">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">{desc}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
    </Link>
  )
}
