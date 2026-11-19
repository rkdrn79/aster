// `flow` with layout 'planes': p_t on planes standing one behind another along a time axis, seen
// at an angle (a parallel oblique view: each plane a slanted card, the time axis running right),
// with the sample paths running from plane to plane. Painted from t = 0 forward, each plane over
// the paths that reach it, so the paths pass behind each density and out of it: the
// "density vs time" picture of stochastic interpolants and diffusion teasers. Native lines only.
import { distExtent } from './research-figures-dist.mjs'
import { densityParts } from './research-figures-glyphs-density.mjs'
import { flowModel, unionExtent } from './research-figures-flow-model.mjs'
import { labelFor, pathOpacity, snapshotsOption } from './research-figures-flow-parts.mjs'
import { simplifyPath } from './research-figures-science-math.mjs'
import {
  anchorPart,
  boxOption,
  dotPart,
  glyphInk,
  headPart,
  labelPart,
  numberOption,
  pathPart
} from './research-figures-science-parts.mjs'
import { styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100
const DEG = Math.PI / 180

/**
 * The projection (t, u, v) → page: `angle` (degrees) the plane's horizontal axis rises, `depth`
 * how much it is foreshortened (0–1), `spacing` the gap between planes in plane widths.
 */
function projection(R, count, view, spacing) {
  const angle = view.angle ?? 24
  const depth = view.depth ?? 0.5
  const U = [Math.cos(angle * DEG) * depth, -Math.sin(angle * DEG) * depth]
  const V = [0, -1]
  const width = 2 * R * U[0]
  const T = [
    Math.max(1, count - 1) * width * spacing,
    (view.rise ?? 0.05) * width * Math.max(1, count - 1)
  ]
  return {
    raw: (t, u, v) => [t * T[0] + u * U[0] + v * V[0], t * T[1] + u * U[1] + v * V[1]],
    U,
    T
  }
}

/** The page box of the planes, their feet, the axis and the paths under a projection. */
function rawBounds(proj, times, R, ground, paths) {
  const points = times.flatMap((t) =>
    [
      [-R, -R],
      [R, -R],
      [R, R],
      [-R, R],
      [0, -ground]
    ].map(([u, v]) => proj.raw(t, u, v))
  )
  for (const path of paths) {
    path.forEach(([u, v], j) => points.push(proj.raw(j / (path.length - 1), u, v)))
  }
  points.push(proj.raw(1.08, 0, -ground))
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/** `flow` layout 'planes' (see the file comment). */
export function makeFlowPlanes(spec, owner) {
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [460, 190])
  const model = flowModel(spec, owner, { place: 'centre', paths: 28 })
  const times = snapshotsOption(owner, spec, [0, 1 / 3, 2 / 3, 1])
  const size = spec.labelSize ?? style.textSize ?? 16
  const color = spec.color ?? 'accent'
  const extent = unionExtent(times.map((t) => distExtent(model.marginal(t), 2.3)))
  const R = Math.max(-extent.x0, extent.x1, -extent.y0, extent.y1) * 1.04
  const view = spec.view ?? {}
  const ground = R * 1.12
  // Fit every corner, foot and path point into the box (labels and the axis below).
  const below = spec.labels === false ? 10 : size * 1.4 + 10
  const room = { w: box.w - 4, h: box.h - below - 4 }
  // Why fitted twice: in a wide box the planes spread apart (spacing grows) instead of leaving
  // the sides blank; `view.spacing` fixes the gap between planes, in plane widths.
  let spacing = view.spacing ?? 1.7
  let proj = projection(R, times.length, view, spacing)
  let bounds = rawBounds(proj, times, R, ground, model.paths)
  if (view.spacing === undefined && times.length > 1) {
    const scale = room.h / (bounds.y1 - bounds.y0)
    const spare = room.w / scale - (bounds.x1 - bounds.x0)
    const width = 2 * R * proj.U[0]
    spacing = Math.min(3.2, Math.max(1.25, spacing + (spare * 0.9) / (width * (times.length - 1))))
    proj = projection(R, times.length, view, spacing)
    bounds = rawBounds(proj, times, R, ground, model.paths)
  }
  const { x0, x1, y0, y1 } = bounds
  const scale = Math.min(room.w / (x1 - x0), room.h / (y1 - y0))
  const ox = box.x + (box.w - (x1 - x0) * scale) / 2 - x0 * scale
  const oy = box.y + 2 - y0 * scale
  const at = (t, u, v) => {
    const [px, py] = proj.raw(t, u, v)
    return [ox + px * scale, oy + py * scale]
  }
  const elements = []
  const anchors = {}
  const thin = spec.paths?.color ? glyphInk(style, spec.paths.color) : '#2a2622'
  const opacity = model.options.opacity ?? Math.min(60, pathOpacity(model.paths.length) * 1.9)
  const width = model.options.width ?? 1
  const hero = model.highlight
  let cut = false
  // Ground ticks and the time axis first: everything stands on them.
  if (spec.axis !== false) {
    times.forEach((t, k) => {
      elements.push(
        pathPart(spec, `t${k}-foot`, [at(t, -R, -ground), at(t, R, -ground)], {
          stroke: '#8f8a85',
          width: 0.9
        })
      )
    })
    const [a, b] = [at(0, -R * 0.2, -ground * 1.08), at(1.06, -R * 0.2, -ground * 1.08)]
    elements.push(
      pathPart(spec, 'axis', [a, [b[0] - 5, b[1]]], { stroke: style.line, width: 1.2 }),
      headPart(spec, 'axis-head', a, b, { color: style.line, length: 7, width: 5.5 })
    )
  }
  times.forEach((t, k) => {
    const map = ([u, v]) => at(t, u, v)
    const corner = [
      [-R, -R],
      [R, -R],
      [R, R],
      [-R, R]
    ].map(map)
    if (spec.planes !== false) {
      elements.push(
        pathPart(spec, `t${k}-plane`, corner, {
          closed: true,
          fill: '#ffffff',
          stroke: '#b9b3ad',
          width: 0.8,
          opacity: 72
        })
      )
    }
    if (spec.density !== false) {
      const filled =
        spec.fill === 'all' ||
        spec.fill === undefined ||
        (spec.fill === 'ends' && (t === 0 || t === 1))
      const drawn = densityParts(
        spec,
        model.marginal(t),
        { x: -R, y: -R, w: 2 * R, h: 2 * R },
        {
          levels: spec.levels ?? 3,
          strokeWidth: spec.strokeWidth ?? 0.7,
          look: filled ? 'filled' : 'line',
          color: t === 0 ? (spec.fromColor ?? color) : color,
          prefix: `t${k}-band`,
          map,
          unit: scale * proj.U[0],
          opacity: filled ? (spec.densityOpacity ?? 94) : undefined
        }
      )
      cut ||= drawn.cut
      elements.push(...drawn.elements)
    }
    anchors[`t${k}.center`] = map([0, 0]).map(r2)
    anchors[`t${k}.top`] = map([0, R]).map(r2)
    const text = labelFor(spec, k, times, { from: '$p_0$', to: '$p_1$', t: '$p_t$' })
    if (text) {
      // Why under the axis: a long label ('ρ_0 (t = 0)') would otherwise lie on the time arrow.
      const foot = at(t, 0, -ground)
      const axis = at(t, -R * 0.2, -ground * 1.08)
      const top = Math.max(foot[1], axis[1]) + 7
      elements.push(...labelPart(spec, `t${k}-label`, text, { cx: foot[0], y: top }, { size }))
    }
    // The paths from this plane to the next, drawn over it and under the next one.
    if (k < times.length - 1) {
      const next = times[k + 1]
      const order = [...model.paths.keys()].toSorted((a, b) => (a === hero) - (b === hero))
      for (const index of order) {
        const path = model.paths[index]
        const n = path.length - 1
        const points = []
        path.forEach(([u, v], j) => {
          const s = j / n
          if (s >= t - 1e-9 && s <= next + 1e-9) {
            points.push(at(s, u, v))
          }
        })
        if (points.length < 2) {
          continue
        }
        const lit = index === hero
        elements.push(
          pathPart(
            spec,
            `path${index}-${k}`,
            simplifyPath(points, model.options.sde ? 0.08 : 0.18),
            {
              stroke: lit ? style.ink : thin,
              width: lit ? (spec.highlightWidth ?? 2) : width,
              opacity: lit ? undefined : opacity
            }
          )
        )
      }
    }
  })
  model.paths.forEach((path, index) => {
    const [first, last] = [path[0], path.at(-1)]
    anchors[`path${index}.start`] = at(0, first[0], first[1]).map(r2)
    anchors[`path${index}.end`] = at(1, last[0], last[1]).map(r2)
  })
  if (spec.ends !== false && model.paths.length) {
    const r = numberOption(owner, 'r', spec.r, 1.8)
    model.paths.forEach((path, index) => {
      const [u, v] = path.at(-1)
      elements.push(
        dotPart(spec, `end${index}`, at(1, u, v), {
          r,
          fill: index === hero ? style.ink : '#2a2622',
          opacity: 85
        })
      )
    })
  }
  if (hero !== null) {
    anchors.x0 = anchors[`path${hero}.start`]
    anchors.x1 = anchors[`path${hero}.end`]
  }
  return {
    elements: [
      anchorPart(spec, drawnExtent(elements), 'flow', {
        layout: 'planes',
        coupling: model.coupling,
        t: times
      }),
      ...elements
    ],
    warnings: cut ? [`${owner}: a density is cut by its plane; use narrower dists`] : [],
    extra: {
      anchors,
      highlight: hero,
      panels: times.map((t, k) => ({ t, center: anchors[`t${k}.center`] }))
    }
  }
}

/**
 * The box the drawing covers. Why not the given box: the planes rarely fill it both ways, and a
 * blank box edge near the page edge must not raise a margin warning.
 */
function drawnExtent(elements) {
  const points = elements.flatMap((part) =>
    part.points
      ? part.points.map(([px, py]) => [part.x + px, part.y + py])
      : [
          [part.x, part.y],
          [part.x + (part.width ?? 0), part.y + (part.height ?? 0)]
        ]
  )
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const [x, y] = [Math.min(...xs), Math.min(...ys)]
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
