// What a flow glyph draws on top of its densities: many thin translucent paths with one
// highlighted example (dots at chosen t), velocity arrows (u_t(x) against u_t^θ(x) with the error
// between them, or the velocity along the example), a quiver of the velocity field, pointers to
// pictures at the ends, and labels. Every helper returns elements in scene units; pure.
import { simplifyPath } from './research-figures-science-math.mjs'
import { pointAt } from './research-figures-interp.mjs'
import {
  dotPart,
  glyphInk,
  headPart,
  labelPart,
  pathPart
} from './research-figures-science-parts.mjs'
import { densityRamp, inside } from './research-figures-contours.mjs'
import { distExtent } from './research-figures-dist.mjs'
import { styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100

/** How opaque one of n thin paths is: many paths overlap into a density of lines. */
export const pathOpacity = (n) => (n >= 60 ? 16 : n >= 30 ? 24 : n >= 15 ? 36 : 55)

/**
 * Thin translucent paths (scene points), the highlighted one last and bold. `paint`: { color,
 * width, opacity, jagged } for the thin ones, { heroColor, heroWidth } for the example.
 */
export function pathParts(spec, paths, highlight, paint = {}) {
  const style = styleOf(spec)
  const thin = paint.color ? glyphInk(style, paint.color) : '#2f2b28'
  const elements = []
  paths.forEach((points, index) => {
    if (index === highlight) {
      return
    }
    elements.push(
      pathPart(
        spec,
        `${paint.prefix ?? 'path'}${index}`,
        simplifyPath(points, paint.jagged ? 0.1 : 0.22),
        {
          stroke: thin,
          width: paint.width ?? 1,
          opacity: paint.opacity ?? pathOpacity(paths.length)
        }
      )
    )
  })
  if (highlight !== null && highlight !== undefined && paths[highlight]) {
    elements.push(
      pathPart(
        spec,
        `${paint.prefix ?? 'path'}${highlight}`,
        simplifyPath(paths[highlight], 0.12),
        {
          stroke: paint.heroColor ? glyphInk(style, paint.heroColor) : style.ink,
          width: paint.heroWidth ?? 2.4
        }
      )
    )
  }
  return elements
}

/** An arrow from `from` to `to` (scene units): a line and a filled head, `width` thick. */
export function arrowParts(spec, suffix, from, to, { color, width = 1.4, head = 6, dashed } = {}) {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
  const length = Math.hypot(dx, dy) || 1
  const base = [to[0] - (dx / length) * head * 0.8, to[1] - (dy / length) * head * 0.8]
  return [
    pathPart(spec, suffix, [from, base], { stroke: color, width, dashed }),
    headPart(spec, `${suffix}-head`, from, to, { color, length: head, width: head * 0.72 })
  ]
}

/**
 * A label beside a point: `side` 'above' | 'below' | 'left' | 'right' (or a unit vector the
 * label goes toward), `gap` units clear of it, so it never sits on the arrow it names.
 */
export function labelBeside(spec, suffix, text, point, side, options = {}) {
  const { size, gap = 5, color } = options
  const named =
    typeof side === 'string'
      ? side
      : Math.abs(side[0]) >= Math.abs(side[1]) * 0.6
        ? side[0] >= 0
          ? 'right'
          : 'left'
        : side[1] < 0
          ? 'above'
          : 'below'
  const lean = options.lean ?? 0
  const horizontal =
    lean < 0
      ? { x: point[0] + 4, align: 'right' }
      : lean > 0
        ? { x: point[0] - 4 }
        : { cx: point[0] }
  const where = {
    above: { ...horizontal, y: point[1] - gap - size * 1.3 },
    below: { ...horizontal, y: point[1] + gap },
    left: { x: point[0] - gap, cy: point[1], align: 'right' },
    right: { x: point[0] + gap, cy: point[1] }
  }[named]
  return labelPart(spec, suffix, text, where, { size, color })
}

const unit = ([x, y]) => {
  const n = Math.hypot(x, y) || 1
  return [x / n, y / n]
}
const rotate = ([x, y], degrees) => {
  const a = (degrees * Math.PI) / 180
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

/**
 * Velocity at a scene point: one arrow (u_t^θ along the example path), or with `compare` the
 * true u_t(x) and a learned u_t^θ(x) a little off it, a dotted line between their tips (the
 * regression error) and x named. `v` is the velocity in scene units per unit t.
 */
export function velocityParts(spec, point, v, options) {
  const style = styleOf(spec)
  const { length, size, compare, labels = {}, color } = options
  const ink = color ? glyphInk(style, color) : style.ink
  const dir = unit(v)
  const elements = []
  const anchors = { x: point.map(r2) }
  const tipOf = (d, k = 1) => [point[0] + d[0] * length * k, point[1] + d[1] * length * k]
  if (!compare) {
    const tip = tipOf(dir)
    elements.push(...arrowParts(spec, 'velocity', point, tip, { color: ink, width: 1.3 }))
    if (labels.model !== false) {
      // Why counted: the label goes on the side of the tip the example path does not run through.
      const near = (dy) =>
        (options.avoid ?? []).filter(
          ([px, py]) =>
            Math.abs(px - tip[0]) < size * 2.2 &&
            (py - tip[1]) * dy > 0 &&
            Math.abs(py - tip[1]) < size * 1.6
        ).length
      const side = near(-1) <= near(1) ? 'above' : 'below'
      elements.push(
        ...labelBeside(spec, 'velocity-label', labels.model ?? '$u_t^\\theta(x)$', tip, side, {
          size,
          gap: 3
        })
      )
    }
    anchors['velocity.tip'] = tip.map(r2)
    return { elements, anchors }
  }
  // Why these turns: the true velocity and the model's sit on either side of the flow, apart enough to read.
  const truth = unit(rotate(dir, 30))
  const model = unit(rotate(dir, -32))
  const [tipTrue, tipModel] = [tipOf(truth), tipOf(model, 1.08)]
  const error = glyphInk(style, options.errorColor ?? 'red')
  elements.push(
    pathPart(spec, 'error', [tipTrue, tipModel], { stroke: error, width: 1.3, dotted: true }),
    ...arrowParts(spec, 'velocity-true', point, tipTrue, { color: ink, width: 1.2 }),
    ...arrowParts(spec, 'velocity', point, tipModel, { color: ink, width: 1.2 })
  )
  if (labels.truth !== false) {
    elements.push(
      ...labelBeside(spec, 'velocity-true-label', labels.truth ?? '$u_t(x)$', tipTrue, 'below', {
        size,
        gap: 5,
        lean: options.lean
      })
    )
  }
  if (labels.model !== false) {
    elements.push(
      ...labelBeside(
        spec,
        'velocity-label',
        labels.model ?? '$u_t^\\theta(x)$',
        tipModel,
        'above',
        { size, gap: 7, lean: options.lean }
      )
    )
  }
  if (labels.x !== false) {
    elements.push(
      ...labelBeside(spec, 'x-label', labels.x ?? '$x$', point, 'left', { size, gap: 4 })
    )
  }
  anchors['velocity.tip'] = tipModel.map(r2)
  anchors['velocity.true'] = tipTrue.map(r2)
  return { elements, anchors }
}

/**
 * A quiver: short arrows of `field(scenePoint)` (scene units per t) on a grid over `box`, the
 * longest filling 80% of a cell, under 15% left out; one element per arrow (shaft and head).
 */
export function quiverParts(spec, box, field, { cols = 9, color = 'mid' } = {}) {
  const style = styleOf(spec)
  const ink = glyphInk(style, color)
  const rows = Math.max(2, Math.round((cols * box.h) / box.w))
  const cell = Math.min(box.w / cols, box.h / rows)
  const arrows = []
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const at = [box.x + (i + 0.5) * (box.w / cols), box.y + (j + 0.5) * (box.h / rows)]
      const v = field(at)
      arrows.push({ at, v, size: Math.hypot(v[0], v[1]) })
    }
  }
  const top = Math.max(...arrows.map((arrow) => arrow.size)) || 1
  return arrows
    .filter((arrow) => arrow.size >= 0.15 * top)
    .map(({ at, v, size }, index) => {
      const length = (0.8 * cell * size) / top
      const d = unit(v)
      const tail = [at[0] - (d[0] * length) / 2, at[1] - (d[1] * length) / 2]
      const tip = [at[0] + (d[0] * length) / 2, at[1] + (d[1] * length) / 2]
      const head = Math.min(4, length * 0.4)
      const wing = (sign) => {
        const w = rotate(d, sign * 150)
        return [tip[0] + w[0] * head, tip[1] + w[1] * head]
      }
      return pathPart(spec, `quiver${index}`, [tail, tip, wing(1), tip, wing(-1)], {
        stroke: ink,
        width: 0.9
      })
    })
}

