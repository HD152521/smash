import { Link, useParams } from 'react-router-dom'
import { ArrowRight, KeyRound, Link2, Settings, Users } from 'lucide-react'
import { BackBar } from '@/components/ui/BackBar'
import { useAuth } from '@/features/auth/useAuth'
import { ClubTournamentList } from '@/features/club/ClubTournamentList'
import { ClubUnavailable } from '@/features/club/ClubScreen'
import { useClub, useClubMembers, useClubTournaments } from '@/features/club/queries'
import { isClubStaff } from '@/lib/club'

/**
 * 동아리 허브 — **이 동아리에서 무엇을 할지 고른다.**
 *
 * 전에는 한 장에 다 있었다. 이름 · 동아리 코드 · 게스트 링크 · 산하 대회
 * 목록 · 회원 명단 · 나가기 · 지우기. 그 화면의 주석은 스스로 "목록
 * 하나(명단)와 값 두 개뿐이라 나눌 만큼 길어지지 않는다" 고 변론했지만,
 * 그 사이 목록이 둘(산하 대회 · 명단)이 되고 게스트 링크가 그 사이에
 * 끼면서 변론이 무너졌다.
 *
 * 대회 관리(`TournamentAdminPage`)가 같은 문제를 이미 이렇게 풀었다 —
 * *"코트·참가자·조를 한 화면에 쌓으면 급할 때 필요한 게 스크롤 밑으로
 * 밀린다"*. 동아리에만 그 원칙을 안 쓰고 있었다.
 *
 * 체육관에서 운영진이 이 화면을 여는 이유는 거의 언제나 하나 —
 * **게스트 링크를 카톡에 붙여넣기.** 이제 한 번 눌러 닿는다.
 *
 * ⚠ 여기에 명단이나 코드를 다시 끌어오지 마라. 산하 대회 목록은
 * 데이터가 아니라 **문의 목록**이라 남는다 — 한 줄이 대회 하나로 가는
 * 길이다.
 */
export function ClubPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const { user } = useAuth()

  const club = useClub(clubId)
  const members = useClubMembers(clubId)
  const tournaments = useClubTournaments(clubId)

  const me = members.data?.find((m) => m.userId === user?.id)
  const canManage = isClubStaff(me?.role)

  if (club.error) return <ClubUnavailable error={club.error} />

  if (!club.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const c = club.data
  const memberCount = members.data?.length

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackBar to="/clubs" label="내 동아리" />

      <p className="mt-6 text-sm font-semibold tracking-widest text-brand-fg uppercase">CLUB</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-1">{c.name}</h1>
      {c.description && <p className="mt-2 text-sm text-ink-2">{c.description}</p>}

      {/*
        운영진이 가장 자주 하는 일을 맨 위, 가장 큰 면적에 둔다.
        회원에게는 이 줄이 아예 없다 — 눌러도 안 되는 것을 보여주지 않는다.
      */}
      {canManage && (
        <Link
          to={`/c/${c.id}/guest`}
          className="group mt-7 flex min-h-20 items-center gap-4 rounded-3xl bg-brand-600 px-5 py-4
                     text-white shadow-[var(--shadow-card)] transition-transform
                     hover:-translate-y-0.5 focus-visible:-translate-y-0.5
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Link2 className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black tracking-tight">게스트 링크</span>
            <span className="mt-0.5 block text-sm text-brand-100">
              계정 없는 사람을 오늘 모임에 부릅니다
            </span>
          </span>
          <ArrowRight
            aria-hidden
            className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      )}

      <ClubTournamentList
        clubId={c.id}
        tournaments={tournaments.data}
        isPending={tournaments.isPending}
        error={tournaments.error}
        canCreate={canManage}
      />

      <h2 className="mt-10 text-xs font-bold tracking-[0.14em] text-ink-3 uppercase">동아리</h2>
      <nav className="mt-3 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
        <HubRow
          to={`/c/${c.id}/members`}
          icon={<Users className="size-5" aria-hidden />}
          title="명단"
          desc="누가 회원이고 누가 운영진인가"
          count={memberCount}
        />
        {canManage && (
          <HubRow
            to={`/c/${c.id}/invite`}
            icon={<KeyRound className="size-5" aria-hidden />}
            title="동아리 코드"
            desc="회원을 명단에 들이는 코드"
          />
        )}
        <HubRow
          to={`/c/${c.id}/settings`}
          icon={<Settings className="size-5" aria-hidden />}
          title="동아리 설정"
          desc={canManage ? '이름 바꾸기 · 나가기' : '나가기'}
          last
        />
      </nav>
    </main>
  )
}

function HubRow({
  to,
  icon,
  title,
  desc,
  count,
  last = false,
}: {
  to: string
  icon: React.ReactNode
  title: string
  desc: string
  /** 셀 수 있는 것만. 아직 모르면 아무것도 안 그린다 — 빈 배지는 고장으로 읽힌다 */
  count?: number
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-16 items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2
                  focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600
                  ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="shrink-0 text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink-1">
          {title}
          {count !== undefined && (
            <span className="tabular ml-1.5 text-sm font-black text-ink-3">{count}</span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-ink-2">{desc}</span>
      </span>
      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-3" />
    </Link>
  )
}
