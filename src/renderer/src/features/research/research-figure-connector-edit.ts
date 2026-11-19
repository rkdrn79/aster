import {
  AXIS_TOLERANCE,
  routeOrthogonal,
  sideFraction,
  sideOfMove,
  type Box,
  type Point,
  type RouteEnd,
  type Side
} from './research-figure-orthogonal-route'

/** A straight run of a connector: collinear segments from point `from` to point `to`. */
export type Run = { axis: 'h' | 'v'; from: number; to: number }
/** Where a run's handle sits and which way it moves (across the run). */
export type SegmentHandle = { run: number; axis: 'h' | 'v'; mid: Point; length: number }

/** The stub a moved end run keeps at its shape, so the arrowhead still meets the side square. */
const STUB = 12
/** Runs shorter than this get no handle: there is nothing to grab. */
const MIN_RUN = 16

const flat = (a: Point, b: Point): boolean => Math.abs(a[1] - b[1]) <= AXIS_TOLERANCE
const upright = (a: Point, b: Point): boolean => Math.abs(a[0] - b[0]) <= AXIS_TOLERANCE

/** The straight runs of an orthogonal path, collinear segments merged; null if any is diagonal. */
export function runsOf(points: readonly Point[]): Run[] | null {
  const runs: Run[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const [a, b] = [points[index], points[index + 1]]
    if (flat(a, b) && upright(a, b)) {
      continue
    }
    const axis = flat(a, b) ? 'h' : upright(a, b) ? 'v' : null
    if (!axis) {
      return null
    }
    const last = runs.at(-1)
    if (last && last.axis === axis && last.to === index) {
      last.to = index + 1
    } else {
      runs.push({ axis, from: index, to: index + 1 })
    }
  }
  return runs
}

/** One handle per run long enough to grab, at its middle (PowerPoint's elbow connector handle). */
export function segmentHandles(points: readonly Point[]): SegmentHandle[] {
  const runs = runsOf(points)
  if (!runs) {
    return []
  }
  return runs.flatMap((run, index) => {
    const [a, b] = [points[run.from], points[run.to]]
    const length = Math.abs(run.axis === 'h' ? b[0] - a[0] : b[1] - a[1])
    return length >= MIN_RUN
      ? [
          {
            run: index,
            axis: run.axis,
            mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const,
            length
          }
        ]
      : []
  })
}

/** Drops repeated points and merges collinear ones, keeping the ends. */
export function tidyPath(points: readonly Point[]): Point[] {
  const kept: Point[] = []
  for (const point of points) {
    const last = kept.at(-1)
    if (last && Math.abs(last[0] - point[0]) < 0.01 && Math.abs(last[1] - point[1]) < 0.01) {
      continue
    }
    const before = kept.at(-2)
    if (
      before &&
      last &&
      ((flat(before, last) && flat(last, point)) || (upright(before, last) && upright(last, point)))
    ) {
      kept[kept.length - 1] = point
      continue
    }
    kept.push(point)
  }
  return kept
}

function toward(from: Point, to: Point, distance: number): Point {
  const dx = Math.sign(to[0] - from[0])
  const dy = Math.sign(to[1] - from[1])
  return [from[0] + dx * distance, from[1] + dy * distance]
}

/**
 * The path with one run moved across itself to `at` (its y for a horizontal run, x for a
 * vertical one), staying orthogonal: the runs beside it stretch, and a run that ends on a shape
 * keeps a short stub there and gets a jog, so the connector stays glued (PowerPoint's elbow).
 */
export function moveRun(points: readonly Point[], runIndex: number, at: number): Point[] {
  const runs = runsOf(points)
  const run = runs?.[runIndex]
  if (!runs || !run) {
    return [...points]
  }
  const set = (point: Point): Point => (run.axis === 'h' ? [point[0], at] : [at, point[1]])
  const first = runIndex === 0
  const last = runIndex === runs.length - 1
  const start = points[run.from]
  const end = points[run.to]
  const length = Math.abs(run.axis === 'h' ? end[0] - start[0] : end[1] - start[1])
  const stub = Math.min(STUB, length / 3)
  const head: Point[] = first
    ? [start, toward(start, end, stub), set(toward(start, end, stub))]
    : [...points.slice(0, run.from), set(start)]
  const middle = points.slice(run.from + 1, run.to).map(set)
  const tail: Point[] = last
    ? [set(toward(end, start, stub)), toward(end, start, stub), end]
    : [set(end), ...points.slice(run.to + 1)]
  return tidyPath([...head, ...middle, ...tail])
}

/** The side of `box` that faces `toward`, for an end dropped on a new shape. */
export function facingSide(box: Box, toward: Point): Side {
  const dx = toward[0] - (box.x + box.width / 2)
  const dy = toward[1] - (box.y + box.height / 2)
  // Why scaled: a wide box faces left or right only when the other end is well beside it.
  return Math.abs(dx) / (box.width || 1) >= Math.abs(dy) / (box.height || 1)
    ? dx > 0
      ? 'right'
      : 'left'
    : dy > 0
      ? 'bottom'
      : 'top'
}

/** One end of a connector being re-glued: its shape now, and whether it is a new one. */
export type ReboundEnd = { box: Box | null; round: boolean; changed: boolean }

const centre = (box: Box): Point => [box.x + box.width / 2, box.y + box.height / 2]

/**
 * A connector whose end was dropped on another shape, routed again at right angles (PowerPoint's
 * elbow connector): the new end enters the side facing the other end, in its middle; the end
 * that stayed keeps the side and place it had on its shape.
 */
export function routeRebound(
  before: readonly Point[],
  now: readonly Point[],
  start: ReboundEnd,
  end: ReboundEnd,
  gap: number
): Point[] | null {
  if (now.length < 2 || before.length < 2) {
    return null
  }
  const first = now[0]
  const last = now.at(-1) ?? first
  const endOf = (which: ReboundEnd, arriving: boolean): RouteEnd | null => {
    const other = arriving ? start : end
    const toward = other.box ? centre(other.box) : arriving ? first : last
    if (which.box && which.changed) {
      return {
        kind: 'shape',
        box: which.box,
        side: facingSide(which.box, toward),
        t: 0.5,
        round: which.round
      }
    }
    const path = which.box ? before : now
    const [from, to] = arriving ? [path.at(-2), path.at(-1)] : [path[0], path[1]]
    const side = from && to ? sideOfMove(from, to, arriving) : null
    const point = arriving ? last : first
    if (!which.box) {
      return side ? { kind: 'point', point, side } : null
    }
    const resolved = side ?? facingSide(which.box, toward)
    return {
      kind: 'shape',
      box: which.box,
      side: resolved,
      t: sideFraction(which.box, resolved, (arriving ? to : from) ?? point),
      round: which.round
    }
  }
  const a = endOf(start, false)
  const b = endOf(end, true)
  return a && b ? routeOrthogonal(a, b, gap, null) : null
}
