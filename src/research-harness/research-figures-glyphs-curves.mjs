// Geometric glyphs for concept figures: a rotated ellipse (a covariance or a density blob, with
// nested sigma rings) and a 2D curve manifold (a data manifold as a curve in the plane, with
// offset shells, points on and off it, a tangent and projections onto it). Both are drawn from
// closed outlines and dots in the glyph's group, on an invisible anchor that carries the id.
import { colorRamp, seeded, normalPair, smoothPath } from './research-figures-science-math.mjs'
import {
  anchorPart,
  boxOption,
  countOption,
  dotPart,
  glyphInk,
  glyphSolid,
  numberOption,
  pathPart
} from './research-figures-science-parts.mjs'
import { styleOf } from './research-figures-type.mjs'

const SEGMENTS = 64

/** The axes of a 2×2 covariance (scene units², y down): radii (1 sigma) and the angle in degrees. */
export function covarianceAxes([[a, b], [c, d]]) {
  if (![a, b, c, d].every(Number.isFinite) || Math.abs(b - c) > 1e-9 * (1 + Math.abs(b))) {
    throw new Error('cov must be a symmetric 2×2 matrix [[sxx, sxy], [sxy, syy]]')
  }
  const mean = (a + d) / 2
  const spread = Math.hypot((a - d) / 2, b)
  const [major, minor] = [mean + spread, mean - spread]
  if (!(minor > 0)) {
    throw new Error('cov must be positive definite (both variances above |sxy|)')
  }
  // Why minus: the scene's y grows downward, and angle counts counter-clockwise as seen.
  const radians = 0.5 * Math.atan2(2 * b, a - d)
  return { rx: Math.sqrt(major), ry: Math.sqrt(minor), angle: (-radians * 180) / Math.PI }
}

/** Points around an ellipse centred at (cx, cy), radii rx and ry, turned `angle` degrees (CCW). */
export function ellipsePoints(cx, cy, rx, ry, angle = 0, segments = SEGMENTS) {
  const turn = (-angle * Math.PI) / 180
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)]
  return Array.from({ length: segments }, (_, index) => {
    const t = (index / segments) * 2 * Math.PI
    const [u, v] = [rx * Math.cos(t), ry * Math.sin(t)]
    return [cx + u * cos - v * sin, cy + u * sin + v * cos]
  })
}

const closeLoop = (points) => [...points, points[0]]

/**
 * `ellipse`: a rotated ellipse, or a Gaussian's sigma rings from `cov`. rx, ry, angle (degrees,
 * counter-clockwise), or cov [[sxx, sxy], [sxy, syy]] with `sigmas` (rings at these multiples);
 * `levels` nests filled rings pale → strong (a density blob); `fill: false` draws outlines only.
 */
export function makeEllipse(spec) {
  const owner = `ellipse ${spec.id}`
  const cx = numberOption(owner, 'cx', spec.cx, Number.NaN)
  const cy = numberOption(owner, 'cy', spec.cy, Number.NaN)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    throw new Error(`${owner}: give its centre cx and cy`)
  }
  const axes = spec.cov
    ? covarianceAxes(spec.cov)
    : {
        rx: numberOption(owner, 'rx', spec.rx, 24),
        ry: numberOption(owner, 'ry', spec.ry, spec.rx ?? 14),
        angle: numberOption(owner, 'angle', spec.angle, 0)
      }
  const levels = countOption(owner, 'levels', spec.levels, 1, [1, 6])
  const sigmas = spec.cov
    ? (spec.sigmas ?? [1, 2]).toSorted((p, q) => q - p)
    : Array.from({ length: levels }, (_, k) => (levels - k) / levels)
  const style = styleOf(spec)
  const color = spec.color ?? 'accent'
  const ramp = colorRamp(style, color)
  const filled = spec.fill !== false
  const count = sigmas.length
  const shade = (index) => (count === 1 ? 0.22 : 0.08 + (0.3 * index) / (count - 1))
  const rings = sigmas.map((sigma, index) =>
    pathPart(
      spec,
      `ring${index}`,
      closeLoop(ellipsePoints(cx, cy, axes.rx * sigma, axes.ry * sigma, axes.angle)),
      {
        closed: true,
        fill: filled ? ramp(shade(index)) : 'transparent',
        stroke: spec.stroke ?? (filled ? ramp(shade(index) + 0.3) : glyphInk(style, color)),
        width: spec.strokeWidth ?? (filled ? 0.75 : 1.25),
        dashed: spec.dashed,
        opacity: spec.opacity
      }
    )
  )
  const outer = sigmas[0]
  const extent = ellipsePoints(cx, cy, axes.rx * outer, axes.ry * outer, axes.angle)
  const xs = extent.map((point) => point[0])
  const ys = extent.map((point) => point[1])
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys)
  }
  const centre = spec.centre
    ? [dotPart(spec, 'centre', [cx, cy], { r: 2, fill: glyphSolid(style, color) })]
    : []
  return {
    elements: [anchorPart(spec, box, 'ellipse', { ...axes, cx, cy }), ...rings, ...centre],
    extra: { ...axes, cx, cy }
  }
}