/** Dots on a scene path at times `ts` (the example's x_t), ink with a white rim. */
export function pathDots(spec, path, ts, { r = 2.3, color, prefix = 'dot' } = {}) {
  const style = styleOf(spec)
  return ts.map((t, k) =>
    dotPart(spec, `${prefix}${k}`, pointAt(path, t), {
      r,
      fill: color ? glyphInk(style, color) : style.ink,
      rim: '#ffffff',
      rimWidth: 0.6
    })
  )
}

/**
 * Where things already are, on a grid of `cell`-unit squares: density outlines, label boxes and
 * paths mark the cells they cover, so a picture can go where it hides the least.
 */
export function occupancy(cell = 4) {
  const cells = new Set()
  const mark = (i, j) => cells.add(`${i},${j}`)
  const index = (value) => Math.floor(value / cell)
  return {
    outline(points) {
      const xs = points.map((p) => p[0])
      const ys = points.map((p) => p[1])
      for (let j = index(Math.min(...ys)); j <= index(Math.max(...ys)); j += 1) {
        for (let i = index(Math.min(...xs)); i <= index(Math.max(...xs)); i += 1) {
          if (inside([(i + 0.5) * cell, (j + 0.5) * cell], points)) {
            mark(i, j)
          }
        }
      }
    },
    rect({ x, y, width, height }) {
      for (let j = index(y); j <= index(y + height); j += 1) {
        for (let i = index(x); i <= index(x + width); i += 1) {
          mark(i, j)
        }
      }
    },
    path(points) {
      for (let k = 1; k < points.length; k += 1) {
        const [a, b] = [points[k - 1], points[k]]
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell / 2)) + 1
        for (let s = 0; s <= steps; s += 1) {
          mark(index(a[0] + ((b[0] - a[0]) * s) / steps), index(a[1] + ((b[1] - a[1]) * s) / steps))
        }
      }
    },
    count({ x, y, width, height }) {
      let total = 0
      for (let j = index(y); j <= index(y + height); j += 1) {
        for (let i = index(x); i <= index(x + width); i += 1) {
          total += cells.has(`${i},${j}`) ? 1 : 0
        }
      }
      return total
    }
  }
}

