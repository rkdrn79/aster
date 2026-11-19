// Three-dimensional geometry for the solid glyphs: an orthographic camera (azimuth and elevation,
// as matplotlib's view_init), named surfaces for loss landscapes, a Swiss roll and other
// parametric sheets, gradient descent on a surface, and great circles on a sphere. Pure numbers.

const DEG = Math.PI / 180

/**
 * A camera looking at the origin from `azimuth` (degrees around the vertical, 0 along +x) and
 * `elevation` (degrees above the floor): screen x right, screen y down, depth toward the viewer.
 */
export function camera({ azimuth = 50, elevation = 25 } = {}) {
  for (const [name, value] of [
    ['azimuth', azimuth],
    ['elevation', elevation]
  ]) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a number of degrees, not ${JSON.stringify(value)}`)
    }
  }
  const [ca, sa] = [Math.cos(azimuth * DEG), Math.sin(azimuth * DEG)]
  const [ce, se] = [Math.cos(elevation * DEG), Math.sin(elevation * DEG)]
  const project = ([x, y, z]) => {
    const toward = x * ca + y * sa
    return [-x * sa + y * ca, -(z * ce - toward * se), toward * ce + z * se]
  }
  return { project, view: [ca * ce, sa * ce, se] }
}

/** Fits projected [sx, sy, depth] points into a box (one scale for both axes), centred. */
export function fitter(points, box, pad = 0) {
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys)
  ]
  const scale = Math.min(
    (box.w - 2 * pad) / (maxX - minX || 1),
    (box.h - 2 * pad) / (maxY - minY || 1)
  )
  const ox = box.x + (box.w - (maxX - minX) * scale) / 2 - minX * scale
  const oy = box.y + (box.h - (maxY - minY) * scale) / 2 - minY * scale
  return ([sx, sy]) => [ox + sx * scale, oy + sy * scale]
}

const bump = (u, v, cu, cv, width) => Math.exp(-((u - cu) ** 2 + (v - cv) ** 2) / width)

/** Loss-landscape surfaces z = f(u, v) on u, v ∈ [−1, 1]; low is good. */
export const SURFACES = {
  bowl: (u, v) => u * u + v * v,
  valley: (u, v) => 0.25 * (u + 0.2) ** 2 + 2.2 * (v - 0.45 * u * u + 0.15) ** 2,
  saddle: (u, v) => 0.5 + 0.5 * (u * u - v * v),
  multimodal: (u, v) =>
    0.45 * (u * u + v * v) -
    0.9 * bump(u, v, 0.42, -0.38, 0.1) -
    0.55 * bump(u, v, -0.48, 0.42, 0.06) -
    0.3 * bump(u, v, -0.35, -0.5, 0.035) +
    0.04 * Math.sin(4 * u) * Math.cos(5 * v),
  'sharp-flat': (u, v) =>
    0.4 * (u * u + v * v) +
    0.15 -
    0.45 * bump(u, v, -0.45, 0.1, 0.012) -
    0.32 * bump(u, v, 0.45, -0.05, 0.12)
}

/** The surface function: a name in SURFACES or `(u, v) => z`, checked to give numbers. */
export function surfaceFunction(f = 'multimodal') {
  if (typeof f === 'function') {
    const probe = f(0.13, -0.27)
    if (!Number.isFinite(probe)) {
      throw new Error(`surface f(u, v) must return a finite number; f(0.13, -0.27) gave ${probe}`)
    }
    return f
  }
  if (!Object.hasOwn(SURFACES, f)) {
    throw new Error(
      `Unknown surface "${f}"; use one of ${Object.keys(SURFACES).join(', ')}, or (u, v) => z`
    )
  }
  return SURFACES[f]
}

/** z on a grid, scaled to 0–1 over the grid: `{ at(u, v), lo, hi }`. */
export function normalizedSurface(f, n = 40) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const z = f(-1 + (2 * i) / n, -1 + (2 * j) / n)
      if (!Number.isFinite(z)) {
        throw new Error(`surface f(u, v) gave ${z} at u=${-1 + (2 * i) / n}, v=${-1 + (2 * j) / n}`)
      }
      lo = Math.min(lo, z)
      hi = Math.max(hi, z)
    }
  }
  const span = hi - lo || 1
  return { at: (u, v) => (f(u, v) - lo) / span, lo, hi }
}

/**
 * Gradient descent on a 0–1 surface from `from` [u, v]: `steps`, learning rate `lr`, `momentum`
 * (0 plain, 0.9 heavy ball); stops early when it settles. Returns [u, v] points, clamped to the square.
 */
export function descend(at, { from = [-0.8, 0.8], steps = 40, lr = 0.08, momentum = 0 } = {}) {
  const h = 1e-3
  let [u, v] = from
  let [mu, mv] = [0, 0]
  const path = [[u, v]]
  for (let step = 0; step < steps; step += 1) {
    const gu = (at(u + h, v) - at(u - h, v)) / (2 * h)
    const gv = (at(u, v + h) - at(u, v - h)) / (2 * h)
    mu = momentum * mu - lr * gu
    mv = momentum * mv - lr * gv
    u = Math.min(1, Math.max(-1, u + mu))
    v = Math.min(1, Math.max(-1, v + mv))
    path.push([u, v])
    if (Math.hypot(mu, mv) < 1e-4) {
      break
    }
  }
  return path
}

/** Parametric sheets (s, t) ∈ [0, 1]² → [x, y, z], roughly within a unit cube. */
export const MANIFOLDS = {
  'swiss-roll': (s, t) => {
    const a = 1.5 * Math.PI * (1 + 2.4 * s)
    return [(a * Math.cos(a)) / 16, 1.5 * (t - 0.5), (a * Math.sin(a)) / 16]
  },
  's-curve': (s, t) => {
    const a = 3 * Math.PI * (s - 0.5)
    return [Math.sin(a) * 0.7, 1.6 * (t - 0.5), Math.sign(a) * (Math.cos(a) - 1) * 0.7]
  },
  sheet: (s, t) => {
    const [u, v] = [2 * s - 1, 2 * t - 1]
    return [u, v, 0.35 * Math.sin(2.2 * u) * Math.cos(1.6 * v)]
  },
  torus: (s, t) => {
    const [a, b] = [2 * Math.PI * s, 2 * Math.PI * t]
    return [
      (0.7 + 0.28 * Math.cos(b)) * Math.cos(a),
      (0.7 + 0.28 * Math.cos(b)) * Math.sin(a),
      0.28 * Math.sin(b)
    ]
  }
}

/** A unit vector at latitude and longitude (degrees): z up. */
export function onSphere([lat, lon]) {
  const [a, b] = [lat * DEG, lon * DEG]
  return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]
}

/** The great-circle arc between two points on a unit sphere, `count` + 1 points (slerp). */
export function greatCircle(from, to, count = 48) {
  const [p, q] = [onSphere(from), onSphere(to)]
  const dot = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  const angle = Math.acos(dot)
  if (angle < 1e-6) {
    return [p, q]
  }
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count
    const [a, b] = [
      Math.sin((1 - t) * angle) / Math.sin(angle),
      Math.sin(t * angle) / Math.sin(angle)
    ]
    return [a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2]]
  })
}

/** Splits a projected path into runs in front of (depth ≥ 0) and behind the sphere's middle. */
export function frontAndBack(projected) {
  const runs = []
  for (const point of projected) {
    const front = point[2] >= 0
    const last = runs.at(-1)
    if (last && last.front === front) {
      last.points.push(point)
    } else {
      runs.push({ front, points: last ? [last.points.at(-1), point] : [point] })
    }
  }
  return runs
}

/** Lambert brightness 0–1 of a face with normal `n` under a light from the upper left front. */
export function lambert(normal, view) {
  const length = Math.hypot(...normal) || 1
  let n = normal.map((value) => value / length)
  // Why flip: a face seen from behind (the inside of a roll) is lit on the side we see.
  if (n[0] * view[0] + n[1] * view[1] + n[2] * view[2] < 0) {
    n = n.map((value) => -value)
  }
  const light = [view[0] * 0.6 - view[1] * 0.5, view[1] * 0.6 + view[0] * 0.5, 0.75]
  const ll = Math.hypot(...light)
  return Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / ll)
}

/** The normal of a quad from its diagonals. */
export function quadNormal([a, b, c, d]) {
  const p = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const q = [d[0] - b[0], d[1] - b[1], d[2] - b[2]]
  return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
}
