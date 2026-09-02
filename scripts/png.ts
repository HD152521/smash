/**
 * 최소한의 PNG 인코더.
 *
 * `gen-icons.ts` 가 홈 화면 아이콘을, `gen-og.ts` 가 카톡 카드 이미지를
 * 만든다. 둘 다 「배경 한 색 + 도형 몇 개」라 이미지 라이브러리를 새로
 * 들일 이유가 없다 — 인코더가 30줄이면 끝난다.
 *
 * 두 스크립트가 같은 인코더를 각자 들고 있으면 한쪽만 고쳐진다.
 * 여기 하나만 둔다.
 */
import { deflateSync } from 'node:zlib'

export type Rgb = readonly [number, number, number]

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
 * 픽셀 하나하나를 `pixel(x, y)` 로 물어 트루컬러 PNG 를 만든다.
 *
 * 필터를 안 쓴다(스캔라인 앞 바이트가 항상 0). 색이 몇 개 안 되는 그림이라
 * deflate 만으로도 충분히 작아지고, 필터를 넣으면 코드만 길어진다.
 */
export function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Rgb,
): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let o = 0
  for (let y = 0; y < height; y++) {
    raw[o++] = 0 // 필터 없음
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
