// Distributions as numbers for the density and flow glyphs: every one is a Gaussian mixture in
// model units (x right, y up; a preset fills about [-1, 1]²), so its density on a grid, its
// samples, its interpolants and their velocities are all closed form. Presets cover the toys of
// generative-model papers (moons, rings, spirals, a checkerboard, a banana, 8 Gaussians, a
// two-mode "data" shape, an image-like blob); a full-covariance Gaussian, any mixture and a KDE
// of given points work the same way. Pure: no elements, no style.
import { cholesky, det2, gaussianLog, inv2, normalPair } from './research-figures-science-math.mjs'

const DEG = Math.PI / 180

/** A covariance [a, b, c] with standard deviations sx (along `angle`, degrees ccw) and sy. */
export function rotatedCov(sx, sy = sx, angle = 0) {
  const [c, s] = [Math.cos(angle * DEG), Math.sin(angle * DEG)]
  return [
    c * c * sx * sx + s * s * sy * sy,
    c * s * (sx * sx - sy * sy),
    s * s * sx * sx + c * c * sy * sy
  ]
}

const g = (x, y, sx, sy = sx, angle = 0, weight = 1) => ({
  mean: [x, y],
  cov: rotatedCov(sx, sy, angle),
  weight
})

/**
 * Components spaced along a curve f(s) = [x, y] for s in [0, 1], `sigma` across it and stretched
 * along its tangent, so a band of a few dozen components reads as one smooth stroke, not beads.
 */
function along(f, count, sigma, weight = 1) {
  return Array.from({ length: count }, (_, k) => {
    const s = count === 1 ? 0.5 : k / (count - 1)
    const [x, y] = f(s)
    const width = typeof sigma === 'function' ? sigma(s) : sigma
    const [ax, ay] = f(Math.max(0, s - 0.01))
    const [bx, by] = f(Math.min(1, s + 0.01))
    // The gap to the next component: the curve's speed (over a 0.02 step in s) times 1 / (count − 1).
    const spacing = count > 1 ? (Math.hypot(bx - ax, by - ay) * 50) / (count - 1) : 0
    const stretch = Math.max(width, 0.75 * spacing)
    return g(x, y, stretch, width, Math.atan2(by - ay, bx - ax) / DEG, weight / count)
  })
}

const arc = (cx, cy, r, from, to) => (s) => [
  cx + r * Math.cos(from + (to - from) * s),
  cy + r * Math.sin(from + (to - from) * s)
]

function checkerboard() {
  const side = 0.45
  const per = 3
  const parts = []
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      if ((i + j) % 2) {
        continue
      }
      for (let a = 0; a < per; a += 1) {
        for (let b = 0; b < per; b += 1) {
          const x = -0.9 + i * side + ((a + 0.5) * side) / per
          const y = -0.9 + j * side + ((b + 0.5) * side) / per
          parts.push(g(x, y, (side / per) * 0.62))
        }
      }
    }
  }
  return parts
}

function banana() {
  return Array.from({ length: 11 }, (_, k) => {
    const u = -0.85 + (1.7 * k) / 10
    const y = 0.95 * u * u - 0.5
    // Why along the tangent: the crescent stays one smooth band, not a string of beads.
    const angle = Math.atan2(1.9 * u, 1) / DEG
    return g(u, y, 0.13, 0.085, angle, 1 - 0.35 * Math.abs(u))
  })
}

/** An image-like data blob: a lumpy, potato-shaped density (the data manifold of a teaser). */
function blob() {
  return [
    g(-0.38, 0.22, 0.34, 0.22, 30, 0.24),
    g(0.22, 0.38, 0.3, 0.2, -20, 0.2),
    g(0.42, -0.18, 0.26, 0.2, 70, 0.18),
    g(-0.08, -0.4, 0.3, 0.18, 10, 0.2),
    g(-0.5, -0.3, 0.18, 0.16, 0, 0.1),
    g(0.02, 0.02, 0.22, 0.22, 0, 0.12)
  ]
}

