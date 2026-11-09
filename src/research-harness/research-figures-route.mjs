// Orthogonal arrow routes: every segment horizontal or vertical, the fewest bends the shapes
// allow (straight, one elbow, then two), with sharp corners that keep clear of other boxes.
import { elementBounds } from './research-figures-geometry.mjs'

/** Ends this close to lining up are drawn straight. */
export const SNAP = 8
/** Free bends (the lane of a two-bend route) sit on this grid. */
export const GRID = 8
/** A segment within this distance of a shape's edge, running along it, hugs the shape. */
export const HUG = 4
/** A segment off an axis by more than this is diagonal. */
export const AXIS = 0.5
const INSET = 6
const SOLID = new Set(['rectangle', 'ellipse', 'diamond', 'image', 'text'])
const HOLDS = new Set(['rectangle', 'ellipse', 'diamond'])

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high))
const toGrid = (value, round = Math.round) => round(value / GRID) * GRID
/** A point from its coordinate along `axis` (0 = x) and across it. */
const at = (axis, along, across) => (axis === 0 ? [along, across] : [across, along])

/** A shape's box as low and high corners and a centre, by axis (0 = x). */
export function boxOf(element) {
  const b = elementBounds(element)
  return {
    id: element.id,
    lo: [b.x, b.y],
    hi: [b.right, b.bottom],
    c: [b.x + b.width / 2, b.y + b.height / 2],
    kind: element.type
  }
}

/** An end of a route: a shape's box, or a fixed point (on a line running along `axis`). */
const endOf = (shape, point, axis) => (shape ? { box: boxOf(shape) } : { point, axis })
const centre = (end, axis) => (end.point ? end.point[axis] : end.box.c[axis])
const span = (end, axis) =>
  end.point ? [end.point[axis], end.point[axis]] : [end.box.lo[axis], end.box.hi[axis]]

/**
 * Where a leg travelling along `axis` meets an end, `across` from its centre line, on the side
 * facing `toward`; ellipses and diamonds are met on their outline, not their box.
 */
function attach(end, axis, toward, across, gap) {
  if (end.point) {
    return end.point
  }
  const { lo, hi, c, kind } = end.box
  const other = 1 - axis
  const half = (hi[other] - lo[other]) / 2
  const inset = kind === 'rectangle' ? Math.min(INSET, half) : half * 0.6
  const level = clamp(across, lo[other] + inset, hi[other] - inset)
  const offset = Math.min(1, Math.abs(level - c[other]) / (half || 1))
  const reach = (hi[axis] - lo[axis]) / 2
  const depth =
    kind === 'ellipse'
      ? reach * Math.sqrt(1 - offset ** 2)
      : kind === 'diamond'
        ? reach * (1 - offset)
        : reach
  const sign = toward < c[axis] ? -1 : 1
  return at(axis, c[axis] + sign * (depth + gap), level)
}

/** Zero bends: the shared span of two ends along the travel axis, or ends within SNAP of it. */
function straight(a, b, axis, gap, share, given = null) {
  const other = 1 - axis
  const [a0, a1] = span(a, axis)
  const [b0, b1] = span(b, axis)
  if (a1 >= b0 && b1 >= a0) {
    return null
  }
  let level
  const point = a.point ?? b.point
  const shape = a.point ? b : a
  if (a.point && b.point) {
    const fixedA = a.axis !== undefined && a.axis !== null
    const fixedB = b.axis !== undefined && b.axis !== null
    const room = fixedA && fixedB ? AXIS : SNAP
    const close = Math.abs(a.point[other] - b.point[other]) <= room
    level = close ? (fixedB && !fixedA ? b.point[other] : a.point[other]) : null
  } else if (point) {
    const [s0, s1] = span(shape, other)
    // Why only free points snap: a junction sits on its line and its dot must stay there.
    const fixed = a.point ? a.axis : b.axis
    const free = fixed === undefined || fixed === null
    const inside = point[other] >= s0 + 2 && point[other] <= s1 - 2
    const near = point[other] > s0 - SNAP && point[other] < s1 + SNAP
    level = inside
      ? point[other]
      : near && free
        ? clamp(point[other], s0 + INSET, s1 - INSET)
        : null
  } else {
    const low = Math.max(span(a, other)[0], span(b, other)[0])
    const high = Math.min(span(a, other)[1], span(b, other)[1])
    level = high - low >= share ? (given ?? (low + high) / 2) : null
  }
  if (level === null) {
    return null
  }
  const toward = centre(b, axis)
  const start = a.point ? at(axis, a.point[axis], level) : attach(a, axis, toward, level, gap)
  const end = b.point
    ? at(axis, b.point[axis], level)
    : attach(b, axis, centre(a, axis), level, gap)
  return [start, end]
}

