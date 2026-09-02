import { useEffect, useState } from 'react'
import { Plus, WifiOff } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { CourtBoard } from '@/features/match/CourtBoard'
import { useAutoQueue, useAutoQueueEnabled } from '@/features/match/useAutoQueue'
import { SessionRsvpPanel } from '@/features/tournament/SessionRsvpPanel'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { useRealtimeMatches } from '@/features/match/useRealtimeMatches'
import { useCourts, useMatches, useMembers, useTournament } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { hasStarted } from '@/lib/rsvp'
import { isSession } from '@/lib/session'

/**
 * 시작 시각을 얼마나 자주 다시 보나.
 *
 * 20:00 정각에 화면이 스스로 코트 현황으로 바뀌어야 한다 — 새로고침해야
 * 바뀌면 "왜 아직 참가 신청이지" 가 된다. 15초면 늦어도 눈치채기 전에 바뀐다.
 */
const TICK_MS = 15_000

/**
 * 대회 메인 — 코트별 현황.
 *
 * 체육관에서 이 화면을 여는 이유는 하나다: "지금 어느 코트에서 뭐 하고 있지".
 * 그래서 코트 현황만 둔다. 순위·심판·관리는 각자 자기 화면으로 보낸다.
 * 한 화면에 다 얹으면 정작 필요한 점수가 아래로 밀린다.
 *
 * 모임은 여기서 한 번 더 갈린다. 시작 시각 전에는 코트가 아직 아무 말도
 * 못 하므로(경기가 없다) 참가 신청 화면을 대신 그린다. **그 판단은 서버가
 * 아니라 여기서, 사용자 시간대로 한다** — `hasStarted` 하나가 기준이다.
 */
