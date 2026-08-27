import { useParams } from 'react-router-dom'
import { UserMinus, Users } from 'lucide-react'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { AddMemberForm } from '@/features/tournament/AddMemberForm'
import { NameEditor } from '@/features/tournament/NameEditor'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/useAuth'
import {
  useGroups,
  useMatches,
  useMembers,
  useRemoveMember,
  useTournament,
} from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { isSession } from '@/lib/session'
import { countRsvp, hasAccountContrast, rsvpCountsText, rsvpLabel } from '@/lib/rsvp'
import {
  buildRosterStats,
  hasRsvpContrast,
  namesInAnyMatch,
  orderRoster,
  rosterStat,
  type RosterStats,
} from '@/lib/roster'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'
import type { GroupRow, TournamentConfig } from '@/types/database'

/**
 * 참가자 명단 — **오늘 누가 왔고 누가 어떤 상태인가.**
 *
 * ## 2026-08-27 — 보는 화면과 고치는 화면을 합쳤다
 *
 * 전에는 이름만 가나다순으로 나열했고 사람을 넣는 버튼이 없었다. 늦게 온
 * 사람 하나를 명단에 올리려면 더보기 → 관리 → 참가자로 따로 들어가야
 * 했다(docs/ui-redesign.md '명단 관리가 편하지 않다'). 명단은 저녁 내내
 * 바뀌는 것이라 그 왕복이 그대로 마찰이 된다.
 *
 * 그래서 **같은 대상(명단)에 대한 한 가지 일**인 추가 · 이름 고치기 ·
 * 빼기를 여기로 가져왔다. 대신 **조 배정과 권한 변경은 안 가져온다** —
 * 그건 대회를 짜는 일이지 오늘을 보는 일이 아니고, 관리 화면
 * (`AdminMembersPage`)의 몫이다.
 *
 * ## 조 미정 경고를 모임에서 뺀다
 *
 * 모임에는 조가 없다(create_session 이 groups 를 안 만든다). 그런데 전에는
 * 조가 없는 전원이 '조 미정' 주황 점선 박스에 통째로 들어갔다. 주황은 이
 * 저장소에서 "곧 끝난다 · 준비해라" 라서(docs/design.md) **정상 상태에
 * 경고색**이 붙어 있던 셈이다. 조가 하나라도 있을 때만 그 구획을 그린다.
 *
 * 누구나 볼 수 있고, 고치는 버튼은 운영진에게만 뜬다. 진짜 벽은 RLS 다.
 */
export function MembersPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const tournament = useTournament(id)
  const groups = useGroups(id)
  const members = useMembers(id)
  const matches = useMatches(id)
  const removeMember = useRemoveMember(id!)

  const all = members.data ?? []
  const me = all.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  const session = isSession(tournament.data?.kind)
  const config = tournament.data?.config as TournamentConfig | undefined

  const stats = buildRosterStats(matches.data ?? [])
  const groupList = groups.data ?? []

  const view: RosterView = {
    tournamentId: id!,
    stats,
    // 경기에 걸린 사람은 서버가 삭제를 막는다. 눌러보고 실패하게 두지 않는다
    locked: namesInAnyMatch(matches.data ?? []),
    myMemberId: me?.id,
    isAdmin,
    /*
     * 아직 한 경기도 안 한 대회에서 전원에게 '0판' 을 붙이면 아무도
     * 갈라주지 못한다 — 모두에게 붙는 표시는 표시가 아니다.
     */
    showPlayed: stats.size > 0,
    showAccount: hasAccountContrast(all),
    showRsvp: session && hasRsvpContrast(all),
    onRemove: (m) => {
      if (confirm(`${m.displayName}님을 이 명단에서 뺄까요?`)) removeMember.mutate(m.id)
    },
    removing: removeMember.isPending,
  }

  return (
    <main
      className="mx-auto w-full max-w-2xl px-5 pt-6"
      // 하단탭에 가려지지 않을 여백. 근거는 TournamentPage 의 Shell 주석.
      style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
    >
      <TournamentNav id={id!} active="members" />
      <h2 className="sr-only">참가자</h2>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          <Users className="size-4" aria-hidden />
          참가자 {all.length}명
        </p>
        {/*
          참가 여부는 모임에만 뜻이 있다 — 대회 행은 전부 'going' 이다.
          '명단만' 을 뒤에 붙이는 이유: 계정 없는 사람은 미정에 안 들어가므로
          (rsvp.ts) 그 수를 안 적으면 9명짜리 모임에 "참가 1 · 미정 0 · 불참 0"
          만 떠서 나머지 8명이 어디로 샜는지 알 수 없다. 네 숫자의 합이
          언제나 명단 전체여야 한다.
        */}
        {session && all.length > 0 && <RsvpSummary members={all} />}
      </div>

      {isAdmin && (
        <div className="mt-3">
          <AddMemberForm tournamentId={id!} />
        </div>
      )}

      {members.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-team-b-fg">
          {toUserMessage(members.error, '참가자를 불러오지 못했습니다')}
        </p>
      )}
      {removeMember.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-team-b-fg">
          {toUserMessage(removeMember.error, '참가자를 빼지 못했습니다')}
        </p>
      )}

      {members.isPending || groups.isPending ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : (
        <RosterSections groups={groupList} members={all} config={config} view={view} />
      )}
    </main>
  )
}

