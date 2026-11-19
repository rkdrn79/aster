// Where an arrow's label goes when the middle of its run is no place for it: a label wider than a
// short run between two panels crosses their edges, so it moves to the other side, toward the
// head or the tail, or just past an end, wherever its ink crosses no shape's edge and covers no
// text. `labelPosition` asks for one place: 'above' | 'below' | 'left' | 'right' | 'head' | 'tail'.
import { elementBounds, isInside, overlaps } from './research-figures-geometry.mjs'
import { arrowLabelBox, headBox } from './research-figures-labels.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
export const LABEL_POSITIONS = ['auto', 'above', 'below', 'left', 'right', 'head', 'tail']

/**
 * What a label must keep clear of: the edges of drawn shapes (a panel or card may hold it whole),
 * pictures and other text (never covered at all), and the arrow's own heads.
 */
export function labelObstacles(elements, arrow) {
  const edges = []
  const solid = []
  for (const element of elements) {
    if (element.isDeleted || element.id === arrow.id) {
      continue
    }
    if (
      SHAPES.has(element.type) &&
      (visible(element.strokeColor) || visible(element.backgroundColor))
    ) {
      edges.push(elementBounds(element))
    } else if (element.type === 'image') {
      solid.push(elementBounds(element))
    } else if (element.type === 'text' && !element.containerId) {
      solid.push(glyphBounds(element))
    }
  }
  for (const atStart of [false, true]) {
    const head = headBox(arrow, atStart, 2)
    if (head) {
      solid.push(head)
    }
  }
  return { edges, solid }
}

const bounds = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  right: x + width,
  bottom: y + height
})

/** Whether a label's ink box at (x, y) crosses an edge or covers a picture, a text or a head. */
export function labelClear(box, { edges, solid }) {
  return (
    !edges.some((edge) => overlaps(box, edge) && !isInside(box, edge)) &&
    !solid.some((item) => overlaps(box, item))
  )
}

const flip = { above: 'below', below: 'above', left: 'right', right: 'left' }

/**
 * The top-left of the label's ink: `position` places it there; 'auto' keeps the usual spot
 * (above a horizontal run, right of a vertical one, or `side`) when it is clear, else tries the
 * other side and then spots along the run and past its ends, nearest first. Returns the usual spot
 * when nothing is clear, so the lint can say what to change.
 */
export function placeArrowLabel(arrow, ink, { segment, side, position = 'auto' }, obstacles) {
  const base = arrowLabelBox(arrow, ink, { segment, side })
  const run = base.run
  if (!run) {
    return base
  }
  const horizontal = run.horizontal
  const usual = horizontal
    ? side === 'below'
      ? 'below'
      : 'above'
    : side === 'left'
      ? 'left'
      : 'right'
  const sideFor = (name) =>
    horizontal
      ? name === 'below' || name === 'right'
        ? 'below'
        : undefined
      : name === 'left' || name === 'above'
        ? 'left'
        : undefined
  const sign = Math.sign((horizontal ? run.b[0] - run.a[0] : run.b[1] - run.a[1]) || 1)
  /** The spot on one side, shifted `shift` units along the run's direction of travel. */
  const spotOn = (name, shift) => {
    const spot = arrowLabelBox(arrow, ink, { segment, side: sideFor(name) })
    return horizontal
      ? { x: spot.x + sign * shift, y: spot.y }
      : { x: spot.x, y: spot.y + sign * shift }
  }
  const extent = horizontal ? ink.width : ink.height
  if (position === 'head' || position === 'tail') {
    // Why: the label's edge at the clear end of the run when it fits, else just past that end.
    const fits = extent <= base.room
    const shift =
      position === 'head'
        ? fits
          ? (base.room - extent) / 2
          : run.length + 4 + extent / 2 - base.along
        : fits
          ? -(base.room - extent) / 2
          : -4 - extent / 2 - base.along
    return { ...base, ...spotOn(usual, shift) }
  }
  if (position !== 'auto') {
    return { ...base, ...spotOn(position, 0) }
  }
  const box = (spot) => bounds(spot.x, spot.y, ink.width, ink.height)
  if (labelClear(box(base), obstacles)) {
    return { ...base, clear: true }
  }
  const reach = (run.length + extent) / 2 + 8
  const shifts = [0]
  for (let step = 4; step <= reach; step += 4) {
    shifts.push(step, -step)
  }
  for (const shift of shifts) {
    for (const name of [usual, flip[usual]]) {
      const spot = spotOn(name, shift)
      if (labelClear(box(spot), obstacles)) {
        return { ...base, ...spot, clear: true }
      }
    }
  }
  return { ...base, clear: false }
}

/**
 * The same words broken into `lines` lines at spaces and after hyphens, the longest line as
 * short as it goes ("Co-Fine-Tune" → "Co-Fine-" / "Tune"); null when there are too few breaks.
 */
export function brokenLabel(text, lines) {
  const pieces = String(text).match(/[^\s-]+-?/g) ?? []
  if (pieces.length < lines || lines < 2) {
    return null
  }
  const join = (part) =>
    part.reduce(
      (line, piece) => (line && !line.endsWith('-') ? `${line} ${piece}` : `${line}${piece}`),
      ''
    )
  let best = null
  const search = (start, left, chosen) => {
    if (left === 1) {
      const all = [...chosen, join(pieces.slice(start))]
      const longest = Math.max(...all.map((line) => line.length))
      if (!best || longest < best.longest) {
        best = { all, longest }
      }
      return
    }
    for (let end = start + 1; end <= pieces.length - left + 1; end += 1) {
      search(end, left - 1, [...chosen, join(pieces.slice(start, end))])
    }
  }
  search(0, lines, [])
  return best ? best.all.join('\n') : null
}
