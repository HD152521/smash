import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/nav/AppHeader'
import { APP_TAB_PADDING } from '@/components/nav/appTabs'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/brand/EmptyState'
import { useMyClubs } from '@/features/club/queries'
import { clubRoleLabel, isClubStaff } from '@/lib/club'
import { toUserMessage } from '@/lib/errors'

/**
 * 내 동아리.
 *
 * 동아리는 대회 위에 얹힌 선택 계층이라, 안 쓰는 사람에게는 이 화면이 평생
 * 비어 있다. 그래서 빈 화면이 '고장' 이 아니라 '아직 안 만든 것' 으로 읽히게
 * 만드는 게 이 화면의 절반이다 — 만들기와 코드로 들어오기를 둘 다 준다.
 */
export function MyClubsPage() {
  const { data, isPending, error } = useMyClubs()

  return (
    <main className="mx-auto w-full max-w-2xl px-5" style={{ paddingBottom: APP_TAB_PADDING }}>
      {/*
        설명문("동아리 밑에 대회와 모임을 열면…")을 뺐다. 하단탭의 목적지라
        매번 보게 되는 화면인데, 매번 볼 것이 아니라 처음 한 번만 필요한
        문장이었다(docs/design.md 「제목을 지우고 정보를 키운다」). 아직
        동아리가 없는 사람에게는 아래 빈 상태가 같은 말을 더 자세히 한다.
      */}
      <AppHeader title="내 동아리" meta={data ? `${data.length}개` : undefined} />

      {isPending && (
        <div className="mt-6 flex flex-col gap-3" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-8 text-sm font-medium text-team-b-fg">
          {toUserMessage(error, '동아리 목록을 불러오지 못했습니다')}
        </p>
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon="shuttlecock"
          className="mt-10 rounded-3xl px-6 py-12"
          title="아직 속한 동아리가 없습니다"
          description="동아리 없이도 대회와 모임은 그대로 열 수 있습니다. 매주 같은 사람들과 친다면 동아리를 만들어 두세요."
          action={
            <div className="flex flex-col justify-center gap-2.5 sm:flex-row">
              <Link
                to="/clubs/new"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600
                           px-4 text-[0.95rem] font-semibold text-white shadow-sm
                           transition-colors hover:bg-brand-700
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                동아리 만들기
              </Link>
              <Link
                to="/clubs/join"
                className="inline-flex h-11 items-center justify-center rounded-xl border
                           border-border-subtle px-4 text-[0.95rem] font-semibold text-ink-1
                           transition-colors hover:bg-surface-2
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                동아리 코드로 들어가기
              </Link>
            </div>
          }
        />
      )}

      {data && data.length > 0 && (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {data.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/c/${c.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border-subtle
                             bg-surface-1 p-5 shadow-[var(--shadow-card)]
                             transition-transform hover:-translate-y-0.5
                             focus-visible:-translate-y-0.5 focus-visible:outline-2
                             focus-visible:outline-offset-2 focus-visible:outline-brand-600
                             active:translate-y-0 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold text-ink-1">{c.name}</h2>
                      {/* 회원 배지는 안 단다 — 대부분이 회원이라 아무것도 구분해 주지 못한다 */}
                      {isClubStaff(c.role) && (
                        <Badge tone={c.role === 'owner' ? 'neutral' : 'ok'}>
                          {clubRoleLabel(c.role)}
                        </Badge>
                      )}
                    </div>

                    {c.description && (
                      <p className="mt-1 truncate text-sm text-ink-2">{c.description}</p>
                    )}

                    {/*
                      동아리 코드는 운영진만 본다. 대회 초대 코드와 같은 이유로
                      (회원에게는 이미 쓸모가 없다) 숨기지만, 여기서는 이유가
                      하나 더 있다 — 아무나 퍼뜨리면 명단이 곧 원본이 되는
                      동아리에 모르는 사람이 들어온다.
                    */}
                    {isClubStaff(c.role) && (
                      <p className="tabular mt-2 text-xs font-semibold tracking-widest text-ink-3">
                        동아리 코드 {c.inviteCode}
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

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <Link
              to="/clubs/new"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border
                         border-border-subtle px-4 text-sm font-semibold text-ink-1
                         transition-colors hover:bg-surface-2 active:bg-surface-2
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              동아리 만들기
            </Link>
            <Link
              to="/clubs/join"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border
                         border-border-subtle px-4 text-sm font-semibold text-ink-1
                         transition-colors hover:bg-surface-2 active:bg-surface-2
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              동아리 코드로 들어가기
            </Link>
          </div>
        </>
      )}
    </main>
  )
}
