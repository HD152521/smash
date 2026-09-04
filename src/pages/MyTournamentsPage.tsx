import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '@/components/nav/AppHeader'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { ChevronRight, KeyRound, Plus, Trophy } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/brand/EmptyState'
import { MonthCalendar } from '@/components/schedule/MonthCalendar'
import { useMyClubs } from '@/features/club/queries'
import { useMyTournaments } from '@/features/tournament/queries'
import {
  clubHorizons,
  fromMonthIndex,
  itemsOnDay,
  keyLabel,
  monthIndex,
  monthRange,
  scheduleHorizon,
  toCalendarItems,
  withinNextDays,
  type CalendarItem,
} from '@/lib/calendar'
import { toUserMessage } from '@/lib/errors'
import { daysUntilLabel } from '@/lib/home'
import { startsAtLabel } from '@/lib/rsvp'
import { cn } from '@/lib/utils'
import type { MemberRole, TournamentKind, TournamentStatus } from '@/types/database'

/**
 * 「내 목록」 — **내가 언제 어디서 치나.** 그것만 한다.
 *
 * ── 캘린더는 얹은 것이 아니라 합친 것이다 ──────────────────────────
 *
 * 전에는 이 화면이 "내가 든 대회·모임의 목록" 이었다. 그건 *색인*이지
 * 질문의 답이 아니다 — 다음 화요일에 치는지 알려면 목록에서 이름을 읽고
 * 날짜를 머릿속에서 맞춰야 했다. 동아리를 둘 들었으면 두 번 해야 했다.
 *
 * 그래서 같은 질문을 **세 단계 축척**으로 다시 짰다. 셋 다 "언제 치나" 의
 * 답이고, 보는 거리만 다르다:
 *
 *     달   캘린더        "이번 달에 며칠 있나" · "화요일마다 있구나"
 *     주   다음 7일      "다음 모임 언제 어디서 뭐"
 *     전부 그 밖에       "내가 든 것들" (날짜가 없는 대회 · 즉석 모임)
 *
 * 목록을 **대체하지 않고 합쳤다.** 대체하면 날짜가 없는 것들(대회·즉석
 * 모임)이 이 탭에서 통째로 사라진다 — 지난 모임을 다시 여는 길이 여기뿐이다.
 * 그렇다고 그냥 얹으면 같은 모임이 캘린더·7일 목록·전체 목록에 세 번 나온다.
 * 그래서 **7일 안의 것은 아래 목록에서 뺀다.** 한 일정은 한 번만 상세로
 * 나온다.
 *
 * ── 홈과 같은 말을 하지 않는다 ─────────────────────────────────────
 *
 * 홈의 책임은 "오늘" 이고 **하나만** 고른다(`HomePage`). 그 주석이
 * *"나머지는 「내 목록」이 할 일이다"* 라고 적어 두었다 — 여기 7일 목록이
 * 그 나머지다. 그래서 여기서는 참가 인원·내 차례를 그리지 않는다. 그건
 * 홈과 코트 화면의 일이고, 목록 전체에 대해 부르면 모임 수만큼 요청이
 * 나가는 N+1 이 된다.
 *
 * ── 남의 일정은 안 보인다 ──────────────────────────────────────────
 *
 * 캘린더가 쓰는 것은 `useMyTournaments`(`tournament_members` 를 내
 * `user_id` 로 걸러 온 것)와 `useMyClubs` 둘뿐이다. 화면이 새로 조회하는
 * 것이 없으므로 **볼 수 있는 것의 범위가 목록과 정확히 같다.** 캘린더를
 * 위해 만든 서버 함수도 마이그레이션도 없다.
 */

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

