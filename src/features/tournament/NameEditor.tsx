import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { useSetDisplayName } from './queries'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * 표시 이름 바꾸기.
 *
 * 본인이 자기 이름을 바꾸는 경우와 관리자가 남의 이름을 고쳐 주는 경우가
 * 하는 일이 같아서 한 컴포넌트로 쓴다. 누가 바꿀 수 있는지는 서버가 정한다
 * (set_display_name) — 화면은 버튼을 안 그릴 뿐이다.
 *
 * 평소에는 이름만 보이고, 연필을 눌러야 입력칸이 열린다.
 * 관리자 화면에서 참가자가 20명이면 입력칸 20개가 늘 열려 있는 꼴이라
 * 훑어보기가 힘들고 실수로 고치기도 쉽다.
 */
export function NameEditor({
  tournamentId,
  memberId,
  name,
  label,
}: {
  tournamentId: string
  memberId: string
  name: string
  /** 연필 버튼의 접근성 이름 — 목록에서 누구의 것인지 구분된다 */
  label?: string
}) {
  /**
   * null 이면 편집 중이 아니다.
   *
   * editing 과 draft 를 따로 두면 '편집 중이 아닐 때 draft 를 name 으로
   * 되돌리는' 효과가 필요해지는데, 그건 prop 을 state 로 베끼는 안티패턴이다.
   * 편집을 시작하는 순간에만 현재 이름을 복사하면 효과가 아예 사라진다.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const rename = useSetDisplayName(tournamentId)

  function cancel() {
    setDraft(null)
    rename.reset()
  }

  async function save() {
    const next = (draft ?? '').trim()
    if (next === name) return cancel()
    try {
      await rename.mutateAsync({ memberId, name: next })
      setDraft(null)
    } catch {
      // 오류는 아래에 그대로 보여 준다 (중복 이름 등)
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="truncate font-bold text-ink-1">{name}</span>
        <button
          type="button"
          onClick={() => setDraft(name)}
          aria-label={label ? `${label} 이름 바꾸기` : '이름 바꾸기'}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3
                     transition-colors hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      </span>
    )
  }

  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft ?? ''}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') cancel()
          }}
          aria-label="표시 이름"
          className={cn(
            'min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-1 px-3',
            'min-h-11 text-base font-bold text-ink-1',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
          )}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={rename.isPending || (draft ?? '').trim().length === 0}
          aria-label="저장"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-600 text-white
                     transition-opacity disabled:opacity-50
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Check className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="취소"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3
                     transition-colors hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <X className="size-4" aria-hidden />
        </button>
      </span>
      {rename.error && (
        <span role="alert" className="mt-1 block text-sm font-medium text-team-b-fg">
          {toUserMessage(rename.error, '이름을 바꾸지 못했습니다')}
        </span>
      )}
    </span>
  )
}
