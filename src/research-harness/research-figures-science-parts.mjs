// The pieces every science glyph is drawn from: paths, closed outlines, dots and arrowheads as
// Excalidraw lines and ellipses in the glyph's group, an invisible anchor that carries the id
// (arrows bind to it, other glyphs read its distribution), labels, colour blends and checks.
import { figureElement } from './research-figures-model.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { hexToOklch, oklchToHex } from './research-figures-palette.mjs'
import { styleColor } from './research-figures-style.mjs'
import { labelLines, makeLines, styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100

/** What every part of a glyph shares: its frame and the `<id>-glyph` group. */
export const groupOf = (spec) => ({
  frame: spec.frame ?? null,
  groupIds: [...(spec.groupIds ?? []), `${spec.id}-glyph`]
})

/** A path (or a closed outline with `fill`) through scene points, rounded to 0.01 units. */
export function pathPart(spec, suffix, points, paint = {}) {
  const style = styleOf(spec)
  const element = makePolyline({
    id: `${spec.id}-${suffix}`,
    points: points.map(([x, y]) => [r2(x), r2(y)]),
    closed: Boolean(paint.closed),
    stroke: paint.stroke ?? 'transparent',
    fill: paint.closed ? (paint.fill ?? 'transparent') : undefined,
    strokeWidth: paint.width ?? 1,
    dashed: paint.dashed,
    dotted: paint.dotted,
    opacity: paint.opacity,
    style,
    ...groupOf(spec),
    // Why marked: a label over a contour band or a mesh face is meant, not a box label overflowing.
    customData: { asterGlyphPart: true }
  })
  // Why round joins: a contour or a path drawn in short runs must not show seams at print.
  element.roundness = null
  return element
}

/** A filled dot of radius r, with a thin rim (white by default) when `rim` is set. */
export function dotPart(
  spec,
  suffix,
  [cx, cy],
  { r = 2.2, fill, rim, rimWidth = 0.8, opacity } = {}
) {
  const { frame, groupIds } = groupOf(spec)
  return figureElement('ellipse', {
    id: `${spec.id}-${suffix}`,
    x: r2(cx - r),
    y: r2(cy - r),
    width: r2(2 * r),
    height: r2(2 * r),
    strokeColor: rim ?? fill,
    strokeWidth: rim ? rimWidth : 0.5,
    backgroundColor: fill,
    ...(opacity !== undefined ? { opacity } : {}),
    frameId: frame,
    groupIds,
    customData: { asterGlyphPart: true }
  })
}

/** A filled arrowhead at `tip`, pointing along `from → tip`: `length` long, `width` across. */
export function headPart(spec, suffix, from, tip, { length = 5, width = 4, color }) {
  const [dx, dy] = [tip[0] - from[0], tip[1] - from[1]]
  const norm = Math.hypot(dx, dy) || 1
  const [ux, uy] = [dx / norm, dy / norm]
  const base = [tip[0] - ux * length, tip[1] - uy * length]
  return pathPart(
    spec,
    suffix,
    [
      tip,
      [base[0] - (uy * width) / 2, base[1] + (ux * width) / 2],
      [base[0] + (uy * width) / 2, base[1] - (ux * width) / 2]
    ],
    { closed: true, fill: color, stroke: color, width: 0.5 }
  )
}

/** The invisible box with the glyph's id: arrows bind to it; `data` rides in its customData. */
export function anchorPart(spec, box, kind, data = {}) {
  const { frame, groupIds } = groupOf(spec)
  return figureElement('rectangle', {
    id: spec.id,
    x: r2(box.x),
    y: r2(box.y),
    width: r2(box.w),
    height: r2(box.h),
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    boundElements: [],
    frameId: frame,
    groupIds,
    customData: { asterGlyph: kind, asterScience: { kind, ...data } }
  })
}

/** A label (TeX between `$…$`, words otherwise) centred at cx with its top at y, or right-aligned. */
export function labelPart(spec, suffix, text, where, { size, color } = {}) {
  const style = styleOf(spec)
  const textSize = size ?? style.smallSize ?? 14
  const lines = labelLines(String(text), textSize, undefined, style)
  return makeLines(
    { id: `${spec.id}-${suffix}`, size: textSize, color, style, ...groupOf(spec), ...where },
    lines
  ).elements
}

/** Mixes two colours in OKLCH (hue taken from the one with chroma): a gray → accent ramp. */
export function blend(a, b, t) {
  const [p, q] = [hexToOklch(a), hexToOklch(b)]
  const s = Math.min(1, Math.max(0, t))
  // Why the more coloured end's hue: a pale tint of teal must not take a gray's hue 0 (pink).
  const h = q.C >= p.C ? q.h : p.h
  return oklchToHex({ L: p.L + (q.L - p.L) * s, C: p.C + (q.C - p.C) * s, h })
}

/** Where a time ramp starts: the gray of noise, early frames and the start of a path. */
export const TIME_START = '#a0a0a0'

/**
 * The colour of time t (0–1) along a path, a track or a trail, and on a timebar: gray at the
 * start to the colour's ink at the end, one rule for every glyph so a timebar keys them all.
 */
export function timeColor(style, color, t, start = TIME_START) {
  return blend(start, glyphInk(style, color), 0.12 + 0.88 * Math.min(1, Math.max(0, t)))
}

/** The colour a glyph is drawn in: a role name's ink (neutral names keep their gray) or #hex. */
export function glyphInk(style, name) {
  if (name.startsWith('#')) {
    return name
  }
  if (['ink', 'line', 'muted', 'mid', 'strong'].includes(name)) {
    return name === 'ink'
      ? style.ink
      : name === 'line'
        ? style.line
        : name === 'muted'
          ? style.muted
          : styleColor(style, name).fill
  }
  return styleColor(style, name).ink
}

/** The saturated marker colour of a role (accent-solid) or the ink of a neutral. */
export function glyphSolid(style, name) {
  if (name.startsWith('#') || ['ink', 'line', 'muted', 'mid', 'strong'].includes(name)) {
    return glyphInk(style, name)
  }
  const color = styleColor(style, name)
  return color.solid ?? color.ink
}

/** A whole number in [min, max], or the default; anything else throws naming the option. */
export function countOption(owner, name, value, fallback, [min, max]) {
  if (value === undefined) {
    return fallback
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${owner}: ${name} must be a whole number from ${min} to ${max}, not ${JSON.stringify(value)}`
    )
  }
  return value
}

/** A finite number, or the default. */
export function numberOption(owner, name, value, fallback) {
  if (value === undefined) {
    return fallback
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${owner}: ${name} must be a finite number, not ${JSON.stringify(value)}`)
  }
  return value
}

/** The glyph's box: x, y, w, h (defaults), each a finite number and the sizes positive. */
export function boxOption(owner, spec, [w, h]) {
  const box = {
    x: numberOption(owner, 'x', spec.x, 0),
    y: numberOption(owner, 'y', spec.y, 0),
    w: numberOption(owner, 'w', spec.w, w),
    h: numberOption(owner, 'h', spec.h, h)
  }
  if (box.w <= 0 || box.h <= 0) {
    throw new Error(`${owner}: w and h must be positive, not ${box.w} × ${box.h}`)
  }
  return box
}
