// Procedural thumbnails for data glyphs that read as small photographs, not clip-art: soft
// subjects with shading and texture on blurred backgrounds, grain and a vignette. `t` moves the
// subject (video frames) and `noise` blends toward Gaussian noise (diffusion). Pure: RGB bytes.

export const PICTURE_KINDS = ['cat', 'landscape', 'arm', 'noise', 'gradient']

function generator(seed) {
  let state = (Number(seed) || 1) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random) {
  const u = Math.max(random(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

/** Smooth value noise in 0–1 over the plane, fractal (three octaves). */
function fractalNoise(seed) {
  const hash = (ix, iy) => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const smooth = (t) => t * t * (3 - 2 * t)
  const value = (x, y) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = smooth(x - ix)
    const fy = smooth(y - iy)
    const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx
    const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx
    return top + (bottom - top) * fy
  }
  return (u, v, scale = 4) =>
    value(u * scale, v * scale) * 0.55 +
    value(u * scale * 2.1, v * scale * 2.1) * 0.3 +
    value(u * scale * 4.3, v * scale * 4.3) * 0.15
}

const hex = (value) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
const mix = (a, b, t) => a.map((channel, index) => channel + (b[index] - channel) * t)
const shade = (color, amount) => color.map((channel) => channel * amount)

/** 1 inside, 0 outside, with an edge `blur` wide: the soft focus of a small photo. */
function soft(distance, blur) {
  return 1 / (1 + Math.exp(distance / blur))
}

function ellipseDistance(u, v, cx, cy, rx, ry) {
  return (Math.hypot((u - cx) / rx, (v - cy) / ry) - 1) * Math.min(rx, ry)
}

function segmentDistance(u, v, [ax, ay], [bx, by], width) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(u - (ax + dx * t), v - (ay + dy * t)) - width / 2
}

function catScene(random, t, texture) {
  const indoor = random() < 0.5
  const fur = random() < 0.5 ? hex('#8a7462') : hex('#c48a52')
  const cx = 0.36 + 0.26 * t
  const ground = indoor ? hex('#a98d6c') : hex('#6f8f4e')
  const wall = indoor ? hex('#e3d8c8') : hex('#a9c3d6')
  return (u, v) => {
    const grain = texture(u, v, 9)
    const horizon = 0.62 + 0.03 * texture(u, 0.5, 3)
    let color =
      v > horizon
        ? shade(ground, 0.8 + 0.35 * grain)
        : shade(mix(wall, hex('#f4efe6'), 1 - v / horizon), 0.92 + 0.12 * grain)
    const shadow = soft(ellipseDistance(u, v, cx + 0.04, 0.8, 0.26, 0.05), 0.04)
    color = shade(color, 1 - 0.35 * shadow)
    const body = soft(ellipseDistance(u, v, cx, 0.66, 0.2, 0.13), 0.012)
    const head = soft(ellipseDistance(u, v, cx + 0.19, 0.5, 0.1, 0.09), 0.01)
    const ear = Math.max(
      soft(ellipseDistance(u, v, cx + 0.13, 0.42, 0.03, 0.05), 0.012),
      soft(ellipseDistance(u, v, cx + 0.25, 0.42, 0.03, 0.05), 0.012)
    )
    const tail = soft(segmentDistance(u, v, [cx - 0.17, 0.68], [cx - 0.28, 0.5], 0.05), 0.014)
    const animal = Math.max(body, head, ear, tail)
    // Why light from the top left and fur noise: a shaded, textured blob reads as a photo.
    const light = 0.75 + 0.45 * (1 - v) - 0.15 * (u - cx)
    const stripes = 0.85 + 0.15 * Math.sin((u - cx) * 60 + 6 * texture(u, v, 6))
    const coat = shade(fur, light * stripes * (0.8 + 0.35 * texture(u * 1.5, v * 3, 14)))
    const eyes = Math.max(
      soft(ellipseDistance(u, v, cx + 0.155, 0.49, 0.016, 0.012), 0.006),
      soft(ellipseDistance(u, v, cx + 0.225, 0.49, 0.016, 0.012), 0.006)
    )
    return mix(mix(color, coat, animal), hex('#3b3a22'), eyes * head)
  }
}

function landscape(random, texture) {
  const sun = [0.62 + random() * 0.2, 0.2 + random() * 0.08]
  return (u, v) => {
    const clouds = texture(u * 0.8, v * 2.5, 3)
    let color = mix(hex('#86b3da'), hex('#e8eff3'), Math.min(1, v / 0.55 + clouds * 0.35))
    const glow = soft(ellipseDistance(u, v, sun[0], sun[1], 0.06, 0.06), 0.04)
    color = mix(color, hex('#fff4d8'), 0.6 * glow)
    const ridge = 0.46 + 0.08 * texture(u, 0.3, 2.5)
    const hills = shade(hex('#8c9daf'), 0.9 + 0.2 * texture(u, v, 8))
    color = mix(color, hills, soft(ridge - v, 0.012))
    const field = 0.62 + 0.05 * texture(u, 0.7, 2)
    const grass = shade(
      mix(hex('#86a55f'), hex('#56743c'), (v - field) / 0.4),
      0.8 + 0.35 * texture(u, v, 16)
    )
    return mix(color, grass, soft(field - v, 0.01))
  }
}

function armScene(random, t, texture) {
  const object = random() < 0.5 ? hex('#c8504a') : hex('#3f78c8')
  const shoulder = [0.26, 0.6]
  const upper = -1.1 + 0.5 * t
  const elbow = [shoulder[0] + 0.3 * Math.cos(upper), shoulder[1] + 0.3 * Math.sin(upper)]
  const fore = 0.5 + 0.6 * t
  const hand = [elbow[0] + 0.27 * Math.cos(fore), elbow[1] + 0.27 * Math.sin(fore)]
  return (u, v) => {
    const grain = texture(u, v, 10)
    let color =
      v > 0.7
        ? shade(hex('#a59d90'), 0.82 + 0.3 * grain)
        : shade(mix(hex('#9aa3ad'), hex('#c3c9cf'), v / 0.7), 0.92 + 0.12 * grain)
    const block = soft(ellipseDistance(u, v, 0.72, 0.68, 0.06, 0.05), 0.012)
    color = mix(color, shade(object, 0.85 + 0.3 * (0.72 - v)), block)
    const base = soft(ellipseDistance(u, v, 0.24, 0.7, 0.11, 0.05), 0.012)
    const limb = Math.max(
      soft(segmentDistance(u, v, shoulder, elbow, 0.07), 0.01),
      soft(segmentDistance(u, v, elbow, hand, 0.055), 0.01),
      base
    )
    // Why white on gray: a lab arm is light against a darker wall, as in robot videos.
    const metal = shade(hex('#f2f3f4'), 0.78 + 0.3 * (1 - v) + 0.08 * grain)
    color = mix(color, metal, limb)
    const joints = Math.max(
      soft(ellipseDistance(u, v, elbow[0], elbow[1], 0.035, 0.035), 0.008),
      soft(ellipseDistance(u, v, hand[0], hand[1], 0.03, 0.03), 0.008)
    )
    return mix(color, hex('#3e4248'), joints)
  }
}

function shader(kind, random, t, texture) {
  if (kind === 'cat') {
    return catScene(random, t, texture)
  }
  if (kind === 'arm') {
    return armScene(random, t, texture)
  }
  if (kind === 'gradient') {
    const [a, b] = [hex('#9ec5e8'), hex('#f3c9a6')]
    return (u, v) => mix(a, b, (u + v) / 2 + 0.15 * (texture(u, v, 3) - 0.5))
  }
  if (kind === 'noise') {
    return () => [128, 128, 128]
  }
  return landscape(random, texture)
}

/**
 * Gray noise at every pixel, blurred `grain` pixels (a Gaussian's sigma) and scaled back to unit
 * variance: grain larger than a pixel stays the same when the picture is drawn bigger or smaller
 * than its pixels, where pixel-sized noise beats against the screen's into a grid.
 */
function noiseField(width, height, random, grain) {
  const field = new Float32Array(width * height)
  for (let index = 0; index < field.length; index += 1) {
    field[index] = gaussian(random)
  }
  if (!(grain > 0.3)) {
    return field
  }
  const radius = Math.ceil(grain * 2.5)
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) =>
    Math.exp(-((index - radius) ** 2) / (2 * grain ** 2))
  )
  const sum = kernel.reduce((total, value) => total + value, 0)
  const weights = kernel.map((value) => value / sum)
  // Why rescale: blurring averages the noise down; each of the two passes keeps sqrt(Σw²) of
  // its spread.
  const gain = 1 / weights.reduce((total, value) => total + value * value, 0)
  const pass = (source, horizontal) => {
    const result = new Float32Array(source.length)
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        let value = 0
        for (let offset = -radius; offset <= radius; offset += 1) {
          // Why wrap: the edges blur like the middle, so no border band is smoother.
          const c = horizontal ? (col + offset + width) % width : col
          const r = horizontal ? row : (row + offset + height) % height
          value += source[r * width + c] * weights[offset + radius]
        }
        result[row * width + col] = value
      }
    }
    return result
  }
  return pass(pass(field, true), false).map((value) => value * gain)
}

