// The shared drawing of the "drawn" glyph family (tensors, feature planes, token maps, voxels,
// filmstrips, pyramids, tiled matrices, skip arcs, pills): one oblique view for the whole figure
// (front faces true shape, depth receding up and to the right, as the reference figures draw
// cuboids), face shading from one base colour, colour ramps, and native elements: every face,
// cell and line is an Excalidraw shape the person can select and recolour.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { figureElement } from './research-figures-model.mjs'
import { makePolyline, makeDot } from './research-figures-shapes.mjs'
import { makeText } from './research-figures-draw.mjs'
import { hexToOklch, oklchToHex } from './research-figures-color-space.mjs'
import { FIGURE_LINE_WIDTH, styleColor } from './research-figures-style.mjs'
import { hasInlineMath, labelLines, makeLines } from './research-figures-type.mjs'
import { decodePng } from './research-figures-png.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { photoKind } from './research-figures-photos.mjs'
import { PHOTO_MOSAICS } from './research-figures-photo-mosaics.mjs'

/** The family's one view: depth recedes at 35° up and to the right, foreshortened to half. */
export const DRAWN_VIEW = { angle: 35, depth: 0.5 }
/** How much lighter a top face and darker a side face print than the front (OKLCH lightness). */
export const FACE_SHADE = { top: 0.05, side: -0.08 }

const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** The page offset of `depth` units of depth in the view: [dx, dy] (dy negative: up). */
export function depthOffset(depth, view = {}) {
  const angle = ((view.angle ?? DRAWN_VIEW.angle) * Math.PI) / 180
  const scale = view.depth ?? DRAWN_VIEW.depth
  return [depth * scale * Math.cos(angle), -depth * scale * Math.sin(angle)]
}

/** A hex colour lighter (dL > 0) or darker in OKLCH, its hue kept. */
export function shade(hex, dL) {
  const color = isHex(hex) ? hexToOklch(hex) : null
  if (!color) {
    return hex
  }
  return oklchToHex({ ...color, L: Math.min(0.985, Math.max(0.05, color.L + dL)) })
}

/** `count` colours from `from` to `to`, evenly in OKLCH (hue the short way round). */
export function ramp(from, to, count) {
  const a = hexToOklch(from)
  const b = hexToOklch(to)
  if (!a || !b || count < 2) {
    return Array.from({ length: count }, () => from)
  }
  let dh = (b.h ?? 0) - (a.h ?? 0)
  dh -= 360 * Math.round(dh / 360)
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1)
    return oklchToHex({
      L: a.L + (b.L - a.L) * t,
      C: a.C + (b.C - a.C) * t,
      h: (a.h ?? 0) + dh * t
    })
  })
}

/**
 * A role's tones: fill (pale), strong (mid), ink (dark, for lines and words) and solid (a
 * saturated tone for a dark face). A #hex gets the same four from its own hue.
 */
export function roleTones(style, role) {
  if (isHex(role)) {
    const base = hexToOklch(role)
    const at = (L, C) => oklchToHex({ L, C: Math.min(base.C, C), h: base.h })
    return {
      fill: base.L > 0.8 ? role : at(0.9, 0.06),
      strong: at(0.72, 0.12),
      ink: at(0.42, 0.14),
      solid: base.L <= 0.8 ? role : at(0.6, 0.15)
    }
  }
  const color = styleColor(style, role)
  let strong = null
  try {
    strong = styleColor(style, `${role}-strong`).fill
  } catch {
    strong = shade(color.fill, -0.18)
  }
  return {
    fill: color.fill,
    strong,
    ink: color.ink ?? style.ink,
    solid: color.solid ?? strong
  }
}

/**
 * The element makers of one glyph: every item gets the glyph's frame and group, and the marks
 * the design layer reads (asterShade: a face's lightness step kept under any repaint;
 * asterMeaning: a colour that encodes something, kept as drawn).
 */