/** One bend: leave `a` along `axis`, turn once, arrive at `b` across it. */
function elbow(a, b, axis, gap) {
  const other = 1 - axis
  if ((a.point && a.axis === axis) || (b.point && b.axis === other)) {
    return null
  }
  const reach = centre(b, axis)
  const start = attach(a, axis, reach, centre(a, other), gap)
  const end = attach(b, other, start[other], reach, gap)
  return [start, at(axis, end[axis], start[other]), end]
}

/** Two bends: leave and arrive along `axis`, joined by a leg across it at `lane`. */
function zigzag(a, b, axis, lane, gap) {
  const other = 1 - axis
  if ((a.point && a.axis === axis) || (b.point && b.axis === axis)) {
    return null
  }
  const start = attach(a, axis, lane, centre(a, other), gap)
  const end = attach(b, axis, lane, centre(b, other), gap)
  if (Math.abs(start[other] - end[other]) <= SNAP) {
    return null
  }
  return [start, at(axis, lane, start[other]), at(axis, lane, end[other]), end]
}

/**
 * Other levels a straight run between two shapes may take inside the span they share, a grid
 * step at a time from its middle: a title or a label in the way moves the run aside, not round.
 */
function sideLevels(a, b, axis) {
  if (a.point || b.point) {
    return []
  }
  const other = 1 - axis
  const low = Math.max(span(a, other)[0], span(b, other)[0]) + INSET
  const high = Math.min(span(a, other)[1], span(b, other)[1]) - INSET
  const middle = (low + high) / 2
  const levels = []
  for (let step = 1; step <= 12; step += 1) {
    for (const level of [toGrid(middle) - step * GRID, toGrid(middle) + step * GRID]) {
      if (level >= low && level <= high) {
        levels.push(level)
      }
    }
  }
  return levels.map((level) => ({ level, off: Math.abs(level - middle) }))
}

/** Lanes for a two-bend route: across the gap between the ends, then just beyond both. */
function lanes(a, b, axis) {
  const [a0, a1] = span(a, axis)
  const [b0, b1] = span(b, axis)
  const result = []
  const low = Math.min(a1, b1)
  const high = Math.max(a0, b0)
  if (high - low >= 24) {
    const middle = toGrid((low + high) / 2)
    for (const step of [0, -1, 1, -2, 2, -3, 3]) {
      const lane = middle + step * GRID
      if (lane > low + 8 && lane < high - 8) {
        result.push(lane)
      }
    }
  }
  result.push(toGrid(Math.max(a1, b1) + 24, Math.ceil), toGrid(Math.min(a0, b0) - 24, Math.floor))
  return result
}

const segments = (path) => path.slice(1).map((point, index) => [path[index], point])
const length = ([p, q]) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])

