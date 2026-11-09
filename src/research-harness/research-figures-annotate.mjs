// Marks for motivation and teaser figures, drawn as editable lines: a check or a cross (right or
// wrong, never emoji), a mini chart with minimal axes (bars, lines or dots from a short array), a
// brace with its label, a numbered step and a sub-caption. Pure, like the other makers.
import { figureElement } from './research-figures-model.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { makeText } from './research-figures-draw.mjs'
import { labelLines, makeLines, styleOf } from './research-figures-type.mjs'
import { SEMANTIC_COLORS, styleColor } from './research-figures-style.mjs'
import { contrast, hexToOklch, oklchToHex } from './research-figures-palette.mjs'
import { measureText } from './research-figures-text.mjs'
import { oneOf } from './research-figures-options.mjs'

/** The ink a check (`good`, green) or a cross (`bad`, red) takes unless a colour is named. */
export const MARK_INKS = { check: SEMANTIC_COLORS.good.ink, cross: SEMANTIC_COLORS.bad.ink }

const round = (value) => Math.round(value * 100) / 100

/**
 * The gray of a bar or a count: the style's heavy block gray, darkened until it stands apart
 * (2:1) from a white page, the style's panel and its panel tints.
 */
export function barGray(style) {
  const backdrops = ['#ffffff', style.panel, ...(style.panels ?? []).map((panel) => panel.fill)]
  const base = hexToOklch(style.strong) ?? { L: 0.8, C: 0, h: 0 }
  let gray = style.strong
  for (let L = base.L; L > 0.4; L -= 0.01) {
    gray = oklchToHex({ ...base, L })
    if (backdrops.every((backdrop) => contrast(gray, backdrop) >= 2)) {
      break
    }
  }
  return gray
}

/** An invisible box with the item's id, for arrows to bind to and lint to read as one item. */
export function anchorBox(id, box, kind, extra = {}) {
  return figureElement('rectangle', {
    id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    boundElements: [],
    customData: { asterGlyph: kind, ...extra }
  })
}

const inkOf = (style, color, fallback) =>
  color ? (color.startsWith('#') ? color : styleColor(style, color).ink) : fallback

/**
 * A check or a cross centred on (cx, cy), `size` units across: line art in green or red (or
 * `color`), heavier than a text stroke so it reads at print size; `circle` rings it, `disc`
 * puts a white disc under it for a photo.
 */
export function makeMark(spec) {
  const style = styleOf(spec)
  const kind = oneOf('kind', spec.kind ?? 'check', ['check', 'cross'])
  const size = spec.size ?? 16
  const { cx = 0, cy = 0, id } = spec
  const ink = inkOf(style, spec.color, MARK_INKS[kind])
  const width = spec.strokeWidth ?? Math.max(2, round(size / 7))
  const at = ([dx, dy]) => [round(cx + dx * size), round(cy + dy * size)]
  const strokes =
    kind === 'check'
      ? [
          [
            [-0.38, 0.02],
            [-0.12, 0.3],
            [0.4, -0.3]
          ]
        ]
      : [
          [
            [-0.3, -0.3],
            [0.3, 0.3]
          ],
          [
            [0.3, -0.3],
            [-0.3, 0.3]
          ]
        ]
  const elements = []
  if (spec.disc || spec.circle) {
    const r = size * 0.62
    elements.push(
      figureElement('ellipse', {
        id: `${id}-disc`,
        x: round(cx - r),
        y: round(cy - r),
        width: round(2 * r),
        height: round(2 * r),
        strokeColor: spec.circle ? ink : 'transparent',
        backgroundColor: spec.disc ? '#ffffff' : 'transparent',
        strokeWidth: 1.5,
        frameId: spec.frame ?? null
      })
    )
  }
  strokes.forEach((points, index) => {
    elements.push(
      makePolyline({
        id: index ? `${id}-${index + 1}` : id,
        points: points.map(at),
        stroke: ink,
        strokeWidth: width,
        style,
        frame: spec.frame,
        customData: { asterMark: kind }
      })
    )
  })
  return elements
}