export function drawnParts(spec, style) {
  const group = `${spec.id}-glyph`
  const base = { frame: spec.frame, groupIds: [group], style }
  const marks = (options) => ({
    ...(options.fine ? { asterFine: true } : {}),
    ...(options.shade !== undefined ? { asterShade: options.shade } : {}),
    ...(options.meaning ? { asterMeaning: options.meaning } : {})
  })
  const poly = (id, points, options = {}) =>
    makePolyline({
      ...base,
      id,
      points,
      closed: options.closed ?? true,
      fill: options.fill ?? 'transparent',
      stroke: options.stroke ?? style.line,
      strokeWidth: options.width ?? FIGURE_LINE_WIDTH,
      dashed: options.dashed,
      dotted: options.dotted,
      ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
      customData: marks(options)
    })
  const line = (id, points, options = {}) => poly(id, points, { ...options, closed: false })
  const rect = (id, x, y, w, h, options = {}) =>
    figureElement('rectangle', {
      id,
      x,
      y,
      width: w,
      height: h,
      strokeColor: options.stroke ?? 'transparent',
      backgroundColor: options.fill ?? 'transparent',
      strokeWidth: options.width ?? FIGURE_LINE_WIDTH,
      strokeStyle: options.dashed ? 'dashed' : 'solid',
      roughness: 0,
      roundness: null,
      ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds: [group],
      customData: marks(options)
    })
  const oval = (id, cx, cy, w, h, options = {}) =>
    figureElement('ellipse', {
      id,
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      strokeColor: options.stroke ?? style.line,
      backgroundColor: options.fill ?? 'transparent',
      strokeWidth: options.width ?? FIGURE_LINE_WIDTH,
      roughness: 0,
      ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds: [group],
      customData: marks(options)
    })
  const dot = (id, cx, cy, r, color, options = {}) =>
    makeDot({ ...base, id, cx, cy, r, color, stroke: options.stroke }).map((element) => ({
      ...element,
      customData: { ...element.customData, ...marks(options) }
    }))
  /**
   * Words or TeX: `text` (`$…$` is math), placed by `x`/`cx`, `y`/`cy` like fig.text; size
   * defaults to the small size. Returns its elements and box.
   */
  const words = (id, text, place, options = {}) => {
    const size = options.size ?? style.smallSize
    const color = options.color
    const texty = hasInlineMath(text) || /[_^\\]/.test(String(text))
    if (!texty) {
      const elements = makeText({ ...base, ...place, id, text: String(text), size, color })
      for (const element of elements) {
        element.customData = { ...element.customData, ...marks(options) }
      }
      return { elements, ...boxOf(elements) }
    }
    const runs = hasInlineMath(text) ? String(text) : [{ tex: String(text) }]
    const made = makeLines(
      { ...base, ...place, id, size, color },
      labelLines(runs, size, undefined, style)
    )
    const elements = made.elements ?? made
    for (const element of elements) {
      element.customData = { ...element.customData, ...marks(options) }
    }
    return { elements, ...boxOf(elements) }
  }
  /** The invisible box that carries the glyph's id: what arrows bind to. */
  const holder = (box) =>
    figureElement('rectangle', {
      id: spec.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds: [group]
    })
  return { poly, line, rect, oval, dot, words, holder, group }
}

/** The bounding box of elements (or of points). */
export function boxOf(items) {
  const xs = []
  const ys = []
  for (const item of items) {
    if (Array.isArray(item)) {
      xs.push(item[0])
      ys.push(item[1])
    } else if (item.type) {
      // Why the element's own bounds: a line's points may run left of or above its x, y.
      const box = elementBounds(item)
      xs.push(box.x, box.right)
      ys.push(box.y, box.bottom)
    } else {
      xs.push(item.x, item.x + (item.width ?? 0))
      ys.push(item.y, item.y + (item.height ?? 0))
    }
  }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/**
 * The three visible faces of a box whose front face is x, y, w, h and whose depth runs `depth`
 * units into the page: front, top and right side, as corner lists (clockwise from top-left).
 */
export function cuboidFaces(x, y, w, h, depth, view) {
  const [dx, dy] = depthOffset(depth, view)
  return {
    front: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ],
    top: [
      [x, y],
      [x + dx, y + dy],
      [x + w + dx, y + dy],
      [x + w, y]
    ],
    side: [
      [x + w, y],
      [x + w + dx, y + dy],
      [x + w + dx, y + h + dy],
      [x + w, y + h]
    ],
    offset: [dx, dy]
  }
}

/**
 * The lines dividing a parallelogram (corners a, b, c, d in order) into `nu` × `nv` cells, as
 * two families: across (`nu` − 1 lines from a–b to d–c) and down (`nv` − 1 from a–d to b–c).
 */
export function faceGrid([a, b, c, d], nu, nv) {
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  const across = []
  const down = []
  for (let i = 1; i < nu; i += 1) {
    across.push([lerp(a, b, i / nu), lerp(d, c, i / nu)])
  }
  for (let j = 1; j < nv; j += 1) {
    down.push([lerp(a, d, j / nv), lerp(b, c, j / nv)])
  }
  return [across, down].filter((family) => family.length)
}

