// Loss wiring judges flag: a loss link that crosses the data arrows (the biggest clutter source
// in round G), and a loss name or symbol left floating with nothing joining it to what it
// compares. Dashed links have their own crossing rule (dashed-crossing).
import { elementBounds } from './research-figures-geometry.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { segmentsCross } from './research-figures-lint-panels.mjs'
import { isLossRole } from './research-figures-style.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
/** How far a loss's name may sit from what it compares and still read as attached. */
const ATTACHED = 32
const LOSS_TEXT = /\\mathcal\{L\}|ℒ|\bloss\b/i

const ownerOf = (element) => element?.customData?.asterKit ?? element?.id

/** The gap between two boxes, 0 when they touch or overlap. */
function gapBetween(first, second) {
  const dx = Math.max(0, first.x - second.right, second.x - first.right)
  const dy = Math.max(0, first.y - second.bottom, second.y - first.bottom)
  return Math.hypot(dx, dy)
}

function crossings(elements, add) {
  const lossOwners = new Set(
    elements
      .filter((element) => element.customData?.asterRole === 'loss')
      .map((element) => ownerOf(element))
  )
  const isLossLine = (line) =>
    isLossRole(line.customData?.asterRole) || lossOwners.has(ownerOf(line))
  const lines = elements.filter(
    (element) =>
      (element.type === 'arrow' || element.type === 'line') &&
      element.points?.length > 1 &&
      visible(element.strokeColor)
  )
  const links = lines.filter((line) => isLossLine(line) && line.strokeStyle !== 'dashed')
  const data = lines.filter(
    (line) =>
      line.type === 'arrow' &&
      !isLossLine(line) &&
      line.strokeStyle !== 'dashed' &&
      line.strokeStyle !== 'dotted'
  )
  const found = new Map()
  for (const link of links) {
    const points = absolutePoints(link)
    for (const arrow of data) {
      const other = absolutePoints(arrow)
      const crossed = points
        .slice(1)
        .some((point, index) =>
          other.slice(1).some((end, at) => segmentsCross(points[index], point, other[at], end))
        )
      if (crossed) {
        const entry = found.get(ownerOf(link)) ?? { link, arrows: new Set() }
        entry.arrows.add(arrow.id)
        found.set(ownerOf(link), entry)
      }
    }
  }
  for (const [owner, { link, arrows }] of found) {
    const ids = [...arrows]
    add(
      'warning',
      'loss-crossing',
      link,
      `${owner}'s links cross ${ids.length} data arrow${ids.length > 1 ? 's' : ''} (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''}); put the loss beside the two things it compares with one short link each, in a lane of its own (loss({ side }), or move the predictions and targets together)`
    )
  }
}

/**
 * A loss node with no links, or a free "L1 loss" / ℒ label, more than ATTACHED from any shape
 * and any arrow end, floats: nothing says what it compares.
 */
function floating(elements, add) {
  const shapes = elements.filter(
    (element) =>
      (SHAPES.has(element.type) || element.type === 'image') &&
      !element.customData?.asterPanel &&
      (visible(element.strokeColor) || visible(element.backgroundColor) || element.type === 'image')
  )
  const ends = elements
    .filter(
      (element) =>
        (element.type === 'arrow' || element.type === 'line') && element.points?.length > 1
    )
    .flatMap((element) => {
      const points = absolutePoints(element)
      return [points[0], points.at(-1)]
    })
  const linked = new Set(
    elements
      .filter((element) => element.type === 'arrow' || element.type === 'line')
      .map((element) => ownerOf(element))
  )
  const candidates = elements.filter((element) => {
    if (element.customData?.asterRole === 'loss') {
      return !elements.some(
        (other) =>
          other !== element &&
          (other.type === 'arrow' || other.type === 'line') &&
          ownerOf(other) === ownerOf(element)
      )
    }
    const words =
      element.type === 'text'
        ? element.text
        : element.customData?.asterTex
          ? element.customData.asterMath
          : null
    // Why only free labels: a label owned by an arrow or a glyph sits where its owner put it.
    return (
      Boolean(words) &&
      LOSS_TEXT.test(words) &&
      !element.containerId &&
      ownerOf(element) === element.id &&
      !linked.has(element.id)
    )
  })
  for (const element of candidates) {
    const box = element.type === 'text' ? glyphBounds(element) : elementBounds(element)
    const own = ownerOf(element)
    const nearShape = shapes.some(
      (shape) =>
        shape !== element &&
        ownerOf(shape) !== own &&
        gapBetween(box, elementBounds(shape)) <= ATTACHED
    )
    const nearEnd = ends.some(
      (point) =>
        gapBetween(box, { x: point[0], y: point[1], right: point[0], bottom: point[1] }) <= ATTACHED
    )
    if (!nearShape && !nearEnd) {
      add(
        'warning',
        'loss-floating',
        element,
        `the loss ${element.type === 'text' ? `"${element.text}"` : ''} floats more than ${ATTACHED} units from anything it compares; draw it with loss({ predictions, targets }) so it sits beside them with its links`
      )
    }
  }
}

export function lossLinkChecks(elements, add) {
  crossings(elements, add)
  floating(elements, add)
}
