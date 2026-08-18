import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 모달.
 *
 * 네이티브 <dialog> 를 쓴다. showModal() 하나로 포커스 가둠, Esc 닫기,
 * 배경 비활성화(inert), 백드롭이 전부 따라온다. 직접 구현하면
 * 포커스 트랩에서 반드시 구멍이 난다.
 *
 * 폰에서는 아래에서 올라오는 시트로, 넓은 화면에서는 가운데 카드로 뜬다.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  // Esc 나 백드롭으로 닫힌 경우에도 부모 상태를 맞춰준다
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handle = () => onClose()
    el.addEventListener('close', handle)
    return () => el.removeEventListener('close', handle)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => {
        // 백드롭(다이얼로그 자신)을 눌렀을 때만 닫는다
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'w-full max-w-lg rounded-t-3xl bg-surface-1 p-0 text-ink-1 backdrop:bg-black/50',
        // 폰: 아래 붙은 시트 / 넓은 화면: 가운데
        'mt-auto mb-0 sm:my-auto sm:rounded-3xl',
        'open:animate-in',
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
        <h2 className="text-lg font-bold text-ink-1">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors
                     hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto p-4">{children}</div>
    </dialog>
  )
}
