/**
 * Re-routes a connector between two shapes with horizontal and vertical segments only: straight
 * when the facing sides share a span, else one bend, else two, keeping the sides it used before.
 */

export type Point = readonly [number, number]
export type Box = { x: number; y: number; width: number; height: number }
export type Side = 'top' | 'bottom' | 'left' | 'right'
/** An arrow end on a shape's side (`t` runs 0..1 along it), or a loose point. */
export type RouteEnd =
  | { kind: 'shape'; box: Box; side: Side; t: number; round: boolean }
  | { kind: 'point'; point: Point; side: Side }

/** A segment off an axis by more than this is diagonal. */
export const AXIS_TOLERANCE = 0.5
/** The shortest leg that still shows its arrowhead. */
const MIN_LEG = 10
/** Ends keep this far from a side's corners. */
const INSET = 6
/** A U-turn route clears the outer shape by this much. */
const DETOUR = 16

const OUT: Record<Side, Point> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }
const horizontal = (side: Side): boolean => side === 'left' || side === 'right'
const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), Math.max(low, high))

export function isOrthogonal(points: readonly Point[]): boolean {
  return points.every((point, index) => {
    const next = points[index + 1]
    return (
      !next ||
      Math.abs(point[0] - next[0]) <= AXIS_TOLERANCE ||
      Math.abs(point[1] - next[1]) <= AXIS_TOLERANCE
    )
  })
}

/** The side a path leaves from (its first move) or arrives at (its last move, reversed). */
export function sideOfMove(from: Point, to: Point, arriving: boolean): Side | null {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (Math.abs(dx) <= AXIS_TOLERANCE && Math.abs(dy) <= AXIS_TOLERANCE) {
    return null
  }
  const along: Side =
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
  const opposite: Record<Side, Side> = {
    right: 'left',
    left: 'right',
    bottom: 'top',
    top: 'bottom'
  }
  return arriving ? opposite[along] : along
}

/** Where a point sits along a side, 0 at its top or left end. */
export function sideFraction(box: Box, side: Side, point: Point): number {
  return horizontal(side)
    ? clamp((point[1] - box.y) / (box.height || 1), 0, 1)
    : clamp((point[0] - box.x) / (box.width || 1), 0, 1)
}

function inset(box: Box, side: Side, t: number, round: boolean): number {
  const [low, length] = horizontal(side) ? [box.y, box.height] : [box.x, box.width]
  const margin = Math.min(INSET, length / 2)
  return clamp(low + (round ? 0.5 : t) * length, low + margin, low + length - margin)
}

function sidePoint(box: Box, side: Side, along: number, gap: number): Point {
  switch (side) {
    case 'left':
      return [box.x - gap, along]
    case 'right':
      return [box.x + box.width + gap, along]
    case 'top':
      return [along, box.y - gap]
    case 'bottom':
      return [along, box.y + box.height + gap]
  }
}

function endPoint(end: RouteEnd, gap: number): Point {
  return end.kind === 'point'
    ? end.point
    : sidePoint(end.box, end.side, inset(end.box, end.side, end.t, end.round), gap)
}

/** The span along a side where a straight connector may meet it. */
function span(end: RouteEnd): [number, number] {
  if (end.kind === 'point') {
    const at = horizontal(end.side) ? end.point[1] : end.point[0]
    return [at, at]
  }
  const { box, side } = end
  if (end.round) {
    const centre = horizontal(side) ? box.y + box.height / 2 : box.x + box.width / 2
    return [centre, centre]
  }
  const [low, length] = horizontal(side) ? [box.y, box.height] : [box.x, box.width]
  const margin = Math.min(INSET, length / 2)
  return [low + margin, low + length - margin]
}

const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1]
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]

