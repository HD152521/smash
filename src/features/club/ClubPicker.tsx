import type { MyClub } from './api'

/**
 * 소속 동아리 고르기.
 *
 * 기본값은 **'동아리 없음'** 이다. 동아리는 선택 계층이고 지금까지의 대회는
 * 전부 소속이 없다 — 기본을 동아리 쪽으로 두면, 어쩌다 동아리 하나에 들어간
 * 사람이 만드는 모든 모임에 운영진이 관리자로 딸려 들어간다.
 *
 * 운영진인 동아리가 하나도 없으면 **아무것도 그리지 않는다.** 고를 게 하나뿐인
 * 선택칸은 정보가 아니라 잡음이고, 대부분의 사용자는 동아리를 안 쓴다.
 */
export function ClubPicker({
  clubs,
  value,
  onChange,
  disabled = false,
}: {
  /** `useStaffClubs()` 의 결과. 부르는 쪽이 들고 있어야 고른 값을 검증할 수 있다 */
  clubs: MyClub[]
  value: string | null
  onChange: (clubId: string | null) => void
  disabled?: boolean
}) {
  if (clubs.length === 0) return null

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink-2">소속 동아리</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-3 text-ink-1
                   focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
      >
        <option value="">동아리 없음</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {/*
        소속은 만든 뒤에 못 바꾼다. 나중에 옮길 수 있으면 대회를 동아리에서
        떼어내 가져가는 길이 열리기 때문인데, 그 사실을 여기서 말해 두지 않으면
        "일단 만들고 나중에 옮기지" 하고 넘어간 사람이 되돌릴 방법을 못 찾는다.
      */}
      <span className="text-xs text-ink-3">
        {value
          ? '동아리 운영진이 관리자로 함께 들어갑니다. 소속은 나중에 바꿀 수 없습니다.'
          : '동아리 없이 여는 지금까지와 같은 방식입니다.'}
      </span>
    </label>
  )
}
