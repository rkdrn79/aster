// A small PNG encoder (8-bit RGB or RGBA) on Node's zlib, so the kit can embed generated
// thumbnails and keyed art without image libraries on the host, and a reader for the pixels of a
// project picture and a blank preview.
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
  return encodePixels(width, height, rgb, 3)
}

/** A PNG with an alpha channel: `width` × `height` RGBA pixels (row-major, 4 bytes each). */
export function encodePngRgba(width, height, rgba) {
  return encodePixels(width, height, rgba, 4)
}

function encodePixels(width, height, data, channels) {
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let row = 0; row < height; row += 1) {
    // Why filter 2 (Up): smooth pictures compress far better against the row above.
    raw[row * (stride + 1)] = row === 0 ? 0 : 2
    for (let index = 0; index < stride; index += 1) {
      const value = data[row * stride + index]
      const above = row === 0 ? 0 : data[(row - 1) * stride + index]
      raw[row * (stride + 1) + 1 + index] = (value - above) & 0xff
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
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
 * The pixels of an 8-bit RGB, RGBA, gray or gray+alpha PNG (the kinds a canvas or an image
 * editor writes, not interlaced or palette ones): `{ width, height, channels, at(x, y) }`, where
 * `at` gives [r, g, b, a]; null for a PNG it cannot read.
 */
export function decodePng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    return null
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const [depth, kind, , , interlace] = bytes.subarray(24, 29)
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[kind] ?? 0
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
  const pixels = Buffer.alloc(stride * height)
  let previous = Buffer.alloc(stride)
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
    line.copy(pixels, row * stride)
    previous = line
  }
  const at = (x, y) => {
    const offset = (y * width + x) * channels
    const value = [...pixels.subarray(offset, offset + channels)]
    return channels < 3
      ? [value[0], value[0], value[0], channels === 2 ? value[1] : 255]
      : [value[0], value[1], value[2], channels === 4 ? value[3] : 255]
  }
  /** Every pixel as RGBA, 4 bytes each, row-major (a copy, made on each call). */
  const rgba = () => {
    const out = new Uint8Array(width * height * 4)
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * channels
      const gray = channels < 3
      out[pixel * 4] = pixels[offset]
      out[pixel * 4 + 1] = gray ? pixels[offset] : pixels[offset + 1]
      out[pixel * 4 + 2] = gray ? pixels[offset] : pixels[offset + 2]
      out[pixel * 4 + 3] =
        channels === 4 ? pixels[offset + 3] : channels === 2 ? pixels[offset + 1] : 255
    }
    return out
  }
  return { width, height, channels, at, rgba }
}

/**
 * Whether a PNG shows one colour only (a blank render), or null for a PNG it cannot read: it
 * decodes the 8-bit RGB or RGBA images a canvas writes, not interlaced or palette ones.
 */
export function pngIsBlank(bytes) {
  const image = decodePng(bytes)
  if (!image || (image.channels !== 3 && image.channels !== 4)) {
    return null
  }
  const first = image.at(0, 0)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = image.at(x, y)
      if (pixel.some((value, channel) => Math.abs(value - first[channel]) > 8)) {
        return false
      }
    }
  }
  return true
}
