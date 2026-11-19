// Generated art for hybrid figures: an image model draws only the illustrative parts of a figure,
// without any text, on white; this keys the white out (white joined to the border becomes
// transparent, the 2 px edge band is softened with colour-to-alpha so anti-aliasing stays clean;
// `soft` keys every light pixel, for beams and glass), trims to the drawing, can cut a sheet of
// separate objects apart, and draws a grid copy with tenths marked along the top and left edges,
// so the agent reads anchor points as shares [u, v] of the art from its top-left corner.
import { decodePng, encodePngRgba, encodePng } from './research-figures-png.mjs'

/** Images an image model may make for one figure: enough for 3–4 slots, few enough to stay fast. */
export const ART_CAP = 4

/** Bright and nearly gray: the generated white background, its noise included. */
const paper = (r, g, b) => Math.min(r, g, b) >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 18

/** Colour-to-alpha against white: the least alpha that explains the pixel over a white page. */
function unwhite(rgba, index) {
  const alpha = Math.max(255 - rgba[index], 255 - rgba[index + 1], 255 - rgba[index + 2]) / 255
  if (alpha <= 0.02) {
    rgba[index + 3] = 0
    return
  }
  for (let channel = 0; channel < 3; channel += 1) {
    rgba[index + channel] = Math.round(255 - (255 - rgba[index + channel]) / alpha)
  }
  rgba[index + 3] = Math.round(rgba[index + 3] * alpha)
}

/** White joined to the border, by flood fill (4-way). */
function borderWhite({ width, height, rgba }) {
  const background = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const push = (pixel) => {
    const index = pixel * 4
    if (!background[pixel] && paper(rgba[index], rgba[index + 1], rgba[index + 2])) {
      background[pixel] = 1
      queue[tail++] = pixel
    }
  }
  for (let x = 0; x < width; x += 1) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const pixel = queue[head++]
    const x = pixel % width
    if (x > 0) {
      push(pixel - 1)
    }
    if (x < width - 1) {
      push(pixel + 1)
    }
    if (pixel >= width) {
      push(pixel - width)
    }
    if (pixel < width * (height - 1)) {
      push(pixel + width)
    }
  }
  return { background, count: tail }
}

function nearBackground(background, width, height, pixel) {
  const x = pixel % width
  const y = (pixel - x) / width
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && background[ny * width + nx]) {
        return true
      }
    }
  }
  return false
}

/** Keys the image in place; an image that already has transparency is left as it is. */
export function keyArt(image, { soft = false } = {}) {
  const { width, height, rgba } = image
  const count = width * height
  let clear = 0
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (rgba[pixel * 4 + 3] < 250) {
      clear += 1
    }
  }
  if (clear > count * 0.05) {
    return { keyed: 'already transparent', background: clear / count }
  }
  if (soft) {
    for (let pixel = 0; pixel < count; pixel += 1) {
      unwhite(rgba, pixel * 4)
    }
    clear = 0
    for (let pixel = 0; pixel < count; pixel += 1) {
      if (rgba[pixel * 4 + 3] === 0) {
        clear += 1
      }
    }
    return { keyed: 'soft', background: clear / count }
  }
  const { background, count: white } = borderWhite(image)
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (background[pixel]) {
      rgba[pixel * 4 + 3] = 0
    } else if (nearBackground(background, width, height, pixel)) {
      unwhite(rgba, pixel * 4)
    }
  }
  return { keyed: 'background', background: white / count }
}

function crop(image, box, keep = null) {
  const width = box.right - box.left
  const height = box.bottom - box.top
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x + box.left
      const sy = y + box.top
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height || (keep && !keep(sx, sy))) {
        continue
      }
      rgba.set(
        image.rgba.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
        (y * width + x) * 4
      )
    }
  }
  return { width, height, rgba }
}

/** The box of everything drawn (alpha above 12), or null when nothing is. */
export function inkBox(image) {
  let left = image.width
  let top = image.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] > 12) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 }
}

/** Trims to the drawing with a margin of `pad` (a share of its larger side, at least 4 px). */
export function trimArt(image, pad = 0.02) {
  const box = inkBox(image)
  if (!box) {
    throw new Error('The image is empty after keying out the white background')
  }
  const margin = Math.max(4, Math.round(pad * Math.max(box.right - box.left, box.bottom - box.top)))
  const touchesEdge =
    box.left <= 1 || box.top <= 1 || box.right >= image.width - 1 || box.bottom >= image.height - 1
  return {
    image: crop(image, {
      left: box.left - margin,
      top: box.top - margin,
      right: box.right + margin,
      bottom: box.bottom + margin
    }),
    touchesEdge
  }
}

/**
 * Separate objects of a sheet, top to bottom and left to right: cells of about 1% of the larger
 * side that hold ink, joined 8-way, so the pieces of one object stay together.
 */