/** Named distributions in model units (x right, y up), each holding most of its mass in [-1, 1]². */
export const DIST_PRESETS = {
  gaussian: () => [g(0, 0, 0.4)],
  'two-gaussians': () => [g(-0.42, -0.3, 0.24, 0.24, 0, 0.45), g(0.42, 0.32, 0.26, 0.26, 0, 0.55)],
  '8gaussians': () =>
    Array.from({ length: 8 }, (_, k) =>
      g(0.75 * Math.cos((k * Math.PI) / 4), 0.75 * Math.sin((k * Math.PI) / 4), 0.1)
    ),
  moons: () => [
    ...along(arc(-0.31, -0.16, 0.62, 0, Math.PI), 16, 0.075),
    ...along(arc(0.31, 0.16, 0.62, Math.PI, 2 * Math.PI), 16, 0.075)
  ],
  ring: () => along(arc(0, 0, 0.72, 0, 2 * Math.PI * (27 / 28)), 28, 0.075),
  rings: () => [
    ...along(arc(0, 0, 0.36, 0, 2 * Math.PI * (15 / 16)), 16, 0.06, 0.33),
    ...along(arc(0, 0, 0.82, 0, 2 * Math.PI * (31 / 32)), 32, 0.06, 0.67)
  ],
  spiral: () =>
    [0, Math.PI].flatMap((turn) =>
      along(
        (s) => {
          const r = 0.12 + 0.78 * s
          const angle = turn + 0.4 + 2.6 * Math.PI * s
          return [r * Math.cos(angle), r * Math.sin(angle)]
        },
        20,
        (s) => 0.045 + 0.035 * s
      )
    ),
  checkerboard: checkerboard,
  banana: banana,
  // Two modes joined by a neck, the data q of a flow-matching blueprint: an elongated upper mode
  // tilted to the left, a heavier lower mode, a thin bridge between them.
  data: () => [
    g(-0.3, 0.52, 0.34, 0.11, 112, 0.3),
    g(-0.02, 0.02, 0.13, 0.08, 120, 0.08),
    g(0.16, -0.25, 0.12, 0.09, 60, 0.08),
    g(0.14, -0.55, 0.3, 0.17, 35, 0.54)
  ],
  blob: blob
}

/** Other names the presets answer to. */
const ALIASES = {
  mix8: '8gaussians',
  '8-gaussians': '8gaussians',
  eightgaussians: '8gaussians',
  spirals: 'spiral',
  circles: 'rings',
  images: 'blob',
  image: 'blob',
  normal: 'gaussian',
  noise: 'gaussian',
  'two-moons': 'moons',
  'two-modes': 'data',
  bimodal: 'data',
  checker: 'checkerboard'
}

export const DIST_NAMES = Object.keys(DIST_PRESETS)

/** A preset's components by name or alias (a fresh copy each call). */
export function presetComponents(name) {
  const key = Object.hasOwn(DIST_PRESETS, name) ? name : ALIASES[name]
  if (!key) {
    throw new Error(
      `Unknown dist "${name}"; use one of ${DIST_NAMES.join(', ')} (or mix8), { mean, cov }, { components } or { points }`
    )
  }
  return DIST_PRESETS[key]()
}

function covOf(owner, part) {
  if (part.cov !== undefined) {
    const value = part.cov
    const cov = Array.isArray(value[0]) ? [value[0][0], value[0][1], value[1][1]] : value
    if (!Array.isArray(cov) || cov.length !== 3 || !cov.every(Number.isFinite) || det2(cov) <= 0) {
      throw new Error(
        `${owner}: cov must be [[a, b], [b, c]] positive definite, not ${JSON.stringify(value)}`
      )
    }
    return cov
  }
  const sigma = part.sigma ?? 0.4
  const [sx, sy] = Array.isArray(sigma) ? sigma : [sigma, sigma]
  if (!(sx > 0 && sy > 0)) {
    throw new Error(`${owner}: sigma must be positive, not ${JSON.stringify(sigma)}`)
  }
  return rotatedCov(sx, sy, part.angle ?? 0)
}

function normalised(components) {
  const total = components.reduce((sum, part) => sum + (part.weight ?? 1), 0)
  return components.map((part) => ({ ...part, weight: (part.weight ?? 1) / total }))
}

