// Colour arithmetic for the figure palettes: hex ↔ OKLCH (Ottosson 2020), luminance and WCAG
// contrast. Pure, so the palettes, the lint and the app share it.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const toHex = (rgb) =>
  `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, channel))))) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** `#rgb` or `#rrggbb` as channels 0–1, or null. */
export function hexChannels(hex) {
  const value = String(hex ?? '').toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(value)
  const pairs = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1)
  return pairs ? pairs.map((pair) => Number.parseInt(pair, 16) / 255) : null
}

/** OKLCH of a hex colour: `{ L, C, h }` (h in degrees), or null when it is not a colour. */
export function hexToOklch(hex) {
  const rgb = hexChannels(hex)
  if (!rgb) {
    return null
  }
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(A, B)
  return { L, C, h: C < 1e-6 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const inGamut = (rgb) => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)

/** A hex colour for OKLCH, brought into sRGB by lowering chroma, never lightness. */
export function oklchToHex({ L, C, h }) {
  let chroma = C
  let rgb = oklchToLinear({ L, C: chroma, h })
  if (!inGamut(rgb)) {
    let low = 0
    let high = C
    for (let step = 0; step < 24; step += 1) {
      chroma = (low + high) / 2
      if (inGamut(oklchToLinear({ L, C: chroma, h }))) {
        low = chroma
      } else {
        high = chroma
      }
    }
    rgb = oklchToLinear({ L, C: low, h })
  }
  return toHex(rgb)
}

/** WCAG relative luminance of a hex colour. */
export function luminance(hex) {
  const [r, g, b] = (hexChannels(hex) ?? [0, 0, 0]).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(first, second) {
  const [a, b] = [luminance(first), luminance(second)].toSorted((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

/** Degrees between two hues around the circle. */
export function hueDistance(first, second) {
  const d = Math.abs(first - second) % 360
  return Math.min(d, 360 - d)
}
