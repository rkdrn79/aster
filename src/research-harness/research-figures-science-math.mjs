// The numbers behind the science glyphs: a seeded random source, Gaussian mixtures in scene units
// (presets such as 8 Gaussians, two moons and a ring are mixtures too), their samples, density
// and score, highest-density levels, marching squares and path smoothing, and colour ramps in
// one hue. Pure: no elements, no style beyond reading colours.
import { hexToOklch, oklchToHex } from './research-figures-palette.mjs'
import { styleColor } from './research-figures-style.mjs'

/** A seeded uniform source in [0, 1) (mulberry32): the same seed draws the same cloud. */
export function seeded(seed = 1) {
  if (!Number.isFinite(seed)) {
    throw new Error(`seed must be a number, not ${JSON.stringify(seed)}`)
  }
  let state = Math.floor(seed * 2654435761) >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Two independent standard normal draws (Box–Muller). */
export function normalPair(random) {
  const u = Math.max(random(), 1e-12)
  const v = random()
  const r = Math.sqrt(-2 * Math.log(u))
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]
}

// 2 × 2 symmetric matrices as [a, b, c] for [[a, b], [b, c]].
export const det2 = ([a, b, c]) => a * c - b * b
export const inv2 = (m) => {
  const d = det2(m)
  return [m[2] / d, -m[1] / d, m[0] / d]
}
export const mul2 = ([a, b, c], [x, y]) => [a * x + b * y, b * x + c * y]
export const add2 = (m, n, s = 1, t = 1) => [
  s * m[0] + t * n[0],
  s * m[1] + t * n[1],
  s * m[2] + t * n[2]
]
/** The lower Cholesky factor [l11, l21, l22] of a covariance. */
export function cholesky([a, b, c]) {
  const l11 = Math.sqrt(Math.max(a, 1e-12))
  const l21 = b / l11
  return [l11, l21, Math.sqrt(Math.max(c - l21 * l21, 1e-12))]
}

/** A Gaussian's log density at a point, `cov` given as [a, b, c]. */
export function gaussianLog([x, y], mean, cov) {
  const [p, q, r] = inv2(cov)
  const dx = x - mean[0]
  const dy = y - mean[1]
  return (
    -0.5 * (p * dx * dx + 2 * q * dx * dy + r * dy * dy) -
    Math.log(2 * Math.PI * Math.sqrt(det2(cov)))
  )
}

/** A Gaussian's density at a point, `cov` given as [a, b, c]. */
export const gaussianAt = (point, mean, cov) => Math.exp(gaussianLog(point, mean, cov))

/**
 * Each component's share of the density at a point (weights × likelihood, normalised in the log
 * domain, so a point far from every component still has shares).
 */
export function responsibilities(components, point) {
  const logs = components.map(
    (component) => Math.log(component.weight) + gaussianLog(point, component.mean, component.cov)
  )
  const top = Math.max(...logs)
  const shares = logs.map((value) => Math.exp(value - top))
  const total = shares.reduce((sum, value) => sum + value, 0)
  return shares.map((value) => value / total)
}

/**
 * A component's covariance in units of the box's shorter side: `sigma` (round), `[sx, sy]`,
 * with `rho` (correlation) or `angle` (degrees, the long axis); or `cov: [[a, b], [b, c]]`.
 */
function shapeOf(component, unit) {
  if (component.cov) {
    const [[a, b], [, c]] = component.cov
    return [a * unit * unit, b * unit * unit, c * unit * unit]
  }
  const sigma = component.sigma ?? 0.16
  const [sx, sy] = (Array.isArray(sigma) ? sigma : [sigma, sigma]).map((value) =>
    value > 0 ? value * unit : Number.NaN
  )
  if (component.angle !== undefined) {
    const t = (component.angle * Math.PI) / 180
    const [cs, sn] = [Math.cos(t), Math.sin(t)]
    // Why minus: y runs down on the page, so a positive angle tilts the long axis up.
    return [
      cs * cs * sx * sx + sn * sn * sy * sy,
      -cs * sn * (sx * sx - sy * sy),
      sn * sn * sx * sx + cs * cs * sy * sy
    ]
  }
  const rho = component.rho ?? 0
  return [sx * sx, -rho * sx * sy, sy * sy]
}

const circle = (count, radius, sigma, start = 0) =>
  Array.from({ length: count }, (_, index) => {
    const t = start + (2 * Math.PI * index) / count
    return { mean: [0.5 + radius * Math.cos(t), 0.5 - radius * Math.sin(t)], sigma }
  })