/**
 * A distribution from a spec, in model units: a preset name; `{ preset, at, scale, rotate,
 * spread }` to move one; `{ mean, cov | sigma, angle }` a Gaussian with full covariance;
 * `{ components: [{ mean, cov | sigma, angle, weight }] }` a mixture; `{ points, bandwidth }`
 * a KDE of given points. Returns `{ components: [{ mean, cov: [a, b, c], weight }] }`.
 */
export function resolveDist(spec = 'gaussian', owner = 'dist') {
  if (spec?.components?.[0]?.cov?.length === 3 && spec.resolved) {
    return spec
  }
  let components
  if (typeof spec === 'string') {
    components = presetComponents(spec)
  } else if (spec && typeof spec === 'object') {
    if (spec.preset ?? spec.kind) {
      components = presetComponents(spec.preset ?? spec.kind)
    } else if (Array.isArray(spec.points)) {
      const h = spec.bandwidth ?? 0.08
      components = spec.points.map(([x, y]) => g(x, y, h))
    } else if (Array.isArray(spec.components)) {
      components = spec.components.map((part) => {
        if (
          !Array.isArray(part.mean) ||
          part.mean.length !== 2 ||
          !part.mean.every(Number.isFinite)
        ) {
          throw new Error(
            `${owner}: a component's mean must be [x, y], not ${JSON.stringify(part.mean)}`
          )
        }
        return { mean: [...part.mean], cov: covOf(owner, part), weight: part.weight ?? 1 }
      })
    } else if (Array.isArray(spec.mean)) {
      components = [{ mean: [...spec.mean], cov: covOf(owner, spec), weight: 1 }]
    }
  }
  if (!components?.length) {
    throw new Error(
      `${owner}: dist must be a preset (${DIST_NAMES.join(', ')}), { mean, cov }, { components } or { points }, not ${JSON.stringify(spec)}`
    )
  }
  const placed = placeDist(
    { components: normalised(components) },
    typeof spec === 'object' ? spec : {}
  )
  return { ...placed, resolved: true }
}

/** A distribution scaled (a number or [sx, sy]), rotated (degrees ccw), widened and moved to `at`. */
export function placeDist(dist, { at = [0, 0], scale = 1, rotate = 0, spread = 1 } = {}) {
  const [kx, ky] = Array.isArray(scale) ? scale : [scale, scale]
  const [c, s] = [Math.cos(rotate * DEG), Math.sin(rotate * DEG)]
  return {
    components: dist.components.map(({ mean, cov, weight }) => {
      const [x, y] = [mean[0] * kx, mean[1] * ky]
      // Σ' = R K Σ K Rᵀ, with K = diag(kx, ky) and R the rotation.
      const [a, b, d] = [
        cov[0] * kx * kx * spread,
        cov[1] * kx * ky * spread,
        cov[2] * ky * ky * spread
      ]
      const r00 = c * c * a - 2 * c * s * b + s * s * d
      const r01 = c * s * a + (c * c - s * s) * b - c * s * d
      const r11 = s * s * a + 2 * c * s * b + c * c * d
      return { mean: [at[0] + c * x - s * y, at[1] + s * x + c * y], cov: [r00, r01, r11], weight }
    })
  }
}

/** The box (model units) holding every component out to k standard deviations. */
export function distExtent(dist, k = 2.6) {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const { mean, cov } of dist.components) {
    const [rx, ry] = [k * Math.sqrt(cov[0]), k * Math.sqrt(cov[2])]
    x0 = Math.min(x0, mean[0] - rx)
    x1 = Math.max(x1, mean[0] + rx)
    y0 = Math.min(y0, mean[1] - ry)
    y1 = Math.max(y1, mean[1] + ry)
  }
  return { x0, x1, y0, y1 }
}

/** n seeded points of a mixture. */
export function sampleDist(dist, n, random) {
  const points = []
  for (let index = 0; index < n; index += 1) {
    let pick = random()
    const part = dist.components.find((item) => (pick -= item.weight) < 0) ?? dist.components.at(-1)
    const [l11, l21, l22] = cholesky(part.cov)
    const [z1, z2] = normalPair(random)
    points.push([part.mean[0] + l11 * z1, part.mean[1] + l21 * z1 + l22 * z2])
  }
  return points
}

