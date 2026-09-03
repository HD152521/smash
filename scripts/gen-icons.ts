/**
 * 홈 화면 아이콘(PNG)을 만든다.
 *
 * 아이폰은 apple-touch-icon 이 PNG 가 아니면 무시하고, 홈 화면에
 * 페이지 스크린샷을 박아 넣는다. 그런데 아이폰에서 알림을 받으려면
 * 반드시 홈 화면에 추가해야 하므로, 아이콘이 깨져 보이면 그 단계에서
 * 사람들이 그만둔다.
 *
 * 외부 이미지 라이브러리를 새로 들이는 대신 PNG 를 직접 쓴다.
 * 배경 한 색 + 원 하나뿐이라 인코더가 짧다 — `scripts/png.ts` 에 있고
 * 카톡 카드 이미지(`gen-og.ts`)와 같은 것을 쓴다.
 *
 *   npm run gen:icons
 */
import { writeFileSync } from 'node:fs'
import { encodePng, type Rgb } from './png'

/** 브랜드 초록 (oklch(52% 0.17 149) 을 sRGB 로 옮긴 값) */
const BG: Rgb = [10, 122, 63]
const FG: Rgb = [255, 255, 255]

/**
 * 셔틀콕을 단순화한 도형: 아래쪽 코르크(원) + 위로 퍼지는 깃털 원뿔.
 *
 * `src/components/brand/Shuttlecock.tsx` 와 같은 실루엣(코르크가 바닥,
 * 깃털이 위로 벌어진다)으로 맞춘다 — 파비콘과 홈 화면 아이콘이 다른
 * 모양이면 같은 마크로 안 보인다.
 */
function pixel(x: number, y: number, size: number): Rgb {
  const cx = size / 2
  const corkCy = size * 0.79
  const corkR = size * 0.15

  // 코르크
  if ((x - cx) ** 2 + (y - corkCy) ** 2 <= corkR ** 2) return FG

  // 깃털 원뿔: 코르크 위 목에서 위로 갈수록 넓어진다
  const coneBottom = corkCy - corkR * 0.5
  const coneTop = size * 0.14
  if (y >= coneTop && y <= coneBottom) {
    const t = (coneBottom - y) / (coneBottom - coneTop) // 0=코르크 쪽(좁음) → 1=꼭대기(넓음)
    const halfW = size * (0.09 + 0.34 * t)
    const dx = Math.abs(x - cx)
    if (dx <= halfW) {
      // 깃살 사이를 비워 셔틀콕처럼 보이게
      const stripe = dx / halfW
      if (stripe < 0.16 || (stripe > 0.42 && stripe < 0.58) || stripe > 0.84) return FG
    }
  }
  return BG
}

for (const size of [192, 512]) {
  const file = `public/icon-${size}.png`
  writeFileSync(file, encodePng(size, size, (x, y) => pixel(x, y, size)))
  console.log(`${file} (${size}x${size})`)
}
