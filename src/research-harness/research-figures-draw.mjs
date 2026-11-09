// Drawing primitives in the figure's style: boxes sized to their labels (or exactly as asked),
// and arrows bound on both sides with Excalidraw's focus. Pure, so the app and the harness share them.
import { PAPER_STYLE, figureElement } from './research-figures-model.mjs'
import { centerOf, edgePoint, elementBounds, focusDistance } from './research-figures-geometry.mjs'
import { ARROW_HEADS, ROUTES, oneOf } from './research-figures-options.mjs'
import { orthogonalize, routeArrow } from './research-figures-route.mjs'
import {
  ARROW_ROLES,
  FIGURE_HEAD_SIZE,
  FIGURE_LINE_WIDTH,
  inkColor,
  paintValue,
  styleColor
} from './research-figures-style.mjs'
import {
  BOUND_TEXT_PADDING,
  glyphBounds,
  inkHeight,
  measureText
} from './research-figures-text.mjs'
import {
  hasInlineMath,
  labelLines,
  makeLines,
  makeText,
  measureLines,
  needsTex,
  styleOf
} from './research-figures-type.mjs'

export {
  makeLines,
  makeMath,
  makeRuns,
  makeText,
  parseMath,
  plainText,
  unbracedScript
} from './research-figures-type.mjs'

const ceil8 = (value) => Math.ceil(value / 8) * 8
// Why: an explicit offset places the label exactly where it is asked for.
const offsetGiven = (offset) => Array.isArray(offset) && offset.some((value) => value !== 0)
/** Excalidraw draws a "triangle" head min(15, last segment / 2) long, an "arrow" head 25. */
export const ARROWHEAD_LENGTH = { triangle: 15, arrow: 25, bar: 15, dot: 15, circle: 15 }

/** Fill, outline and role of a shape: its `color` in the style, then `fill`/`stroke` overrides. */
export function shapePaint(spec) {
  const style = styleOf(spec)
  const paint = styleColor(style, spec.color)
  const role = spec.role ?? paint.role
  return {
    fill: paintValue(style, spec.fill, 'fill') ?? paint.fill,
    stroke: paintValue(style, spec.stroke, 'ink') ?? paint.stroke,
    ...(role ? { customData: { asterRole: role } } : {})
  }
}

/**
 * A shape with its label inside. Without `w`/`h` it grows to fit the label with room to spare;
 * with them it keeps that size (only growing to what the label needs) and `exact` keeps it even
 * then. A string label is bound text (`labelAlign`, `labelValign` place it); a label given as
 * runs (`['encoder', { tex: 'E_\\theta' }]`) or with `$…$` math, with `math` (a second line,
 * or after the label with `inline: true`) or with `labelOffset` [dx, dy] is free text grouped
 * with it, placed by `labelAlign` and `labelValign` too.
 */
