/**
 * 카톡 미리보기 카드에 붙는 이미지(1200x630)를 만든다.
 *
 *   npm run gen:og
 *
 * ── 왜 동적 이미지(@vercel/og)가 아닌가 ─────────────────────────────
 *
 * 모임 이름을 그림에 박아 넣으면 의존성(satori + resvg)과 폰트 파일이 붙고,
 * 크롤러 요청마다 이미지를 렌더해야 한다. 그런데 카카오 카드는 **제목과
 * 설명을 글자로 따로 보여 준다** — 모임 이름·시각은 이미 거기 있고,
 * 이미지가 또 말할 필요가 없다. 이미지의 일은 「이게 어느 앱인지 한눈에
 * 알아보게 하는 것」 하나뿐이라 한 장이면 된다.
 *
 * 정말 필요해지면 그때 근거를 대고 바꾼다. 지금은 정적 한 장이다.
 *
 * ── 왜 글자를 비트맵으로 그리나 ─────────────────────────────────────
 *
 * 한글은 이 방식으로 못 그린다. 그래서 그림에는 로고(SMASH)만 넣고 한글
 * 문구는 전부 카드의 제목·설명(HTML 메타)에 맡긴다 — 그쪽은 폰트가 필요
 * 없고, 잘리지도 않고, 모임마다 다르게 나갈 수 있다.
 */
import { writeFileSync } from 'node:fs'
import { encodePng, type Rgb } from './png'

const W = 1200
const H = 630

/** src/index.css 의 다크 토큰을 sRGB 로 옮긴 값 (--surface-0 · --brand-500 · --accent-500) */
const BG: Rgb = [15, 23, 37]
const BG_LINE: Rgb = [26, 38, 58]
const LIME: Rgb = [168, 240, 60]
const CYAN: Rgb = [100, 214, 226]
const INK: Rgb = [236, 243, 250]

// ── 5x7 비트맵 글리프 — SMASH 다섯 글자에 필요한 넷뿐이다 ──────────────
const GLYPHS: Record<string, readonly string[]> = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
}

const WORD = 'SMASH'
const CELL = 20 // 글리프 한 칸의 픽셀 크기 → 글자 하나가 100x140
const GAP = 26
const WORD_W = WORD.length * 5 * CELL + (WORD.length - 1) * GAP
const WORD_X = 470
const WORD_Y = 236

/** 워드마크 안이면 true. 글리프 표에 없는 글자는 빈칸으로 둔다 */
function inWordmark(x: number, y: number): boolean {
  if (y < WORD_Y || y >= WORD_Y + 7 * CELL) return false
  if (x < WORD_X || x >= WORD_X + WORD_W) return false
  const row = Math.floor((y - WORD_Y) / CELL)
  const offset = x - WORD_X
  const stride = 5 * CELL + GAP
  const index = Math.floor(offset / stride)
  const col = Math.floor((offset - index * stride) / CELL)
  if (col >= 5) return false // 글자 사이 여백
  const glyph = GLYPHS[WORD[index] ?? '']
  return glyph?.[row]?.[col] === '1'
}

/**
 * 셔틀콕 — 코르크(원) + 위로 퍼지는 깃털 원뿔.
 *
 * `public/favicon.svg` · `gen-icons.ts` 와 **같은 실루엣**이다. 카드 이미지만
 * 다른 마크를 쓰면 같은 앱으로 안 보인다.
 */
function inShuttlecock(x: number, y: number): boolean {
  const cx = 250
  const size = 380
  const top = 130
  const corkCy = top + size * 0.79
  const corkR = size * 0.15

  if ((x - cx) ** 2 + (y - corkCy) ** 2 <= corkR ** 2) return true

  const coneBottom = corkCy - corkR * 0.5
  const coneTop = top + size * 0.14
  if (y >= coneTop && y <= coneBottom) {
    const t = (coneBottom - y) / (coneBottom - coneTop)
    const halfW = size * (0.09 + 0.34 * t)
    const dx = Math.abs(x - cx)
    if (dx <= halfW) {
      const stripe = dx / halfW
      return stripe < 0.16 || (stripe > 0.42 && stripe < 0.58) || stripe > 0.84
    }
  }
  return false
}

/** 코트 라인 — 배경보다 아주 조금 밝은 선. 있는 줄 모르고 봐도 되는 정도로 */
function onCourtLine(x: number, y: number): boolean {
  const inset = 60
  const onBorder =
    (x >= inset && x < inset + 3 && y >= inset && y < H - inset) ||
    (x >= W - inset - 3 && x < W - inset && y >= inset && y < H - inset) ||
    (y >= inset && y < inset + 3 && x >= inset && x < W - inset) ||
    (y >= H - inset - 3 && y < H - inset && x >= inset && x < W - inset)
  // 네트(가운데 세로선)
  const onNet = x >= W / 2 - 1 && x < W / 2 + 2 && y >= inset && y < H - inset
  return onBorder || onNet
}

/** 워드마크 아래 라임 밑줄 + 그 끝의 시안 점 — 브랜드 색 둘을 한 번씩 쓴다 */
function onUnderline(x: number, y: number): Rgb | null {
  const uy = WORD_Y + 7 * CELL + 34
  if (y < uy || y >= uy + 12) return null
  if (x < WORD_X || x >= WORD_X + WORD_W) return null
  return x >= WORD_X + WORD_W - 90 ? CYAN : LIME
}

function pixel(x: number, y: number): Rgb {
  if (inShuttlecock(x, y)) return LIME
  if (inWordmark(x, y)) return INK
  const underline = onUnderline(x, y)
  if (underline) return underline
  if (onCourtLine(x, y)) return BG_LINE
  return BG
}

writeFileSync('public/og.png', encodePng(W, H, pixel))
console.log(`public/og.png (${W}x${H})`)