/** How a segment meets a box: 'cross' through its inside, 'hug' along its edge, or null. */
export function segmentMeets([p, q], box, margin = 1) {
  const axis = Math.abs(p[1] - q[1]) <= AXIS ? 0 : 1
  const other = 1 - axis
  const from = Math.min(p[axis], q[axis])
  const to = Math.max(p[axis], q[axis])
  const overlap = Math.min(to, box.hi[axis] - margin) - Math.max(from, box.lo[axis] + margin)
  if (overlap <= 0) {
    return null
  }
  const level = p[other]
  if (level > box.lo[other] + margin && level < box.hi[other] - margin) {
    return 'cross'
  }
  const near = Math.min(Math.abs(level - box.lo[other]), Math.abs(level - box.hi[other]))
  return near <= HUG && overlap > 8 ? 'hug' : null
}

function score(path, ends, obstacles, headSize) {
  const legs = segments(path)
  let total = (path.length - 2) * 100 + legs.reduce((sum, leg) => sum + length(leg), 0) * 0.05
  for (const leg of legs) {
    for (const end of ends) {
      total += segmentMeets(leg, end, 1) === 'cross' ? 1e6 : 0
    }
    for (const obstacle of obstacles) {
      const meets = segmentMeets(leg, obstacle)
      total += meets === 'cross' ? (obstacle.holder ? 60 : 1000) : meets === 'hug' ? 40 : 0
    }
  }
  if (path.length > 2) {
    total += legs.some((leg) => length(leg) < SNAP) ? 5000 : 0
    // Why in proportion: a slightly short head beats a detour with an extra bend.
    total += Math.max(0, headSize * 2 + 4 - length(legs.at(-1))) * 6
  }
  return total
}

/**
 * Boxes a route between `ends` should keep clear of: shapes and free text, but not the ends,
 * what sits inside an end (its label, icon or math), what holds an end (a panel), the arrow's
 * own pieces, or a junction dot. A box that holds others costs less to cross than a block.
 */
export function routeObstacles(elements, ends, skip) {
  const inside = (b, o) =>
    b.lo[0] >= o.lo[0] - 1 &&
    b.lo[1] >= o.lo[1] - 1 &&
    b.hi[0] <= o.hi[0] + 1 &&
    b.hi[1] <= o.hi[1] + 1
  const boxes = elements
    .filter(
      (element) =>
        !element.isDeleted &&
        SOLID.has(element.type) &&
        !element.containerId &&
        element.width > 4 &&
        element.height > 4 &&
        element.id !== skip &&
        !element.id.startsWith(`${skip}-`) &&
        element.customData?.asterKit !== skip
    )
    .map(boxOf)
  const endBoxes = ends.map((end) => end.box ?? { lo: end.point, hi: end.point })
  return boxes
    .filter((b) => !endBoxes.some((end) => inside(b, end) || inside(end, b)))
    .map((b) => ({
      ...b,
      holder: boxes.some((other) => other !== b && HOLDS.has(other.kind) && inside(other, b))
    }))
}

/**
 * The orthogonal path from `start` to `end` (shapes, or null with `from` / `to` points):
 * straight when the ends share a span (or nearly do), else the one- or two-bend route that
 * crosses and hugs the fewest boxes. `route` (straight, hv, vh) is preferred when it works.
 */