export function splitArt(image) {
  const cell = Math.max(4, Math.round(0.012 * Math.max(image.width, image.height)))
  const cols = Math.ceil(image.width / cell)
  const rows = Math.ceil(image.height / cell)
  const filled = new Uint8Array(cols * rows)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] > 12) {
        filled[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1
      }
    }
  }
  const label = new Int32Array(cols * rows).fill(-1)
  const parts = []
  for (let start = 0; start < cols * rows; start += 1) {
    if (!filled[start] || label[start] >= 0) {
      continue
    }
    const id = parts.length
    const stack = [start]
    label[start] = id
    const box = { left: cols, top: rows, right: 0, bottom: 0, count: 0 }
    while (stack.length) {
      const block = stack.pop()
      const bx = block % cols
      const by = (block - bx) / cols
      box.count += 1
      box.left = Math.min(box.left, bx)
      box.right = Math.max(box.right, bx)
      box.top = Math.min(box.top, by)
      box.bottom = Math.max(box.bottom, by)
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = bx + dx
          const ny = by + dy
          const next = ny * cols + nx
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && filled[next] && label[next] < 0) {
            label[next] = id
            stack.push(next)
          }
        }
      }
    }
    parts.push({ id, ...box })
  }
  const total = parts.reduce((sum, part) => sum + part.count, 0)
  const band = rows / 5
  return parts
    .filter((part) => part.count >= total * 0.01)
    .toSorted(
      (a, b) =>
        Math.floor((a.top + a.bottom) / 2 / band) - Math.floor((b.top + b.bottom) / 2 / band) ||
        a.left - b.left
    )
    .map((part) =>
      crop(
        image,
        {
          left: part.left * cell,
          top: part.top * cell,
          right: Math.min(image.width, (part.right + 1) * cell),
          bottom: Math.min(image.height, (part.bottom + 1) * cell)
        },
        (x, y) => label[Math.floor(y / cell) * cols + Math.floor(x / cell)] === part.id
      )
    )
}

const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001001001001',
  '111101111101111',
  '111101111001111'
]

/**
 * The art at most 900 px across on a checkerboard (transparent shows as checks), with red lines
 * at each tenth and the digits 1–9 (0.1–0.9) along the top and left: an RGB PNG for the agent.
 */
export function artGridPng(image) {
  const scale = Math.min(1, 900 / image.width, 900 / image.height)
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const margin = 22
  const width = w + margin + 6
  const height = h + margin + 6
  const rgb = new Uint8Array(width * height * 3).fill(255)
  const set = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return
    }
    const index = (y * width + x) * 3
    for (let channel = 0; channel < 3; channel += 1) {
      rgb[index + channel] = Math.round(rgb[index + channel] * (1 - alpha) + color[channel] * alpha)
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const check = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 236 : 250
      const sx = Math.min(image.width - 1, Math.floor(x / scale))
      const sy = Math.min(image.height - 1, Math.floor(y / scale))
      const index = (sy * image.width + sx) * 4
      const alpha = image.rgba[index + 3] / 255
      set(
        x + margin,
        y + margin,
        [0, 1, 2].map((c) => image.rgba[index + c] * alpha + check * (1 - alpha))
      )
    }
  }
  for (let k = 1; k < 10; k += 1) {
    const gx = margin + Math.round((k * w) / 10)
    const gy = margin + Math.round((k * h) / 10)
    const color = k === 5 ? [220, 30, 30] : [235, 90, 90]
    const alpha = k === 5 ? 0.75 : 0.45
    for (let y = margin - 6; y < margin + h; y += 1) {
      set(gx, y, color, y < margin ? 1 : alpha)
    }
    for (let x = margin - 6; x < margin + w; x += 1) {
      set(x, gy, color, x < margin ? 1 : alpha)
    }
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (DIGITS[k][r * 3 + c] !== '1') {
          continue
        }
        for (let d = 0; d < 4; d += 1) {
          set(gx - 3 + c * 2 + (d % 2), 2 + r * 2 + (d >> 1), [150, 0, 0])
          set(4 + c * 2 + (d % 2), gy - 5 + r * 2 + (d >> 1), [150, 0, 0])
        }
      }
    }
  }
  for (let x = margin - 1; x <= margin + w; x += 1) {
    set(x, margin - 1, [120, 120, 120])
    set(x, margin + h, [120, 120, 120])
  }
  for (let y = margin - 1; y <= margin + h; y += 1) {
    set(margin - 1, y, [120, 120, 120])
    set(margin + w, y, [120, 120, 120])
  }
  return encodePng(width, height, rgb)
}

/**
 * A generated PNG made ready to place: keyed, trimmed, optionally split. Returns the pieces as
 * PNG bytes with their pixel size and a grid PNG each, or throws for a file it cannot read.
 */
export function prepareArt(bytes, { soft = false, split = false, pad = 0.02 } = {}) {
  const decoded = decodePng(bytes)
  if (!decoded) {
    throw new Error('Not a PNG Aster can read (8-bit RGB or RGBA, not interlaced or palette)')
  }
  const image = { width: decoded.width, height: decoded.height, rgba: decoded.rgba() }
  const keyed = keyArt(image, { soft })
  const { image: trimmed, touchesEdge } = trimArt(image, pad)
  const pieces = split ? splitArt(trimmed).map((piece) => trimArt(piece, pad).image) : [trimmed]
  return {
    keyed: keyed.keyed,
    background: Number(keyed.background.toFixed(3)),
    touchesEdge,
    pieces: pieces.map((piece) => ({
      width: piece.width,
      height: piece.height,
      png: encodePngRgba(piece.width, piece.height, piece.rgba),
      grid: artGridPng(piece)
    }))
  }
}
