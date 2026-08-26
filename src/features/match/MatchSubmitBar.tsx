import { Button } from '@/components/ui/Button'
import type { GroupRow } from '@/types/database'

/**
 * 저장 바 — 무엇을 저장하는지 요약하고 저장한다.
 *
 * 항상 띄워 두지 않는다. 폰에서 화면 아래 90px 을 계속 가려서, 그 자리에 온
 * 조·선수 버튼을 눌러도 바가 대신 먹는다 (히트 테스트로 확인함).
 * 선택 중에는 바에 보여줄 쓸모 있는 정보도 없다. 그래서 부르는 쪽이
 * 편성이 끝났을 때만 렌더한다.
 */
export function MatchSubmitBar({
  groupA,
  groupB,
  targetA,
  targetB,
  label,
  loading,
  onSubmit,
}: {
  groupA: GroupRow | undefined
  groupB: GroupRow | undefined
  targetA: number
  targetB: number
  /** 저장 단추 글자 — 화면마다 하는 일이 다르다 */
  label: string
  loading: boolean
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-0/95 px-5 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
        <p className="tabular min-w-0 flex-1 truncate text-sm text-ink-2">
          <b className="text-ink-1">{groupA?.name}</b>
          {groupA?.is_joker && ' 🃏'} {targetA}점<span className="mx-1.5 text-ink-3">vs</span>
          <b className="text-ink-1">{groupB?.name}</b>
          {groupB?.is_joker && ' 🃏'} {targetB}점
        </p>
        <Button size="lg" loading={loading} onClick={onSubmit}>
          {label}
        </Button>
      </div>
    </div>
  )
}