export function routeArrow({
  start,
  end,
  from,
  to,
  fromAxis,
  toAxis,
  gap,
  elements = [],
  skip,
  route,
  headSize = 10,
  ends: bound = []
}) {
  const a = endOf(start, from, fromAxis)
  const b = endOf(end, to, toAxis)
  // Why bound shapes too: an end pinned to a spot on its shape routes from a point, yet must
  // neither cross that shape nor count what it holds as in the way.
  const held = bound.map((shape) => ({ box: boxOf(shape) }))
  const ends = [a, b, ...held].filter((item) => item.box).map((item) => item.box)
  const obstacles = routeObstacles(elements, [a, b, ...held], skip)
  const leaning =
    Math.abs(centre(a, 0) - centre(b, 0)) >= Math.abs(centre(a, 1) - centre(b, 1)) ? 0 : 1
  const candidates = []
  for (const axis of [0, 1]) {
    const share = route === 'straight' ? 1 : 8
    candidates.push({
      path: straight(a, b, axis, gap, share),
      bonus: route === 'straight' ? 500 : 0
    })
    for (const { level, off } of sideLevels(a, b, axis)) {
      candidates.push({
        path: straight(a, b, axis, gap, share, level),
        bonus: (route === 'straight' ? 500 : 0) - off * 0.5
      })
    }
    const bent = axis === 0 ? 'hv' : 'vh'
    candidates.push({
      path: elbow(a, b, axis, gap),
      bonus: (route === bent ? 500 : 0) + (axis === leaning ? 1 : 0)
    })
    for (const lane of lanes(a, b, axis)) {
      candidates.push({ path: zigzag(a, b, axis, lane, gap), bonus: 0 })
    }
  }
  const scored = candidates
    .filter((candidate) => candidate.path)
    .map((candidate) => ({
      path: candidate.path,
      cost: score(candidate.path, ends, obstacles, headSize) - candidate.bonus
    }))
    .toSorted((first, second) => first.cost - second.cost)
  return scored[0]?.path ?? orthogonalize([a.point ?? a.box.c, b.point ?? b.box.c])
}

/** Corners for a hand-given path: a near-aligned point snaps straight, any other gets a bend. */
export function orthogonalize(points, { keepLast = false } = {}) {
  const result = [[...points[0]]]
  for (const [index, original] of points.slice(1).entries()) {
    const point = [...original]
    const last = result.at(-1)
    const dx = Math.abs(point[0] - last[0])
    const dy = Math.abs(point[1] - last[1])
    const pinned = keepLast && index === points.length - 2
    if (dx > AXIS && dy > AXIS) {
      if (Math.min(dx, dy) <= SNAP && pinned && result.length > 1) {
        // Why: the end is a junction on a line; the corner before it moves instead.
        const axis = dx < dy ? 0 : 1
        last[axis] = point[axis]
        const before = result.at(-2)
        if (Math.abs(before[0] - last[0]) > AXIS && Math.abs(before[1] - last[1]) > AXIS) {
          result.splice(-1, 0, axis === 0 ? [last[0], before[1]] : [before[0], last[1]])
        }
      } else if (Math.min(dx, dy) <= SNAP && !pinned) {
        point[dx < dy ? 0 : 1] = last[dx < dy ? 0 : 1]
      } else {
        result.push(dx >= dy ? [point[0], last[1]] : [last[0], point[1]])
      }
    }
    result.push(point)
  }
  return result
}

/**
 * A junction on a line, slid along its segment to where a branch to `other` (a shape) runs
 * straight; `axis` is the direction that segment runs, which the branch must not follow.
 */
export function alignJunction(path, point, other, slide) {
  for (const [p, q] of segments(path)) {
    const axis = Math.abs(p[1] - q[1]) <= AXIS ? 0 : Math.abs(p[0] - q[0]) <= AXIS ? 1 : null
    if (axis === null) {
      continue
    }
    const across = 1 - axis
    const from = Math.min(p[axis], q[axis])
    const to = Math.max(p[axis], q[axis])
    if (Math.abs(point[across] - p[across]) > 1 || point[axis] < from - 1 || point[axis] > to + 1) {
      continue
    }
    if (!slide || !other) {
      return { point, axis }
    }
    const box = boxOf(other)
    const low = Math.max(from + 4, box.lo[axis] + INSET)
    const high = Math.min(to - 4, box.hi[axis] - INSET)
    return {
      point: low <= high ? at(axis, clamp(box.c[axis], low, high), p[across]) : point,
      axis
    }
  }
  return { point, axis: null }
}

/** The point `at` (0–1) along a path, by length. */
export function pointAlong(path, at) {
  const legs = segments(path)
  const lengths = legs.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]))
  let remaining = lengths.reduce((sum, value) => sum + value, 0) * at
  for (const [index, [p, q]] of legs.entries()) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Math.min(1, remaining / lengths[index]) : 0
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    }
    remaining -= lengths[index]
  }
  return path[0]
}

