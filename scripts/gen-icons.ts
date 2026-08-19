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

/** 셔틀콕을 단순화한 도형: 둥근 사각 배경 + 흰 원 + 아래로 퍼지는 깃 */
function pixel(x: number, y: number, size: number): [number, number, number] {
  const cx = size / 2
  const headR = size * 0.16
  const headY = size * 0.36

  // 콕 머리
  if ((x - cx) ** 2 + (y - headY) ** 2 <= headR ** 2) return FG

  // 깃: 머리 아래로 사다리꼴
  const top = headY + headR * 0.6
  const bottom = size * 0.76
  if (y >= top && y <= bottom) {
    const t = (y - top) / (bottom - top)
    const halfW = size * (0.09 + 0.16 * t)
    if (Math.abs(x - cx) <= halfW) {
      // 깃살 사이를 비워 셔틀콕처럼 보이게
      const stripe = Math.abs(x - cx) / halfW
      if (stripe < 0.28 || (stripe > 0.5 && stripe < 0.82)) return FG
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