/** A number as papers print counts: 5.8B, 2.1B, 140M, 12K; strings stay as written. */
export function formatValue(value, format) {
  if (typeof format === 'function') {
    return String(format(value))
  }
  if (typeof value !== 'number') {
    return String(value)
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}

/**
 * A mini chart from a short array, in the figure's style: `kind` bar (the highlighted bar in
 * the accent, the others gray, value labels on top), line (one polyline per series, the
 * highlighted one in the accent, a label at its end) or scatter. Minimal axes: a baseline and
 * a left rule, no ticks or grid; `labels` under the bars or points, `yLabel` above the plot.
 */
export function makeChart(spec) {
  const style = styleOf(spec)
  const kind = oneOf('kind', spec.kind ?? 'bar', ['bar', 'line', 'scatter'])
  const { id, x = 0, y = 0, w = 132, h = 88 } = spec
  const size = spec.size ?? style.smallSize ?? 14
  const family = style.fontFamily
  const series = (spec.series ?? [{ values: spec.values ?? [], label: spec.label }]).map(
    (item, index) => ({ ...item, index })
  )
  const count = Math.max(0, ...series.map((item) => item.values.length))
  if (!count) {
    throw new Error('chart needs values: [..] or series: [{ values }]')
  }
  const highlight =
    spec.highlight === 'last'
      ? kind === 'bar' && series.length === 1
        ? count - 1
        : series.length - 1
      : spec.highlight
  const accent = styleColor(style, spec.color ?? 'accent')
  const accentFill = styleColor(style, `${spec.color ?? 'accent'}-strong`).fill
  // Why not the block grays: a bar must stand out from a white page and a tinted panel.
  const gray = { fill: barGray(style), ink: style.muted }
  const lineH = size * 1.25
  const labels = spec.labels ?? []
  const valueLabels = kind === 'bar' && spec.valueLabels !== false
  const top = (spec.yLabel ? lineH + 2 : 0) + (valueLabels ? lineH + 2 : 4)
  const bottom = labels.length ? lineH + 4 : 0
  const ends =
    kind === 'line'
      ? Math.max(
          0,
          ...series.map((item) =>
            item.label ? measureText(item.label, size, family).width + 6 : 0
          )
        )
      : 0
  const plot = { x: x + 2, y: y + top, w: w - 2 - ends, h: h - top - bottom }
  const all = series.flatMap((item) => item.values)
  const spread = Math.max(...all) - Math.min(...all) || 1
  const lo = spec.min ?? (kind === 'bar' ? Math.min(0, ...all) : Math.min(...all) - spread * 0.15)
  const hi = spec.max ?? Math.max(...all) + (kind === 'bar' ? 0 : spread * 0.15)
  const yOf = (value) => round(plot.y + plot.h - ((value - lo) / (hi - lo || 1)) * plot.h)
  const slot = plot.w / count
  const xOf = (index) =>
    kind === 'bar'
      ? plot.x + slot * (index + 0.5)
      : plot.x + 6 + (index * (plot.w - 12)) / Math.max(1, count - 1)
  const elements = [anchorBox(id, { x, y, width: w, height: h }, 'chart', { asterChart: kind })]
  const text = (suffix, value, where, color) =>
    makeText({
      id: `${id}-${suffix}`,
      text: value,
      size,
      color,
      style,
      frame: spec.frame,
      ...where
    })[0]
  const rule = (suffix, points) =>
    makePolyline({
      id: `${id}-${suffix}`,
      points,
      stroke: style.line,
      strokeWidth: 1.5,
      style,
      frame: spec.frame
    })
  if (spec.yLabel) {
    elements.push(text('ylabel', spec.yLabel, { x: plot.x, y }, style.muted))
  }
  if (kind === 'bar') {
    const groups = series.length
    const barW = Math.min(spec.barWidth ?? slot * 0.64, 40) / groups
    for (const item of series) {
      item.values.forEach((value, index) => {
        const on = groups === 1 ? index === highlight : item.index === highlight
        const left = xOf(index) - (barW * groups) / 2 + barW * item.index
        const top = Math.min(yOf(value), yOf(Math.max(lo, 0)))
        const fill = item.color ? styleColor(style, item.color).fill : on ? accentFill : gray.fill
        elements.push(
          figureElement('rectangle', {
            id: `${id}-b${groups === 1 ? index : `${item.index}-${index}`}`,
            x: round(left),
            y: top,
            width: round(barW - (groups > 1 ? 1 : 0)),
            height: round(Math.max(1, Math.abs(yOf(value) - yOf(Math.max(lo, 0))))),
            strokeColor: 'transparent',
            backgroundColor: fill,
            frameId: spec.frame ?? null,
            customData: { asterKit: id, asterBar: true }
          })
        )
        if (valueLabels && groups === 1) {
          const words = formatValue(value, spec.format)
          elements.push(
            text(
              `v${index}`,
              words,
              { cx: xOf(index), y: top - lineH - 1 },
              on ? accent.ink : style.ink
            )
          )
        }
      })
    }
  } else {
    for (const item of series) {
      const on = series.length === 1 || item.index === highlight || item.highlight
      const ink = item.color ? inkOf(style, item.color) : on ? accent.ink : style.muted
      const points = item.values.map((value, index) => [round(xOf(index)), yOf(value)])
      if (kind === 'line' && points.length > 1) {
        elements.push(
          makePolyline({
            id: `${id}-s${item.index}`,
            points,
            stroke: ink,
            strokeWidth: on ? 2.5 : 1.5,
            dashed: Boolean(item.dashed),
            style,
            frame: spec.frame
          })
        )
      }
      points.forEach(([px, py], index) => {
        const r = kind === 'scatter' ? 3.5 : 2.5
        elements.push(
          figureElement('ellipse', {
            id: `${id}-p${item.index}-${index}`,
            x: round(px - r),
            y: round(py - r),
            width: 2 * r,
            height: 2 * r,
            strokeColor: 'transparent',
            backgroundColor: ink,
            frameId: spec.frame ?? null
          })
        )
      })
      if (kind === 'line' && item.label) {
        const [px, py] = points.at(-1)
        elements.push(text(`l${item.index}`, item.label, { x: px + 6, cy: py }, ink))
      }
    }
  }
  if (spec.axis !== false) {
    const base = yOf(kind === 'bar' ? Math.max(lo, 0) : lo)
    elements.push(
      rule('xaxis', [
        [plot.x, base],
        [round(plot.x + plot.w), base]
      ]),
      rule('yaxis', [
        [plot.x, plot.y - 2],
        [plot.x, base]
      ])
    )
  }
  labels.forEach((label, index) => {
    const on = series.length === 1 && index === highlight && kind === 'bar'
    elements.push(
      text(
        `x${index}`,
        String(label),
        { cx: round(xOf(index)), y: round(plot.y + plot.h + 3) },
        on ? accent.ink : style.ink
      )
    )
  })
  return { elements, plot, width: w, height: h }
}

/** The run of a brace: its two ends and the direction it opens toward the label. */
function braceRun(box, side, gap) {
  switch (side) {
    case 'top':
      return { a: [box.x, box.y - gap], b: [box.right, box.y - gap], out: [0, -1] }
    case 'left':
      return { a: [box.x - gap, box.y], b: [box.x - gap, box.bottom], out: [-1, 0] }
    case 'right':
      return { a: [box.right + gap, box.y], b: [box.right + gap, box.bottom], out: [1, 0] }
    default:
      return { a: [box.x, box.bottom + gap], b: [box.right, box.bottom + gap], out: [0, 1] }
  }
}

/**
 * A brace along one side of `box` (bottom, top, left, right), opening toward its label:
 * `shape: 'curly'` (a smooth brace) or 'square' (a bracket with a centre tick).
 */
export function makeBrace(spec, box) {
  const style = styleOf(spec)
  const side = oneOf('side', spec.side ?? 'bottom', ['bottom', 'top', 'left', 'right']) ?? 'bottom'
  const shape = oneOf('shape', spec.shape ?? 'curly', ['curly', 'square'])
  const depth = spec.depth ?? 7
  const { a, b, out } = braceRun(box, side, spec.gap ?? 4)
  const along = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])]
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const at = (t, d) => [
    round(a[0] + along[0] * t + out[0] * d),
    round(a[1] + along[1] * t + out[1] * d)
  ]
  const mid = length / 2
  const curl = Math.min(depth, length / 6)
  // Why two halves: a smooth curve through the tip would loop; each half ends at the tip.
  const halves =
    shape === 'curly'
      ? [
          [at(0, 0), at(curl, depth), at(mid - curl, depth), at(mid, depth * 2)],
          [at(length, 0), at(length - curl, depth), at(mid + curl, depth), at(mid, depth * 2)]
        ]
      : [[at(0, 0), at(0, depth), at(length, depth), at(length, 0)]]
  const ink = inkOf(style, spec.color, style.line)
  const elements = halves.map((points, index) => {
    const line = makePolyline({
      id: index ? `${spec.id}-2` : spec.id,
      points,
      stroke: ink,
      strokeWidth: spec.strokeWidth ?? 1.5,
      style,
      frame: spec.frame,
      customData: { asterBrace: shape }
    })
    if (shape === 'curly') {
      line.roundness = { type: 2 }
    }
    return line
  })
  if (shape === 'square') {
    elements.push(
      makePolyline({
        id: `${spec.id}-tick`,
        points: [at(mid, depth), at(mid, depth * 2)],
        stroke: ink,
        strokeWidth: spec.strokeWidth ?? 1.5,
        style,
        frame: spec.frame
      })
    )
  }
  const tip = at(mid, depth * 2)
  if (spec.label !== undefined && spec.label !== '') {
    const size = spec.size ?? style.smallSize ?? 14
    const lines = labelLines(spec.label, size, undefined, style)
    const probe = makeLines({ id: 'probe', size, style }, lines)
    const width = probe.width ?? 0
    const height = probe.height ?? size * 1.25
    const where =
      side === 'bottom'
        ? { x: tip[0] - width / 2, y: tip[1] + 3 }
        : side === 'top'
          ? { x: tip[0] - width / 2, y: tip[1] - 3 - height }
          : side === 'left'
            ? { x: tip[0] - 5 - width, y: tip[1] - height / 2 }
            : { x: tip[0] + 5, y: tip[1] - height / 2 }
    elements.push(
      ...makeLines(
        {
          id: `${spec.id}-label`,
          size,
          color: spec.labelColor,
          style,
          frame: spec.frame,
          ...where
        },
        lines
      ).elements
    )
  }
  return elements
}

