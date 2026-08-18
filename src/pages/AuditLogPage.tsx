import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useAuditLog, useMembers } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 감사 로그.
 *
 * "누가 내 경기 점수를 고쳤냐" 는 대회마다 나오는 질문이고, 그때 근거가 없으면
 * 운영자가 의심받는다. 기록 자체는 위조할 수 없게 막아 뒀고(RPC 전용),
 * 여기서는 그걸 관리자가 읽을 수 있게만 한다.
 */
const ACTION_LABEL: Record<string, string> = {
  'tournament.create': '대회 생성',
  'tournament.status': '대회 상태 변경',
  'tournament.regenerate_code': '초대 코드 재발급',
  'member.role': '권한 변경',
  'match.create': '경기 편성',
  'match.manual': '결과 직접 입력',
  'match.void': '경기 무효 처리',
  'match.reopen': '경기 재개',
  'match.finish_manual': '수동 종료',
  'score.undo': '점수 취소',
}

export function AuditLogPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const members = useMembers(id)
  const log = useAuditLog(id)

  const me = members.data?.find((m) => m.userId === user?.id)
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'
  if (members.data && !isAdmin) return <Navigate to={`/t/${id}`} replace />

  const nameOf = (actorId: string | null) =>
    members.data?.find((m) => m.userId === actorId)?.displayName ?? '알 수 없음'

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
      <Link
        to={`/t/${id}/admin`}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink-1"
      >
        <ArrowLeft className="size-4" aria-hidden />
        관리로
      </Link>

      <h1 className="mt-6 text-3xl font-black tracking-tight text-ink-1">변경 기록</h1>
      <p className="mt-2 text-sm text-ink-2">
        누가 무엇을 바꿨는지 남습니다. 이 기록은 지우거나 고칠 수 없습니다.
      </p>

      {log.error && (
        <p role="alert" className="mt-6 text-sm font-medium text-team-b">
          {toUserMessage(log.error, '기록을 불러오지 못했습니다')}
        </p>
      )}

      {log.isPending && <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy />}

      {log.data && log.data.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
          아직 기록이 없습니다.
        </p>
      )}

      {log.data && log.data.length > 0 && (
        <ol className="mt-6 flex flex-col gap-2">
          {log.data.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-border-subtle bg-surface-1 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-ink-1">
                  {ACTION_LABEL[e.action] ?? e.action}
                </span>
                <time className="tabular text-xs text-ink-3" dateTime={e.created_at}>
                  {new Date(e.created_at).toLocaleString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p className="mt-1 text-sm text-ink-2">{nameOf(e.actor_id)}</p>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
