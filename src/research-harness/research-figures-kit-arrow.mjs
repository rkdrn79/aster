// The kit's bound arrow, split from research-figures-kit.mjs: ends on shapes, on other lines
// (junctions) or on a group of items (an invisible container around them), with its label beside
// the longest run, and layered so no panel or card it ends in covers it.
import {
  centerOf,
  distanceToBounds,
  edgePoint,
  elementBounds
} from './research-figures-geometry.mjs'
import { arrowLabelBox, flowLabel, inkBox } from './research-figures-labels.mjs'
import {
  LABEL_POSITIONS,
  brokenLabel,
  labelObstacles,
  placeArrowLabel
} from './research-figures-label-spot.mjs'
import { figureElement } from './research-figures-model.mjs'
import { makeChevron, makeDot } from './research-figures-shapes.mjs'
import { makeArrow, makeLines } from './research-figures-draw.mjs'
import { labelLines } from './research-figures-type.mjs'
import { warnKit } from './research-figures-cards.mjs'
import { oneOf } from './research-figures-options.mjs'
import { withCorridor } from './research-figures-route-corridor.mjs'

/** Where a self-loop leaves its node: a side, or an angle in degrees (0 right, 90 up). */
const LOOP_SIDES = { right: 0, top: 90, left: 180, bottom: 270 }

/**
 * A self-loop's path around `shape`: it leaves the outline at `angle` − spread / 2, swings out
 * `size` units and comes back at `angle` + spread / 2, through five points Excalidraw smooths.
 */