const arc = (count, cx, cy, radius, from, to, sigma) =>
  Array.from({ length: count }, (_, index) => {
    const t = from + ((to - from) * index) / (count - 1)
    return { mean: [cx + radius * Math.cos(t), cy - radius * Math.sin(t)], sigma }
  })

/** Named distributions as mixtures in a unit square (x right, y down), centred in the box. */
export const DISTRIBUTION_PRESETS = {
  gaussian: () => [{ mean: [0.5, 0.5], sigma: 0.17 }],
  'two-gaussians': () => [
    { mean: [0.3, 0.62], sigma: 0.1, weight: 0.45 },
    { mean: [0.7, 0.36], sigma: 0.11, weight: 0.55 }
  ],
  '8gaussians': () => circle(8, 0.33, 0.045),
  ring: () => circle(28, 0.3, 0.05),
  moons: () => [
    ...arc(14, 0.4, 0.56, 0.24, 0, Math.PI, 0.04),
    ...arc(14, 0.6, 0.44, 0.24, Math.PI, 2 * Math.PI, 0.04)
  ],
  spiral: () =>
    Array.from({ length: 22 }, (_, index) => {
      const s = index / 21
      const t = 0.6 + 3.3 * Math.PI * s
      const radius = 0.05 + 0.33 * s
      return {
        mean: [0.5 + radius * Math.cos(t), 0.5 - radius * Math.sin(t)],
        sigma: 0.022 + 0.02 * s
      }
    })
}

/**
 * A mixture in scene units inside the box { x, y, w, h }: `dist` is a preset name or
 * `{ components: [{ mean: [u, v] (shares of the box), sigma | [sx, sy] | cov, rho, angle, weight }] }`.
 * Preset shapes keep their proportions in the box's centred square; sigma is a share of the
 * box's shorter side. Returns `{ components: [{ mean: [x, y], cov: [a, b, c], weight }] }`.
 */
export function mixtureIn(dist = 'gaussian', box) {
  const unit = Math.min(box.w, box.h)
  const preset = typeof dist === 'string'
  if (preset && !Object.hasOwn(DISTRIBUTION_PRESETS, dist)) {
    throw new Error(
      `Unknown dist "${dist}"; use one of ${Object.keys(DISTRIBUTION_PRESETS).join(', ')}, or { components: [...] }`
    )
  }
  const raw = preset ? DISTRIBUTION_PRESETS[dist]() : dist?.components
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error('dist needs a preset name or { components: [{ mean: [u, v], sigma }] }')
  }
  const place = preset
    ? ([u, v]) => [box.x + (box.w - unit) / 2 + u * unit, box.y + (box.h - unit) / 2 + v * unit]
    : ([u, v]) => [box.x + u * box.w, box.y + v * box.h]
  const total = raw.reduce((sum, component) => sum + (component.weight ?? 1), 0)
  const components = raw.map((component) => {
    if (
      !Array.isArray(component.mean) ||
      component.mean.length !== 2 ||
      !component.mean.every(Number.isFinite)
    ) {
      throw new Error(
        `A component's mean must be [u, v] numbers (shares of the box), not ${JSON.stringify(component.mean)}`
      )
    }
    const cov = shapeOf(component, unit)
    if (!cov.every(Number.isFinite) || det2(cov) <= 0) {
      throw new Error(
        `A component's sigma or cov must be positive numbers: ${JSON.stringify(component)}`
      )
    }
    return { mean: place(component.mean), cov, weight: (component.weight ?? 1) / total }
  })
  return { components }
}

/** n points drawn from a mixture, in scene units. */
export function sampleMixture(mixture, n, random) {
  const points = []
  for (let index = 0; index < n; index += 1) {
    let pick = random()
    const component =
      mixture.components.find((item) => (pick -= item.weight) < 0) ?? mixture.components.at(-1)
    const [l11, l21, l22] = cholesky(component.cov)
    const [z1, z2] = normalPair(random)
    points.push([component.mean[0] + l11 * z1, component.mean[1] + l21 * z1 + l22 * z2])
  }
  return points
}

export function densityAt(mixture, point) {
  return mixture.components.reduce(
    (sum, component) => sum + component.weight * gaussianAt(point, component.mean, component.cov),
    0
  )
}

/** ∇ log p at a point: where Langevin dynamics and a score field push. */
export function scoreAt(mixture, point) {
  const shares = responsibilities(mixture.components, point)
  let gx = 0
  let gy = 0
  mixture.components.forEach((component, index) => {
    const [sx, sy] = mul2(inv2(component.cov), [
      component.mean[0] - point[0],
      component.mean[1] - point[1]
    ])
    gx += shares[index] * sx
    gy += shares[index] * sy
  })
  return [gx, gy]
}

