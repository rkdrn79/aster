// The kit's bound arrow, split from research-figures-kit.mjs: ends on shapes, on other lines
// (junctions) or on a group of items (an invisible container around them), with its label beside
// the longest run, and layered so no panel or card it ends in covers it.
import { distanceToBounds, elementBounds } from './research-figures-geometry.mjs'
import { arrowLabelBox, inkBox } from './research-figures-labels.mjs'
import { figureElement } from './research-figures-model.mjs'
import { makeChevron, makeDot } from './research-figures-shapes.mjs'
import { makeArrow, makeLines } from './research-figures-draw.mjs'
import { labelLines, texLabel } from './research-figures-type.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const filled = (element) =>
  SHAPES.has(element.type) &&
  Boolean(element.backgroundColor) &&
  element.backgroundColor !== 'transparent'

/** An invisible rectangle (drawn as nothing) arrows bind to: a group's bounds, `pad` outside. */
export function makeContainer(spec, box) {
  const pad = spec.pad ?? 4
  return figureElement('rectangle', {
    id: spec.id,
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + 2 * pad,
    height: box.height + 2 * pad,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    boundElements: [],
    frameId: spec.frame ?? null,
    customData: { asterContainer: spec.ids ?? true, asterIntentional: true }
  })
}

export function arrowMethods(core) {
  const { elements, styled } = core
  const find = (id) => elements.find((element) => element.id === id && !element.isDeleted)
  const union = (ids) => {
    const boxes = ids.map((id) => core.bounds(id))
    const x = Math.min(...boxes.map((box) => box.x))
    const y = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.right))
    const bottom = Math.max(...boxes.map((box) => box.bottom))
    return { x, y, width: right - x, height: bottom - y }
  }
  /** A container around `ids` (or the box x, y, w, h), placed under the lowest of them. */
  const group = (spec) => {
    if (!spec?.id) {
      throw new Error('group({ id, ids | x, y, w, h }) needs an id')
    }
    const ids = spec.ids ?? spec.around
    const box = ids?.length
      ? union(ids)
      : { x: spec.x ?? 0, y: spec.y ?? 0, width: spec.w ?? 0, height: spec.h ?? 0 }
    if (!(box.width > 0 && box.height > 0)) {
      throw new Error(`group ${spec.id}: give it ids, or x, y, w and h`)
    }
    const container = makeContainer({ ...spec, ids }, box)
    core.claim(spec.id, [container])
    core.insert([container], ids?.length ? core.under(ids) : core.back())
    return container
  }
  /** An arrow end given as several ids: the id of a container drawn around them. */
  const groupEnd = (spec, end, side) =>
    Array.isArray(end) && end.every((id) => typeof id === 'string')
      ? group({ id: `${spec.id}-${side}`, ids: end, pad: spec.groupPad, frame: spec.frame }).id
      : end
  /** The label drawn once at the origin to measure its ink, then beside the arrow's run. */
  const arrowLabel = (spec, arrow) => {
    const style = styled({}).style
    const size = spec.labelSize ?? style.smallSize
    // Why two kinds: `label` is TeX (x_t, a Greek macro) unless it reads as words ("softmax")
    // or mixes words and `$…$` math; `labelText` prints exactly as written.
    const label =
      spec.labelText !== undefined
        ? [String(spec.labelText).replaceAll('$', '\\$')]
        : texLabel(spec.label)
    const lines = labelLines(label, size, undefined, style)
    const draw = (where) =>
      makeLines(
        styled({
          id: `${spec.id}-label`,
          size,
          color: spec.labelColor,
          frame: spec.frame,
          ...where
        }),
        lines
      )
    const probe = draw({ x: 0, y: 0 })
    const ink = inkBox(probe.elements)
    const spot = arrowLabelBox(arrow, ink, { segment: spec.labelSegment, side: spec.labelSide })
    const [dx, dy] = spec.labelOffset ?? [0, 0]
    return draw({ x: spot.x - ink.x + dx, y: spot.y - ink.y + dy })
  }
  /**
   * Where the arrow goes in the stack: under the shapes it joins, but above any filled shape
   * (a panel, a card, a stage) one of its points lies in, so its head is never hidden.
   */
  const layer = (arrow, ends, at) => {
    const own = new Set(ends.flatMap((end) => core.owned(end).map((element) => element.id)))
    const points = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py])
    let index = at
    elements.forEach((element, position) => {
      if (position < at || own.has(element.id) || element.isDeleted || !filled(element)) {
        return
      }
      const box = elementBounds(element)
      if (points.some(([px, py]) => distanceToBounds([px, py], box) === 0)) {
        index = Math.max(index, position + 1)
      }
    })
    return index
  }
  return {
    /**
     * An invisible container (draws nothing) around items or at x, y, w, h, for arrows to bind
     * to: `arrow({ to: 'group-id' })` meets the group's edge. Replaces box({ color: 'none' }).
     */
    group,
    /**
     * A bound arrow (see makeArrow). It sits under the shapes it joins, but above a panel or card
     * it ends in, unless `layer: 'top'`; `head: 'chevron'` draws an open head; `from: { on: id,
     * at | x | y }` starts it on another line with a junction dot; `to: [ids]` ends it on the
     * group of items (a container `<id>-to`); labels go beside `labelSegment`, clear of the heads.
     */
    arrow(spec) {
      const from = groupEnd(spec, spec.from, 'from')
      const to = groupEnd(spec, spec.to, 'to')
      const start = core.junction(from, to)
      const finish = core.junction(to, from)
      const arrow = makeArrow(
        styled({
          ...spec,
          from: start?.point ?? from,
          to: finish?.point ?? to,
          fromAxis: start?.axis ?? spec.fromAxis,
          toAxis: finish?.axis ?? spec.toAxis
        }),
        core.lookup,
        { elements }
      )
      const chevrons =
        spec.head === 'chevron' && spec.heads !== 'none'
          ? (spec.heads === 'both' ? ['end', 'start'] : ['end']).map((at) =>
              makeChevron(arrow, {
                at,
                length: spec.headSize ?? 8,
                width: spec.headWidth ?? spec.headSize ?? 8,
                id: `${spec.id}-head${at === 'start' ? '-start' : ''}`
              })
            )
          : []
      // Why the line's colour: a black dot on a coloured link reads as a third thing.
      const dots = [start, finish]
        .map((joint, index) =>
          joint && spec.junction !== false
            ? makeDot(
                styled({
                  id: `${spec.id}-joint${index}`,
                  cx: joint.point[0],
                  cy: joint.point[1],
                  r: 3,
                  color: joint.color
                })
              )[0]
            : null
        )
        .filter(Boolean)
      // Why: an end on math (no element of that id) binds to the run nearest the end.
      for (const [side, end, point] of [
        ['startBinding', from, arrow.points[0]],
        ['endBinding', to, arrow.points.at(-1)]
      ]) {
        if (arrow[side] && typeof end === 'string' && !find(end)) {
          const at = [arrow.x + point[0], arrow.y + point[1]]
          const nearest = core
            .owned(end)
            .filter((item) => item.type === 'text' || item.type === 'image')
            .map((item) => ({ item, distance: distanceToBounds(at, elementBounds(item)) }))
            .toSorted((a, b) => a.distance - b.distance)[0]
          arrow[side].elementId = nearest?.item.id ?? arrow[side].elementId
        }
      }
      const label =
        spec.label !== undefined || spec.labelText !== undefined
          ? arrowLabel(spec, arrow).elements
          : []
      core.claim(spec.id, [arrow, ...chevrons, ...dots, ...label])
      const ends = [from, to].filter((end) => typeof end === 'string')
      core.insert(
        [arrow, ...chevrons],
        spec.layer === 'top' ? elements.length : layer(arrow, ends, core.under(ends))
      )
      core.insert([...dots, ...label])
      return arrow
    }
  }
}