/** The curve's shape in shares of its box (u right, v down), sampled densely. */
function curveShares(curve) {
  const sample = (f) => Array.from({ length: SEGMENTS + 1 }, (_, k) => f(k / SEGMENTS))
  if (Array.isArray(curve)) {
    if (curve.length < 2 || !curve.every((p) => p.length === 2 && p.every(Number.isFinite))) {
      throw new Error('curve points are [[u, v], …] shares of the box, at least two')
    }
    return smoothPath(curve, { rounds: 3 })
  }
  const shapes = {
    arc: (t) => [t, 0.85 - 0.7 * Math.sin(Math.PI * t)],
    s: (t) => [t, 0.5 - 0.35 * Math.sin(2 * Math.PI * t)],
    wave: (t) => [t, 0.5 - 0.3 * Math.sin(3 * Math.PI * t)],
    line: (t) => [t, 0.5]
  }
  if (!shapes[curve]) {
    throw new Error(`curve is ${Object.keys(shapes).join(' | ')} or [[u, v], …] shares`)
  }
  return sample(shapes[curve])
}

/** A path with arc-length lookups: the point and unit normal (left of travel) at share s. */
export function curveTrack(points) {
  const lengths = [0]
  for (let k = 1; k < points.length; k += 1) {
    lengths.push(
      lengths[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1])
    )
  }
  const total = lengths.at(-1) || 1
  const locate = (s) => {
    const target = Math.min(1, Math.max(0, s)) * total
    let k = 1
    while (k < points.length - 1 && lengths[k] < target) {
      k += 1
    }
    const span = lengths[k] - lengths[k - 1] || 1
    const t = (target - lengths[k - 1]) / span
    const [a, b] = [points[k - 1], points[k]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const norm = Math.hypot(dx, dy) || 1
    return {
      point: [a[0] + dx * t, a[1] + dy * t],
      normal: [dy / norm, -dx / norm],
      tangent: [dx / norm, dy / norm]
    }
  }
  return {
    length: total,
    point: (s) => locate(s).point,
    normal: (s) => locate(s).normal,
    tangent: (s) => locate(s).tangent,
    /** The point `d` units off the curve at share s (positive: left of travel, up for 'arc'). */
    offset: (s, d) => {
      const { point, normal } = locate(s)
      return [point[0] + normal[0] * d, point[1] + normal[1] * d]
    }
  }
}

/**
 * `curveManifold`: a data manifold drawn as a curve in the plane (x, y, w, h; curve 'arc' | 's' |
 * 'wave' | 'line' | [[u, v], …]), with `shells` (offset bands, units, nested pale → strong: the
 * noisy neighbourhoods M_t around M), `on` dots on it and `off` dots off it (seeded, beyond the
 * innermost band), a `tangent` at a share and `projections` (an off point's dashed drop onto
 * the curve). Returns point(s), normal(s) and offset(s, d) for labels and arrows.
 */
