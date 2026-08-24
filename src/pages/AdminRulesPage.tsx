import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { useAdminGate } from '@/features/admin/useAdminGate'
import { RuleFields } from '@/features/tournament/RuleFields'
import { toRuleSettings, type RuleSettings } from '@/lib/ruleSettings'
import { useMatches, useTournament, useUpdateTournamentConfig } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import type { TournamentConfig } from '@/types/database'

/**
 * 경기 규칙 바꾸기 (관리자).
 *
 * 아직 시작하지 않은 경기는 서버가 새 규칙으로 다시 굳힌다. 이미 시작했거나
 * 끝난 경기는 그대로 둔다 — 판정 근거가 도중에 바뀌면 이미 나온 결과와
 * 순위가 소급 변조된다.
 *
 * 그 경계를 화면에서 미리 알려 준다. 누른 뒤에 "왜 지난 경기는 안 바뀌지"
 * 를 묻게 하면 늦는다.
 */
export function AdminRulesPage() {
  const { id } = useParams<{ id: string }>()
  const gate = useAdminGate(id)
  const tournament = useTournament(id)
  const matches = useMatches(id)
  const save = useUpdateTournamentConfig(id ?? '')

  const saved = tournament.data?.config
  const [rules, setRules] = useState<RuleSettings | null>(null)
  const [filledFrom, setFilledFrom] = useState<TournamentConfig | null>(null)

  /*
   * 서버 값이 도착하면 그때 폼을 채운다. 폼을 미리 기본값으로 채워 두면
   * 사용자가 손대기도 전에 '기본값으로 되돌리는 변경' 이 화면에 떠 있게 된다.
   *
   * useEffect 대신 렌더 중에 맞춘다. 효과로 채우면 값이 없는 화면이 한 번
   * 그려진 뒤에 채워져서 입력칸이 껌뻑인다.
   *
   * react-query 는 내용이 같으면 같은 객체를 돌려주므로(structural sharing)
   * 다시 받아왔다는 이유만으로는 여기 안 걸린다. 저장에 성공했거나 다른
   * 관리자가 바꿨을 때만 폼이 서버 값으로 맞춰진다.
   */
  if (saved && saved !== filledFrom) {
    setFilledFrom(saved)
    setRules(toRuleSettings(saved))
  }

  if (gate.denied) return <Navigate to={`/t/${id}`} replace />

  if (!tournament.data || !rules || gate.loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 pt-10">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />
      </main>
    )
  }

  const scheduled = (matches.data ?? []).filter((m) => m.status === 'scheduled').length
  const locked = (matches.data ?? []).filter(
    (m) => m.status === 'live' || m.status === 'finished',
  ).length
  const dirty = JSON.stringify(rules) !== JSON.stringify(toRuleSettings(saved!))

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-28">
      <BackLink to={`/t/${id}/admin`}>관리로</BackLink>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">경기 규칙</h1>
      <p className="mt-2 text-sm text-ink-2">
        {scheduled > 0 ? (
          <>
            아직 시작하지 않은 <b className="text-ink-1">{scheduled}경기</b>에 바로 적용됩니다.
          </>
        ) : (
          '앞으로 편성하는 경기에 적용됩니다.'
        )}
        {locked > 0 && ` 이미 진행 중이거나 끝난 ${locked}경기는 그대로 둡니다.`}
      </p>

      <div className="mt-8">
        <RuleFields
          value={rules}
          onChange={setRules}
          jokerCount={tournament.data.config.jokerGroupCount}
          disabled={save.isPending}
        />
      </div>

      {/*
        단식↔복식은 이미 편성된 경기를 고치지 않는다. 인원을 서버가 다시 짜 줄
        방법이 없어서다 (복식 경기에서 누구를 뺄지 앱이 정할 수 없다).
        저장하고 나서 알면 늦으므로 누르기 전에 말한다.
      */}
      {rules.format !== saved!.format && scheduled > 0 && (
        <p className="mt-6 rounded-xl bg-warn/10 p-3 text-sm font-medium text-warn-fg">
          이미 편성된 {scheduled}경기의 인원은 그대로입니다. 새로 편성하는 경기부터{' '}
          {rules.format === 'singles' ? '1명씩' : '2명씩'} 고르게 됩니다.
        </p>
      )}

      {save.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b-fg">
          {toUserMessage(save.error, '설정을 바꾸지 못했습니다')}
        </p>
      )}

      {save.isSuccess && !dirty && (
        <p className="mt-6 text-sm font-medium text-ok-fg">저장했습니다.</p>
      )}

      {/*
        저장 버튼은 아래에 고정한다. 설정이 길어서 다 내려가야 버튼이 나오면
        한 항목만 고치고 나가는 사람이 저장을 놓친다.
      */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-1/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={!dirty || save.isPending}
            onClick={() => setRules(toRuleSettings(saved!))}
          >
            되돌리기
          </Button>
          <Button
            size="lg"
            className="flex-1"
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => save.mutate(rules)}
          >
            {dirty ? '저장' : '바뀐 내용 없음'}
          </Button>
        </div>
      </div>
    </main>
  )
}