export function makeBox(spec, random = Math.random) {
  const style = styleOf(spec)
  const shape = spec.shape ?? 'rectangle'
  const fontSize = spec.size ?? style.textSize ?? PAPER_STYLE.fontSize
  const free =
    Array.isArray(spec.label) ||
    spec.labelOffset ||
    spec.math ||
    hasInlineMath(spec.label) ||
    needsTex(spec.label, style)
  // Why inline: "Encoder E_θ" on one line keeps the box one text line tall.
  const source =
    spec.math && spec.inline ? [...[spec.label ?? []].flat(), ' ', { tex: spec.math }] : spec.label
  const lines = free
    ? labelLines(source, fontSize, spec.inline ? undefined : spec.math, style)
    : null
  const label = free ? '' : String(spec.label ?? '')
  const text = lines
    ? measureLines(lines, fontSize, style)
    : measureText(label, fontSize, style.fontFamily)
  const labelled = lines ? lines.length > 0 : label !== ''
  const grow = shape === 'ellipse' ? Math.SQRT2 : shape === 'diamond' ? 2 : 1
  const fitW = labelled ? (text.width + BOUND_TEXT_PADDING * 2) * grow : 0
  // Why: the lint's minimum: a given height only has to hold the label's ink, plus a hair.
  const ink = lines ? text.height - 0.31 * fontSize : inkHeight(label, fontSize)
  const tightH = labelled ? (ink + 2) * grow : 0
  // Why less room for two lines: their own leading already spaces them; 16 more made a label
  // and a math line 72 tall.
  const multiline = lines ? lines.length > 1 : label.includes('\n')
  const roomyH = labelled ? (text.height + BOUND_TEXT_PADDING * 2 + (multiline ? 8 : 16)) * grow : 0
  const sized = (given, fit, roomy) =>
    given === undefined
      ? Math.max(ceil8(roomy), 32)
      : spec.exact
        ? given
        : Math.max(given, Math.ceil(fit))
  const width = sized(spec.w, fitW, fitW + 24 * grow)
  const height = sized(spec.h, tightH, roomyH)
  const x = spec.cx !== undefined ? spec.cx - width / 2 : (spec.x ?? 0)
  const y = spec.cy !== undefined ? spec.cy - height / 2 : (spec.y ?? 0)
  const paint = shapePaint(spec)
  const radius = typeof spec.rounded === 'number' ? spec.rounded : style.radius
  const common = { frameId: spec.frame ?? null, groupIds: spec.groupIds ?? [] }
  const box = figureElement(
    shape,
    {
      id: spec.id,
      x,
      y,
      width,
      height,
      strokeColor: paint.stroke,
      backgroundColor: paint.fill,
      strokeStyle: spec.dashed ? 'dashed' : spec.dotted ? 'dotted' : 'solid',
      strokeWidth: spec.strokeWidth ?? style.outlineWidth ?? FIGURE_LINE_WIDTH,
      roundness:
        shape === 'rectangle' && spec.rounded !== false && radius > 0
          ? { type: 3, value: radius }
          : null,
      boundElements: [],
      ...(paint.customData || spec.bar || spec.intentional
        ? {
            customData: {
              ...paint.customData,
              ...(spec.bar ? { asterBar: true } : {}),
              ...(spec.intentional ? { asterIntentional: true } : {})
            }
          }
        : {}),
      ...common
    },
    random
  )
  if (!labelled) {
    return [box]
  }
  if (lines) {
    const [dx, dy] = spec.labelOffset ?? [0, 0]
    const groupIds = common.groupIds.length ? common.groupIds : [`${spec.id}-shape`]
    box.groupIds = groupIds
    const horizontal = oneOf('labelAlign', spec.labelAlign, ['left', 'center', 'right']) ?? 'center'
    const vertical = oneOf('labelValign', spec.labelValign, ['top', 'middle', 'bottom']) ?? 'middle'
    const pad = BOUND_TEXT_PADDING
    const placed = makeLines(
      {
        id: `${spec.id}-label`,
        ...(horizontal === 'center'
          ? { cx: x + width / 2 + dx }
          : { x: (horizontal === 'left' ? x + pad : x + width - pad) + dx, align: horizontal }),
        cy: y + height / 2 + dy,
        size: fontSize,
        color: spec.labelColor ?? (spec.color === 'highlight' ? '#ffffff' : undefined),
        style: spec.style,
        frame: spec.frame
      },
      lines,
      random
    )
    // Why the ink: a subscript hangs below the line box, so math sat low in its box; top and
    // bottom keep the ink a padding off that edge.
    const inks = placed.elements
      .filter((element) => element.type === 'text' || element.type === 'image')
      .map((element) => (element.type === 'text' ? glyphBounds(element) : elementBounds(element)))
    const inkTop = Math.min(...inks.map((ink) => ink.y))
    const inkBottom = Math.max(...inks.map((ink) => ink.y + ink.height))
    const shift = offsetGiven(spec.labelOffset)
      ? 0
      : vertical === 'top'
        ? y + pad + 2 + dy - inkTop
        : vertical === 'bottom'
          ? y + height - pad - 2 + dy - inkBottom
          : y + height / 2 + dy - (inkTop + inkBottom) / 2
    for (const element of placed.elements) {
      element.groupIds = [...element.groupIds, ...groupIds]
      element.y += shift
    }
    return [box, ...placed.elements]
  }
  const horizontal = spec.labelAlign ?? 'center'
  const vertical = spec.labelValign ?? 'middle'
  const pad = BOUND_TEXT_PADDING
  const [labelElement] = makeText(
    {
      id: `${spec.id}-label`,
      text: label,
      size: fontSize,
      color: spec.labelColor ?? (spec.color === 'highlight' ? '#ffffff' : undefined),
      style: spec.style,
      x:
        horizontal === 'left'
          ? x + pad
          : horizontal === 'right'
            ? x + width - pad - text.width
            : x + (width - text.width) / 2,
      y:
        vertical === 'top'
          ? y + pad
          : vertical === 'bottom'
            ? y + height - pad - text.height
            : y + (height - text.height) / 2,
      frame: spec.frame,
      groupIds: common.groupIds
    },
    random
  )
  Object.assign(labelElement, {
    containerId: spec.id,
    textAlign: horizontal,
    verticalAlign: vertical
  })
  box.boundElements.push({ type: 'text', id: labelElement.id })
  return [box, labelElement]
}

