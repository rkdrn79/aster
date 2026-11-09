// Where an arrow's label goes, clear of its heads; and where an arrow's heads are, for the lint.
import { ARROWHEAD_LENGTH } from './research-figures-draw.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { glyphBounds } from './research-figures-text.mjs'

/** A linear element's points in scene coordinates. */
export function absolutePoints(element) {
  return (element.points ?? []).map(([px, py]) => [element.x + px, element.y + py])
}

/** Straight runs of a path: collinear segments (the head-size point) count as one. */
export function pathRuns(points) {
  const runs = []
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const last = runs.at(-1)
    const cross = last
      ? (last.b[0] - last.a[0]) * (b[1] - a[1]) - (last.b[1] - last.a[1]) * (b[0] - a[0])
      : 1
    if (last && Math.abs(cross) < 0.5) {
      last.b = b
    } else {
      runs.push({ a, b })
    }
  }
  return runs.map((run) => ({
    ...run,
    length: Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]),
    horizontal: Math.abs(run.b[0] - run.a[0]) >= Math.abs(run.b[1] - run.a[1])
  }))
}

/** How long Excalidraw draws the head at one end: 0 without a head. */
export function headLength(arrow, atStart = false) {
  const type = atStart ? arrow.startArrowhead : arrow.endArrowhead
  const points = absolutePoints(arrow)
  if (!type || points.length < 2) {
    return 0
  }
  const [tip, before] = atStart ? [points[0], points[1]] : [points.at(-1), points.at(-2)]
  const last = Math.hypot(tip[0] - before[0], tip[1] - before[1])
  return Math.min(ARROWHEAD_LENGTH[type] ?? 15, last / 2)
}

/** The box a head covers, grown by `margin`; null without a head. */
export function headBox(arrow, atStart = false, margin = 0) {
  const length = headLength(arrow, atStart)
  if (!length) {
    return null
  }
  const points = absolutePoints(arrow)
  const [tip, before] = atStart ? [points[0], points[1]] : [points.at(-1), points.at(-2)]
  const span = Math.hypot(tip[0] - before[0], tip[1] - before[1]) || 1
  const ux = (tip[0] - before[0]) / span
  const uy = (tip[1] - before[1]) / span
  const half = length * 0.45
  const corners = [
    tip,
    [tip[0] - ux * length - uy * half, tip[1] - uy * length + ux * half],
    [tip[0] - ux * length + uy * half, tip[1] - uy * length - ux * half]
  ]
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  const x = Math.min(...xs) - margin
  const y = Math.min(...ys) - margin
  const right = Math.max(...xs) + margin
  const bottom = Math.max(...ys) + margin
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/**
 * Where a label's ink box (`{ width, height }`) goes beside an arrow: by the run `segment`
 * (index, else the longest), above a horizontal run or right of a vertical one (`side`: below,
 * left), centred on the part of the run clear of its heads. `room` is that part's length.
 */
export function arrowLabelBox(arrow, ink, { segment, side } = {}) {
  const runs = pathRuns(absolutePoints(arrow))
  if (!runs.length) {
    return { x: arrow.x, y: arrow.y, room: 0 }
  }
  const longest = runs.reduce((best, run) => (run.length > best.length ? run : best))
  const chosen =
    segment === undefined ? longest : runs[Math.min(Math.max(segment, 0), runs.length - 1)]
  const index = runs.indexOf(chosen)
  // Why 8: a label keeps 4 pt from a head, measured from the head's base.
  const clearStart = index === 0 ? headLength(arrow, true) + (arrow.startArrowhead ? 8 : 4) : 0
  const clearEnd = index === runs.length - 1 ? headLength(arrow, false) + 8 : 0
  const ux = (chosen.b[0] - chosen.a[0]) / (chosen.length || 1)
  const uy = (chosen.b[1] - chosen.a[1]) / (chosen.length || 1)
  const along = (clearStart + (chosen.length - clearEnd)) / 2
  const mid = [chosen.a[0] + ux * along, chosen.a[1] + uy * along]
  const gap = 4 + (arrow.strokeWidth ?? 2) / 2
  const room = chosen.length - clearStart - clearEnd
  if (chosen.horizontal) {
    return {
      x: mid[0] - ink.width / 2,
      y: side === 'below' ? mid[1] + gap : mid[1] - gap - ink.height,
      room
    }
  }
  return {
    x: side === 'left' ? mid[0] - gap - ink.width : mid[0] + gap,
    y: mid[1] - ink.height / 2,
    room
  }
}

/** A line's path without its heads, so a junction never lands on an arrowhead. */
export function clearOfHeads(line) {
  const points = absolutePoints(line)
  const trim = (from, to, cut) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
    const keep = Math.max(0, length - cut) / length
    return [from[0] + (to[0] - from[0]) * keep, from[1] + (to[1] - from[1]) * keep]
  }
  const end = headLength(line, false)
  const start = headLength(line, true)
  if (end) {
    points[points.length - 1] = trim(points.at(-2), points.at(-1), end + 4)
  }
  if (start) {
    points[0] = trim(points[1], points[0], start + 4)
  }
  return points
}

/** The ink of drawn label elements: text by its glyphs, the rest by their boxes. */
export function inkBox(elements) {
  const boxes = elements.map((element) =>
    element.type === 'text' ? glyphBounds(element) : elementBounds(element)
  )
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y }
}