/** 상세로 펼쳐 보여줄 창. 사용자가 말한 "일주일 내에 있는 것만" 이다 */
const DETAIL_DAYS = 7

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
   *
   * 캘린더도 같은 목록을 쓴다. 동아리 순서가 곧 표시의 모양·색·자리라,
   * 여기 순서가 흔들리면 지난주와 이번 주의 점이 다른 모양이 된다.
   */
  const { data: myClubs } = useMyClubs()
  const clubNames = useMemo(() => new Map((myClubs ?? []).map((c) => [c.id, c.name])), [myClubs])
  const clubIds = useMemo(() => (myClubs ?? []).map((c) => c.id), [myClubs])

  /** 마운트 시각. 렌더 중 `new Date()` 는 순수하지 않아 린트가 막는다 (`HomePage` 와 같은 규율) */
  const [now] = useState(() => new Date())
  const [month, setMonth] = useState(() => monthIndex(now.getFullYear(), now.getMonth()))

  /** 캘린더에서 하루를 골랐을 때. null 이면 아래는 '다음 7일' 이다 */
  const [day, setDay] = useState<string | null>(null)

  const items = useMemo(() => toCalendarItems(data ?? []), [data])
  const soon = useMemo(() => withinNextDays(items, now, DETAIL_DAYS), [items, now])
  const dated = useMemo(() => new Set(items.map((i) => i.id)), [items])

  /*
   * 🔴 **날짜가 있는 것은 목록에 다시 안 적는다.**
   *
   * 처음에는 7일 밖의 것을 전부 아래에 다시 깔았다. 320px 로 찍어 보니
   * 캘린더 밑에 카드 열한 장이 쌓여서, 화면이 "캘린더 + 예전 그 목록" 이
   * 됐다 — 캘린더를 넣은 이유가 통째로 사라졌다. 사용자가 말한 것도
   * 정확히 이거다: *"일주일 내에 있는 것만 보여주고 나머지는 캘린더
   * 색칠만."*
   *
   * 그래서 규칙을 하나로 세운다: **캘린더에 앉을 수 있는 것은 캘린더가
   * 맡고, 앉을 수 없는 것만 목록이 맡는다.** 앉을 수 없는 것은 둘이다 —
   * 시각이 없는 대회와 즉석 모임(`toCalendarItems` 주석).
   *
   * 7일 밖의 일정에 닿는 길은 캘린더에서 그 날을 누르는 것이다. 목록을
   * 되살리지 않고 닿을 수 있게 하는 쪽을 골랐다.
   */
  const rest = (data ?? []).filter((t) => !dated.has(t.id))

  const detail = day ? itemsOnDay(items, day) : soon

  /*
   * 어느 쪽을 먼저 보여줄까.
   *
   * 모임이 하나라도 있으면 모임이다 — 모임을 쓰는 사람은 매주 여기 온다.
   * 대회만 있는 사람에게 빈 '모임' 칸을 먼저 보여줄 이유는 없다.
   */
  const hasSession = rest.some((t) => t.kind === 'session')
  const [picked, setPicked] = useState<TournamentKind | null>(null)
  const kind: TournamentKind = picked ?? (hasSession ? 'session' : 'tournament')

  const shown = rest.filter((t) => t.kind === kind)

  /*
   * 동아리 목록이 아직 안 왔으면 캘린더를 안 그린다.
   *
   * 지평선은 "내가 든 동아리" 를 세어 판단한다. 로딩 중의 빈 배열을 그대로
   * 넣으면 `open`(= 빈칸은 정말 빈칸)이 나오고, 그건 **화면이 잠깐 거짓말을
   * 하는 것**이다. 여기서 막는 오해가 정확히 그 오해다.
   */
  const clubsReady = myClubs !== undefined
  const horizon = scheduleHorizon(clubIds, items)
  const range = monthRange(now, items)
  const { year, month: monthNo } = fromMonthIndex(month)
  const showCalendar = clubsReady && (items.length > 0 || clubIds.length > 0)

  return (
    <main className="mx-auto w-full max-w-2xl px-5" style={{ paddingBottom: APP_TAB_PADDING }}>
      {/*
        뒤로가기 대신 큰 제목이다 — 이 화면은 하단탭의 목적지라 되짚어
        나갈 위가 없다(`AppHeader` 주석).

        개수는 제목 아래에 안 적는다. 밑의 필터 칩이 이미 종류별로 세고
        있어서, 찍어 보니 '1개' 와 '모임 1' 이 한 뼘 안에 나란히 섰다 —
        같은 숫자를 두 번 말하는 셈이다.
      */}
      <AppHeader title="내 목록" />

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

      {data && data.length > 0 && showCalendar && (
        <MonthCalendar
          year={year}
          month={monthNo}
          items={items}
          now={now}
          horizon={horizon}
          clubIds={clubIds}
          clubNames={clubNames}
          clubHorizonRows={clubHorizons(clubIds, items)}
          range={range}
          onMove={(next) => {
            setMonth(next)
            // 다른 달로 넘어가면 고른 날은 화면에서 사라진다. 선택만 남으면
            // 아래 상세가 지금 안 보이는 칸을 가리키게 된다
            setDay(null)
          }}
          selectedKey={day}
          onSelectDay={setDay}
        />
      )}

      {/*
        상세는 캘린더의 아래층이다. 캘린더가 없는 화면(날짜 있는 일정도
        동아리도 없는 사람)에 "다음 7일" 만 남으면, 있지도 않은 격자를
        가리키는 안내문이 뜬다.
      */}
      {showCalendar && (
        <DetailList
          items={detail}
          now={now}
          clubNames={clubNames}
          day={day}
          hasAny={items.length > 0}
          onClearDay={() => setDay(null)}
        />
      )}

      {rest.length > 0 && (
        <section aria-labelledby="rest-heading" className="mt-7">
          <h2 id="rest-heading" className="text-base font-black text-ink-1">
            그 밖에
          </h2>
          {/*
            대회와 즉석 모임은 날짜가 없어 캘린더에 앉을 칸이 없다
            (`toCalendarItems` 주석). 그 둘이 갈 곳이 여기다 — 여기까지
            없애면 지난 모임을 다시 여는 길이 앱에서 사라진다.
          */}
          <div className="mt-2 flex gap-1.5">
            {(['session', 'tournament'] as const).map((k) => {
              const n = rest.filter((t) => t.kind === k).length
              if (n === 0) return null
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setPicked(k)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                    kind === k
                      ? 'bg-brand-600 text-brand-ink'
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

          <ul className="mt-3 flex flex-col gap-3">
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
                      <h3 className="truncate text-lg font-bold text-ink-1">{t.name}</h3>
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
        </section>
      )}

      <MakeOrJoin />
    </main>
  )
}

/**
 * 상세 — **캘린더가 못 하는 말을 여기서 한다.**
 *
 * 격자의 칸은 40px 이라 점 하나가 한계다. 그래서 "언제 어디서 뭐" 는 여기
 * 상세로 나온다. 사용자가 말한 그대로다 — *"일주일 내에 있는 것만 보여주고
 * 나머지는 캘린더 색칠만."*
 *
 * **상세 칸은 하나뿐이고, 보는 구간만 바뀐다.** 기본은 다음 7일이고,
 * 캘린더에서 하루를 누르면 그 날이 된다. 둘을 따로 두면 같은 모임이 한
 * 화면에 두 번 서고, 그러면 어느 쪽이 지금 것인지 눈이 매번 다시 판단한다.
 *
 * 날짜 문구는 새로 만들지 않고 이미 있는 둘을 쓴다: `startsAtLabel`
 * ("9월 8일 (화) 20:00") · `daysUntilLabel` ("오늘" · "3일 뒤"). 앱 안에서
 * 같은 날짜가 화면마다 다르게 읽히면 안 된다.
 *
 * ⚠ **"진행 중" 을 여기서 말하지 않는다.** `create_session` 은 모임을 항상
 * `status='live'` 로 만들어서, 다음 주 모임도 만든 순간부터 live 다
 * (`home.ts` 주석 — 이걸 빠뜨려 홈이 다음 주 모임을 "진행 중" 으로 표시한
 * 적이 있다). 시작 여부는 홈이 `hasStarted` 로 판단하고, 여기는 **언제인지**만
 * 말한다. 같은 함정을 두 번 밟지 않는 가장 쉬운 방법은 그 말을 아예 안
 * 하는 것이다.
 */
function DetailList({
  items,
  now,
  clubNames,
  day,
  hasAny,
  onClearDay,
}: {
  items: readonly CalendarItem[]
  now: Date
  clubNames: ReadonlyMap<string, string>
  /** 캘린더에서 고른 날. null 이면 다음 7일 */
  day: string | null
  /** 캘린더에 찍힌 것이 하나라도 있는가 — 없으면 "눌러 보세요" 라고 하면 안 된다 */
  hasAny: boolean
  onClearDay: () => void
}) {
  return (
    <section aria-labelledby="detail-heading" className="mt-6">
      <div className="flex items-center gap-3">
        <h2 id="detail-heading" className="min-w-0 flex-1 truncate text-base font-black text-ink-1">
          {day ? (keyLabel(day) ?? '고른 날') : `다음 ${DETAIL_DAYS}일`}
        </h2>
        {day && (
          <button
            type="button"
            onClick={onClearDay}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold text-ink-2
                       transition-colors hover:bg-surface-2 active:bg-surface-2
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            다음 {DETAIL_DAYS}일 보기
          </button>
        )}
      </div>

      {items.length === 0 ? (
        /*
          빈 줄 하나로 끝낸다. 여기에 큰 빈 상태를 두면 화면의 무게중심이
          "없다" 로 옮겨 가는데, 바로 위 캘린더가 이미 이번 달을 보여주고
          있어서 사실이 아니다.
        */
        <p className="mt-2 text-sm text-ink-2">
          앞으로 {DETAIL_DAYS}일 안에 잡힌 일정이 없습니다.
          {hasAny && ' 위 캘린더에서 날짜를 눌러 그 날 일정을 볼 수 있습니다.'}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((it) => {
            const club = it.clubId ? clubNames.get(it.clubId) : undefined
            const when = startsAtLabel(it.at.toISOString())
            const until = daysUntilLabel(it.at.toISOString(), now)
            return (
              <li key={it.id}>
                <Link
                  to={`/t/${it.id}`}
                  className="group flex items-center gap-3.5 rounded-2xl border border-border-subtle
                             bg-surface-1 px-4 py-3.5 shadow-[var(--shadow-card)]
                             transition-transform hover:-translate-y-0.5
                             focus-visible:-translate-y-0.5 focus-visible:outline-2
                             focus-visible:outline-offset-2 focus-visible:outline-brand-600
                             active:translate-y-0 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-ink-1">{it.name}</h3>
                      {club && <Badge tone="neutral">{club}</Badge>}
                    </div>
                    <p className="tabular mt-1 text-sm text-ink-2">
                      {until && <b className="font-black text-ink-1">{until}</b>}
                      {until && when && ' · '}
                      {when}
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
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
