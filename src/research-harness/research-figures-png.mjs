// A small PNG encoder (8-bit RGB) on Node's zlib, so the kit can embed generated thumbnails
// without image libraries on the host, and a reader that tells a blank preview apart.
import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

/** A PNG of `width` × `height` RGB pixels (row-major, 3 bytes each). */
export function encodePng(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let row = 0; row < height; row += 1) {
    // Why filter 2 (Up): smooth pictures compress far better against the row above.
    raw[row * (stride + 1)] = row === 0 ? 0 : 2
    for (let index = 0; index < stride; index += 1) {
      const value = rgb[row * stride + index]
      const above = row === 0 ? 0 : rgb[(row - 1) * stride + index]
      raw[row * (stride + 1) + 1 + index] = (value - above) & 0xff
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const paeth = (left, up, corner) => {
  const estimate = left + up - corner
  const [a, b, c] = [left, up, corner].map((value) => Math.abs(estimate - value))
  return a <= b && a <= c ? left : b <= c ? up : corner
}

/**
 * Whether a PNG shows one colour only (a blank render), or null for a PNG it cannot read: it
 * decodes the 8-bit RGB or RGBA images a canvas writes, not interlaced or palette ones.
 */
export function pngIsBlank(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    return null
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const [depth, kind, , , interlace] = bytes.subarray(24, 29)
  const channels = kind === 6 ? 4 : kind === 2 ? 3 : 0
  if (depth !== 8 || !channels || interlace !== 0) {
    return null
  }
  const data = []
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'IDAT') {
      data.push(bytes.subarray(at + 8, at + 8 + length))
    }
    at += 12 + length
  }
  let raw
  try {
    raw = inflateSync(Buffer.concat(data))
  } catch {
    return null
  }
  const stride = width * channels
  if (raw.length < (stride + 1) * height) {
    return null
  }
  let previous = Buffer.alloc(stride)
  const first = []
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]
    const line = Buffer.from(raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)))
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? line[index - channels] : 0
      const up = previous[index]
      const corner = index >= channels ? previous[index - channels] : 0
      const add = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter] ?? 0
      line[index] = (line[index] + add) & 0xff
    }
    for (let index = 0; index < stride; index += channels) {
      const pixel = [...line.subarray(index, index + channels)]
      if (!first.length) {
        first.push(...pixel)
      } else if (pixel.some((value, channel) => Math.abs(value - first[channel]) > 8)) {
        return false
      }
    }
    previous = line
  }
  return true
}