/** A mixture moved from one box into another: one scale for both axes, centred. */
export function moveMixture(mixture, from, to) {
  const scale = Math.min(to.w / from.w, to.h / from.h)
  const ox = to.x + (to.w - from.w * scale) / 2
  const oy = to.y + (to.h - from.h * scale) / 2
  return {
    components: mixture.components.map((component) => ({
      ...component,
      mean: [ox + (component.mean[0] - from.x) * scale, oy + (component.mean[1] - from.y) * scale],
      cov: component.cov.map((value) => value * scale * scale)
    }))
  }
}

/** The density on a grid over the box, `cell` units apart: `{ values, nx, ny, x0, y0, cell }`. */
export function densityGrid(mixture, box, cell) {
  const nx = Math.max(8, Math.round(box.w / cell) + 1)
  const ny = Math.max(8, Math.round(box.h / cell) + 1)
  const dx = box.w / (nx - 1)
  const dy = box.h / (ny - 1)
  const values = new Float64Array(nx * ny)
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      values[j * nx + i] = densityAt(mixture, [box.x + i * dx, box.y + j * dy])
    }
  }
  return { values, nx, ny, x0: box.x, y0: box.y, dx, dy }
}

/**
 * The density thresholds whose regions hold each share of the mass (highest-density regions):
 * 0.9 is the level inside which 90% of the samples fall.
 */
export function massLevels(grid, masses) {
  const sorted = Float64Array.from(grid.values).sort().toReversed()
  const total = sorted.reduce((sum, value) => sum + value, 0) || 1
  return masses.map((mass) => {
    let running = 0
    for (const value of sorted) {
      running += value / total
      if (running >= mass) {
        return value
      }
    }
    return sorted.at(-1)
  })
}

// Marching squares: corners top-left 8, top-right 4, bottom-right 2, bottom-left 1; edges
// 0 top, 1 right, 2 bottom, 3 left. Each case joins the edges its level crosses.
const CASES = [
  [],
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[0, 1]],
  [
    [0, 1],
    [3, 2]
  ],
  [[0, 2]],
  [[0, 3]],
  [[0, 3]],
  [[0, 2]],
  [
    [0, 3],
    [2, 1]
  ],
  [[0, 1]],
  [[3, 1]],
  [[2, 1]],
  [[3, 2]],
  []
]

/**
 * Closed (or edge-cut) contour loops of a grid at `level`, as point lists in scene units. The
 * grid is padded with zeros, so a region cut by the box edge still closes along it.
 */
export function contourLoops(grid, level) {
  const { nx, ny, x0, y0, dx, dy } = grid
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : grid.values[j * nx + i])
  const point = (i, j, edge) => {
    // Edges: 0 top (i,j)-(i+1,j), 1 right, 2 bottom, 3 left of the cell with corner (i, j).
    const ends = [
      [
        [i, j],
        [i + 1, j]
      ],
      [
        [i + 1, j],
        [i + 1, j + 1]
      ],
      [
        [i, j + 1],
        [i + 1, j + 1]
      ],
      [
        [i, j],
        [i, j + 1]
      ]
    ][edge]
    const [[ai, aj], [bi, bj]] = ends
    const va = at(ai, aj)
    const vb = at(bi, bj)
    const t = va === vb ? 0.5 : (level - va) / (vb - va)
    const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))
    const gx = clamp(ai + t * (bi - ai), 0, nx - 1)
    const gy = clamp(aj + t * (bj - aj), 0, ny - 1)
    return [x0 + gx * dx, y0 + gy * dy]
  }
  const key = (i, j, edge) => {
    // Why shared keys: the bottom edge of one cell is the top edge of the one below.
    if (edge === 2) {
      return `h${i},${j + 1}`
    }
    if (edge === 0) {
      return `h${i},${j}`
    }
    return edge === 1 ? `v${i + 1},${j}` : `v${i},${j}`
  }
  const links = new Map()
  const points = new Map()
  const link = (a, b) => {
    links.set(a, [...(links.get(a) ?? []), b])
    links.set(b, [...(links.get(b) ?? []), a])
  }
  for (let j = -1; j < ny; j += 1) {
    for (let i = -1; i < nx; i += 1) {
      const index =
        (at(i, j) >= level ? 8 : 0) |
        (at(i + 1, j) >= level ? 4 : 0) |
        (at(i + 1, j + 1) >= level ? 2 : 0) |
        (at(i, j + 1) >= level ? 1 : 0)
      for (const [e1, e2] of CASES[index]) {
        const k1 = key(i, j, e1)
        const k2 = key(i, j, e2)
        points.set(k1, points.get(k1) ?? point(i, j, e1))
        points.set(k2, points.get(k2) ?? point(i, j, e2))
        link(k1, k2)
      }
    }
  }
  const seen = new Set()
  const loops = []
  for (const start of links.keys()) {
    if (seen.has(start)) {
      continue
    }
    const loop = [start]
    seen.add(start)
    let current = start
    for (;;) {
      const next = (links.get(current) ?? []).find((candidate) => !seen.has(candidate))
      if (!next) {
        break
      }
      seen.add(next)
      loop.push(next)
      current = next
    }
    if (loop.length >= 4) {
      loops.push(loop.map((name) => points.get(name)))
    }
  }
  return loops
}