/**
 * RGB bytes of a `kind` picture `width` × `height`; `view` ({ x, y, w, h } in 0–1) crops it,
 * as for one patch of an image; `noise` (0–1) blends in Gaussian noise (up to about 0.4 keeps
 * the subject visible), `intensity` (0–1) sets how strong that noise is, and `grain` (pixels)
 * how coarse.
 */
export function renderPicture({
  kind = 'landscape',
  width = 96,
  height = 96,
  seed = 1,
  t = 0,
  noise = 0,
  view = null,
  tint = null,
  intensity = 1,
  grain = 0
}) {
  const random = generator(seed)
  const texture = fractalNoise(Number(seed) || 1)
  const paint = shader(kind, random, t, texture)
  const pixels = new Uint8Array(width * height * 3)
  const amount = kind === 'noise' ? 1 : Math.min(1, Math.max(0, noise))
  const grainRandom = generator(Number(seed) * 7919 + 13)
  const field = amount ? noiseField(width, height, grainRandom, grain) : null
  const frame = view ?? { x: 0, y: 0, w: 1, h: 1 }
  const tintChannels = tint ? hex(tint) : null
  // Why 40 and not more: stronger noise clips to black and white, salt and pepper.
  const spread = (tint ? 32 : 40) * Math.min(1, Math.max(0, intensity))
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let color = [0, 0, 0]
      if (kind !== 'noise') {
        for (const [dx, dy] of [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75]
        ]) {
          const sample = paint(
            frame.x + ((col + dx) / width) * frame.w,
            frame.y + ((row + dy) / height) * frame.h
          )
          color = color.map((channel, index) => channel + sample[index] / 4)
        }
      }
      // Why a vignette and grain: lens fall-off and sensor noise are what make it a photo.
      const u = frame.x + ((col + 0.5) / width) * frame.w
      const v = frame.y + ((row + 0.5) / height) * frame.h
      const vignette = 1 - 0.36 * ((u - 0.5) ** 2 + (v - 0.5) ** 2)
      const offset = (row * width + col) * 3
      // Why one draw for all channels: gray noise, as diffusion figures show it; colour noise
      // reads as a fourth hue.
      const gray = field ? field[row * width + col] * spread : 0
      for (let channel = 0; channel < 3; channel += 1) {
        const photo = color[channel] * vignette + gaussian(grainRandom) * 3
        const base = tint ? tintChannels[channel] : 128
        const value = photo * (1 - amount) + (base + gray) * amount
        pixels[offset + channel] = Math.max(0, Math.min(255, Math.round(value)))
      }
    }
  }
  return pixels
}
