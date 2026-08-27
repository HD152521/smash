import { cn } from '@/lib/utils'
import { isMatchReferee } from '@/lib/matchAccess'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 진행 중인 코트 카드의 **속** — 코트 이름 · 오른쪽 한 자리 · 네트로 갈린 양 팀.
 *
 * 대회와 모임이 같은 코트를 그리되 **오른쪽 한 자리와 카드를 감싸는 것**만
 * 다르다. 대회는 점수를 크게 띄우고 카드 전체가 점수판으로 가는 링크고,
 * 모임은 거기에 '끝내기' 가 앉고 카드 전체가 그 버튼이다.
 *
 * 그래서 껍데기는 각자 두고 속만 여기서 나눈다 — 두 벌로 복사하면 네트
 * 선 굵기 하나 고칠 때 한쪽만 고치게 된다.
 */
export function LiveCourtBody({
  courtName,
  match,
  myDisplayName,
  trailing,
}: {
  courtName: string
  match: MatchOverviewRow
  myDisplayName: string | undefined
  /** 코트 이름 오른쪽 자리 — 대회는 점수, 모임은 '끝내기' */
  trailing: React.ReactNode
}) {
  const iAmReferee = isMatchReferee(match, myDisplayName)

  return (
    <>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5">
        <h3 className="truncate text-lg font-black text-ink-1">{courtName}</h3>
        {trailing}
      </div>
      <div className="flex items-stretch gap-3 px-4 pt-1.5 pb-3.5">
        <TeamNames
          name={match.group_a_name}
          joker={match.group_a_joker}
          players={match.players_a}
          align="left"
        />
        <div aria-hidden className="w-px shrink-0 bg-border-subtle" />
        <TeamNames
          name={match.group_b_name}
          joker={match.group_b_joker}
          players={match.players_b}
          align="right"
        />
      </div>
      {/* 모임에는 심판이 없으므로 이 줄은 대회에서만 나온다 */}
      {(iAmReferee || (match.referees?.length ?? 0) > 0) && (
        <p className="px-4 pb-3 text-xs text-ink-3">
          심판 {match.referees?.join(', ') || '미지정'}
          {iAmReferee && <span className="ml-1.5 font-bold text-brand-fg">내가 심판</span>}
        </p>
      )}
    </>
  )
}

function TeamNames({
  name,
  joker,
  players,
  align,
}: {
  name: string | null
  joker: boolean | null
  players: string[] | null
  align: 'left' | 'right'
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className="truncate text-sm font-bold text-ink-1">
        {joker && <span aria-hidden>🃏 </span>}
        {name ?? players?.join(' · ') ?? '—'}
      </p>
      {name && players && players.length > 0 && (
        <p className="truncate text-xs text-ink-3">{players.join(' · ')}</p>
      )}
    </div>
  )
}