export function makeCurveManifold(spec) {
  const owner = `curveManifold ${spec.id}`
  const box = boxOption(owner, spec, [200, 100])
  const style = styleOf(spec)
  const color = spec.color ?? 'accent'
  const ramp = colorRamp(style, color)
  const points = curveShares(spec.curve ?? 'arc').map(([u, v]) => [
    box.x + u * box.w,
    box.y + v * box.h
  ])
  const track = curveTrack(points)
  const shells = (spec.shells ?? [12]).toSorted((p, q) => q - p)
  const elements = []
  shells.forEach((width, index) => {
    const left = Array.from({ length: SEGMENTS + 1 }, (_, k) => track.offset(k / SEGMENTS, width))
    const right = Array.from({ length: SEGMENTS + 1 }, (_, k) =>
      track.offset(1 - k / SEGMENTS, -width)
    )
    const shade = shells.length === 1 ? 0.14 : 0.06 + (0.16 * index) / (shells.length - 1)
    elements.push(
      pathPart(spec, `shell${index}`, closeLoop([...left, ...right]), {
        closed: true,
        fill: ramp(shade),
        stroke: spec.shellStroke === false ? 'transparent' : ramp(shade + 0.18),
        width: 0.75,
        dashed: spec.shellDashed
      })
    )
  })
  elements.push(
    pathPart(spec, 'curve', points, {
      stroke: glyphInk(style, color),
      width: numberOption(owner, 'strokeWidth', spec.strokeWidth, 1.5)
    })
  )
  const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
  const r = numberOption(owner, 'r', spec.r, 2.5)
  const on = countOption(owner, 'on', spec.on, 0, [0, 200])
  for (let k = 0; k < on; k += 1) {
    const s = (k + 0.5) / on + (random() - 0.5) * (0.6 / Math.max(on, 1))
    elements.push(
      dotPart(spec, `on${k}`, track.point(s), { r, fill: glyphSolid(style, color), rim: '#ffffff' })
    )
  }
  const off = countOption(owner, 'off', spec.off, 0, [0, 200])
  const inner = shells.at(-1) ?? 0
  const offPoints = []
  for (let k = 0; k < off; k += 1) {
    const s = 0.05 + 0.9 * random()
    const [z] = normalPair(random)
    const d = Math.sign(z || 1) * (inner + 4 + Math.abs(z) * (shells[0] - inner + 6))
    offPoints.push(track.offset(s, d))
    elements.push(
      dotPart(spec, `off${k}`, offPoints.at(-1), {
        r,
        fill: glyphSolid(style, 'mid'),
        rim: '#ffffff'
      })
    )
  }
  if (spec.tangent !== undefined) {
    const at = typeof spec.tangent === 'number' ? spec.tangent : (spec.tangent.at ?? 0.5)
    const half = (spec.tangent.length ?? Math.min(box.w, box.h) * 0.5) / 2
    const [p, t] = [track.point(at), track.tangent(at)]
    elements.push(
      pathPart(
        spec,
        'tangent',
        [
          [p[0] - t[0] * half, p[1] - t[1] * half],
          [p[0] + t[0] * half, p[1] + t[1] * half]
        ],
        { stroke: glyphInk(style, 'ink'), width: 1, dashed: true }
      )
    )
  }
  for (const [k, item] of (spec.projections ?? []).entries()) {
    const from = item.from ?? offPoints[item.off ?? k]
    if (!from) {
      throw new Error(`${owner}: projection ${k} needs from: [x, y] or off: an off-dot index`)
    }
    const foot = nearestOn(points, from)
    elements.push(
      pathPart(spec, `proj${k}`, [from, foot], {
        stroke: glyphInk(style, 'ink'),
        width: 1,
        dashed: true
      }),
      dotPart(spec, `foot${k}`, foot, { r: 2, fill: glyphSolid(style, 'ink') })
    )
  }
  const pad = shells[0] ?? 0
  const anchorBox = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }
  return {
    elements: [anchorPart(spec, anchorBox, 'curveManifold', { color }), ...elements],
    extra: {
      point: track.point,
      normal: track.normal,
      offset: track.offset,
      offPoints
    }
  }
}

/** The point of a polyline nearest to `p`. */
function nearestOn(points, p) {
  let best = points[0]
  let distance = Infinity
  for (let k = 1; k < points.length; k += 1) {
    const [a, b] = [points[k - 1], points[k]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const span = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span))
    const q = [a[0] + dx * t, a[1] + dy * t]
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < distance) {
      distance = d
      best = q
    }
  }
  return best
}
