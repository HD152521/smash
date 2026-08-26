import { Chip } from './Chip'
import type { CourtRow } from '@/types/database'

/**
 * 코트 고르기 — 앞으로 할 경기에만 있다.
 *
 * 이미 치른 경기에는 코트를 물을 이유가 없다. 그래서 이 조각은 편성과
 * 수정 화면에만 들어간다 (지난 결과 입력 화면에는 아예 없다).
 */
export function CourtPicker({
  courts,
  value,
  onChange,
}: {
  courts: CourtRow[] | undefined
  /** 빈 문자열이면 '아직 안 정함' */
  value: string
  onChange: (courtId: string) => void
}) {
  return (
    <section aria-label="코트" className="mt-8">
      <h2 className="text-sm font-semibold text-ink-2">
        코트 <span className="font-normal text-ink-3">(나중에 정해도 됩니다)</span>
      </h2>
      {/* 코트를 안 정하면 대진표의 '코트 미배정' 에 모인다.
          비는 코트를 보고 그때 배정하는 게 실제 운영 순서다. */}
      <p className="mt-1 text-sm text-ink-3">
        지금 고르지 않고 넘어가도 됩니다. 대진표에서 비는 코트를 보고 배정할 수 있고, 선수와
        심판에게는 코트가 정해지는 순간 알림이 갑니다.
      </p>
      {courts && courts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {courts.map((c) => (
            <Chip
              key={c.id}
              active={value === c.id}
              onClick={() => onChange(c.id === value ? '' : c.id)}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-3">
          등록된 코트가 없습니다. 코트 없이도 편성할 수 있습니다.
        </p>
      )}
    </section>
  )
}
