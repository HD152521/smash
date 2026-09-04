import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BackBar } from '@/components/ui/BackBar'
import { Button } from '@/components/ui/Button'
import { Chip, PersonGrid, PickedBar } from './SessionPersonPicker'
import {
  useCourts,
  useCreateSessionMatch,
  useMatches,
  useMembers,
  useTournament,
  useUpdateSessionMatch,
} from '@/features/tournament/queries'
import { hasAccountContrast, partitionGoing } from '@/lib/rsvp'
import { countPlays, excludedByKind, suggestMatch } from '@/lib/autoMatch'
import { isAutoQueued, labelAfterHumanEdit } from '@/lib/autoQueue'
import { MATCH_KIND_FILTERS, matchKindLabel, type MatchKindFilter } from '@/lib/gender'
import { buildBusyMap } from '@/lib/busy'
import { removePick, splitTeams, togglePick } from '@/lib/matchPicker'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { MemberSummary } from '@/features/tournament/api'
import type { MatchOverviewRow } from '@/types/database'

/**
 * 모임 경기 편성 — 조 대신 **사람 넷과 코트 하나**를 고른다.
 *
 * 대회 편성(MatchCreatePage · MatchEditPage)과 나눠 둔다. 저쪽은 조를 먼저
 * 고르고 그 조에서 선수를 고르는 두 단계인데, 모임에는 조가 없어서 그 단계
 * 자체가 없다.
 *
 * ── 새로 짜기와 고치기가 같은 화면인 이유 ──────────────────────────
 * 하는 일이 글자 그대로 같다: 사람 넷을 고르고 코트를 정한다. 다른 것은
 * **시작할 때 무엇이 들어 있느냐** 뿐이다(빈 화면에 앱의 제안 / 그 경기의
 * 현재 선수). 고치기를 위해 화면을 하나 더 만들면 잠금 규칙(`busy.ts`)과
 * 판수 표시와 팀 가르기가 두 벌이 되고, 그 둘은 반드시 어긋난다.
 *
 * 대신 **모드를 쿼리로 켜지 않는다.** 라우트가 가른다 — 새로 짜기는
 * `/matches/new-session`, 고치기는 `/matches/:matchId/edit-session` 이고
 * 각 라우트가 자기 페이지 파일을 갖는다. 이 저장소는 `MatchCreatePage` 의
 * `mode` 토글로 한 번 겪었다(docs/이어서시작.md '화면 하나에 책임 하나').
 * 여기서 갈리는 것은 **어느 경기를 들고 들어왔나** 하나뿐이라,
 * `editMatchId` 가 있으면 고치기다.
 *
 * 화면의 규칙.
 *
 *  1. **다른 경기에 묶인 사람은 고를 수 없다.** 지금 뛰는 중이거나(live),
 *     이미 다음 경기에 편성돼 기다리는 중(scheduled)이면 잠근다. 넣어 두면
 *     시작하는 순간 서버가 거절하거나(한 사람 두 코트) 그 사람이 두 코트에서
 *     동시에 불려 간다. 고를 때 막는 게 낫다. 다만 **목록에서 지우지는
 *     않는다** — 사람이 조용히 사라지면 "쟤 어디 갔지" 가 된다. 흐리게 두고
 *     어느 코트에 있는지 옆에 적는다(`src/lib/busy.ts`).
 *
 *     ⚠ **고치는 중인 그 경기는 세지 않는다**(`exceptMatchId`). 안 그러면
 *     그 경기의 네 명이 자기 자신 때문에 잠겨, 아무도 뺄 수 없고 자리도
 *     안 나서 고치기가 통째로 죽는다.
 *  2. **새로 짜는 화면을 열면 네 명이 이미 들어가 있다.** 판수가 적은
 *     사람부터 급수를 맞춰 앱이 골라 둔다(`src/lib/autoMatch.ts`). 그대로
 *     좋으면 한 번 눌러 끝내고, 아니면 이름을 눌러 바꾼다 — **앱이 고른
 *     게 기본값이고 손대는 게 예외다.** 옆에 `[자동으로 짜기]` 버튼을
 *     달았다면 아무도 안 눌렀을 것이다.
 *
 *     한 번이라도 이름을 누르면 그때부터는 사람의 목록이고, 제안은 다시
 *     덮지 않는다. 총무가 다르게 짜는 데는 대개 앱이 모르는 이유가 있다.
 *
 *     **고치는 화면에서는 제안을 아예 안 만든다.** 고치러 온 사람의
 *     기본값은 그 경기의 현재 선수다 — 열자마자 앱이 다른 넷을 들이밀면
 *     그건 고치기가 아니라 새로 짜기이고, 무엇을 바꿨는지 알 수 없게 된다.
 *     같은 이유로 종목 칩도 고치기에는 없다(종목은 제안의 조건이다).
 *
 *  3. **참가를 누른 사람이 먼저 온다.** 그날 온 사람이 대개 그 사람들이라
 *     스무 명 명단에서 매번 찾아 내려가지 않게 된다. 하지만 참가는
 *     **게이트가 아니다** — 불참·미응답도 그대로 펼쳐 두고 고를 수 있다.
 *     누르지 않으면 못 치게 하는 앱은 동아리에서 미움받는다.
 *
 * 참가자 목록은 **기본이 펼침**이다. 접는 건 예외지 규칙이 아니다 — 아무도
 * 참가를 안 눌렀는데 전원이 숨어 있으면 경기를 짜려고 매번 한 번 더 눌러야
 * 한다. 고른 사람은 하단 고정 바에 편이 갈린 모양으로 계속 보이고, 거기서
 * 바로 뺄 수 있다(타다 패턴 — `docs/design.md`).
 */
