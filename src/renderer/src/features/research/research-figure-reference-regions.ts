// Measures a reference figure for its recreation: each solid colour's connected regions with
// their bounding boxes, so the agent can place boxes from numbers instead of by eye.

// Why 800: enough to place a box within a couple of pixels, fast enough to run on every start.
const SAMPLE_MAX_PX = 800
const MIN_PIXELS = 24
// Why: a glyph's box is smaller than this, so text does not drown out shapes and lines.
const MIN_BOX_AREA = 256
const MAX_REGIONS = 80

export type ReferenceRegion = {
  color: string
  x: number
  y: number
  width: number
  height: number
  /** Share of the bounding box this colour fills: about 1 for a filled box, low for an outline. */
  fill: number
}

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0')

/** Connected regions of one quantized colour in RGBA pixels, background and near-white left out. */
export function findColorRegions(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): ReferenceRegion[] {
  const count = width * height
  const bins = new Int32Array(count)
  const frequency = new Map<number, number>()
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    const [r, g, b, a] = [
      pixels[offset],
      pixels[offset + 1],
      pixels[offset + 2],
      pixels[offset + 3]
    ]
    const light = a < 128 || (r > 240 && g > 240 && b > 240)
    bins[index] = light ? -1 : ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    frequency.set(bins[index], (frequency.get(bins[index]) ?? 0) + 1)
  }
  const background = [...frequency.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? -1
  const seen = new Uint8Array(count)
  const stack = new Int32Array(count)
  const regions: (ReferenceRegion & { pixels: number })[] = []
  for (let start = 0; start < count; start += 1) {
    const bin = bins[start]
    if (seen[start] || bin === -1 || bin === background) {
      continue
    }
    let size = 0
    let top = 0
    let [left, right, upper, lower] = [width, 0, height, 0]
    let [r, g, b] = [0, 0, 0]
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const index = stack[--top]
      const x = index % width
      const y = (index - x) / width
      size += 1
      r += pixels[index * 4]
      g += pixels[index * 4 + 1]
      b += pixels[index * 4 + 2]
      left = Math.min(left, x)
      right = Math.max(right, x)
      upper = Math.min(upper, y)
      lower = Math.max(lower, y)
      for (const next of [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1
      ]) {
        if (next !== -1 && !seen[next] && bins[next] === bin) {
          seen[next] = 1
          stack[top++] = next
        }
      }
    }
    const box = { x: left, y: upper, width: right - left + 1, height: lower - upper + 1 }
    if (size >= MIN_PIXELS && box.width * box.height >= MIN_BOX_AREA) {
      regions.push({
        color: `#${hex(r / size)}${hex(g / size)}${hex(b / size)}`,
        ...box,
        fill: Math.round((size / (box.width * box.height)) * 100) / 100,
        pixels: size
      })
    }
  }
  // Why filled first: solid boxes are what a recreation places first; outlines and lines follow.
  const filled = (region: ReferenceRegion) => (region.fill >= 0.5 ? 1 : 0)
  return regions
    .toSorted((a, b) => filled(b) - filled(a) || b.width * b.height - a.width * a.height)
    .slice(0, MAX_REGIONS)
    .map(({ pixels: _pixels, ...region }) => region)
}

/** The regions of a decoded reference image, in its own pixels. */
export function measureReferenceRegions(image: HTMLImageElement): ReferenceRegion[] {
  const scale = Math.min(1, SAMPLE_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return []
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const back = (value: number) => Math.round(value / scale)
  return findColorRegions(data, canvas.width, canvas.height).map((region) => ({
    ...region,
    x: back(region.x),
    y: back(region.y),
    width: back(region.width),
    height: back(region.height)
  }))
}
