// Layout warnings about arrows and labels: a label on an arrowhead, an arrow through a box it
// does not join, and text crossing the slanted edge of a polygon such as a trapezoid.
import {
  elementBounds,
  overlaps,
  pointInPolygon,
  segmentCrossesBox
} from './research-figures-geometry.mjs'
import { absolutePoints, headBox } from './research-figures-labels.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const OBSTACLES = new Set(['rectangle', 'ellipse', 'diamond', 'image'])
/** A mark this close to a label touches it at print. */
const TOUCHING = 2
const visible = (color) => Boolean(color) && color !== 'transparent'

function contains(bounds, point) {
  return (
    point[0] >= bounds.x &&
    point[0] <= bounds.x + bounds.width &&
    point[1] >= bounds.y &&
    point[1] <= bounds.y + bounds.height
  )
}

/** A label's ink: text by its glyphs, typeset math and icons by their box. */
const inkOf = (element) => (element.type === 'text' ? glyphBounds(element) : elementBounds(element))

function headChecks(arrows, texts, add) {
  for (const arrow of arrows) {
    for (const box of [headBox(arrow, false, 3), headBox(arrow, true, 3)].filter(Boolean)) {
      const touching = texts.find((text) => overlaps(inkOf(text), box, 0))
      if (touching) {
        add(
          'warning',
          'label-on-head',
          touching,
          `touches the head of ${arrow.id}; move the label (labelSegment, labelSide) or lengthen the arrow`
        )
      }
    }
  }
}

function throughChecks(arrows, elements, add) {
  const ownerOf = (element) => element?.customData?.asterKit ?? element?.id
  const byId = new Map(elements.map((element) => [element.id, element]))
  const obstacles = elements.filter(
    (element) =>
      OBSTACLES.has(element.type) &&
      !element.customData?.asterTex &&
      !element.customData?.asterIcon &&
      (element.type === 'image' ||
        visible(element.backgroundColor) ||
        visible(element.strokeColor)) &&
      element.width > 8 &&
      element.height > 8
  )
  for (const arrow of arrows) {
    const points = absolutePoints(arrow)
    if (points.length < 2) {
      continue
    }
    const joined = new Set(
      [arrow.startBinding, arrow.endBinding]
        .map((binding) => byId.get(binding?.elementId))
        .filter(Boolean)
        .flatMap((element) => [element.id, ownerOf(element)])
    )
    for (const shape of obstacles) {
      const bounds = elementBounds(shape)
      if (joined.has(shape.id) || joined.has(ownerOf(shape))) {
        continue
      }
      // Why: a panel around both ends is a group the arrow runs inside, not an obstacle.
      if (contains(bounds, points[0]) || contains(bounds, points.at(-1))) {
        continue
      }
      const inner = {
        x: bounds.x + 3,
        y: bounds.y + 3,
        width: bounds.width - 6,
        height: bounds.height - 6
      }
      if (points.slice(1).some((point, index) => segmentCrossesBox(points[index], point, inner))) {
        add(
          'warning',
          'arrow-through',
          arrow,
          `passes through ${shape.id}; route around it (via, route) or end at it`
        )
        break
      }
    }
  }
}

function polygonChecks(elements, texts, add) {
  const polygons = elements.filter((element) => {
    const points = element.points ?? []
    return (
      element.type === 'line' &&
      points.length > 3 &&
      Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1 &&
      (visible(element.backgroundColor) || visible(element.strokeColor))
    )
  })
  for (const polygon of polygons) {
    const corners = absolutePoints(polygon)
    const bounds = elementBounds(polygon)
    for (const text of texts) {
      const ink = glyphBounds(text)
      const center = [ink.x + ink.width / 2, ink.y + ink.height / 2]
      if (!contains(bounds, center) || !pointInPolygon(center, corners)) {
        continue
      }
      const inset = 0.5
      const outside = [
        [ink.x + inset, ink.y + inset],
        [ink.x + ink.width - inset, ink.y + inset],
        [ink.x + inset, ink.y + ink.height - inset],
        [ink.x + ink.width - inset, ink.y + ink.height - inset]
      ].some((corner) => !pointInPolygon(corner, corners))
      if (outside) {
        add(
          'warning',
          'text-outside-shape',
          text,
          `crosses the edge of ${polygon.id}; shorten the label, make the shape wider, or move the label into its wide part`
        )
      }
    }
  }
}

/**
 * An arrow or a line (a residual, a bracket) drawn across a word or a formula (a panel title, a
 * note, a key phrase) hides it; a glyph's own lines may run under its own label.
 */
