// Contours of a density grid for the density and flow glyphs: levels by mass (the region inside
// a level holds a share of the samples), marching squares, smoothed closed outlines, and the
// order that paints filled bands right with stacked closed shapes (each outline before the ones
// inside it, a hole filled with the band around it), the way matplotlib's contourf looks.
import {
  contourLoops,
  massLevels,
  simplifyLoop,
  smoothPath
} from './research-figures-science-math.mjs'
import { hexToOklch, oklchToHex } from './research-figures-palette.mjs'
import { styleColor } from './research-figures-style.mjs'

/**
 * Shares of mass inside each level, outermost first. A count spaces the rings of a Gaussian
 * evenly (from 2.45 σ in), so a single mode reads like a contour plot; shares give them exactly.
 */
export function levelMasses(levels = 6) {
  if (Array.isArray(levels)) {
    if (!levels.every((mass) => typeof mass === 'number' && mass > 0 && mass < 1)) {
      throw new Error(
        `levels as shares of mass must be numbers between 0 and 1, not ${JSON.stringify(levels)}`
      )
    }
    return levels.toSorted((a, b) => b - a)
  }
  if (!Number.isInteger(levels) || levels < 1 || levels > 10) {
    throw new Error(
      `levels must be a count from 1 to 10 or shares of mass like [0.9, 0.6, 0.3], not ${JSON.stringify(levels)}`
    )
  }
  return Array.from({ length: levels }, (_, k) => {
    const r = 2.45 * (1 - k / (levels + 0.65))
    return 1 - Math.exp((-r * r) / 2)
  })
}

/** Whether a point lies inside a closed outline (even-odd). */
export function inside([x, y], loop) {
  let hit = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const [xi, yi] = loop[i]
    const [xj, yj] = loop[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      hit = !hit
    }
  }
  return hit
}

/** Whether the density just inside a loop lies under its level (the loop bounds a hole). */
function isHole(grid, loop, level) {
  let left = loop[0]
  for (const point of loop) {
    if (point[0] < left[0]) {
      left = point
    }
  }
  const x = left[0] + grid.dx * 0.75
  const gx = (x - grid.x0) / grid.dx
  const gy = (left[1] - grid.y0) / grid.dy
  const i = Math.max(0, Math.min(grid.nx - 2, Math.floor(gx)))
  const j = Math.max(0, Math.min(grid.ny - 2, Math.floor(gy)))
  const [fx, fy] = [gx - i, gy - j]
  const at = (a, b) => grid.values[b * grid.nx + a]
  const value =
    at(i, j) * (1 - fx) * (1 - fy) +
    at(i + 1, j) * fx * (1 - fy) +
    at(i, j + 1) * (1 - fx) * fy +
    at(i + 1, j + 1) * fx * fy
  return value < level
}

/**
 * Every contour of a grid at the levels whose regions hold `masses`, as closed outlines in
 * painting order: `[{ points, band, hole, depth }]`, band the level's index (0 outermost), hole
 * true where the outline bounds a dip below its level. Painting them in order, each filled with
 * its band's colour (a hole with the band below), gives filled bands with no gaps.
 * `tolerance` simplifies the smoothed outlines (grid units ≈ cell / 4 by default).
 */
export function contourBands(grid, masses, { tolerance, minArea } = {}) {
  const levels = massLevels(grid, masses)
  const cell = Math.min(Math.abs(grid.dx), Math.abs(grid.dy))
  const tol = tolerance ?? cell * 0.22
  const smallest = minArea ?? cell * cell * 2.5
  const loops = []
  levels.forEach((level, band) => {
    for (const raw of contourLoops(grid, level)) {
      const points = simplifyLoop(smoothPath(raw, { closed: true, rounds: 2 }), tol)
      if (points.length < 4) {
        continue
      }
      const area = Math.abs(polygonArea(points))
      if (area < smallest) {
        continue
      }
      loops.push({ points, band, hole: isHole(grid, raw, level), area, level })
    }
  })
  for (const loop of loops) {
    loop.depth = loops.filter(
      (other) => other !== loop && other.area > loop.area && inside(loop.points[0], other.points)
    ).length
  }
  return loops.toSorted((a, b) => a.depth - b.depth || a.band - b.band)
}

export function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[(index + 1) % points.length]
    area += ax * by - bx * ay
  }
  return area / 2
}

const NEUTRAL = new Set(['ink', 'line', 'muted', 'mid', 'strong', 'gray', 'grey'])

/** The colour a ramp is built on: a role's saturated marker colour, a gray, or a #hex. */
function baseColor(style, name) {
  if (name.startsWith('#')) {
    return name
  }
  if (NEUTRAL.has(name)) {
    return '#8a8580'
  }
  const color = styleColor(style, name)
  return color.solid ?? color.ink
}

/**
 * A sequential ramp in one hue, like matplotlib's Oranges or Blues: t = 0 a pale tint, about
 * 0.55 the colour itself, t = 1 a deep shade of it, the hue turning a little warmer as it darkens.
 */
export function densityRamp(style, name = 'accent') {
  const base = hexToOklch(baseColor(style, name))
  const neutral = base.C < 0.03
  const pale = { L: 0.955, C: neutral ? 0.004 : Math.min(0.035, base.C * 0.3), h: base.h }
  // Why a lighter core for gray: noise stays a quiet backdrop, never a black disc.
  const deep = {
    L: neutral ? 0.52 : Math.min(0.36, base.L * 0.55),
    C: neutral ? 0.01 : base.C * 0.75,
    h: base.h - (neutral ? 0 : 8)
  }
  const mid = 0.55
  return (t) => {
    const s = Math.min(1, Math.max(0, t))
    const [a, b, k] = s <= mid ? [pale, base, s / mid] : [base, deep, (s - mid) / (1 - mid)]
    return oklchToHex({
      L: a.L + (b.L - a.L) * k,
      C: a.C + (b.C - a.C) * k,
      h: a.h + (b.h - a.h) * k
    })
  }
}

/** The dark line around filled bands: the ramp's hue near black. */
export function densityEdge(style, name = 'accent') {
  const base = hexToOklch(baseColor(style, name))
  return oklchToHex({ L: 0.24, C: Math.min(0.04, base.C * 0.3), h: base.h })
}

/** The quiet line of an unfilled p_t: a warm gray toward the hue. */
export function densityLine(style, name = 'accent') {
  const base = hexToOklch(baseColor(style, name))
  return oklchToHex({ L: 0.5, C: Math.min(0.03, base.C * 0.25), h: base.h })
}
