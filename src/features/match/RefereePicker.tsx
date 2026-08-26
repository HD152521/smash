import { Chip } from './Chip'
import type { MemberSummary } from '@/features/tournament/api'

/**
 * 심판 지정 — 앞으로 할 경기에만 있다.
 *
 * 이미 끝난 경기의 점수를 소급 입력할 때는 지정할 심판이 없다.
 * 뛰는 사람은 후보에서 뺀다 (서버도 같은 이유로 거부한다).
 */
export function RefereePicker({
  members,
  playing,
  value,
  onToggle,
}: {
  members: MemberSummary[]
  /** 이 경기에서 뛰는 사람 — 심판을 볼 수 없다 */
  playing: Set<string>
  value: string[]
  onToggle: (memberId: string) => void
}) {
  return (
    <section aria-label="심판" className="mt-8">
      <h2 className="text-sm font-semibold text-ink-2">
        심판 <span className="font-normal text-ink-3">(선택 · 점수를 기록할 사람)</span>
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {members
          .filter((m) => !playing.has(m.id))
          .map((m) => (
            <Chip key={m.id} active={value.includes(m.id)} onClick={() => onToggle(m.id)}>
              {m.displayName}
            </Chip>
          ))}
      </div>
      {value.length === 0 && (
        <p className="mt-2 text-xs text-ink-3">
          심판을 지정하지 않으면 관리자만 점수를 기록할 수 있습니다.
        </p>
      )}
    </section>
  )
}
