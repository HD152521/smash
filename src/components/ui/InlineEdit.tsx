import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 제자리 이름 편집.
 *
 * 평소에는 이름만 보이고, 연필을 눌러야 입력칸이 열린다.
 * 목록이 20줄이면 입력칸 20개가 늘 열려 있는 꼴이라 훑어보기 힘들고
 * 실수로 고치기도 쉽다.
 *
 * 저장/오류 처리는 부르는 쪽이 한다 — 참가자 이름과 코트 이름은
 * 서버 규칙이 다르므로(중복 검사 위치, 길이 제한) 여기서 알 필요가 없다.
 */
export function InlineEdit({
  value,
  onSave,
  pending = false,
  error,
  maxLength = 20,
  label,
  compact = false,
}: {
  value: string
  /** 저장에 실패하면 던져야 입력칸이 열린 채로 남는다 */
  onSave: (next: string) => Promise<void>
  pending?: boolean
  error?: string | null
  maxLength?: number
  /** 연필 버튼의 접근성 이름 — 목록에서 누구의 것인지 구분된다 */
  label?: string
  /**
   * 목록 안에서 쓸 때. 연필 버튼 없이 이름 자체를 눌러 고친다.
   * 좁은 화면에서 40px 짜리 버튼 하나가 이름을 통째로 밀어내기 때문이다.
   * 편집을 시작하면 입력칸과 저장/취소는 그대로 44px 이다.
   */
  compact?: boolean
}) {
  /**
   * null 이면 편집 중이 아니다.
   *
   * editing 과 draft 를 따로 두면 '편집 중이 아닐 때 draft 를 value 로
   * 되돌리는' 효과가 필요해지는데, 그건 prop 을 state 로 베끼는 안티패턴이다.
   * 편집을 시작하는 순간에만 현재 값을 복사하면 효과가 아예 사라진다.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null

  function cancel() {
    setDraft(null)
  }

  async function save() {
    const next = (draft ?? '').trim()
    if (next === value) return cancel()
    try {
      await onSave(next)
      setDraft(null)
    } catch {
      // 오류는 부르는 쪽이 error 로 넘겨 준다. 입력칸은 열어 둔다.
    }
  }

  if (!editing) {
    /*
     * 목록 안(compact)에서는 이름 자체가 버튼이다.
     * 연필을 따로 두면 그 40px 이 이름 몫에서 빠진다. 좁은 화면에서는
     * 이름이 한 글자도 못 나오는 지경이 된다.
     * 이름을 눌러 고치는 건 목록에서 흔한 방식이라 배우는 비용도 없다.
     */
    if (compact) {
      return (
        <button
          type="button"
          onClick={() => setDraft(value)}
          aria-label={label ? `${label} 이름 바꾸기` : '이름 바꾸기'}
          className="min-w-0 truncate rounded-lg text-left font-bold text-ink-1
                     transition-colors hover:text-brand-fg
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {value}
        </button>
      )
    }

    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="truncate font-bold text-ink-1">{value}</span>
        <button
          type="button"
          onClick={() => setDraft(value)}
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
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') cancel()
          }}
          aria-label={label ? `${label} 이름` : '이름'}
          className={cn(
            'min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-1 px-3',
            'min-h-11 text-base font-bold text-ink-1',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
          )}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending || (draft ?? '').trim().length === 0}
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
      {error && (
        <span role="alert" className="mt-1 block text-sm font-medium text-team-b-fg">
          {error}
        </span>
      )}
    </span>
  )
}