/** How far along a path a point on it lies (by length), measured to its nearest run. */
function lengthTo(path, point) {
  let best = { distance: Infinity, along: 0 }
  let walked = 0
  for (const [p, q] of segments(path)) {
    const span = Math.hypot(q[0] - p[0], q[1] - p[1])
    const dot = (point[0] - p[0]) * (q[0] - p[0]) + (point[1] - p[1]) * (q[1] - p[1])
    const t = span ? clamp(dot / span ** 2, 0, 1) : 0
    const distance = Math.hypot(
      p[0] + (q[0] - p[0]) * t - point[0],
      p[1] + (q[1] - p[1]) * t - point[1]
    )
    if (distance < best.distance - 1e-6) {
      best = { distance, along: walked + span * t }
    }
    walked += span
  }
  return best.along
}

const pathLength = (path) =>
  segments(path).reduce((sum, [p, q]) => sum + Math.hypot(q[0] - p[0], q[1] - p[1]), 0)

/**
 * The point a junction names on a line's drawn path: `at` a fraction 0–1 of its whole length
 * ('mid'; 'auto' starts mid and slides level with the branch's target), or `x` / `y` on the one
 * run that crosses that coordinate. A point on a head (`heads`: the lengths kept clear at the
 * start and the end) moves to the head's base, so a dot never sits on an arrowhead. Throws when
 * the line misses the coordinate or crosses it twice.
 */
export function junctionPoint(path, end, heads = { start: 0, end: 0 }) {
  const total = pathLength(path)
  const low = Math.min(heads.start, total / 2)
  const high = Math.max(total - heads.end, total / 2)
  // Why by length: `at` and a head's base are both distances along the drawn path.
  const offHeads = (point) => {
    const along = lengthTo(path, point)
    return along < low || along > high
      ? pointAlong(path, clamp(along, low, high) / (total || 1))
      : point
  }
  if (end.at !== undefined) {
    if (end.at === 'mid' || end.at === 'auto') {
      return offHeads(pointAlong(path, 0.5))
    }
    if (typeof end.at !== 'number' || end.at < 0 || end.at > 1) {
      throw new Error(
        `at is a fraction from 0 to 1, 'mid' or 'auto', not ${JSON.stringify(end.at)}`
      )
    }
    return offHeads(pointAlong(path, end.at))
  }
  const axis = end.x !== undefined ? 0 : 1
  const name = axis === 0 ? 'x' : 'y'
  const value = end.x ?? end.y
  const hits = []
  for (const [p, q] of segments(path)) {
    const low = Math.min(p[axis], q[axis])
    const high = Math.max(p[axis], q[axis])
    if (high - low > AXIS && value >= low - 0.01 && value <= high + 0.01) {
      const t = (value - p[axis]) / (q[axis] - p[axis])
      const hit = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      if (!hits.some((other) => Math.hypot(other[0] - hit[0], other[1] - hit[1]) < 1)) {
        hits.push(hit)
      }
    }
  }
  if (hits.length === 1) {
    return offHeads(hits[0])
  }
  const along = segments(path).some(
    ([p, q]) => Math.abs(p[axis] - q[axis]) <= AXIS && Math.abs(p[axis] - value) <= 0.5
  )
  const values = path.map((point) => point[axis])
  const span = `${Math.round(Math.min(...values))}–${Math.round(Math.max(...values))}`
  throw new Error(
    hits.length
      ? `${end.on} crosses ${name} ${value} ${hits.length} times; give at instead`
      : along
        ? `${end.on} runs along ${name} ${value}; give ${axis === 0 ? 'y' : 'x'} or at instead`
        : `${end.on} does not reach ${name} ${value}: it spans ${name} ${span}`
  )
}
