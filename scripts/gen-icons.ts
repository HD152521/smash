/**
 * 홈 화면 아이콘(PNG)을 만든다.
 *
 * 아이폰은 apple-touch-icon 이 PNG 가 아니면 무시하고, 홈 화면에
 * 페이지 스크린샷을 박아 넣는다. 그런데 아이폰에서 알림을 받으려면
 * 반드시 홈 화면에 추가해야 하므로, 아이콘이 깨져 보이면 그 단계에서
 * 사람들이 그만둔다.
 *
 * 외부 이미지 라이브러리를 새로 들이는 대신 PNG 를 직접 쓴다.
 * 배경 한 색 + 원 하나뿐이라 인코더가 짧다.
 *
 *   npm run gen:icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

/** 브랜드 초록 (oklch(52% 0.17 149) 을 sRGB 로 옮긴 값) */
const BG: [number, number, number] = [10, 122, 63]
const FG: [number, number, number] = [255, 255, 255]

function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * 셔틀콕을 단순화한 도형: 아래쪽 코르크(원) + 위로 퍼지는 깃털 원뿔.
 *
 * `src/components/brand/Shuttlecock.tsx` 와 같은 실루엣(코르크가 바닥,
 * 깃털이 위로 벌어진다)으로 맞춘다 — 파비콘과 홈 화면 아이콘이 다른
 * 모양이면 같은 마크로 안 보인다.
 */
function pixel(x: number, y: number, size: number): [number, number, number] {
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

function makePng(size: number): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // 필터 없음
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const file = `public/icon-${size}.png`
  writeFileSync(file, makePng(size))
  console.log(`${file} (${size}x${size})`)
}