export function loopPath(shape, { angle = 90, size = 26, spread = 60, gap = 3 } = {}) {
  const [cx, cy] = centerOf(shape)
  const ray = (degrees, distance) => {
    const radians = (degrees * Math.PI) / 180
    // Why minus: y grows downward, so 90° (up) is a negative y.
    return [cx + Math.cos(radians) * distance, cy - Math.sin(radians) * distance]
  }
  const half = spread / 2
  const out = (degrees, share) => {
    const edge = edgePoint(shape, ray(degrees, 1000), 0)
    const radius = Math.hypot(edge[0] - cx, edge[1] - cy)
    return ray(degrees, radius + size * share)
  }
  return [
    edgePoint(shape, ray(angle - half, 1000), gap),
    out(angle - half * 1.5, 0.7),
    out(angle, 1),
    out(angle + half * 1.5, 0.7),
    edgePoint(shape, ray(angle + half, 1000), gap)
  ].map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])
}

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
  /**
   * An end given as the id of a line or polyline (a bus, a rail, an arrow): a point on it level
   * with the other end, as `{ on: id, at: 'auto' }` would give, since lines take no binding.
   */
  const onLine = (end) => {
    const element = typeof end === 'string' ? find(end) : null
    return element && (element.type === 'line' || element.type === 'arrow')
      ? { on: end, at: 'auto', line: true }
      : end
  }
  /**
   * The label drawn once at the origin to measure its ink, then beside the arrow's run; where
   * that crosses a shape's edge it moves (labelPosition 'auto'), and plain words that fit nowhere
   * break onto two or three lines ("Co-Fine-" / "Tune") before giving up.
   */
  const arrowLabel = (spec, arrow) => {
    const style = styled({}).style
    const size = spec.labelSize ?? style.smallSize
    // Why two kinds: `label` is plain words unless it holds math (x_t, a Greek macro, `$…$`)
    // or is a lone symbol (Q); `labelText` prints exactly as written.
    const source = spec.labelText ?? spec.label
    // Why plain for a broken label: "Co-" alone would read as math (a lone token).
    const itemsOf = (text) =>
      spec.labelText !== undefined || text !== source
        ? [String(text).replaceAll('$', '\\$')]
        : flowLabel(spec.label)
    const draw = (lines, where) =>
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
    // Why auto only without an offset: an offset is the agent placing it by hand.
    const position =
      oneOf('labelPosition', spec.labelPosition, LABEL_POSITIONS) ??
      (spec.labelOffset ? null : 'auto')
    const obstacles = position === 'auto' ? labelObstacles(elements, arrow) : null
    const plain = typeof source === 'string' && !source.includes('\n') && !/[$\\_^{}]/.test(source)
    const tries = [source, ...(plain ? [brokenLabel(source, 2), brokenLabel(source, 3)] : [])]
    let chosen = null
    for (const text of tries.filter((entry) => entry !== null)) {
      const lines = labelLines(itemsOf(text), size, undefined, style)
      // Why centred: a label on two or three lines reads as one block over its run.
      const align = lines.length > 1 ? 'center' : 'left'
      const ink = inkBox(draw(lines, { x: 0, y: 0, align }).elements)
      const spot = position
        ? placeArrowLabel(
            arrow,
            ink,
            { segment: spec.labelSegment, side: spec.labelSide, position },
            obstacles
          )
        : arrowLabelBox(arrow, ink, { segment: spec.labelSegment, side: spec.labelSide })
      chosen ??= { lines, ink, spot, align }
      if (position !== 'auto' || spot.clear) {
        chosen = { lines, ink, spot, align }
        break
      }
    }
    const { lines, ink, spot, align } = chosen
    // Why a warning now: round 14 agents found a label wider than its short run (P(camera) on
    // a 66-unit lane) only in the preview; the joining-input pattern was not written anywhere.
    const extent = Math.abs(spot.run?.horizontal === false ? ink.height : ink.width)
    if (position === 'auto' && spot.clear === false && spot.run && extent > (spot.room ?? 0)) {
      ;(core.warn ?? warnKit)([
        `arrow ${spec.id}: its label (${Math.round(extent)} units) has no clear spot beside its ${Math.round(spot.room ?? 0)}-unit run; shorten or break it (labelText with \\n), widen the gap, or name it as its own input: a text beside the arrow with a short arrow joining it (fig.arrow({ from: '<text id>', to: { on: '${spec.id}', at: 'auto' } }))`
      ])
    }
    const [dx, dy] = spec.labelOffset ?? [0, 0]
    return draw(lines, { x: spot.x - ink.x + dx, y: spot.y - ink.y + dy, align })
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
  /** Where a curve's label goes: off the bulge (an arc) or beside the middle (an S). */
  const curveLabelSpot = (arrow, spec, shape) => {
    const points = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py])
    const [from, to] = [points[0], points.at(-1)]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
    const normal = [(to[1] - from[1]) / length, -(to[0] - from[0]) / length]
    const bend = Number(spec.bend === undefined || spec.bend === 'arc' ? length / 4 : spec.bend)
    const sign = shape === 's' ? 1 : Math.sign(bend) || 1
    const point =
      shape === 's'
        ? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
        : points[Math.floor(points.length / 2)]
    return { point, direction: [normal[0] * sign, normal[1] * sign] }
  }
  /** Claims a curve or loop with its label, `labelGap` units past `spot` along its direction. */
  const finishCurve = (spec, arrow, spot) => {
    arrow.customData = { ...arrow.customData, asterCurve: true }
    let label = []
    if (spec.label !== undefined || spec.labelText !== undefined) {
      const style = styled({}).style
      const size = spec.labelSize ?? style.smallSize
      const text =
        spec.labelText !== undefined
          ? [String(spec.labelText).replaceAll('$', '\\$')]
          : flowLabel(spec.label)
      const lines = labelLines(text, size, undefined, style)
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
      const ink = inkBox(draw({ x: 0, y: 0 }).elements)
      const gap = spec.labelGap ?? 4
      const [dx, dy] = spot.direction
      // Why the ink's half-extent along the direction: the label's near edge sits `gap` away.
      const reach = Math.abs(dx) * (ink.width / 2) + Math.abs(dy) * (ink.height / 2) + gap
      const cx = spot.point[0] + dx * reach + (spec.labelOffset?.[0] ?? 0)
      const cy = spot.point[1] + dy * reach + (spec.labelOffset?.[1] ?? 0)
      label = draw({ x: cx - ink.width / 2 - ink.x, y: cy - ink.height / 2 - ink.y }).elements
    }
    core.claim(spec.id, [arrow, ...label])
    const ends = [spec.from, spec.to, spec.on].filter((end) => typeof end === 'string')
    core.insert(
      [arrow],
      spec.layer === 'top' ? elements.length : layer(arrow, ends, core.under(ends))
    )
    core.insert(label)
    return arrow
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
     * `route: 'under' | 'over'` runs a return path in the nearest clear band below (above).
     */
    arrow(given) {
      // Why first: a return path in a clear band is an ordinary routed arrow once it has via.
      const spec = withCorridor(given, core)
      const from = onLine(groupEnd(spec, spec.from, 'from'))
      const to = onLine(groupEnd(spec, spec.to, 'to'))
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
      // Why no dot under a head: an arrow that ends on a line points at it, it does not join it.
      const dots = [start, finish]
        .map((joint, index) =>
          joint && spec.junction !== false && !(index === 1 && to.line)
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
    },
    /**
     * A curved arrow for a schematic (a transport map, a feedback that bends round, a state
     * change), never a connector: `shape` 'arc' (one bulge, `bend` units to the left of travel,
     * negative to the right, 'arc' a quarter of the length) or 's' (an S, bulging both ways).
     * Ends bind like arrow's; `label` sits off the bulge.
     */
    curve(spec) {
      const shape = oneOf('curve shape', spec?.shape ?? 'arc', ['arc', 's'])
      const arrow = makeArrow(
        styled({ ...spec, curve: spec.bend ?? 'arc', curveShape: shape, label: undefined }),
        core.lookup,
        { elements }
      )
      return finishCurve(spec, arrow, curveLabelSpot(arrow, spec, shape))
    },
    /**
     * A self-loop on a node (a state that stays, a recurrent edge): leaves and re-enters `on` at
     * `side` (top, right, bottom, left, or an angle in degrees, 0 right and 90 up), `size` units
     * out, its ends `spread` degrees apart; the head lands on the node; `label` sits past the
     * loop's top.
     */
    loop(spec) {
      if (!spec?.id || !spec.on) {
        throw new Error('loop({ id, on: nodeId, side }) needs an id and the node it loops on')
      }
      const node = core.need(spec.on)
      const angle =
        typeof spec.side === 'number'
          ? spec.side
          : LOOP_SIDES[oneOf('loop side', spec.side ?? 'top', Object.keys(LOOP_SIDES))]
      const path = loopPath(node, {
        angle,
        size: spec.size ?? 26,
        spread: spec.spread ?? 60,
        gap: spec.gap ?? 3
      })
      const arrow = makeArrow(
        styled({
          ...spec,
          from: path[0],
          to: path.at(-1),
          curve: 1,
          label: undefined
        }),
        core.lookup,
        { elements }
      )
      // Why replace the path: makeArrow's arc has three points; a loop needs its five.
      const [x0, y0] = path[0]
      arrow.x = x0
      arrow.y = y0
      arrow.points = path.map(([x, y]) => [x - x0, y - y0])
      const xs = arrow.points.map((point) => point[0])
      const ys = arrow.points.map((point) => point[1])
      arrow.width = Math.max(...xs) - Math.min(...xs)
      arrow.height = Math.max(...ys) - Math.min(...ys)
      const bind = { elementId: node.id, focus: 0, gap: Math.max(1, spec.gap ?? 3) }
      arrow.startBinding = { ...bind }
      arrow.endBinding = { ...bind }
      const radians = (angle * Math.PI) / 180
      return finishCurve(spec, arrow, {
        point: path[2],
        direction: [Math.cos(radians), -Math.sin(radians)]
      })
    }
  }
}