function anchor(shape, adjacent, gap) {
  const bounds = elementBounds(shape)
  const [cx, cy] = centerOf(shape)
  const horizontal =
    Math.abs(adjacent[0] - cx) / bounds.width >= Math.abs(adjacent[1] - cy) / bounds.height
  if (shape.type !== 'rectangle') {
    return edgePoint(shape, adjacent, gap)
  }
  if (horizontal) {
    const y = Math.min(Math.max(adjacent[1], bounds.y + 6), bounds.bottom - 6)
    return [adjacent[0] < cx ? bounds.x - gap : bounds.right + gap, y]
  }
  const x = Math.min(Math.max(adjacent[0], bounds.x + 6), bounds.right - 6)
  return [x, adjacent[1] < cy ? bounds.y - gap : bounds.bottom + gap]
}

/**
 * Two boxes side by side (or stacked) that share at least 8 units of height (or width) get a
 * straight horizontal (or vertical) arrow through the middle of what they share.
 */
function alignedEnds(start, end, gap) {
  const a = elementBounds(start)
  const b = elementBounds(end)
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.bottom, b.bottom)
  if (bottom - top >= 8 && (a.right <= b.x || b.right <= a.x)) {
    const y = (top + bottom) / 2
    return a.right <= b.x
      ? [
          [a.right + gap, y],
          [b.x - gap, y]
        ]
      : [
          [a.x - gap, y],
          [b.right + gap, y]
        ]
  }
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.right, b.right)
  if (right - left >= 8 && (a.bottom <= b.y || b.bottom <= a.y)) {
    const x = (left + right) / 2
    return a.bottom <= b.y
      ? [
          [x, a.bottom + gap],
          [x, b.y - gap]
        ]
      : [
          [x, a.y - gap],
          [x, b.bottom + gap]
        ]
  }
  return null
}

const BINDABLE = new Set(['rectangle', 'diamond', 'ellipse', 'image', 'frame', 'text'])

/** Lines (polygons) cannot take bindings; an arrow meets their bounding box instead. */
function target(element) {
  if (!element || BINDABLE.has(element.type)) {
    return element
  }
  return { ...elementBounds(element), id: element.id, type: 'rectangle', unbindable: true }
}

/** Inserts a point `2 × size` before the end so Excalidraw draws a head `size` long. */
function sizedHead(absolute, size, atStart) {
  const tip = atStart ? absolute[0] : absolute.at(-1)
  const before = atStart ? absolute[1] : absolute.at(-2)
  const length = Math.hypot(tip[0] - before[0], tip[1] - before[1])
  if (length <= size * 2 + 0.5) {
    return absolute
  }
  const t = (size * 2) / length
  const extra = [tip[0] - (tip[0] - before[0]) * t, tip[1] - (tip[1] - before[1]) * t]
  return atStart
    ? [absolute[0], extra, ...absolute.slice(1)]
    : [...absolute.slice(0, -1), extra, tip]
}

/**
 * A curved arrow: from edge to edge through a point `curve` units to the left of the straight
 * line (negative bends right; 'arc' is a quarter of its length), drawn smooth by Excalidraw.
 */
function curvePath(spec, start, end, gap) {
  const a = start ? centerOf(start) : spec.from
  const b = end ? centerOf(end) : spec.to
  const from = start ? edgePoint(start, b, gap) : a
  const to = end ? edgePoint(end, a, gap) : b
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  const bend = spec.curve === 'arc' ? length / 4 : Number(spec.curve)
  if (!Number.isFinite(bend)) {
    throw new Error(`curve is a number of units or 'arc', not ${JSON.stringify(spec.curve)}`)
  }
  // Why left of travel: y grows downward, so (dy, -dx) points to the left of the direction.
  const normal = [(to[1] - from[1]) / length, -(to[0] - from[0]) / length]
  const middle = [
    (from[0] + to[0]) / 2 + normal[0] * bend,
    (from[1] + to[1]) / 2 + normal[1] * bend
  ]
  return [from, middle, to]
}