/** Corner cutting (Chaikin): a smooth outline from a jagged one. */
export function smoothPath(points, { closed = false, rounds = 2 } = {}) {
  let path = points
  for (let round = 0; round < rounds; round += 1) {
    const next = closed ? [] : [path[0]]
    const count = closed ? path.length : path.length - 1
    for (let index = 0; index < count; index += 1) {
      const [ax, ay] = path[index]
      const [bx, by] = path[(index + 1) % path.length]
      next.push(
        [0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by],
        [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]
      )
    }
    if (!closed) {
      next.push(path.at(-1))
    }
    path = next
  }
  return path
}

/** Drops points closer than `tolerance` to the line through their neighbours (Ramer–Douglas–Peucker). */
export function simplifyPath(points, tolerance = 0.6) {
  if (points.length < 3) {
    return points
  }
  const [ax, ay] = points[0]
  const [bx, by] = points.at(-1)
  const length = Math.hypot(bx - ax, by - ay) || 1
  let worst = 0
  let at = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const [px, py] = points[index]
    const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
    if (distance > worst) {
      worst = distance
      at = index
    }
  }
  if (worst <= tolerance) {
    return [points[0], points.at(-1)]
  }
  return [
    ...simplifyPath(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplifyPath(points.slice(at), tolerance)
  ]
}

/** A closed outline simplified in two halves (split at the point farthest from its start). */
export function simplifyLoop(points, tolerance = 0.6) {
  const [ax, ay] = points[0]
  let far = 0
  points.forEach(([px, py], index) => {
    if (Math.hypot(px - ax, py - ay) > Math.hypot(points[far][0] - ax, points[far][1] - ay)) {
      far = index
    }
  })
  if (far === 0) {
    return points
  }
  const closed = [...points, points[0]]
  return [
    ...simplifyPath(closed.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplifyPath(closed.slice(far), tolerance).slice(0, -1)
  ]
}

/** The signed area of a closed outline (positive clockwise on the page). */
export function loopArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[(index + 1) % points.length]
    area += ax * by - bx * ay
  }
  return area / 2
}

/** A point inside a closed outline: the middle of the widest run across its middle row. */
export function interiorPoint(points) {
  const ys = points.map((point) => point[1])
  const y = (Math.min(...ys) + Math.max(...ys)) / 2
  const crossings = []
  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[(index + 1) % points.length]
    if ((ay <= y && by > y) || (by <= y && ay > y)) {
      crossings.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
    }
  }
  crossings.sort((a, b) => a - b)
  let best = [crossings[0] ?? points[0][0], y]
  let width = -1
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    if (crossings[index + 1] - crossings[index] > width) {
      width = crossings[index + 1] - crossings[index]
      best = [(crossings[index] + crossings[index + 1]) / 2, y]
    }
  }
  return best
}

const NEUTRAL = new Set([
  'ink',
  'line',
  'muted',
  'mid',
  'strong',
  'block',
  'gray',
  'white',
  'panel'
])

/**
 * A colour ramp in one hue: t = 0 a pale tint, t = 1 the colour's ink. Neutral names ramp from
 * a pale gray to the style's line gray, so a prior or a baseline stays without hue.
 */
export function colorRamp(style, name = 'accent') {
  const neutral = NEUTRAL.has(name)
  // Why a lighter gray for mid: a prior or noise drawn in mid recedes behind the data.
  const gray = ['ink', 'line'].includes(name) ? style.line : '#7a7a7a'
  const dark = hexToOklch(
    neutral ? gray : name.startsWith('#') ? name : styleColor(style, name).ink
  )
  const light = { L: 0.965, C: neutral ? 0 : Math.min(0.03, dark.C), h: dark.h }
  const deep = neutral ? dark : { ...dark, L: Math.min(dark.L, 0.5) }
  return (t) => {
    const s = Math.min(1, Math.max(0, t))
    return oklchToHex({
      L: light.L + (deep.L - light.L) * s,
      C: light.C + (deep.C - light.C) * s,
      h: dark.h
    })
  }
}