/**
 * A fast density of a mixture: inverse covariances and normalisers computed once, components
 * farther than 7 standard deviations skipped.
 */
export function densityFn(dist) {
  const parts = dist.components.map(({ mean, cov, weight }) => {
    const [p, q, r] = inv2(cov)
    return { mx: mean[0], my: mean[1], p, q, r, k: weight / (2 * Math.PI * Math.sqrt(det2(cov))) }
  })
  return (x, y) => {
    let sum = 0
    for (const part of parts) {
      const dx = x - part.mx
      const dy = y - part.my
      const m = part.p * dx * dx + 2 * part.q * dx * dy + part.r * dy * dy
      if (m < 49) {
        sum += part.k * Math.exp(-0.5 * m)
      }
    }
    return sum
  }
}

/**
 * The density on a grid over `box` ({ x, y, w, h } in the mixture's own units), `cell` apart:
 * `{ values, nx, ny, x0, y0, dx, dy }`. Each component only touches the cells within 5 standard
 * deviations of it, so a mixture of hundreds of narrow components stays fast.
 */
export function gridDensity(dist, box, cell) {
  const nx = Math.max(8, Math.round(box.w / cell) + 1)
  const ny = Math.max(8, Math.round(box.h / cell) + 1)
  const dx = box.w / (nx - 1)
  const dy = box.h / (ny - 1)
  const values = new Float64Array(nx * ny)
  for (const { mean, cov, weight } of dist.components) {
    const [p, q, r] = inv2(cov)
    const k = weight / (2 * Math.PI * Math.sqrt(det2(cov)))
    const [rx, ry] = [5 * Math.sqrt(cov[0]), 5 * Math.sqrt(cov[2])]
    const i0 = Math.max(0, Math.floor((mean[0] - rx - box.x) / dx))
    const i1 = Math.min(nx - 1, Math.ceil((mean[0] + rx - box.x) / dx))
    const j0 = Math.max(0, Math.floor((mean[1] - ry - box.y) / dy))
    const j1 = Math.min(ny - 1, Math.ceil((mean[1] + ry - box.y) / dy))
    for (let j = j0; j <= j1; j += 1) {
      const ddy = box.y + j * dy - mean[1]
      for (let i = i0; i <= i1; i += 1) {
        const ddx = box.x + i * dx - mean[0]
        values[j * nx + i] +=
          k * Math.exp(-0.5 * (p * ddx * ddx + 2 * q * ddx * ddy + r * ddy * ddy))
      }
    }
  }
  return { values, nx, ny, x0: box.x, y0: box.y, dx, dy }
}

/** Log density of a mixture at a point (for tests and checks). */
export function logDensity(dist, point) {
  const logs = dist.components.map(
    (part) => Math.log(part.weight) + gaussianLog(point, part.mean, part.cov)
  )
  const top = Math.max(...logs)
  return top + Math.log(logs.reduce((sum, value) => sum + Math.exp(value - top), 0))
}

/**
 * A model → page map: model (x, y up) to scene units (y down) with one scale, the extent centred
 * in `box`. `pad` is a share of the box kept clear on every side.
 */
export function fitMap(extent, box, pad = 0.04) {
  const room = { w: box.w * (1 - 2 * pad), h: box.h * (1 - 2 * pad) }
  const scale = Math.min(room.w / (extent.x1 - extent.x0), room.h / (extent.y1 - extent.y0))
  const [mx, my] = [(extent.x0 + extent.x1) / 2, (extent.y0 + extent.y1) / 2]
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2]
  return {
    scale,
    point: ([x, y]) => [cx + (x - mx) * scale, cy - (y - my) * scale],
    model: ([px, py]) => [mx + (px - cx) / scale, my - (py - cy) / scale],
    dist: (dist) => ({
      components: dist.components.map(({ mean, cov, weight }) => ({
        mean: [cx + (mean[0] - mx) * scale, cy - (mean[1] - my) * scale],
        cov: [cov[0] * scale * scale, -cov[1] * scale * scale, cov[2] * scale * scale],
        weight
      }))
    })
  }
}