/** A path through hand-given corners (`via`, a forced route), or one straight diagonal. */
function handPath(spec, start, end, gap) {
  const startCenter = start ? centerOf(start) : spec.from
  const endCenter = end ? centerOf(end) : spec.to
  let via = (spec.via ?? []).map(([px, py]) => [px, py])
  if (!via.length && spec.route === 'hv') {
    via = [[endCenter[0], startCenter[1]]]
  } else if (!via.length && spec.route === 'vh') {
    via = [[startCenter[0], endCenter[1]]]
  }
  const first = via[0] ?? endCenter
  const last = via.at(-1) ?? startCenter
  const aligned = !via.length && start && end ? alignedEnds(start, end, gap) : null
  const startPoint =
    aligned?.[0] ??
    (start
      ? via.length
        ? anchor(start, first, gap)
        : edgePoint(start, endCenter, gap)
      : spec.from)
  const endPoint =
    aligned?.[1] ??
    (end ? (via.length ? anchor(end, last, gap) : edgePoint(end, startCenter, gap)) : spec.to)
  if (
    via.length &&
    start &&
    Math.abs(via[0][0] - startPoint[0]) < Math.abs(via[0][1] - startPoint[1])
  ) {
    via[0] = [startPoint[0], via[0][1]]
  } else if (via.length && start) {
    via[0] = [via[0][0], startPoint[1]]
  }
  if (via.length && end) {
    const corner = via.at(-1)
    const verticalIn = Math.abs(corner[0] - endPoint[0]) < Math.abs(corner[1] - endPoint[1])
    via[via.length - 1] = verticalIn ? [endPoint[0], corner[1]] : [corner[0], endPoint[1]]
  }
  return [startPoint, ...via, endPoint]
}

const SIDES = ['left', 'right', 'top', 'bottom']

/**
 * Where an arrow end that names its spot meets a shape, still bound to it: `at` a fraction 0–1
 * along the side (top to bottom on a left or right side, left to right on a top or bottom one)
 * or `{ x }` / `{ y }` on it, on `side` (by default the side facing `toward`), `gap` units out.
 * `axis` is the way that side runs, which the arrow must not leave along.
 */
export function pinnedEnd(shape, toward, at, side, gap, name = 'fromAt') {
  const b = elementBounds(shape)
  const [cx, cy] = centerOf(shape)
  const facing =
    oneOf(name === 'fromAt' ? 'fromSide' : 'toSide', side, SIDES) ??
    (Math.abs(toward[0] - cx) / (b.width || 1) >= Math.abs(toward[1] - cy) / (b.height || 1)
      ? toward[0] < cx
        ? 'left'
        : 'right'
      : toward[1] < cy
        ? 'top'
        : 'bottom')
  const upright = facing === 'left' || facing === 'right'
  const value =
    typeof at === 'number'
      ? upright
        ? b.y + at * b.height
        : b.x + at * b.width
      : upright
        ? at?.y
        : at?.x
  const [low, high] = upright ? [b.y, b.bottom] : [b.x, b.right]
  if (
    (typeof at === 'number' && (at < 0 || at > 1)) ||
    !Number.isFinite(value) ||
    value < low ||
    value > high
  ) {
    throw new Error(
      `${name} is a fraction 0–1 along the ${facing} side of ${shape.id} or { ${upright ? 'y' : 'x'} } from ${Math.round(low)} to ${Math.round(high)}, not ${JSON.stringify(at)}`
    )
  }
  const point = upright
    ? [facing === 'left' ? b.x - gap : b.right + gap, value]
    : [value, facing === 'top' ? b.y - gap : b.bottom + gap]
  return { point, axis: upright ? 1 : 0 }
}

/**
 * An arrow from `from` to `to` (element ids or [x, y]), drawn only with horizontal and vertical
 * segments: straight through the span two ends share, else the elbow (one bend, at most two)
 * that keeps clear of `elements`. `route` prefers straight, hv (leave horizontally, arrive
 * vertically) or vh; `via` lists corner points; `points` gives the whole path (absolute), still
 * binding its ends; only `allowDiagonal: true` draws a slanted line. Ends sit `gap` units off
 * the outline (default 4), with Excalidraw's focus.
 */