export interface SessionMatchEditorProps {
  tournamentId: string
  /**
   * 고칠 경기. **없으면 새로 짜는 화면이다.** 라우트가 정한다 —
   * 화면 안에서 켜고 끄는 토글이 아니다.
   */
  editMatchId?: string
  /** 저장하거나 뒤로 갈 때 돌아갈 자리 */
  backTo: string
  backLabel: string
}

export function SessionMatchEditor({
  tournamentId,
  editMatchId,
  backTo,
  backLabel,
}: SessionMatchEditorProps) {
  const navigate = useNavigate()
  const tournament = useTournament(tournamentId)
  const members = useMembers(tournamentId)
  const courts = useCourts(tournamentId)
  const matches = useMatches(tournamentId)
  const create = useCreateSessionMatch(tournamentId)
  const edit = useUpdateSessionMatch(tournamentId)

  /*
   * 사람이 손댄 목록. null 이면 **아직 아무도 안 건드렸다** 는 뜻이고,
   * 그때 화면에 보이는 것은 앱의 제안이다(새로 짜기). 고치기에서는 아래
   * 에서 그 경기의 현재 선수로 미리 채운다 — 거기서는 제안이 없다.
   *
   * 효과(useEffect)로 제안을 상태에 밀어 넣지 않고 **파생**으로 푼다.
   * 효과로 하면 "언제 덮어쓰는가" 가 실행 순서에 달리고, 명단·경기 목록이
   * 다시 불려 올 때마다(포커스 복귀·실시간 갱신) 그 순서를 또 따져야 한다.
   * 한 번이라도 순서를 잘못 잡으면 총무가 방금 고른 사람이 제안으로
   * 되돌아간다 — 그 화면은 못 쓴다.
   *
   * 파생이면 규칙이 한 줄로 남는다: **손댔으면 사람 것, 아니면 제안.**
   */
  const [manual, setManual] = useState<string[] | null>(null)
  const [courtId, setCourtId] = useState<string | null>(null)

  /*
   * 종목. 기본은 `'any'` — 대부분의 날은 그냥 돌아가면 되고, 그때도 앱은
   * 같은 성별 넷을 먼저 찾는다. 종목을 고르는 건 "오늘은 여복 좀 돌리자"
   * 같은 **예외**라서 기본값 자리를 차지하면 안 된다.
   */
  const [kind, setKind] = useState<MatchKindFilter>('any')

  const editing = editMatchId ? (matches.data ?? []).find((m) => m.id === editMatchId) : undefined

  /*
   * 고칠 경기의 현재 편성을 폼에 넣는다 — **자동 제안이 아니라 이것이
   * 고치기의 기본값이다.**
   *
   * 효과가 아니라 렌더 중에 맞춘다(`MatchEditPage` 와 같은 판단). 효과로
   * 채우면 빈 화면이 한 번 그려진 뒤 값이 들어와 사람 칸들이 껌뻑인다.
   * react-query 는 내용이 같으면 같은 객체를 돌려주므로(structural sharing)
   * 다시 받아왔다는 이유만으로는 여기 안 걸린다 — 다른 기기가 이 경기를
   * 실제로 바꿨을 때만 폼이 서버 값으로 맞춰진다.
   *
   * 서버가 내려주는 선수 정보는 이름뿐이라(`match_overview`) 이름으로
   * 멤버 id 를 되짚는다. 그래서 **명단이 도착하기 전에는 채우지 않는다** —
   * 채우면 넷이 통째로 빈 채로 굳고 다시 채울 계기가 없다.
   */
  const [filledFrom, setFilledFrom] = useState<MatchOverviewRow | null>(null)
  if (editing && members.data && editing !== filledFrom) {
    setFilledFrom(editing)
    setManual(
      idsOfNames(members.data, [...(editing.players_a ?? []), ...(editing.players_b ?? [])]),
    )
    setCourtId(editing.court_id ?? null)
  }

  const squad = tournament.data?.config.format === 'singles' ? 1 : 2
  const need = squad * 2

  /*
   * ── 🔴 오기 전에는 아무것도 주장하지 않는다 ───────────────────────
   *
   * `matches.data ?? []` 는 **아직 안 왔다** 를 **아무도 안 뛴다** 로 읽는다.
   * 그 순간 이 화면은 잠긴 칸 0개 · 전원 0판 · 넷이 다 찬 제안 · 켜진
   * 「경기 만들기」를 완성된 모습으로 그린다. 1번 코트에서 뛰는 중인 사람이
   * 그 넷에 들어 있어도 화면은 아무 말이 없다.
   *
   * 되돌아오지도 않는다. 이름을 한 번 누르면 그 목록이 `manual` 로 굳어
   * (아래 주석의 "손댔으면 사람 것") 뒤늦게 목록이 도착해도 자가 치유가
   * 안 된다. 서버는 만들기를 받아 주고, 거절은 **초록 버튼을 누르는 코트
   * 앞에서** 나온다 — 만든 사람은 이미 화면을 떠났다.
   *
   * `TournamentPage` 의 자동 예약이 이미 같은 규율을 쓴다:
   *   *"명단·경기·코트가 오기 전에는 '대기가 비었다' 가 참이 아니라
   *     **모른다** 이다."*
   * 자동 예약에는 있고 사람이 눌러 확정하는 화면에는 없었다. 오히려 여기가
   * 더 급하다 — 자동 예약은 다음 틱에 스스로 다시 계산하지만, 사람이 누른
   * 것은 안 돌아온다.
   *
   * ⚠ 빈 배열(`[]`)과는 다르다. 그건 도착한 사실이라 그대로 믿는다 —
   * 명단이 진짜로 비었으면 아래에서 "아직 명단에 아무도 없습니다" 를 그린다.
   */
  const loaded = Boolean(members.data && matches.data && courts.data)

  /*
   * 다른 경기에 묶인 사람 (진행 중 · 대기 중). 판단은 `src/lib/busy.ts` 에 있다.
   *
   * **고치는 중인 그 경기만 뺀다.** 안 빼면 그 넷이 자기 자신 때문에 잠겨
   * 한 명도 못 빼고 빈자리도 안 생긴다 — 고치기 화면이 열리자마자 죽는다.
   *
   * **명단에서 빼지 않는다.** 지우면 화면이 아무 말도 없이 사람을 없애서,
   * 왜 안 보이는지 알 길이 없다. 흐리게 두고 사정을 옆에 적는다.
   */
  const busy = buildBusyMap(matches.data ?? [], { exceptMatchId: editMatchId ?? null })

  const roster = members.data ?? []
  const busyCount = roster.filter((m) => busy.has(m.displayName)).length

  /*
   * 참가한 사람 / 그 외.
   *
   * 둘 다 항상 펼쳐서 보여준다 — 각 그룹 안에서는 서버가 이름순으로 내려준
   * 순서를 그대로 쓴다.
   */
  const { going, others } = partitionGoing(roster)

  /*
   * 오늘 몇 판씩 쳤나 — 제안의 근거이자 화면에 그리는 숫자다.
   *
   * 같은 함수에서 나와야 한다. 근거를 따로 세면 "2판이라며 왜 얘가 빠졌지"
   * 가 생기고, 한 번 그러면 총무는 제안을 매번 갈아엎는다.
   */
  const plays = countPlays(matches.data ?? [])
  // 고치기에는 제안이 없다 — 기본값은 그 경기의 현재 선수다
  const suggestion = editMatchId ? null : suggestMatch(roster, matches.data ?? [], squad, kind)
  const picked = manual ?? suggestion ?? []

  /*
   * 종목을 고르면 성별을 안 적은 사람이 제안에서 빠진다 — 그 판단은
   * `autoMatch.ts` 에 있고 화면은 숫자만 그린다(`busyCount` 와 같은 규율).
   * 이건 **그 사람이 오늘 경기를 못 하게 되는 결정**이라, 말없이 넘어가면
   * 안 된다.
   */
  const excludedCount = excludedByKind(roster, kind)

  /*
   * 판수 배지는 **차이가 있을 때만** 붙인다 ('명단만' 배지와 같은 규율 —
   * `hasAccountContrast`). 모임 첫 경기에는 전원이 0판이라 모두에게 '0판'
   * 이 붙는데, 모두에게 붙는 배지는 배지가 아니라 배경이 된다.
   */
  const showPlays = roster.some((m) => (plays.get(m.displayName) ?? 0) > 0)

  function toggle(memberId: string) {
    setManual((prev) => togglePick(prev ?? picked, memberId, need))
  }

  function remove(memberId: string) {
    setManual((prev) => removePick(prev ?? picked, memberId))
  }

  const { teamA, teamB, ready } = splitTeams(picked, squad)
  const saving = create.isPending || edit.isPending
  const saveError = create.error ?? edit.error

  async function submit() {
    try {
      if (editing?.id) {
        /*
         * 서버가 제자리에서 고친다(`update_session_match`) — 경기 id 도
         * 대기 줄의 자리(`queue_order`)도 그대로다. 전에는 지우고 다시
         * 만들어서 새 경기가 줄 맨 뒤에 섰고, 그걸 `set_court_queue` 로
         * 되돌리는 보정을 여기서 계산해 함께 보냈다. 이제 보낼 것이 없다.
         */
        await edit.mutateAsync({
          matchId: editing.id,
          courtId,
          playersA: teamA,
          playersB: teamB,
          // 사람이 손댄 편성은 더 이상 '자동' 이 아니다 (`labelAfterHumanEdit`).
          // ⚠ 서버는 편성을 통째로 다시 쓴다 — 안 보내면 이름이 지워진다.
          label: labelAfterHumanEdit(editing.label),
        })
      } else {
        await create.mutateAsync({ courtId, playersA: teamA, playersB: teamB })
      }
      navigate(backTo, { replace: true })
    } catch {
      // saveError 로 화면에 뿌린다
    }
  }

  /*
   * 고칠 것이 없어진 경우 — 지워졌거나, 이미 시작했거나 끝났다.
   * 시작한 경기는 서버가 거절하므로(22023) 화면도 그 길을 안 보인다.
   *
   * ⚠ 저장하는 동안에는 판단하지 않는다. 저장이 끝나면 어차피 `backTo` 로
   * 나가는데, 그 직전에 다른 기기가 이 경기를 시작하거나 지우면 성공한
   * 저장이 "돌려보내짐" 으로 보인다.
   */
  if (editMatchId && !saving) {
    if (matches.data && !editing) return <Navigate to={backTo} replace />
    if (editing && editing.status !== 'scheduled') return <Navigate to={backTo} replace />
  }

  const nameOf = (memberId: string) =>
    members.data?.find((m) => m.id === memberId)?.displayName ?? '?'

  const selectedCourt = courtId ? (courts.data ?? []).find((c) => c.id === courtId) : undefined
  const courtLabel = selectedCourt?.name ?? '나중에'

  // '명단만' 배지는 계정 있는 사람과 없는 사람이 섞여 있을 때만 뜻이 산다 —
  // 참가/그 외 각 목록 안에서 따로 판단한다 (`hasAccountContrast`)
  const showGoingBadge = hasAccountContrast(going)
  const showOthersBadge = hasAccountContrast(others)

  /*
   * 아직 다 안 왔다 — 그리지 않는다.
   *
   * 두 경우를 한 자리에서 막는다.
   *   · `!loaded` — 명단·경기·코트 중 하나라도 안 왔다. 없는 사실로 제안을
   *     그리면 잠금이 통째로 빠진 화면이 되고, 한 번 누르면 굳는다(위 참고).
   *   · 고칠 경기를 아직 못 읽었다 — 빈 명단을 먼저 그리면 "아무도 없네" 로
   *     읽힌다.
   *
   * ⚠ 훅은 전부 위에서 이미 불렀다. 이 저장소는 훅보다 먼저 조건부로
   * 돌아간 적이 있고, 그때 훅 순서가 렌더마다 달라졌다.
   */
  if (!loaded || (editMatchId && !filledFrom)) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-44">
        <BackBar to={backTo} label={backLabel} />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-44">
      <BackBar to={backTo} label={backLabel} />

      {/*
        코트는 예외적으로만 건드린다 — 안 정해도 된다. 공용 대기에 두면
        먼저 비는 코트가 집어간다. 그래서 두 줄짜리 칩 그리드 대신 한 줄
        요약("코트: 나중에 ▾")만 두고 접어 둔다. (참가자와 반대: 참가자는
        매번 골라야 하니 펼치고, 코트는 대개 안 건드리니 접는다.)

        아래쪽 대신 여기(맨 위)에 둔 이유: 하단에는 이미 고정 바가 화면의
        일부를 차지한다. 참가자가 적은 모임에서는 본문 전체 높이가 뷰포트보다
        살짝만 크거나 작아지는데, 그 경계에서 아래쪽 요소가 스크롤 없이는
        고정 바 뒤에 완전히 가려 버린다(실측으로 확인함). 맨 위, 참가자
        목록보다 먼저 오는 한 줄이면 목록 길이와 상관없이 항상 보인다.
      */}
      <section aria-label="코트" className="mt-5">
        <details>
          <summary
            className="min-h-11 w-fit cursor-pointer list-none rounded-lg px-1 py-2 text-sm
                       font-semibold text-ink-2 transition-colors hover:text-ink-1
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            코트: {courtLabel} <span aria-hidden>▾</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-2 px-1">
            <Chip active={courtId === null} onClick={() => setCourtId(null)}>
              나중에 (공용 대기)
            </Chip>
            {(courts.data ?? []).map((c) => (
              <Chip key={c.id} active={courtId === c.id} onClick={() => setCourtId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </details>
      </section>

      {/*
        사람 고르기가 본 작업이다. 코트 한 줄 다음에 바로 이름이 와야
        스크롤 없이 보인다.
      */}
      <section aria-label="참가자" className="mt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-2">누가 칠까요</h2>
          <span className="tabular text-xs font-black text-ink-3">
            {picked.length} / {need}
          </span>
        </div>

        {/*
          자동으로 걸린 경기를 고치는 중이면 그 사실과 결과를 미리 말한다.
          저장하고 나서 배지가 사라진 걸 보고 "내가 뭘 잘못 눌렀나" 를 겪지
          않게 — 사라지는 게 맞다는 근거는 `labelAfterHumanEdit` 에 있다.
        */}
        {editing && isAutoQueued(editing) && (
          <p className="mt-2 text-xs text-ink-3">
            앱이 자동으로 걸어 둔 경기입니다 · 고치면 &apos;자동&apos; 표시가 없어집니다
          </p>
        )}

        {/*
          종목 칩. 같은 성별(남복·여복)이 앞이고 혼복이 마지막이다 —
          순서의 정본은 `MATCH_KIND_FILTERS` 다. "혼복은 대안이지 기본이
          아니다" 는 말이 고르는 순서에 그대로 남아 있어야 한다.

          고치기에는 안 둔다 — 종목은 **제안의 조건**인데 고치기에는 제안이
          없다. 눌러도 아무 일도 안 일어나는 칩은 고장으로 읽힌다.
        */}
        {!editMatchId && (
          <div role="group" aria-label="종목" className="mt-3 flex flex-wrap gap-2">
            {MATCH_KIND_FILTERS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {matchKindLabel(k)}
              </Chip>
            ))}
          </div>
        )}

        {/*
          종목을 고른 순간 성별을 안 적은 사람은 제안에 영영 안 뜬다.
          말없이 빠지면 총무는 그 사람이 왜 안 나오는지 알 수 없고, 그건
          그 사람이 오늘 못 친다는 뜻이다. 고칠 방법(성별 적기)과 지금
          당장의 우회(직접 고르기)를 한 줄에 같이 적는다.
        */}
        {!editMatchId && excludedCount > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            성별을 안 적은 {excludedCount}명은 {matchKindLabel(kind)} 제안에서 빠집니다 · 직접 고를
            수는 있습니다
          </p>
        )}

        {/*
          왜 이 넷인지 화면이 말한다. 근거 없는 제안은 매번 갈아엎게 된다 —
          "적게 친 사람부터" 라고 적혀 있고 이름 옆에 판수가 보이면, 총무는
          제안을 믿거나 어디를 고쳐야 하는지 안다. 종목을 골랐으면 그것도
          같이 적는다 — 고른 조건과 제안이 한 문장에 있어야 짝이 맞는다.

          손대는 순간 사라진다. 사람이 자기 손으로 짠 목록 위에 앱의 변명이
          남아 있으면 그건 설명이 아니라 잔소리다.
        */}
        {manual === null && suggestion && (
          <p className="mt-2 text-xs text-ink-3">
            적게 친 사람부터 {kind === 'any' ? '' : `${matchKindLabel(kind)}으로 `}골라 뒀습니다 ·
            이름을 눌러 바꾸세요
          </p>
        )}

        {roster.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
            아직 명단에 아무도 없습니다.
          </p>
        ) : (
          <>
            {going.length > 0 && (
              <>
                <p className="mt-3 text-xs font-bold text-ink-3">참가 {going.length}명</p>
                <PersonGrid
                  members={going}
                  picked={picked}
                  busy={busy}
                  plays={plays}
                  showPlays={showPlays}
                  squad={squad}
                  showAccountBadge={showGoingBadge}
                  onToggle={toggle}
                />
              </>
            )}

            {others.length > 0 && (
              <>
                <div
                  className={cn(
                    'flex items-center gap-2 text-xs font-bold text-ink-3',
                    going.length > 0 ? 'mt-5 border-t border-border-subtle pt-4' : 'mt-3',
                  )}
                >
                  <span>그 외 {others.length}명</span>
                  <span className="font-normal text-ink-3/80">
                    · 참가를 안 눌렀어도 고를 수 있습니다
                  </span>
                </div>
                <PersonGrid
                  members={others}
                  picked={picked}
                  busy={busy}
                  plays={plays}
                  showPlays={showPlays}
                  squad={squad}
                  showAccountBadge={showOthersBadge}
                  onToggle={toggle}
                />
              </>
            )}
          </>
        )}

        {/*
          명단에는 있는데 못 고르는 사람이 몇인지 한 줄로 미리 말해 준다 —
          흐린 칸을 하나씩 눌러 보고 나서야 알게 되면 늦다.
        */}
        {busyCount > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            {busyCount}명은 다른 경기에 들어가 있어 고를 수 없습니다.
          </p>
        )}
      </section>

      {saveError && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(
            saveError,
            editMatchId ? '경기를 고치지 못했습니다' : '경기를 만들지 못했습니다',
          )}
        </p>
      )}

      {/*
        고른 사람을 대진 모양으로 하단에 고정한다 — 목록을 아무리 내려도
        지금까지 고른 편이 그대로 보이고, 잘못 골랐으면 여기서 바로 뺀다.
        제출 버튼도 같은 자리라 엄지 한 번으로 끝난다.

        아이폰 홈 인디케이터 자리를 비켜 준다. 하단탭(TournamentTabBar)이
        이미 같은 규율을 쓰는데 여기만 빠져 있었다 — 이 화면에서 가장
        중요한 버튼이 손가락 바에 깔리는 자리다.
      */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-1/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-2xl">
          <PickedBar teamA={teamA} teamB={teamB} squad={squad} nameOf={nameOf} onRemove={remove} />
          <Button
            size="xl"
            className="mt-2 w-full"
            loading={saving}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {ready
              ? editMatchId
                ? '고치기'
                : '경기 만들기'
              : `${need - picked.length}명 더 고르기`}
          </Button>
        </div>
      </div>
    </main>
  )
}

/**
 * 이름 → 멤버 id. 못 찾은 이름은 조용히 버린다.
 *
 * `match_overview` 가 선수를 이름으로만 내려주기 때문에 되짚어야 한다
 * (`busy.ts` 도 같은 이유로 이름을 기준으로 삼는다). 명단에서 빠진 사람의
 * 이름이 남아 있을 수 있는데, 그 자리는 비워 두는 편이 맞다 — 고치는
 * 사람이 빈자리를 보고 새로 넣으면 된다.
 */
function idsOfNames(members: readonly MemberSummary[], names: readonly string[]): string[] {
  return names
    .map((n) => members.find((m) => m.displayName === n)?.id)
    .filter((x): x is string => Boolean(x))
}
