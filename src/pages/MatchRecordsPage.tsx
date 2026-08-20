import { useState } from 'react'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { Link, useParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useAdminGate } from '@/features/admin/useAdminGate'
import { useGroups, useMatches, useVoidMatch } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 경기 기록 — 끝난 경기를 몇 대 몇으로 누가 이겼는지.
 *
 * 대회가 끝난 뒤 가장 많이 열리는 화면이다. "그때 그 경기 몇 대 몇이었지"
 * 를 찾으려면 조나 사람으로 걸러야 한다.
 *
 * 순서는 목록을 받아온 순서(fetchMatches)를 그대로 따르고, 무효 경기만
 * 맨 아래로 내린다.
 */
export function MatchRecordsPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatches(id)
  const groups = useGroups(id)
  const gate = useAdminGate(id)
  const voidMatch = useVoidMatch(id ?? '')

  const [groupFilter, setGroupFilter] = useState('')
  const [query, setQuery] = useState('')

  const finished = (matches.data ?? []).filter(
    (m) => m.status === 'finished' || m.status === 'void',
  )

  const q = query.trim().toLowerCase()
  const filtered = finished.filter((m) => {
    if (groupFilter && m.group_a_id !== groupFilter && m.group_b_id !== groupFilter) return false
    if (!q) return true
    const names = [...(m.players_a ?? []), ...(m.players_b ?? []), ...(m.referees ?? [])]
    return names.some((n) => n.toLowerCase().includes(q))
  })

  /*
   * 무효는 맨 아래로 가라앉힌다.
   *
   * 순위에 안 들어가는 경기가 목록 한가운데 흐릿하게 끼어 있으면 훑어
   * 내려가는 눈이 매번 거기서 한 번씩 걸린다. 지운 것도 아니라서 찾으려면
   * 찾을 수 있어야 하고, 그러면 자리는 맨 아래가 맞다.
   *
   * sort 는 안정 정렬이라 무효끼리도 · 아닌 것끼리도 원래 순서가 유지된다.
   * 원본을 건드리지 않도록 복사본을 정렬한다.
   */
  const ordered = [...filtered].sort(
    (a, b) => Number(a.status === 'void') - Number(b.status === 'void'),
  )

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <TournamentNav id={id!} active="records" />
      <h2 className="sr-only">경기 기록</h2>

      {/* 필터 */}
      <div className="mt-6 flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">선수 또는 심판 이름으로 찾기</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="선수 · 심판 이름"
            className="h-11 w-full rounded-xl border border-border-subtle bg-surface-1 pr-3.5 pl-10
                       text-ink-1 outline-none placeholder:text-ink-3
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
        </label>

        {groups.data && groups.data.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="조로 거르기">
            <Chip active={groupFilter === ''} onClick={() => setGroupFilter('')}>
              전체
            </Chip>
            {groups.data.map((g) => (
              <Chip
                key={g.id}
                active={groupFilter === g.id}
                onClick={() => setGroupFilter(groupFilter === g.id ? '' : g.id)}
              >
                {g.name}
                {g.is_joker && ' 🃏'}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {matches.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(matches.error, '기록을 불러오지 못했습니다')}
        </p>
      )}

      {/* 무효 처리 실패는 목록 위에 한 번만 띄운다. 카드마다 띄우면 목록이 흔들린다. */}
      {voidMatch.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(voidMatch.error, '무효 처리하지 못했습니다')}
        </p>
      )}

      {matches.isPending ? (
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-ink-2">
          {finished.length === 0 ? '아직 끝난 경기가 없습니다.' : '조건에 맞는 경기가 없습니다.'}
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs text-ink-3">
            {filtered.length}경기
            {filtered.length !== finished.length && ` (전체 ${finished.length})`}
          </p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {ordered.map((m) => {
              // 뷰 컬럼은 NOT NULL 이 보존되지 않아 생성 타입이 전부 nullable 이다.
              // 지역 const 로 받아야 콜백 안까지 좁혀진 타입이 살아남는다.
              const matchId = m.id
              const isAdmin = !gate.denied && !gate.loading

              return (
                <li key={matchId}>
                  <RecordCard
                    m={m}
                    tournamentId={id!}
                    onVoid={
                      isAdmin && matchId !== null
                        ? (reason) => voidMatch.mutate({ matchId, reason })
                        : undefined
                    }
                    voiding={voidMatch.isPending && voidMatch.variables?.matchId === matchId}
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}

function RecordCard({
  m,
  tournamentId,
  onVoid,
  voiding,
}: {
  m: MatchOverviewRow
  tournamentId: string
  /** 관리자일 때만 온다. 없으면 X 를 아예 그리지 않는다. */
  onVoid?: (reason: string | undefined) => void
  voiding: boolean
}) {
  const voided = m.status === 'void'
  const when = m.finished_at ?? m.created_at
  // 이미 무효인 경기에 X 를 또 띄우면 뭘 더 할 수 있는 것처럼 보인다
  const canVoid = Boolean(onVoid) && !voided

  return (
    <div className="relative">
      {/* 눌러서 점수가 어떻게 흘러갔는지 본다. 최종 점수만으로는
          21:19 도 21:5 도 그냥 '이겼다' 라서 남는 게 없다. */}
      <Link
        to={`/t/${tournamentId}/records/${m.id}`}
        className={cn(
          'block rounded-2xl border border-border-subtle bg-surface-1 p-4',
          'transition-colors hover:bg-surface-2',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          voided && 'opacity-60',
          // X 자리를 비워 둔다. 안 그러면 배지가 버튼 밑으로 들어간다.
          canVoid && 'pr-14',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {when && (
            <time className="tabular text-ink-3" dateTime={when}>
              {new Date(when).toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          )}
          {m.court_name && <span className="font-semibold text-ink-3">{m.court_name}</span>}
          {voided && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink-3">
              무효
            </span>
          )}
          {m.source === 'manual' && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink-2">
              직접 입력
            </span>
          )}
          {m.edited_at && !voided && m.source !== 'manual' && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn-fg">
              수정됨
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <Side
            name={m.group_a_name}
            joker={m.group_a_joker}
            players={m.players_a}
            won={!voided && m.winner_side === 'A'}
          />
          <span className="tabular shrink-0 text-2xl font-black text-ink-1">
            {m.score_a ?? 0} : {m.score_b ?? 0}
          </span>
          <Side
            name={m.group_b_name}
            joker={m.group_b_joker}
            players={m.players_b}
            won={!voided && m.winner_side === 'B'}
            align="right"
          />
        </div>

        {(m.referees?.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-ink-3">심판 {m.referees?.join(', ')}</p>
        )}
      </Link>

      {/*
        링크 '안' 이 아니라 형제로 겹쳐 올린다. a 안에 button 을 넣으면
        스크린리더가 둘 중 뭘 읽을지 모르고, 탭으로도 빠져나오지 못한다.
      */}
      {canVoid && (
        <button
          type="button"
          aria-label={`${m.group_a_name ?? ''} 대 ${m.group_b_name ?? ''} 경기 무효 처리`}
          disabled={voiding}
          onClick={() => {
            /*
             * 사유를 묻는 창이 확인 창을 겸한다 — 취소하면 아무 일도 없다.
             * 확인 따로 사유 따로 물으면 X 한 번 누르는 데 세 동작이 든다.
             */
            const reason = prompt('무효 처리하면 순위에서 빠집니다.\n사유 (변경 기록에 남습니다)')
            if (reason === null) return
            onVoid?.(reason || undefined)
          }}
          className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-xl
                     text-ink-3 transition-colors hover:bg-surface-2 hover:text-team-b-fg
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600
                     disabled:opacity-40"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

function Side({
  name,
  joker,
  players,
  won,
  align = 'left',
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  won: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className={cn('truncate font-bold', won ? 'text-brand-fg' : 'text-ink-1')}>
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? '—'}
        {won && <span className="ml-1 text-xs">승</span>}
      </p>
      {players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-border-subtle bg-surface-1 text-ink-1 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}