/** Which edge of a square a ray from its centre along d leaves by. */
const exitSide = ([dx, dy]) =>
  Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'below' : 'above') : dx > 0 ? 'right' : 'left'

/**
 * Where a `side`-unit picture goes inside `box`, with its label (`label` { w, h }, or null) below
 * or beside it: the spot that hides the fewest occupied cells, keeps the label off the pointer,
 * sits under (and `outward` of) its point, and is nearest it. Returns { x, y, labelSide }.
 */
export function placePicture(target, box, side, label, occ, outward = 0) {
  const step = Math.max(3, side / 5)
  let best = null
  for (let y = box.y + 2; y <= box.y + box.h - side - 2 + 1e-6; y += step) {
    for (let x = box.x + 2; x <= box.x + box.w - side - 2 + 1e-6; x += step) {
      const [cx, cy] = [x + side / 2, y + side / 2]
      const exit = exitSide([target[0] - cx, target[1] - cy])
      for (const labelSide of label ? ['below', 'right', 'left'] : [null]) {
        const rect = label ? labelRect(labelSide, x, y, side, label) : null
        if (
          rect &&
          (rect.x < box.x ||
            rect.y + rect.height > box.y + box.h ||
            rect.x + rect.width > box.x + box.w)
        ) {
          continue
        }
        const covered =
          occ.count({ x, y, width: side, height: side }) + (rect ? occ.count(rect) : 0)
        const gap = Math.max(
          Math.abs(target[0] - cx) - side / 2,
          Math.abs(target[1] - cy) - side / 2
        )
        // Why outward: X_0 sits on the far side of the noise, X_1 past the data, never between them.
        const wrongSide = outward && (cx - target[0]) * outward < -side * 0.25 ? 200 : 0
        // Why below: a thumbnail under its point reads as the sample it shows, the pointer rising to it.
        const above = cy < target[1] ? 150 : 0
        const score =
          covered * 60 +
          Math.hypot(target[0] - cx, target[1] - cy) +
          (gap < 14 ? 400 : 0) +
          wrongSide +
          above +
          (labelSide === exit ? 300 : 0) +
          (labelSide && labelSide !== 'below' ? 15 : 0)
        if (!best || score < best.score) {
          best = { x, y, labelSide, score }
        }
      }
    }
  }
  return best ?? { x: box.x + 2, y: box.y + box.h - side - 2, labelSide: label ? 'right' : null }
}

