import { useId } from 'react'
import { PLAYER_GRADES, gradeLabel } from '@/lib/grade'
import { cn } from '@/lib/utils'
import type { PlayerGrade } from '@/types/database'

/**
 * 급수 고르기 — 가입(LoginPage)과 게스트 등록(GuestJoinPage)이 함께 쓴다.
 *
 * ## 왜 드롭다운이 아니라 한 줄인가
 *
 * 고를 것이 여섯 개뿐이고, 둘 다 **손가락으로 한 번에 끝내야 하는 자리**다.
 * 게스트는 코트 앞에 서서 이름을 적는 중이고, 가입은 칸이 하나 늘어날수록
 * 사람이 샌다. select 는 탭 → 시트 열림 → 고르기 → 닫힘으로 네 동작인데
 * 여기는 한 동작이다.
 *
 * ## 왜 '모름' 이 목록의 첫 칸인가
 *
 * 급수는 **선택**이다(둘 다 nullable — 20260901000001 참고). 그런데 아무것도
 * 안 고른 상태를 화면에 안 그리면, 잘못 눌렀을 때 되돌릴 방법이 없다.
 * '모름' 을 실제 선택지로 그리면 되돌리기가 그냥 다른 칸 누르기가 된다.
 *
 * 첫 칸인 이유는 이게 **기본값**이기 때문이다 — 안 고른 사람은 여기 있다.
 *
 * ## 색으로만 말하지 않는다
 *
 * 고른 칸을 굵기 · 배경 · 테두리로 함께 가른다. 체육관 조명과 햇빛
 * 아래에서 색이 제일 먼저 무너진다(docs/design.md). 그리고 급수 자체가
 * 언제나 **글자**로 적혀 있다 — 색이 급수를 뜻하는 자리는 없다.
 *
 * ## 네이티브 라디오다
 *
 * `<button role="radio">` 로 흉내 내면 화살표 이동을 직접 구현해야 하고,
 * 그 구현이 빠진 채로 배포되는 일이 흔하다. 진짜 `input[type=radio]` 를
 * `sr-only` 로 숨기고 라벨을 그리면 키보드 이동 · 그룹 묶기 · 스크린리더
 * 읽기가 전부 공짜다.
 */
export function GradePicker({
  value,
  onChange,
  size = 'md',
  disabled = false,
  label = '급수',
  hint,
}: {
  value: PlayerGrade | null
  onChange: (grade: PlayerGrade | null) => void
  /** md = 가입 폼(옆 칸들과 같은 높이) · lg = 게스트 등록(코트 앞 손가락) */
  size?: 'md' | 'lg'
  disabled?: boolean
  label?: string
  hint?: string
}) {
  // 같은 화면에 둘 이상 놓여도 라디오 그룹이 섞이지 않게 이름을 격리한다
  const name = useId()

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-semibold text-ink-2">{label}</legend>
      <div
        className={cn(
          'mt-2 grid grid-cols-7 gap-1 rounded-2xl border border-border-subtle bg-surface-1 p-1',
          disabled && 'opacity-50',
        )}
      >
        <Option
          name={name}
          checked={value === null}
          onSelect={() => onChange(null)}
          size={size}
          text="모름"
        />
        {PLAYER_GRADES.map((grade) => (
          <Option
            key={grade}
            name={name}
            checked={value === grade}
            onSelect={() => onChange(grade)}
            size={size}
            text={gradeLabel(grade) ?? grade}
          />
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </fieldset>
  )
}

function Option({
  name,
  checked,
  onSelect,
  size,
  text,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  size: 'md' | 'lg'
  text: string
}) {
  return (
    <label className="min-w-0 cursor-pointer">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        className={cn(
          'grid place-items-center rounded-xl text-center font-bold transition-colors',
          size === 'lg' ? 'h-12 text-base' : 'h-10 text-sm',
          'text-ink-3 peer-hover:bg-surface-2',
          // 고른 칸: 색 하나가 아니라 배경 + 글자색 + 굵기로 함께 가른다
          'peer-checked:bg-brand-600 peer-checked:font-black peer-checked:text-white',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600',
        )}
      >
        {text}
      </span>
    </label>
  )
}
