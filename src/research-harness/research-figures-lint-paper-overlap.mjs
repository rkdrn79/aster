// Overlaps the other checks leave to typeset math, for the paper look: a formula over a word or
// another formula, or across the edge of a box or a region. On a small page these are what a
// crowded figure prints with (LDM's z ∈ ℝ^{h×w×c} under z, its attention formula on a rail).
import {
  boxPolygonDistance,
  elementBounds,
  isInside,
  overlaps,
  segmentCrossesBox
} from './research-figures-geometry.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
/** A word or formula closer than this to a shape it is not in touches it at print (1.5 pt). */
export const PAPER_EDGE_GAP = 3

/** The empty space between two boxes; 0 when they overlap. */
function gapBetween(a, b) {
  return Math.max(0, a.x - b.right, b.x - a.right, a.y - b.bottom, b.y - a.bottom)
}
const shown = (color) => typeof color === 'string' && color !== 'transparent' && color !== 'none'
const ownerOf = (element) => element.customData?.asterKit ?? element.id
const sameItem = (a, b) =>
  ownerOf(a) === ownerOf(b) || (a.groupIds ?? []).some((group) => b.groupIds?.includes(group))

/** The ink of a word or a formula: a text's glyphs, a formula image's own box. */
function inkOf(element) {
  return element.type === 'text' ? glyphBounds(element) : elementBounds(element)
}

/**
 * `paper-overlap` findings: formulas over words, formulas and the edges of shapes, and any word
 * or formula touching the edge of a box, a region or a trapezoid it is not inside.
 */
export function paperOverlapChecks(elements, add) {
  const words = elements.filter(
    (element) =>
      !element.isDeleted &&
      ((element.type === 'text' && !element.containerId) || element.customData?.asterTex)
  )
  const shapes = elements.filter(
    (element) =>
      !element.isDeleted &&
      SHAPES.has(element.type) &&
      !element.customData?.asterSwatch &&
      (shown(element.strokeColor) || shown(element.backgroundColor))
  )
  // Why closed lines too: trapezoids and a U-Net's halves are drawn as closed polygons.
  const polygons = elements.filter((element) => {
    const points = element.points ?? []
    const closed =
      points.length > 3 &&
      Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1
    return !element.isDeleted && element.type === 'line' && closed && shown(element.strokeColor)
  })
  const told = new Set()
  const tell = (element, message) => {
    const owner = ownerOf(element)
    if (!told.has(owner)) {
      told.add(owner)
      add('warning', 'paper-overlap', element, message)
    }
  }
  const formulas = words.filter((element) => element.customData?.asterTex)
  for (const formula of formulas) {
    const ink = inkOf(formula)
    const over = words.find(
      (other) =>
        other !== formula &&
        !sameItem(formula, other) &&
        !(other.customData?.asterTex && told.has(ownerOf(other))) &&
        overlaps(ink, inkOf(other))
    )
    if (over) {
      tell(
        formula,
        `the formula ${ownerOf(formula)} overlaps ${ownerOf(over)}; on a small page make room: put the formula under its panel, shorten it, or stack it on two lines`
      )
      continue
    }
    const edge = shapes.find((shape) => {
      if (sameItem(formula, shape)) {
        return false
      }
      const box = elementBounds(shape)
      return overlaps(ink, box) && !isInside(ink, box)
    })
    const inner = { x: ink.x + 1, y: ink.y + 1, width: ink.width - 2, height: ink.height - 2 }
    const outline =
      edge ??
      polygons.find((shape) => {
        const path = absolutePoints(shape)
        return (
          !sameItem(formula, shape) &&
          path.slice(1).some((point, index) => segmentCrossesBox(path[index], point, inner))
        )
      })
    if (outline) {
      tell(
        formula,
        `the formula ${ownerOf(formula)} crosses the edge of ${ownerOf(outline)}; move it clear (a gap of 4 or more), shorten it, or stack it`
      )
    }
  }
  for (const word of words) {
    if (told.has(ownerOf(word))) {
      continue
    }
    const ink = inkOf(word)
    const near = (gap) => gap > 0 && gap < PAPER_EDGE_GAP
    const box = shapes.find((shape) => {
      const bounds = elementBounds(shape)
      return !sameItem(word, shape) && !isInside(ink, bounds) && near(gapBetween(ink, bounds))
    })
    const polygon =
      box ??
      polygons.find(
        // Why few corners: a trapezoid or a plane has an edge to keep off; a contour is data.
        (shape) =>
          shape.points.length <= 6 &&
          !sameItem(word, shape) &&
          near(boxPolygonDistance(ink, absolutePoints(shape)))
      )
    if (polygon) {
      tell(
        word,
        `${ownerOf(word)} touches the edge of ${ownerOf(polygon)} (under ${PAPER_EDGE_GAP} units, 1.5 pt, between them); move it 4 units clear`
      )
    }
  }
}