function labelRect(labelSide, x, y, side, { w, h }) {
  return labelSide === 'below'
    ? { x: x + side / 2 - w / 2, y: y + side + 2, width: w, height: h }
    : labelSide === 'right'
      ? { x: x + side + 3, y: y + side / 2 - h / 2, width: w, height: h }
      : { x: x - 3 - w, y: y + side / 2 - h / 2, width: w, height: h }
}

/** A picture's slot at (x, y), a pointer from it to `target`, a dot there and its label. */
export function pictureSlot(spec, key, target, { x, y, side, labelSide }, { label, labelSize }) {
  const style = styleOf(spec)
  const slot = { x: r2(x), y: r2(y), w: side, h: side }
  const centre = [x + side / 2, y + side / 2]
  const d = unit([target[0] - centre[0], target[1] - centre[1]])
  // Where the line from the centre toward the target leaves the square.
  const reach = side / 2 / Math.max(Math.abs(d[0]), Math.abs(d[1]), 1e-6)
  const start = [centre[0] + d[0] * (reach + 2), centre[1] + d[1] * (reach + 2)]
  const end = [target[0] - d[0] * 3.2, target[1] - d[1] * 3.2]
  const elements = []
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) > 6) {
    elements.push(
      ...arrowParts(spec, `${key}-pointer`, start, end, { color: style.ink, width: 1, head: 5 })
    )
  }
  elements.push(
    dotPart(spec, `${key}-point`, target, {
      r: 2.2,
      fill: style.ink,
      rim: '#ffffff',
      rimWidth: 0.6
    })
  )
  if (label) {
    const where = {
      below: { cx: x + side / 2, y: y + side + 2 },
      right: { x: x + side + 3, cy: y + side / 2 },
      left: { x: x - 3, cy: y + side / 2, align: 'right' }
    }[labelSide ?? 'below']
    elements.push(...labelPart(spec, `${key}-label`, label, where, { size: labelSize }))
  }
  return { slot, elements }
}

/** The times p_t is drawn at: `snapshots` (or older `t` / `steps`), each in [0, 1]. */
export function snapshotsOption(owner, spec, fallback) {
  const steps = spec.steps
  const times =
    spec.snapshots ??
    spec.t ??
    (steps ? Array.from({ length: steps }, (_, k) => k / (steps - 1)) : fallback)
  if (
    !Array.isArray(times) ||
    !times.length ||
    !times.every((t) => typeof t === 'number' && t >= 0 && t <= 1)
  ) {
    throw new Error(
      `${owner}: snapshots must be times between 0 and 1 like [0, 0.5, 1], not ${JSON.stringify(times)}`
    )
  }
  return times.toSorted((a, b) => a - b)
}

/** Labels for the ends and p_t: true (p, q, p_t), false, a list (one per snapshot) or { from, to, t }. */
export function labelFor(spec, k, times, defaults) {
  if (spec.labels === false) {
    return null
  }
  if (Array.isArray(spec.labels)) {
    return spec.labels[k] ?? null
  }
  const named = { ...defaults, ...(typeof spec.labels === 'object' ? spec.labels : {}) }
  const t = times[k]
  if (t === 0) {
    return named.from
  }
  if (t === 1) {
    return named.to
  }
  const inner = times.filter((value) => value > 0 && value < 1)
  // Why one p_t label: two or three unfilled snapshots read as one path; each named would crowd.
  return inner.length > 1 && inner[Math.floor((inner.length - 1) / 2)] !== t ? null : named.t
}

/** The colour behind the bands (a hole in the lowest band is painted with it). */
export function backgroundColor(spec, color) {
  if (typeof spec.background === 'string') {
    return spec.background
  }
  return spec.background ? densityRamp(styleOf(spec), color)(0.02) : '#ffffff'
}

/** The scene box a mixture's contours need (3 σ), inside `bound`. */
export function gridBox(scene, bound) {
  const e = distExtent(scene, 3.2)
  const x0 = Math.max(bound.x, e.x0)
  const y0 = Math.max(bound.y, e.y0)
  const x1 = Math.min(bound.x + bound.w, e.x1)
  const y1 = Math.min(bound.y + bound.h, e.y1)
  return { x: x0, y: y0, w: Math.max(4, x1 - x0), h: Math.max(4, y1 - y0) }
}