/**
 * 참가 · 미정 · 불참 · 명단만 한 줄.
 *
 * 네 숫자의 합이 언제나 명단 전체다(rsvp.ts `countRsvp`). '명단만' 을
 * 빼먹으면 9명짜리 모임에 "참가 1 · 미정 0 · 불참 0" 만 떠서 나머지
 * 여덟이 어디로 샜는지 알 수 없다 — 찍어 보고 잡은 문제다.
 */
function RsvpSummary({ members }: { members: MemberSummary[] }) {
  const counts = countRsvp(members)
  return (
    <p className="tabular text-xs font-semibold text-ink-3">
      {rsvpCountsText(counts)}
      {counts.noAccount > 0 && ` · 명단만 ${counts.noAccount}`}
    </p>
  )
}

/**
 * 명단을 어떻게 나눠 담을지.
 *
 * 대회는 조가 뼈대다 — "우리 조에 누구 있지" 가 대회에서 명단을 여는
 * 이유고, 조가 없으면 그 질문에 답할 방법이 없다. 모임은 조가 아예 없어서
 * 한 장으로 붙인다.
 */
function RosterSections({
  groups,
  members,
  config,
  view,
}: {
  groups: GroupRow[]
  members: MemberSummary[]
  config: TournamentConfig | undefined
  view: RosterView
}) {
  const ungrouped = members.filter((m) => !m.groupId)

  if (groups.length === 0) {
    return (
      <section
        aria-label="명단"
        className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1"
      >
        {members.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-3">
            아직 아무도 없습니다{view.isAdmin && ' — 위에 이름을 적어 넣어 보세요'}
          </p>
        ) : (
          <RosterRows members={members} view={view} />
        )}
      </section>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          members={members.filter((m) => m.groupId === g.id)}
          config={config}
          view={view}
        />
      ))}

      {/*
        조가 있는 대회에서만 그린다. 모임에는 조가 없으므로 여기까지 오지
        않는다 — 예전에는 조 없는 전원이 이 주황 점선 박스에 통째로 들어가
        정상 상태에 경고색이 칠해져 있었다.
      */}
      {ungrouped.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-dashed border-warn/50">
          <header className="flex items-center justify-between border-b border-border-subtle bg-warn/5 px-4 py-2.5">
            <h2 className="font-bold text-ink-1">조 미정</h2>
            <span className="tabular text-xs font-semibold text-warn-fg">{ungrouped.length}명</span>
          </header>
          <RosterRows members={ungrouped} view={view} />
        </section>
      )}
    </div>
  )
}

/** 한 줄을 그리는 데 필요한 것들. 줄마다 인자 여덟 개를 넘기지 않으려고 묶는다 */
interface RosterView {
  tournamentId: string
  stats: RosterStats
  /** 경기에 걸려 있어 뺄 수 없는 이름 */
  locked: Set<string>
  myMemberId: string | undefined
  isAdmin: boolean
  showPlayed: boolean
  showAccount: boolean
  showRsvp: boolean
  onRemove: (m: MemberSummary) => void
  removing: boolean
}

function GroupCard({
  group,
  members,
  config,
  view,
}: {
  group: GroupRow
  members: MemberSummary[]
  config: TournamentConfig | undefined
  view: RosterView
}) {
  const over = members.length > group.capacity
  const target = group.is_joker ? config?.jokerPoints : config?.normalPoints

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-black text-ink-1">{group.name}</h2>
          {group.is_joker && (
            <Badge tone="joker">
              <span aria-hidden>🃏</span>
              조커
              {target !== undefined && <span className="tabular">· {target}점</span>}
            </Badge>
          )}
        </div>
        <span className={cn('tabular text-xs font-semibold', over ? 'text-warn-fg' : 'text-ink-3')}>
          {members.length} / {group.capacity}명{over && ' · 정원 초과'}
        </span>
      </header>

      {members.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-ink-3">아직 아무도 없습니다</p>
      ) : (
        <RosterRows members={members} view={view} />
      )}
    </section>
  )
}