/**
 * A numbered step: a digit in a ring (line art, `color` accent by default) or, with `solid`, in
 * a filled disc with white figures. Binds: the id (the ring).
 */
export function makeStep(spec) {
  const style = styleOf(spec)
  const size = spec.size ?? 22
  const color = styleColor(style, spec.color ?? 'accent')
  const ink = spec.color === 'ink' ? style.ink : (color.ink ?? style.ink)
  const solid = Boolean(spec.solid)
  const { cx = 0, cy = 0 } = spec
  const ring = figureElement('ellipse', {
    id: spec.id,
    x: round(cx - size / 2),
    y: round(cy - size / 2),
    width: size,
    height: size,
    strokeColor: ink,
    backgroundColor: solid ? ink : '#ffffff',
    strokeWidth: 1.5,
    boundElements: [],
    frameId: spec.frame ?? null,
    customData: { asterStep: spec.n }
  })
  const [digit] = makeText({
    id: `${spec.id}-n`,
    text: String(spec.n ?? 1),
    size: spec.textSize ?? Math.max(14, Math.round(size * 0.64)),
    color: solid ? '#ffffff' : ink,
    cx,
    cy,
    style,
    frame: spec.frame
  })
  // Why grouped, not bound: Excalidraw grows an ellipse to fit bound text, and the ring must stay
  // small; grouped, the digit still moves with it.
  ring.groupIds = [`${spec.id}-step`]
  digit.groupIds = [`${spec.id}-step`]
  return [ring, digit]
}