export function makeArrow(spec, lookup, { random = Math.random, elements = [] } = {}) {
  oneOf('route', spec.route, ROUTES)
  oneOf('head', spec.head, ARROW_HEADS)
  oneOf('heads', spec.heads, ['end', 'both', 'none'])
  const roleName =
    oneOf('role', spec.role, Object.keys(ARROW_ROLES)) ?? (spec.color === 'loss' ? 'loss' : 'data')
  const look = ARROW_ROLES[roleName]
  const gap = spec.gap ?? 4
  const start = typeof spec.from === 'string' ? target(lookup(spec.from)) : null
  const end = typeof spec.to === 'string' ? target(lookup(spec.to)) : null
  const headSize = spec.headSize ?? look.headSize ?? FIGURE_HEAD_SIZE
  // Why: connectors run only horizontally and vertically; a diagonal must be asked for.
  const curved = spec.curve !== undefined && spec.curve !== null && spec.curve !== 0
  const diagonal = spec.allowDiagonal === true || curved
  // Why pinned ends stay bound: fromAt / toAt choose where an end meets its shape, and the
  // route runs from that point while the binding keeps the arrow on the shape when it moves.
  const centre = (shape, point) => (shape ? centerOf(shape) : point)
  const pinStart =
    start && (spec.fromAt !== undefined || spec.fromSide !== undefined)
      ? pinnedEnd(start, centre(end, spec.to), spec.fromAt ?? 0.5, spec.fromSide, gap, 'fromAt')
      : null
  const pinEnd =
    end && (spec.toAt !== undefined || spec.toSide !== undefined)
      ? pinnedEnd(end, centre(start, spec.from), spec.toAt ?? 0.5, spec.toSide, gap, 'toAt')
      : null
  let absolute
  if (curved) {
    absolute = curvePath(spec, start, end, gap)
  } else if (spec.points) {
    absolute = spec.points.map(([px, py]) => [px, py])
  } else if (diagonal || spec.via?.length) {
    absolute = handPath(spec, start, end, gap)
  } else {
    absolute = routeArrow({
      start: pinStart ? null : start,
      end: pinEnd ? null : end,
      from: pinStart?.point ?? spec.from,
      to: pinEnd?.point ?? spec.to,
      fromAxis: pinStart?.axis ?? spec.fromAxis,
      toAxis: pinEnd?.axis ?? spec.toAxis,
      gap,
      elements,
      skip: spec.id,
      route: spec.route,
      headSize,
      ends: [start, end].filter(Boolean)
    })
  }
  if (!diagonal) {
    absolute = orthogonalize(absolute, {
      keepLast: (spec.toAxis !== undefined && spec.toAxis !== null) || Boolean(pinEnd)
    })
  }
  const head = spec.head === 'chevron' || spec.head === 'none' ? null : (spec.head ?? 'triangle')
  const startHead = spec.heads === 'both' ? head : null
  const endHead = spec.heads === 'none' ? null : head
  const anchors = { start: absolute[1], end: absolute.at(-2) }
  if (headSize && endHead && !curved) {
    absolute = sizedHead(absolute, headSize, false)
  }
  if (headSize && startHead && !curved) {
    absolute = sizedHead(absolute, headSize, true)
  }
  // Why loss-link: the canvas's Loss line role writes the same, so both read as a loss's link.
  const role = roleName === 'loss' ? 'loss-link' : null
  const ink = spec.color ?? look.color
  const dashed = spec.dashed ?? (spec.dotted ? false : look.dashed)
  const [x0, y0] = absolute[0]
  const points = absolute.map(([px, py]) => [px - x0, py - y0])
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const binding = (shape, adjacent, edge) =>
    shape && !shape.unbindable
      ? { elementId: shape.id, focus: focusDistance(shape, adjacent, edge), gap: Math.max(1, gap) }
      : null
  return figureElement(
    'arrow',
    {
      id: spec.id,
      x: x0,
      y: y0,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points,
      strokeStyle: dashed ? 'dashed' : spec.dotted ? 'dotted' : 'solid',
      strokeColor: inkColor(styleOf(spec), ink, 'line'),
      strokeWidth: spec.strokeWidth ?? look.strokeWidth ?? FIGURE_LINE_WIDTH,
      ...(role || roleName !== 'data' || diagonal
        ? {
            customData: {
              ...(role ? { asterRole: role } : roleName === 'data' ? {} : { asterLine: roleName }),
              ...(curved ? { asterCurve: true } : diagonal ? { asterDiagonal: true } : {})
            }
          }
        : {}),
      startArrowhead: startHead,
      ...(curved ? { roundness: { type: 2 } } : {}),
      endArrowhead: endHead,
      startBinding: binding(start, anchors.start, absolute[0]),
      endBinding: binding(end, anchors.end, absolute.at(-1)),
      frameId: spec.frame ?? null
    },
    random
  )
}