export function TournamentPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const courts = useCourts(id)
  const realtime = useRealtimeMatches(id)

  /*
   * 시작했나를 판단할 '지금'.
   *
   * 렌더마다 new Date() 를 부르지 않는다 — 그러면 언제 다시 그려지느냐에
   * 따라 화면이 바뀌어, 아무도 안 건드렸는데 갑자기 바뀌거나 시각이
   * 지났는데도 안 바뀌는 일이 생긴다. 시계는 여기 하나뿐이다.
   */
  const [now, setNow] = useState(() => new Date())
  /** 시작 전이라도 코트를 보고 싶을 때. 시각을 잘못 넣은 모임에 갇히지 않게 */
  const [showCourts, setShowCourts] = useState(false)

  const startsAt = tournament.data?.starts_at ?? null
  const sessionKind = isSession(tournament.data?.kind)

  useEffect(() => {
    // 이미 시작했거나 즉석 모임이면 시계가 필요 없다. 대회도 마찬가지다.
    if (!sessionKind || !startsAt || hasStarted(startsAt, new Date())) return
    const timer = setInterval(() => {
      const current = new Date()
      setNow(current)
      // 한 번 바뀌고 나면 더 볼 일이 없다 — 코트 화면을 15초마다 다시 그리지 않는다
      if (hasStarted(startsAt, current)) clearInterval(timer)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [sessionKind, startsAt])

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  /*
   * ── 자동 예약 (docs: src/lib/autoQueue.ts) ─────────────────────────
   *
   * 코트마다 다음 경기 하나를 미리 걸어 둔다. 훅은 조건부로 못 부르므로
   * 여기서 부르고 **`enabled` 로만 켠다** — 조건이 하나라도 어긋나면
   * 아무 일도 안 일어난다.
   *
   * 켜지는 조건이 여럿인 이유:
   *   · `sessionKind` — 대회 경기는 조·심판·조커가 있어 편성 규칙이 다르다
   *   · `isAdmin`     — 서버가 남을 코트에 넣는 걸 관리자에게만 허락한다.
   *                     동시에 폭주를 열두 대에서 한 대로 줄이는 장치다
   *   · `started`     — 시작 전 화면은 참가 신청이다. 아직 안 온 사람으로
   *                     경기를 짜 두면 그날 저녁 전부 지워야 한다
   *   · 데이터 도착   — 명단·경기·코트가 오기 전에는 "대기가 비었다" 가
   *                     참이 아니라 **모른다** 이다. 빈 배열을 보고 만들면
   *                     새로고침할 때마다 중복 편성이 쌓인다
   */
  const [autoQueueOn, setAutoQueueOn] = useAutoQueueEnabled(id)
  const started = showCourts || hasStarted(startsAt, now)
  const loaded = Boolean(members.data && matches.data && courts.data)
  const autoQueueHandle = useAutoQueue({
    tournamentId: id ?? '',
    enabled: Boolean(id) && sessionKind && isAdmin && started && loaded && autoQueueOn,
    courts: courts.data ?? [],
    matches: matches.data ?? [],
    members: members.data ?? [],
    squad: tournament.data?.config.format === 'singles' ? 1 : 2,
  })

  if (tournament.error) {
    return (
      <Shell id={id}>
        <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
          {toUserMessage(tournament.error, '대회를 불러오지 못했습니다')}
        </p>
      </Shell>
    )
  }

  if (!tournament.data || !members.data) {
    return (
      <Shell id={id}>
        <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </Shell>
    )
  }

  // 아직 조를 안 고른 참가자는 온보딩으로 보낸다.
  // 대회가 시작된 뒤라면 스스로 고칠 수 없으므로 보내지 않는다 (관리자 몫).
  // 모임에는 조가 없다 — 여기로 보내면 고를 게 없는 화면에 갇힌다.
  if (!isSession(tournament.data.kind) && me && !me.groupId && tournament.data.status === 'draft') {
    return <Navigate to={`/t/${id}/setup`} replace />
  }

  const t = tournament.data
  const session = isSession(t.kind)
  /*
   * 참가 신청 화면을 그릴 때.
   *
   * starts_at 이 NULL 인 즉석 모임과 이미 시작한 모임은 여기 안 걸린다
   * (hasStarted 가 둘 다 '시작했다' 로 답한다). 대회도 마찬가지다 —
   * 대회에는 참가 신청이라는 개념 자체가 없고, rsvp 값도 읽지 않는다.
   */
  const beforeStart = session && !showCourts && !hasStarted(t.starts_at, now)
  /** 하단 고정 버튼이 뜰 때만 그만큼 여백을 준다 — 안 뜨는 화면에서 빈 공간을 남기지 않는다 */
  const showCreateButton = !beforeStart && session && Boolean(me)

  return (
    <Shell id={id} padForFixedButton={showCreateButton}>
      {/* 조 안내는 대회에서만 뜻이 있다. 모임에는 조가 없다. */}
      {!session && me && !me.groupId && t.status !== 'draft' && (
        <p className="mt-5 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm font-semibold text-ink-1">
          조가 정해지지 않았습니다. 대회가 시작돼서 스스로 바꿀 수 없으니 관리자에게 요청해 주세요.
        </p>
      )}

      {beforeStart && (
        <SessionRsvpPanel
          tournamentId={id!}
          startsAt={t.starts_at}
          members={members.data}
          me={me}
          onShowCourts={() => setShowCourts(true)}
        />
      )}

      {/*
        ── 코트별 현황 (이 화면의 본론) ───────────────────────────

        "코트 현황" 이라는 제목은 달지 않는다 — 탭이 이미 '코트' 다.
        같은 말을 본문에서 또 하면 그 자리에 코트 하나가 덜 들어간다
        (docs/design.md '제목을 지우고 정보를 키운다').

        시작 전에는 아예 그리지 않는다. 감추기만 하면 아직 경기가 하나도
        없는 코트 목록이 계속 살아 있으면서 실시간 구독까지 붙어 있게 된다.
      */}
      {!beforeStart && (
        <section className="mt-5">
          {/*
            정상(live·connecting)일 때는 조용히 둔다 — 실시간 연결은
            운영진이 신경 쓸 일이 아니라 당연히 되는 일이다. 초록 "실시간"
            글자가 상태인지 버튼인지 제목인지 모호하다는 지적을 받았다
            (코디네이터 피드백 2026-08-27 '["실시간" 라벨]'). 정보가 필요한
            순간은 딱 하나, **끊겼을 때**뿐이다 — 그때는 화면이 갱신을
            멈췄다는 뜻이라 알아야 새로고침이라도 한다.
          */}
          {realtime === 'offline' && (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warn-fg">
              <WifiOff className="size-3.5" aria-hidden />
              실시간 연결이 끊겼습니다 · 새로고침해 주세요
            </p>
          )}
          {matches.isPending || courts.isPending ? (
            <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
          ) : (
            <CourtBoard
              tournamentId={id!}
              courts={courts.data ?? []}
              matches={matches.data ?? []}
              myDisplayName={me?.displayName}
              /*
               * 모임에는 지정 심판이 없다. 뛰는 사람이 자기 경기를 시작하고
               * 끝낸다 — 그 판단은 `lib/matchAccess.ts` 가 서버의 can_run_match
               * 와 똑같이 한다. 예전엔 여기서 `canScore={isAdmin || session}` 로
               * 모임 참가자 **전원**에게 열어 줬는데, 서버는 '그 경기에 뛰는
               * 사람' 만 받으므로 남의 코트를 눌렀다 권한 오류를 보게 됐다.
               */
              isAdmin={isAdmin}
              isSession={session}
              /* 스위치는 실제로 돌릴 수 있는 사람에게만 — AutoQueueToggle 주석 */
              autoQueue={
                session && isAdmin
                  ? {
                      enabled: autoQueueOn,
                      onChange: setAutoQueueOn,
                      onDeleted: autoQueueHandle.declineMatch,
                    }
                  : null
              }
            />
          )}
        </section>
      )}

      {/*
        모임에서 가장 자주 누르는 버튼을 하단 고정으로.
        엄지가 닿는 화면 아래 3분의 1 에 둔다(docs/design.md '자주 누르는
        것은 아래에 둔다') — SessionMatchCreatePage 의 제출 버튼과 같은 자리.
        관리 화면 안에 두지 않는 이유는 그대로다: 모임장이 아닌 사람도
        비는 코트를 보고 자기들끼리 들어가기 때문이다
        (create_session_match 가 '뛰는 사람 본인' 을 허용한다).
      */}
      {showCreateButton && (
        <div
          className="fixed inset-x-0 z-30 border-t border-border-subtle bg-surface-1/95 p-4 backdrop-blur"
          /*
            하단탭(TournamentTabBar) 바로 위에 붙인다 — 둘 다 fixed bottom
            이라 그대로 두면 겹친다(docs 작업 지시 '3. 하단 고정 버튼과
            겹치지 않게'). 4rem 은 탭바 한 줄의 내용 높이(min-h-16)와 같다.
            safe-area 는 탭바가 자기 padding-bottom 으로 한 번 더 까므로
            여기서 한 번만 더해야 둘이 정확히 맞붙는다.
          */
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
        >
          <Link
            to={`/t/${id}/matches/new-session`}
            className="mx-auto flex min-h-14 max-w-2xl items-center justify-center gap-2 rounded-2xl
                       bg-brand-600 px-5 font-black text-brand-ink shadow-sm transition-colors
                       hover:bg-brand-700
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Plus className="size-5" aria-hidden />
            경기 짜기
          </Link>
        </div>
      )}
    </Shell>
  )
}

function Shell({
  id,
  padForFixedButton = false,
  children,
}: {
  id: string | undefined
  /** 하단 고정 '경기 짜기' 버튼이 코트 목록을 가리지 않게 여백을 더 준다 */
  padForFixedButton?: boolean
  children: React.ReactNode
}) {
  return (
    <main
      className="mx-auto w-full max-w-2xl px-5 pt-6"
      /*
        하단탭이 이제 모든 대회 화면에 고정으로 깔린다. '경기 짜기' 버튼이
        더 뜨면 그 위에 한 겹 더 쌓이므로 본문 여백도 그만큼 늘어난다.
        수치 근거는 위 CTA 컨테이너 주석과 TournamentTabBar 주석에 있다.
      */
      style={{
        paddingBottom: padForFixedButton
          ? 'calc(9.5rem + env(safe-area-inset-bottom))'
          : 'calc(5.5rem + env(safe-area-inset-bottom))',
      }}
    >
      {id && <TournamentNav id={id} active="court" />}
      {children}
    </main>
  )
}
