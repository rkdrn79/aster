// Minimal zero-dependency PNG writer shared by the demo simulators (8-bit RGB, no filtering).
import { deflateSync } from 'node:zlib'

/** PNG bytes for `width`×`height` RGB pixels; `pixel(x, y)` returns [r, g, b] in 0–255. */
export function rgbPng(width, height, pixel) {
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      row[1 + x * 3] = clampByte(r)
      row[2 + x * 3] = clampByte(g)
      row[3 + x * 3] = clampByte(b)
    }
    rows.push(row)
  }
  return png(width, height, Buffer.concat(rows))
}

/** PNG bytes from raw scanlines (a 0 filter byte, then RGB triples, per row). */
export function png(width, height, raw) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc
}
