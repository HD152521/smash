import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge, LiveBadge } from '@/components/ui/Badge'
import { toUserMessage } from '@/lib/errors'
import type { ClubTournament } from './api'
import type { TournamentStatus } from '@/types/database'

const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: '준비중',
  live: '진행중',
  finished: '종료',
}

/**
 * 이 동아리 밑에 열린 대회·모임.
 *
 * 목록이 비어 있는 게 정상인 경우가 둘이라 빈 칸을 오류로 그리면 안 된다.
 *
 *  1. 아직 아무것도 안 열었다
 *  2. **나중에 운영진이 됐다** — 동아리는 권한 축이 아니라서
 *     (`tournaments_select` 는 여전히 `is_tournament_member` 뿐이다) 내가
 *     운영진이 되기 *전에* 열린 대회에는 내 멤버 행이 없고, 그래서 안 보인다.
 *     의도된 동작이지만 화면에서 아무 말도 안 하면 "동아리 대회가 사라졌다"
 *     로 읽힌다. 그 사람에게 보이는 건 텅 빈 목록 하나뿐이기 때문이다.
 */
export function ClubTournamentList({
  clubId,
  tournaments,
  isPending,
  error,
  canCreate,
}: {
  clubId: string
  tournaments: ClubTournament[] | undefined
  isPending: boolean
  error: unknown
  /** 운영진만 동아리 밑에 열 수 있다 (`create_tournament` 이 is_club_admin 을 본다) */
  canCreate: boolean
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-ink-1">동아리 대회·모임</h2>

      {isPending && (
        <div className="mt-3 flex flex-col gap-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {error != null && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '동아리 대회를 불러오지 못했습니다')}
        </p>
      )}

      {tournaments && tournaments.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-border-subtle px-5 py-8 text-center">
          <p className="text-sm font-semibold text-ink-1">아직 동아리 밑에 연 대회가 없습니다</p>
          <p className="mt-1.5 text-xs text-ink-2">
            내가 운영진이 되기 전에 열린 대회는 여기 보이지 않습니다. 그 대회의 참가자 명단에 내가
            없기 때문입니다.
          </p>
          {canCreate && <CreateLinks clubId={clubId} className="mt-5" />}
        </div>
      )}

      {tournaments && tournaments.length > 0 && (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/t/${t.id}`}
                  className="group flex min-h-14 items-center gap-3 rounded-2xl border
                             border-border-subtle bg-surface-1 px-4 py-3 transition-colors
                             hover:bg-surface-2 focus-visible:outline-2
                             focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-ink-1">{t.name}</span>
                      {t.status === 'live' ? (
                        <LiveBadge />
                      ) : (
                        <Badge tone={t.status === 'finished' ? 'neutral' : 'ok'}>
                          {STATUS_LABEL[t.status]}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {t.kind === 'session' ? '모임' : '대회'} · 코드 {t.inviteCode}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          {canCreate && <CreateLinks clubId={clubId} className="mt-3" />}
        </>
      )}
    </section>
  )
}

/**
 * 동아리 밑에 여는 진입점.
 *
 * 소속을 쿼리로 넘긴다 — 만들기 화면의 기본값은 '동아리 없음' 이라
 * 여기서 넘겨주지 않으면 동아리 화면에서 들어간 사람도 매번 다시 골라야 한다.
 * 넘겨받은 쪽은 그 동아리에서 내가 운영진일 때만 그 값을 쓴다.
 */
function CreateLinks({ clubId, className }: { clubId: string; className?: string }) {
  const linkClass =
    'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border ' +
    'border-border-subtle px-4 text-sm font-semibold text-ink-1 transition-colors ' +
    'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-brand-600'

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Link to={`/new/session?club=${clubId}`} className={linkClass}>
          모임 열기
        </Link>
        <Link to={`/new?club=${clubId}`} className={linkClass}>
          대회 만들기
        </Link>
      </div>
    </div>
  )
}