/** One path for these two ends and sides, or null when they leave no room for it. */
function pathFor(start: RouteEnd, end: RouteEnd, gap: number): Point[] | null {
  const u = OUT[start.side]
  const v = OUT[end.side]
  let s = endPoint(start, gap)
  let e = endPoint(end, gap)
  if (horizontal(start.side) !== horizontal(end.side)) {
    const corner: Point = horizontal(start.side) ? [e[0], s[1]] : [s[0], e[1]]
    const first = dot(minus(corner, s), u)
    const last = dot(minus(corner, e), v)
    return first >= MIN_LEG / 2 && last >= MIN_LEG ? [s, corner, e] : null
  }
  const across = horizontal(start.side) ? 1 : 0
  const reach = dot(minus(e, s), u)
  if (u[0] === -v[0] && u[1] === -v[1]) {
    if (reach < MIN_LEG) {
      return null
    }
    const [lowA, highA] = span(start)
    const [lowB, highB] = span(end)
    const low = Math.max(lowA, lowB)
    const high = Math.min(highA, highB)
    if (low <= high) {
      const level =
        s[across] >= low && s[across] <= high
          ? s[across]
          : e[across] >= low && e[across] <= high
            ? e[across]
            : clamp((s[across] + e[across]) / 2, low, high)
      s = across === 1 ? [s[0], level] : [level, s[1]]
      e = across === 1 ? [e[0], level] : [level, e[1]]
      return [s, e]
    }
    const middle = Math.round((across === 1 ? s[0] + e[0] : s[1] + e[1]) / 2)
    return across === 1
      ? [s, [middle, s[1]], [middle, e[1]], e]
      : [s, [s[0], middle], [e[0], middle], e]
  }
  // Same-facing sides: out past the farther end, across, and back in.
  const far = Math.max(dot(s, u), dot(e, u)) + DETOUR
  return across === 1
    ? [s, [far * u[0], s[1]], [far * u[0], e[1]], e]
    : [s, [s[0], far * u[1]], [e[0], far * u[1]], e]
}

function centreOf(end: RouteEnd): Point {
  return end.kind === 'point'
    ? end.point
    : [end.box.x + end.box.width / 2, end.box.y + end.box.height / 2]
}

/** Sides chosen afresh from where the shapes sit, most direct first. */
function freshSides(start: RouteEnd, end: RouteEnd, prefer: 'hv' | 'vh' | null): [Side, Side][] {
  const [ax, ay] = centreOf(start)
  const [bx, by] = centreOf(end)
  const h: Side = bx >= ax ? 'right' : 'left'
  const hIn: Side = bx >= ax ? 'left' : 'right'
  const v: Side = by >= ay ? 'bottom' : 'top'
  const vIn: Side = by >= ay ? 'top' : 'bottom'
  const across: [Side, Side][] = [
    [h, vIn],
    [v, hIn]
  ]
  const facing: [Side, Side][] =
    Math.abs(bx - ax) >= Math.abs(by - ay)
      ? [
          [h, hIn],
          [v, vIn]
        ]
      : [
          [v, vIn],
          [h, hIn]
        ]
  if (prefer === 'hv') {
    return [across[0], ...facing, across[1]]
  }
  if (prefer === 'vh') {
    return [across[1], ...facing, across[0]]
  }
  return [facing[0], ...across, facing[1]]
}

function withSide(end: RouteEnd, side: Side): RouteEnd {
  return end.kind === 'point' ? end : { ...end, side, t: 0.5 }
}

/**
 * An axis-aligned path (absolute points) from `start` to `end`: the sides they had when they
 * still fit, otherwise sides picked from where the shapes now sit. Never diagonal.
 */
export function routeOrthogonal(
  start: RouteEnd,
  end: RouteEnd,
  gap: number,
  prefer: 'hv' | 'vh' | null = null
): Point[] {
  const kept = pathFor(start, end, gap)
  if (kept) {
    return kept
  }
  for (const [from, to] of freshSides(start, end, prefer)) {
    const path = pathFor(withSide(start, from), withSide(end, to), gap)
    if (path) {
      return path
    }
  }
  const s = endPoint(start, gap)
  const e = endPoint(end, gap)
  return [s, [e[0], s[1]], e]
}
