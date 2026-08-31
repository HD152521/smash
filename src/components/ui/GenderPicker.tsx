import { useId } from 'react'
import { PLAYER_GENDERS, genderLabel } from '@/lib/gender'
import { cn } from '@/lib/utils'
import type { PlayerGender } from '@/types/database'

/**
 * 성별 고르기 — 가입(LoginPage) · 게스트 등록(GuestJoinPage) ·
 * 마이페이지(MyPage) · 명단(MembersPage)이 함께 쓴다.
 *
 * `GradePicker` 와 **일부러 같은 모양**이다. 두 칸이 언제나 나란히 서는데
 * 하나는 라디오 줄, 하나는 드롭다운이면 같은 성격의 선택이 다른 물건처럼
 * 보인다. 그래서 판단 넷을 그대로 물려받는다:
 *
 *  - 드롭다운이 아니라 **한 줄**. 고를 것이 둘뿐이고 둘 다 손가락 한 번에
 *    끝나야 하는 자리다(코트 앞 · 가입 폼).
 *  - **'모름' 이 목록의 첫 칸**. 성별은 선택이고(컬럼도 nullable —
 *    20260902000001), 아무것도 안 고른 상태를 안 그리면 잘못 눌렀을 때
 *    되돌릴 방법이 없다. 첫 칸인 이유는 그게 **기본값**이기 때문이다.
 *  - **색으로만 말하지 않는다.** 고른 칸을 굵기 · 배경 · 테두리로 함께
 *    가르고, 값 자체는 언제나 글자('남'·'여')로 적혀 있다.
 *  - **네이티브 라디오다.** `<button role="radio">` 로 흉내 내면 화살표
 *    이동을 직접 구현해야 하고 그 구현이 빠진 채 배포되는 일이 흔하다.
 *
 * ## 왜 칸이 셋(모름 · 남 · 여)뿐인가
 *
 * 이 값은 사람의 정체성을 적는 칸이 아니라 **어느 종목에 넣을 수 있나**를
 * 적는 칸이다(`matchKindOf`). 배드민턴 복식의 종목이 남복 · 여복 · 혼복
 * 셋이라 편성이 물어보는 것도 둘 중 하나이고, 그 밖의 답은 '모름' 과 같은
 * 자리로 간다 — 편성에서 빠진다는 뜻이다.
 *
 * ## 그리드 칸 수를 급수와 맞추지 않는다
 *
 * `GradePicker` 는 7칸(모름 + 6급수)이라 한 칸이 좁다. 여기는 3칸뿐이라
 * 같은 `grid-cols-7` 을 쓰면 왼쪽에 몰려 붙어 짝이 안 맞아 보인다.
 * 세 칸을 고르게 나눈다.
 */
export function GenderPicker({
  value,
  onChange,
  size = 'md',
  disabled = false,
  label = '성별',
  hint,
}: {
  value: PlayerGender | null
  onChange: (gender: PlayerGender | null) => void
  /** md = 가입·마이페이지 폼 · lg = 게스트 등록(코트 앞 손가락) */
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
          'mt-2 grid grid-cols-3 gap-1 rounded-2xl border border-border-subtle bg-surface-1 p-1',
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
        {PLAYER_GENDERS.map((gender) => (
          <Option
            key={gender}
            name={name}
            checked={value === gender}
            onSelect={() => onChange(gender)}
            size={size}
            text={genderLabel(gender) ?? gender}
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
