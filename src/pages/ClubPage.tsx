import { Link, useNavigate, useParams } from 'react-router-dom'
import { LogOut, Trash2 } from 'lucide-react'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useAuth } from '@/features/auth/useAuth'
import { ClubStaffManager } from '@/features/club/ClubStaffManager'
import { ClubTournamentList } from '@/features/club/ClubTournamentList'
import {
  useClub,
  useClubMembers,
  useClubTournaments,
  useDeleteClub,
  useRemoveClubMember,
  useRenameClub,
} from '@/features/club/queries'
import { CLUB_NAME_MAX, isClubStaff } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'

/**
 * 동아리 화면 — 이름 · 동아리 코드 · 명단 · 산하 대회.
 *
 * 대회의 관리 화면(`TournamentAdminPage`)처럼 허브로 쪼개지 않고 한 장에 둔다.
 * 동아리에서 하는 일은 목록 하나(명단)와 값 두 개(이름·코드)뿐이라 화면을
 * 나눌 만큼 길어지지 않는다. 길어지는 것은 명단인데, 그건 어차피 스크롤이다.
 *
 * 권한은 화면이 아니라 서버가 정한다. 여기서 숨기는 건 **눌러도 안 되는 것을
 * 안 보이게** 하는 것뿐이다 — 진짜 벽은 RLS 와 RPC 안의 검사다.
 */
export function ClubPage() {
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const club = useClub(clubId)
  const members = useClubMembers(clubId)
  const tournaments = useClubTournaments(clubId)

  const rename = useRenameClub(clubId ?? '')
  const leave = useRemoveClubMember(clubId ?? '')
  const remove = useDeleteClub()

  /*
   * 내 역할은 명단에서 찾는다. 목록 화면(`useMyClubs`)이 이미 역할을 들고
   * 있지만 여기까지 들고 오지 않는다 — 코드로 막 들어온 사람이나 주소로 바로
   * 들어온 사람에게는 그 목록이 아직 없다.
   */
  const me = members.data?.find((m) => m.userId === user?.id)
  const canManage = isClubStaff(me?.role)
  const isOwner = me?.role === 'owner'

  async function handleLeave() {
    if (!me) return
    if (!confirm(`${club.data?.name ?? '이 동아리'}에서 나갈까요?`)) return
    try {
      await leave.mutateAsync(me.id)
      navigate('/clubs', { replace: true })
    } catch {
      // leave.error 로 화면에 뿌린다
    }
  }

  async function handleDelete() {
    if (!clubId) return
    if (!confirm(`${club.data?.name ?? '이 동아리'}를 지울까요? 되돌릴 수 없습니다.`)) return
    try {
      await remove.mutateAsync(clubId)
      navigate('/clubs', { replace: true })
    } catch {
      // remove.error 로 화면에 뿌린다
    }
  }

  if (club.error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
        <BackLink to="/clubs">내 동아리</BackLink>
        <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
          {toUserMessage(club.error, '동아리를 불러오지 못했습니다')}
        </p>
        {/* 남의 동아리는 아예 안 보인다(`clubs_select` 가 is_club_member).
            '없다' 와 '내가 회원이 아니다' 를 구별할 수 없으므로 둘 다 안내한다. */}
        <p className="mt-2 text-sm text-ink-2">
          회원만 볼 수 있습니다.{' '}
          <Link
            to="/clubs/join"
            className="font-semibold text-brand-fg underline underline-offset-2
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            동아리 코드로 들어가기
          </Link>
        </p>
      </main>
    )
  }

  if (!club.data) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const c = club.data

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <BackLink to="/clubs">내 동아리</BackLink>

      <p className="mt-6 text-sm font-semibold tracking-widest text-brand-fg uppercase">CLUB</p>
      {canManage ? (
        <div className="mt-1 flex items-center">
          <InlineEdit
            value={c.name}
            label="동아리"
            maxLength={CLUB_NAME_MAX}
            pending={rename.isPending}
            error={rename.error ? toUserMessage(rename.error, '이름을 바꾸지 못했습니다') : null}
            onSave={async (next) => {
              await rename.mutateAsync(next)
            }}
          />
        </div>
      ) : (
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-1">{c.name}</h1>
      )}

      {c.description && <p className="mt-2 text-sm text-ink-2">{c.description}</p>}

      {/* ── 동아리 코드 ───────────────────────────────────────────── */}
      {/*
        운영진에게만 보인다. 대회 초대 코드와 같은 규칙이지만 이유가 하나 더
        있다 — 동아리 명단은 앞으로 열리는 모든 대회 명단의 원본이라,
        코드가 새면 모르는 사람이 명단에 남는다.
        재발급은 없다. 대회와 달리 코드를 자주 바꿀 일이 없고, 바꾸면 아직
        안 들어온 회원에게 뿌린 코드가 한꺼번에 죽는다.
      */}
      {canManage && (
        <section className="mt-6 rounded-2xl border border-border-subtle bg-surface-1 p-5">
          <h2 className="text-sm font-semibold text-ink-2">동아리 코드</h2>
          <p className="tabular mt-0.5 text-2xl font-black tracking-[0.2em] text-ink-1">
            {c.invite_code}
          </p>
          <p className="mt-1.5 text-xs text-ink-3">
            대회 초대 코드와 다릅니다. 회원은 <b>동아리 들어가기</b> 화면에서 이 코드를 넣습니다.
          </p>
        </section>
      )}

      <ClubTournamentList
        clubId={c.id}
        tournaments={tournaments.data}
        isPending={tournaments.isPending}
        error={tournaments.error}
        canCreate={canManage}
      />

      {/* ── 명단 ──────────────────────────────────────────────────── */}
      <div className="mt-8">
        {members.isPending && (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
        )}

        {members.error && (
          <p role="alert" className="text-sm font-medium text-team-b-fg">
            {toUserMessage(members.error, '명단을 불러오지 못했습니다')}
          </p>
        )}

        {members.data && (
          <ClubStaffManager
            clubId={c.id}
            members={members.data}
            myMemberId={me?.id}
            canManage={canManage}
          />
        )}
      </div>

      {/* ── 나가기 · 지우기 ───────────────────────────────────────── */}
      {/*
        동아리장은 나갈 수 없다 (`remove_club_member` 가 막는다). 나가면
        아무도 운영할 수 없는 동아리가 남기 때문이다. 대신 지우는 길이 있다.
      */}
      <section className="mt-10 border-t border-border-subtle pt-6">
        {me && !isOwner && (
          <>
            <Button
              variant="secondary"
              loading={leave.isPending}
              onClick={() => void handleLeave()}
            >
              <LogOut className="size-4" aria-hidden />
              동아리 나가기
            </Button>
            <p className="mt-2 text-xs text-ink-3">
              이미 치른 대회의 기록과 명단은 그대로 남습니다.
            </p>
            {leave.error && (
              <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                {toUserMessage(leave.error, '나가지 못했습니다')}
              </p>
            )}
          </>
        )}

        {isOwner && (
          <>
            <Button variant="danger" loading={remove.isPending} onClick={() => void handleDelete()}>
              <Trash2 className="size-4" aria-hidden />
              동아리 지우기
            </Button>
            <p className="mt-2 text-xs text-ink-3">
              산하 대회·모임과 경기 기록은 남고 소속만 풀립니다. 사라지는 것은 동아리와 이
              명단뿐입니다.
            </p>
            {remove.error && (
              <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
                {toUserMessage(remove.error, '동아리를 지우지 못했습니다')}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  )
}
