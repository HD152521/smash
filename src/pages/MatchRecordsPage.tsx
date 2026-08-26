import { useState } from 'react'
import { TournamentNav } from '@/features/tournament/TournamentNav'
import { Link, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useGroups, useMatches } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import { matchHasPlayer, orderRecords } from '@/lib/records'
import { isUnscored } from '@/lib/session'
import { cn } from '@/lib/utils'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 경기 기록 — 끝난 경기를 몇 대 몇으로 누가 이겼는지.
 *
 * 대회가 끝난 뒤 가장 많이 열리는 화면이다. "그때 그 경기 몇 대 몇이었지"
 * 를 찾으려면 조나 사람으로 걸러야 한다.
 *
 * 순서와 검색 기준은 lib/records.ts 에 있다 — 최근에 끝난 것이 위, 무효는
 * 맨 아래, 검색은 뛴 사람만.
 *
 * ⚠ **이 화면의 책임은 찾는 것 하나다. 여기서 기록을 고치지 않는다.**
 * 전에는 카드마다 무효 처리 X 가 붙어 있었는데, 폰에서 목록을 훑다 손끝이
 * 스치는 자리가 곧 "순위에서 빼기" 였다. 그 버튼 하나 때문에 카드 여백까지
 * 비틀어 놨었다.
 *
 * 무효는 상세 화면(`/t/:id/records/:matchId`)에만 있다. 그쪽은 "이 경기를
 * 되짚어 본다" 가 책임이라 판단에 필요한 근거(점수가 어떻게 흘렀는지 ·
 * 심판)가 이미 다 있고, 결과가 어떻게 되는지도 눌리기 전에 설명한다.
 */
export function MatchRecordsPage() {
  const { id } = useParams<{ id: string }>()
  const matches = useMatches(id)
  const groups = useGroups(id)

  const [groupFilter, setGroupFilter] = useState('')
  const [query, setQuery] = useState('')

  const finished = (matches.data ?? []).filter(
    (m) => m.status === 'finished' || m.status === 'void',
  )

  const filtered = finished.filter((m) => {
    if (groupFilter && m.group_a_id !== groupFilter && m.group_b_id !== groupFilter) return false
    return matchHasPlayer(m, query)
  })

  const ordered = orderRecords(filtered)

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <TournamentNav id={id!} active="records" />
      <h2 className="sr-only">경기 기록</h2>

      {/* 필터 */}
      <div className="mt-6 flex flex-col gap-3">
        <label className="relative">
          <span className="sr-only">선수 이름으로 찾기</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="선수 이름"
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
            {ordered.map((m, i) => {
              // 뷰 컬럼은 NOT NULL 이 보존되지 않아 생성 타입이 전부 nullable 이다.
              // 지역 const 로 받아야 콜백 안까지 좁혀진 타입이 살아남는다.
              const matchId = m.id
              /*
               * 날짜가 바뀌는 자리에 머리말을 넣는다.
               * 이틀짜리 대회에서 시각만 보이면 어제 경기와 오늘 경기가
               * 구분되지 않는다. 무효 구간은 시각순이 아니므로 넣지 않는다.
               */
              const day = m.status === 'void' ? null : dayLabel(m)
              const prev = i === 0 ? null : ordered[i - 1]
              const showDay =
                day !== null && (prev == null || prev.status === 'void' || dayLabel(prev) !== day)

              return (
                <li key={matchId}>
                  {showDay && (
                    <h3 className="mt-3 mb-1.5 text-xs font-black text-ink-3 first:mt-0">{day}</h3>
                  )}
                  <RecordCard m={m} tournamentId={id!} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}

/** 목록을 끊어 읽는 기준이 되는 날짜 — "8월 24일 (월)" */
function dayLabel(m: MatchOverviewRow): string | null {
  const when = m.finished_at ?? m.created_at
  if (!when) return null
  const d = new Date(when)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function RecordCard({ m, tournamentId }: { m: MatchOverviewRow; tournamentId: string }) {
  const voided = m.status === 'void'
  const when = m.finished_at ?? m.created_at
  return (
    <>
      {/* 눌러서 점수가 어떻게 흘러갔는지 본다. 최종 점수만으로는
          21:19 도 21:5 도 그냥 '이겼다' 라서 남는 게 없다. */}
      <Link
        to={`/t/${tournamentId}/records/${m.id}`}
        className={cn(
          'block rounded-2xl border border-border-subtle bg-surface-1 p-4',
          'transition-colors hover:bg-surface-2',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          voided && 'opacity-60',
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
          {/*
            모임 경기는 점수를 안 세고 끝날 수 있다. 그때 '0 : 0' 을 크게 띄우면
            0대 0으로 끝난 경기처럼 읽힌다 — 안 센 것과 0점은 다른 이야기다.
          */}
          {isUnscored(m) ? (
            <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-3">
              점수 없음
            </span>
          ) : (
            <span className="tabular shrink-0 text-2xl font-black text-ink-1">
              {m.score_a ?? 0} : {m.score_b ?? 0}
            </span>
          )}
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
    </>
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
