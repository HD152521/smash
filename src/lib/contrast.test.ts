import { describe, expect, it } from 'vitest'
// ?raw 로 읽는다. node:fs 를 쓰면 앱 tsconfig 에 node 타입을 열어야 하고,
// 그러면 브라우저 코드가 fs 를 import 해도 타입 검사가 잡지 못하게 된다.
import css from '../index.css?raw'
import { contrastRatio } from './contrast'

/** index.css 에서 토큰 값을 그대로 읽는다 — 테스트가 값을 따로 베끼면 같이 썩는다 */
function token(name: string, { dark = false } = {}): string {
  // 다크 블록은 [data-theme='dark'] 안에 있다
  const scope = dark
    ? css.slice(css.indexOf("[data-theme='dark'] {"), css.indexOf('@theme inline'))
    : css
  const re = new RegExp(name + String.raw`:\s*(oklch\([^)]*\))`)
  const m = re.exec(scope)
  if (!m?.[1]) throw new Error(`토큰을 찾을 수 없습니다: ${name} (dark=${dark})`)
  return m[1]
}

const AA = 4.5

describe('명암비 계산', () => {
  it('흑백은 정확히 21:1 이다', () => {
    // 이 앵커가 깨지면 아래 숫자는 전부 의미가 없다.
    // 선형 sRGB 가 아니라 감마 값으로 계산하면 여기서 걸린다.
    expect(contrastRatio('oklch(100% 0 0)', 'oklch(0% 0 0)')).toBeCloseTo(21, 1)
  })

  it('같은 색끼리는 1:1 이다', () => {
    expect(contrastRatio('oklch(52% 0.17 149)', 'oklch(52% 0.17 149)')).toBeCloseTo(1, 5)
  })

  it('브라우저가 실제로 렌더한 값과 일치한다', () => {
    // Chrome 에서 getImageData 로 잰 실측값. 계산식이 틀어지면 여기서 걸린다.
    expect(contrastRatio('oklch(28% 0.08 152)', 'oklch(66% 0.19 148)')).toBeCloseTo(4.93, 1)
    expect(contrastRatio('oklch(37% 0.10 72)', 'oklch(74% 0.16 78)')).toBeCloseTo(4.53, 1)
    expect(contrastRatio('oklch(100% 0 0)', 'oklch(52% 0.17 149)')).toBeCloseTo(4.97, 1)
  })
})

const FG = ['--fg-brand', '--fg-ok', '--fg-live', '--fg-warn', '--fg-team-b', '--ink-3']
const SURFACES = ['--surface-0', '--surface-1', '--surface-2']

describe('글씨 강조색은 두 테마 · 모든 면에서 AA 를 넘는다', () => {
  for (const dark of [false, true]) {
    for (const fg of FG) {
      for (const bg of SURFACES) {
        it(`${dark ? '다크' : '라이트'} ${fg} on ${bg}`, () => {
          expect(contrastRatio(token(fg, { dark }), token(bg, { dark }))).toBeGreaterThanOrEqual(AA)
        })
      }
    }
  }
})

describe('색을 배경으로 깔고 글씨를 얹는 곳도 AA 를 넘는다', () => {
  const cases: Array<[string, string, string]> = [
    ['흰 글씨 / brand-600', 'oklch(100% 0 0)', '--color-brand-600'],
    ['흰 글씨 / ok', 'oklch(100% 0 0)', '--color-ok'],
    ['흰 글씨 / live', 'oklch(100% 0 0)', '--color-live'],
    ['흰 글씨 / warn', 'oklch(100% 0 0)', '--color-warn'],
    ['흰 글씨 / team-b', 'oklch(100% 0 0)', '--color-team-b'],
  ]
  for (const [name, fg, bgToken] of cases) {
    it(name, () => {
      expect(contrastRatio(fg, token(bgToken))).toBeGreaterThanOrEqual(AA)
    })
  }

  it('조커 배지 (joker-ink / joker)', () => {
    expect(contrastRatio(token('--color-joker-ink'), token('--color-joker'))).toBeGreaterThanOrEqual(AA)
  })

  it('승 배지 (brand-900 / brand-500)', () => {
    // 흰 글씨였을 때 2.87 이었다. 심판이 결과를 확인하는 배지다.
    expect(contrastRatio(token('--color-brand-900'), token('--color-brand-500'))).toBeGreaterThanOrEqual(AA)
  })
})