function RosterRows({ members, view }: { members: MemberSummary[]; view: RosterView }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {orderRoster(members, view.stats).map((m) => (
        <RosterRow key={m.id} member={m} view={view} />
      ))}
    </ul>
  )
}

/**
 * 한 사람 한 줄 — 이름 · 상태 배지 · 오늘 판수 · (운영진이면) 빼기.
 *
 * 배지를 이름과 같은 줄에 흘려 넣고 `flex-wrap` 으로 접는다. 폭이 모자란
 * 줄만 두 줄이 되고 나머지는 한 줄로 남는다 — 20줄짜리 목록을 통째로 두
 * 배 높이로 만들지 않으려는 것이다.
 */
function RosterRow({ member: m, view }: { member: MemberSummary; view: RosterView }) {
  const isMe = m.id === view.myMemberId
  const stat = rosterStat(view.stats, m.displayName)
  const isLocked = view.locked.has(m.displayName)
  // 주최자는 뺄 수 없다(서버 규칙) — 없어지면 대회 주인이 사라진다
  const canRemove = view.isAdmin && m.role !== 'owner' && !isMe

  return (
    <li className="flex items-center gap-2 py-1.5 pr-2 pl-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {/*
          운영진은 이름을 눌러 바로 고친다. 오타로 들어온 이름을 본인이
          못 고치는 상황(폰이 없거나 이미 경기 중)이 흔하다.
        */}
        {view.isAdmin ? (
          <NameEditor
            tournamentId={view.tournamentId}
            memberId={m.id}
            name={m.displayName}
            label={m.displayName}
            compact
          />
        ) : (
          <span
            className={cn('min-w-0 truncate font-semibold', isMe ? 'text-brand-fg' : 'text-ink-1')}
          >
            {m.displayName}
          </span>
        )}

        {isMe && <span className="shrink-0 text-xs font-bold text-brand-fg">나</span>}
        {m.role === 'owner' && <Badge>주최</Badge>}
        {m.role === 'admin' && <Badge tone="ok">관리</Badge>}
        {/*
          `is_guest` 로만 가른다. `userId === null` 로 그리면 운영진이 손으로
          올린 미가입 회원 전원에게 '게스트' 딱지가 붙는다 — 그 사람들은 매주
          오는 회원이다. 계정 유무는 따로, 갈라줄 때만 띄운다.
        */}
        {m.isGuest && <Badge tone="neutral">게스트</Badge>}
        {view.showAccount && !m.userId && <Badge tone="neutral">미가입</Badge>}
        {/*
          계정이 있는 사람만 '미정/불참' 이 붙는다. 계정이 없으면 누를
          방법이 없어 값이 영원히 'invited' 에 머무는데, 그걸 '미정' 이라고
          부르면 매주 오는 회원이 유령 미응답자가 된다 (rsvp.ts 의
          `noAccount` 가 같은 이유로 그 사람들을 미정에서 빼낸다).
        */}
        {view.showRsvp && m.userId && m.rsvp !== 'going' && (
          <Badge tone="neutral">{rsvpLabel(m.rsvp)}</Badge>
        )}
      </div>

      {/*
        오늘 몇 판 뛰었나. 색이 아니라 굵기로 가른다 — 체육관 조명·햇빛·
        색맹에서 색이 제일 먼저 무너진다(docs/design.md).
      */}
      {view.showPlayed && (
        <span
          className={cn(
            'tabular shrink-0 text-xs',
            stat.played === 0 ? 'font-bold text-ink-1' : 'text-ink-3',
          )}
        >
          {stat.played}판
        </span>
      )}

      {canRemove ? (
        <button
          type="button"
          disabled={view.removing || isLocked}
          title={
            isLocked
              ? '이미 경기에 걸려 있어 뺄 수 없습니다 (지우면 그 경기 기록에서도 사라집니다)'
              : undefined
          }
          onClick={() => view.onRemove(m)}
          aria-label={
            isLocked
              ? `${m.displayName} 제외 불가 — 이미 경기에 나갔습니다`
              : `${m.displayName} 제외`
          }
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-border-subtle
                     text-ink-3 transition-colors
                     hover:border-team-b/40 hover:bg-team-b/10 hover:text-team-b-fg
                     disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border-subtle
                     disabled:hover:bg-transparent disabled:hover:text-ink-3
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <UserMinus className="size-4" aria-hidden />
        </button>
      ) : (
        /*
          자리만 비워 둔다. 주최자 줄에만 버튼이 없으면 판수 칸이 그 줄에서만
          오른쪽으로 밀려 숫자 열이 어긋난다 — 찍어 보고 잡은 문제다.
        */
        view.isAdmin && <span aria-hidden className="size-10 shrink-0" />
      )}
    </li>
  )
}
