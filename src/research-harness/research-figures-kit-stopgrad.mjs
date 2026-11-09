// The kit's stop-gradient mark: two slashes across an arrow and an "sg" label, both placed where
// they cover neither the arrow's own label nor its heads.
import { elementBounds, overlaps, pointOnPath } from './research-figures-geometry.mjs'
import { absolutePoints, headBox } from './research-figures-labels.mjs'
import { makeStopGrad } from './research-figures-shapes.mjs'
import { glyphBounds } from './research-figures-text.mjs'
import { labelLines, makeLines } from './research-figures-type.mjs'

const inkOf = (element) => (element.type === 'text' ? glyphBounds(element) : elementBounds(element))
/** Units the slashes and their label keep from the arrow's own label and heads. */
const CLEARANCE = 4

function union(boxes) {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x, y, width: right - x, height: bottom - y }
}

export function stopGradMethod(core) {
  /**
   * Two slashes across an arrow with an "sg" label beside them (`label: false` hides it, or any
   * text); without `at`, the first spot along the arrow clear of its label and heads.
   */
  return (arrowId, spec = {}) => {
    const arrow = core.need(arrowId)
    const style = core.styled({}).style
    const id = spec.id ?? `${arrowId}-stopgrad`
    const text = spec.label === false ? null : (spec.label ?? 'sg')
    const obstacles = [
      ...core
        .owned(arrowId)
        .filter(
          (element) =>
            element.id !== arrowId && (element.type === 'text' || element.type === 'image')
        )
        .map(inkOf),
      headBox(arrow, false, 4),
      headBox(arrow, true, 4)
    ].filter(Boolean)
    // Why a negative margin: slashes that merely touch the arrow's label still read as on it.
    const clear = (box) => !obstacles.some((obstacle) => overlaps(box, obstacle, -CLEARANCE))
    const room = (box) =>
      Math.min(
        Infinity,
        ...obstacles.map((obstacle) =>
          Math.max(
            obstacle.x - (box.x + box.width),
            box.x - (obstacle.x + obstacle.width),
            obstacle.y - (box.y + box.height),
            box.y - (obstacle.y + obstacle.height)
          )
        )
      )
    const lines =
      text === null
        ? []
        : labelLines(Array.isArray(text) ? text : [String(text)], style.smallSize, undefined, style)
    const draw = (where) =>
      makeLines(core.styled({ id: `${id}-label`, size: style.smallSize, ...where }), lines)
    const ink = lines.length ? union(draw({ x: 0, y: 0 }).elements.map(inkOf)) : null
    const path = absolutePoints(arrow)
    const spots = spec.at === undefined ? [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85] : [spec.at]
    let best = null
    for (const at of spots) {
      const items = makeStopGrad(arrow, core.styled({ ...spec, at }))
      const mark = union(items.map(elementBounds))
      const [a, b] = [
        pointOnPath(path, { at: Math.max(0, at - 0.02) }),
        pointOnPath(path, { at: Math.min(1, at + 0.02) })
      ]
      const horizontal = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
      // Why two sides: above (or right) first, the other side when the arrow's label is there.
      const places = !ink
        ? [null]
        : horizontal
          ? [
              { x: mark.x + mark.width / 2 - ink.width / 2, y: mark.y - 4 - ink.height },
              { x: mark.x + mark.width / 2 - ink.width / 2, y: mark.y + mark.height + 4 }
            ]
          : [
              { x: mark.x + mark.width + 4, y: mark.y + mark.height / 2 - ink.height / 2 },
              { x: mark.x - 4 - ink.width, y: mark.y + mark.height / 2 - ink.height / 2 }
            ]
      const place = places.find(
        (spot) => !spot || clear({ ...spot, width: ink.width, height: ink.height })
      )
      const option = { items, mark, place: place ?? places[0] }
      // Why the roomiest when none is clear: on a short arrow, the spot furthest from the
      // label and heads still reads best.
      option.room = room(mark)
      if (!best || option.room > best.room) {
        best = option
      }
      if (clear(mark) && place !== undefined) {
        best = option
        break
      }
    }
    if (ink && best.place) {
      best.items.push(...draw({ x: best.place.x - ink.x, y: best.place.y - ink.y }).elements)
    }
    return core.add(best.items, id)
  }
}