function textCrossChecks(arrows, labels, add) {
  for (const arrow of arrows) {
    const points = absolutePoints(arrow)
    const owner = arrow.customData?.asterKit ?? arrow.id
    const crossed = labels.find((label) => {
      if (label.customData?.asterKit === arrow.id || label.customData?.asterKit === owner) {
        return false
      }
      const ink = inkOf(label)
      const inner = { x: ink.x + 1, y: ink.y + 1, width: ink.width - 2, height: ink.height - 2 }
      return points.slice(1).some((point, index) => segmentCrossesBox(points[index], point, inner))
    })
    if (crossed) {
      add(
        'warning',
        arrow.type === 'arrow' ? 'arrow-over-text' : 'line-over-text',
        arrow,
        `crosses the text ${crossed.id}; move the text or route around it`
      )
    }
  }
}

/** A stop-grad mark drawn over (or touching) a label or an arrowhead reads as neither. */
function markChecks(elements, arrows, labels, add) {
  const warned = new Set()
  for (const mark of elements.filter((element) => element.customData?.asterMark)) {
    const group = mark.groupIds?.[0]
    if (warned.has(group)) {
      continue
    }
    const box = elementBounds(mark)
    // Why a negative margin: slashes touching a label read as struck through it.
    const onLabel = labels.find(
      (label) => !(label.groupIds ?? []).includes(group) && overlaps(inkOf(label), box, -TOUCHING)
    )
    const onHead = arrows.find((arrow) =>
      [headBox(arrow, false, 2), headBox(arrow, true, 2)].some(
        (head) => head && overlaps(head, box, 0)
      )
    )
    if (onLabel || onHead) {
      warned.add(group)
      add(
        'warning',
        'mark-on-label',
        mark,
        `the ${mark.customData.asterMark} mark covers or touches ${onLabel ? `the label ${onLabel.id}` : `the head of ${onHead.id}`}; move it along the arrow (at)`
      )
    }
  }
}

const SIDE_ROLES = new Set(['side', 'aux', 'loss', 'loss-link', 'compared'])

/** Which of a label's boxes every direct route between two points (straight or one elbow) crosses. */
function blocking(start, end, labels) {
  const routes =
    Math.abs(start[0] - end[0]) < 1 || Math.abs(start[1] - end[1]) < 1
      ? [[start, end]]
      : [
          [start, [end[0], start[1]], end],
          [start, [start[0], end[1]], end]
        ]
  return labels.find((label) => {
    const ink = inkOf(label)
    const inner = { x: ink.x + 1, y: ink.y + 1, width: ink.width - 2, height: ink.height - 2 }
    return routes.every((route) =>
      route.slice(1).some((point, index) => segmentCrossesBox(route[index], point, inner))
    )
  })
}

/**
 * An arrow that runs more than twice as far as its ends are apart (Manhattan) is a detour; when
 * a title or a label sits on every direct route, it names it (move it, or leave a lane).
 */
function detourChecks(arrows, labels, add) {
  // Why not side, aux or loss lines: residuals and EMA links go around the blocks by design.
  for (const arrow of arrows.filter(
    (element) =>
      !SIDE_ROLES.has(element.customData?.asterLine) &&
      !SIDE_ROLES.has(element.customData?.asterRole)
  )) {
    const points = absolutePoints(arrow)
    if (points.length < 2) {
      continue
    }
    const length = points
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
        0
      )
    const [start, end] = [points[0], points.at(-1)]
    const reach = Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1])
    if (length - reach > 32 && length > reach * 2) {
      const owner = arrow.customData?.asterKit ?? arrow.id
      const blocker = blocking(
        start,
        end,
        labels.filter((label) => (label.customData?.asterKit ?? label.id) !== owner)
      )
      add(
        'warning',
        'detour',
        arrow,
        `runs ${Math.round(length)} units to reach ${Math.round(reach)} away${blocker ? `: ${blocker.id} sits on every direct route, so move it (or the title row) out of the way` : '; put its ends next to each other'}`
      )
    }
  }
}

export function layoutChecks(elements, add) {
  const arrows = elements.filter((element) => element.type === 'arrow')
  const texts = elements.filter((element) => element.type === 'text')
  const labels = elements.filter(
    (element) => (element.type === 'text' && !element.containerId) || element.customData?.asterTex
  )
  // Why open lines only: a closed polygon (a trapezoid) holds its label; lines cross over words.
  const lines = elements.filter((element) => {
    const points = element.points ?? []
    return (
      element.type === 'line' &&
      points.length > 1 &&
      visible(element.strokeColor) &&
      Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) >= 1
    )
  })
  headChecks(arrows, labels, add)
  detourChecks(arrows, labels, add)
  markChecks(elements, arrows, labels, add)
  textCrossChecks([...arrows, ...lines], labels, add)
  throughChecks(arrows, elements, add)
  polygonChecks(elements, texts, add)
}
