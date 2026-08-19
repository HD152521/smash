/**
 * WCAG 명암비 계산.
 *
 * 이 파일이 있는 이유: 색 토큰의 명도를 감으로 정하면 반드시 어딘가 깨진다.
 * 실제로 다크 모드 강조색이 2.5:1 까지 떨어져 있었는데 아무도 몰랐다.
 *
 * 함정: 상대휘도는 **선형(linear) sRGB** 로 계산해야 한다.
 * 감마를 씌운 값으로 계산하면 전부 그럴듯하지만 틀린 숫자가 나온다.
 * 그래서 흑백이 정확히 21.00 이 나오는지 테스트에서 못 박는다.
 */

interface Oklch {
  l: number // 0..1
  c: number
  h: number // degrees
}

/** "oklch(52% 0.17 149)" 를 읽는다 */
function parseOklch(css: string): Oklch {
  const m = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\s*\)/i.exec(css)
  if (!m) throw new Error(`oklch 로 읽을 수 없습니다: ${css}`)
  const raw = Number(m[1])
  return { l: css.includes('%') ? raw / 100 : raw, c: Number(m[2]), h: Number(m[3]) }
}

/** OKLCH → 선형 sRGB (0..1, 색역 밖은 잘라낸다) */
function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3

  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ]
}

function relativeLuminance(css: string): number {
  const [r, g, b] = oklchToLinearRgb(parseOklch(css))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}