/**
 * One path through a family of parallel grid lines, back and forth: each turn runs along the
 * face's own edge, so a face's grid is two elements that print as separate lines.
 */
export function gridPath(segments) {
  const path = []
  for (const [index, [p, q]] of segments.entries()) {
    const [start, end] = index % 2 ? [q, p] : [p, q]
    path.push(start, end)
  }
  return path
}

/** A face's grid as line elements, one per family (`<id>-u`, `<id>-v`). */
export function gridLines(parts, id, corners, nu, nv, options) {
  return faceGrid(corners, nu, nv).map((family, index) =>
    parts.line(index ? `${id}-v` : `${id}-u`, gridPath(family), options)
  )
}

const cache = new Map()

/**
 * A stock photo pixelated at rows × cols from its 8 × 8 mosaic (each cell the mean of the mosaic
 * cells it covers), or null for a kind without one.
 */
export function pixelateKind(kind, rows, cols) {
  const name = photoKind(kind)
  const mosaic = name ? PHOTO_MOSAICS[name] : null
  if (!mosaic) {
    return null
  }
  const cell = (r, c) => {
    const at = (r * 8 + c) * 6
    return [0, 2, 4].map((offset) =>
      Number.parseInt(mosaic.slice(at + offset, at + offset + 2), 16)
    )
  }
  const hex = (value) => Math.round(value).toString(16).padStart(2, '0')
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const sum = [0, 0, 0]
      let weight = 0
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          // Why overlap: a cell takes every mosaic cell it covers, in proportion.
          const oy = Math.max(0, Math.min((r + 1) / rows, (y + 1) / 8) - Math.max(r / rows, y / 8))
          const ox = Math.max(0, Math.min((c + 1) / cols, (x + 1) / 8) - Math.max(c / cols, x / 8))
          const share = ox * oy
          if (share > 0) {
            cell(y, x).forEach((value, channel) => {
              sum[channel] += value * share
            })
            weight += share
          }
        }
      }
      return `#${sum.map((value) => hex(value / weight)).join('')}`
    })
  )
}

/**
 * The mean colour of each of rows × cols cells of a project PNG (a picture pixelated per scale,
 * as VAR draws its token maps), or null when the file is not a PNG the kit can read.
 */
export function pixelate(project, src, rows, cols) {
  const file = path.isAbsolute(src) ? src : path.join(project, src)
  if (!cache.has(file)) {
    let image = null
    try {
      image = decodePng(readFileSync(file))
    } catch {
      image = null
    }
    cache.set(file, image)
  }
  const image = cache.get(file)
  if (!image) {
    return null
  }
  // Why a square crop: a token map is square; the picture's centre square is what it shows.
  const side = Math.min(image.width, image.height)
  const x0 = Math.floor((image.width - side) / 2)
  const y0 = Math.floor((image.height - side) / 2)
  const step = Math.max(1, Math.floor(side / Math.max(rows, cols) / 6))
  const hex = (value) => Math.round(value).toString(16).padStart(2, '0')
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const sum = [0, 0, 0]
      let weight = 0
      const ya = y0 + Math.floor((r * side) / rows)
      const yb = y0 + Math.floor(((r + 1) * side) / rows)
      const xa = x0 + Math.floor((c * side) / cols)
      const xb = x0 + Math.floor(((c + 1) * side) / cols)
      for (let y = ya; y < yb; y += step) {
        for (let x = xa; x < xb; x += step) {
          const [red, green, blue, alpha] = image.at(x, y)
          // Why over white: a transparent background prints as the page.
          const a = alpha / 255
          sum[0] += red * a + 255 * (1 - a)
          sum[1] += green * a + 255 * (1 - a)
          sum[2] += blue * a + 255 * (1 - a)
          weight += 1
        }
      }
      return weight ? `#${sum.map((value) => hex(value / weight)).join('')}` : '#ffffff'
    })
  )
}

/** Tags elements a nested kit call drew (an image, a curve) as part of this glyph. */
export function adopt(core, owner, ids) {
  const wanted = new Set(ids)
  for (const element of core.elements) {
    const kit = element.customData?.asterKit
    if (wanted.has(element.id) || wanted.has(kit)) {
      element.customData = { ...element.customData, asterKit: owner }
    }
  }
}
