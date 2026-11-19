// Time and direction: one-dimensional sample paths over t between a prior and a data density
// drawn as side profiles (the diffusion / flow-matching teaser, ODE vs SDE), and a vector field
// as a grid of short arrows (rotation, sink, saddle, the score of a density, a flow's velocity).
import { colorRamp, scoreAt, seeded, simplifyPath } from './research-figures-science-math.mjs'
import { density1d, flowField, mixture1d, paths1d } from './research-figures-science-flow.mjs'
import {
  anchorPart,
  blend,
  boxOption,
  countOption,
  dotPart,
  glyphInk,
  glyphSolid,
  headPart,
  labelPart,
  numberOption,
  pathPart,
  timeColor
} from './research-figures-science-parts.mjs'
import { splitPath } from './research-figures-glyphs-science.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

/** The 1D marginal of the interpolation at t: a mixture over pairs of components. */
function marginal1d(from, to, t) {
  return from.flatMap((a) =>
    to.map((b) => ({
      mean: (1 - t) * a.mean + t * b.mean,
      sd: Math.max(1e-3, Math.hypot((1 - t) * a.sd, t * b.sd)),
      weight: a.weight * b.weight
    }))
  )
}

/** A density profile standing on a vertical baseline at x, bulging toward `side` (±1). */
function profilePoints(mixture, x, side, depth, toY, range) {
  const values = Array.from({ length: 81 }, (_, k) => range[0] + ((range[1] - range[0]) * k) / 80)
  const peak = Math.max(...values.map((value) => density1d(mixture, value)))
  return values.map((value) => [x + side * depth * (density1d(mixture, value) / peak), toY(value)])
}

/**
 * `trajectories`: n paths of a value over t from `from` (left) to `to` (right), with each
 * distribution as a profile at its end: ode (curved, never crossing), sde (jagged, same ends),
 * straight (ranked pairs). `at` adds outline profiles of p_t inside; direction 'left' puts the
 * data on the left (the diffusion convention).
 */
export function makeTrajectories(spec) {
  const owner = `trajectories ${spec.id}`
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [320, 140])
  const kind = oneOf('style', spec.kind ?? 'ode', ['ode', 'sde', 'straight'])
  const n = countOption(owner, 'n', spec.n, 14, [1, 80])
  const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
  const from = mixture1d(spec.from ?? { modes: [0] })
  const to = mixture1d(
    spec.to ?? { modes: [-1.3, 1.15], widths: [0.32, 0.28], weights: [0.45, 0.55] }
  )
  const range = spec.range ?? [-3, 3]
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] >= range[1]
  ) {
    throw new Error(
      `${owner}: range must be [low, high] numbers, not ${JSON.stringify(spec.range)}`
    )
  }
  const flip = oneOf('direction', spec.direction ?? 'right', ['right', 'left']) === 'left'
  const depth = numberOption(
    owner,
    'profileWidth',
    spec.profileWidth,
    spec.profiles === false ? 0 : Math.min(48, box.w * 0.14)
  )
  const gap = depth ? 6 : 0
  const plot = { x0: box.x + depth + gap, x1: box.x + box.w - depth - gap }
  const toY = (value) => box.y + ((range[1] - value) / (range[1] - range[0])) * box.h
  const toX = (t) => (flip ? plot.x1 - t * (plot.x1 - plot.x0) : plot.x0 + t * (plot.x1 - plot.x0))
  const color = spec.color ?? 'accent'
  const ink = glyphInk(style, color)
  const gray = '#9a9a9a'
  const values = paths1d(from, to, n, {
    kind,
    steps: kind === 'sde' ? 64 : 48,
    noise: numberOption(owner, 'noise', spec.noise, 0.8),
    random
  })
  const elements = [anchorPart(spec, box, 'trajectories', { style: kind, n })]
  const tone = oneOf('tone', spec.tone ?? 'ramp', ['ramp', 'flat'])
  const width = numberOption(owner, 'strokeWidth', spec.strokeWidth, 1)
  values.forEach((path, p) => {
    const points = path.map((value, k) => [toX(k / (path.length - 1)), toY(value)])
    const kept = simplifyPath(points, kind === 'sde' ? 0.12 : 0.2)
    const pieces = tone === 'flat' ? [kept] : splitPath(kept, 6)
    pieces.forEach((piece, s) => {
      const t = pieces.length === 1 ? 1 : (s + 1) / pieces.length
      elements.push(
        pathPart(spec, `path${p}-${s}`, piece, {
          stroke: tone === 'ramp' ? timeColor(style, color, t) : ink,
          width,
          opacity: spec.opacity
        })
      )
    })
    if (spec.ends !== false) {
      elements.push(
        dotPart(spec, `end${p}`, points.at(-1), {
          r: 1.7,
          fill: glyphSolid(style, color),
          rim: '#ffffff',
          rimWidth: 0.5
        })
      )
    }
  })
  if (depth) {
    const lightGray = '#e6e6e6'
    const tint = colorRamp(style, color)
    for (const [name, mixture, t, fill, stroke] of [
      ['from', from, 0, lightGray, '#7a7a7a'],
      ['to', to, 1, tint(0.22), ink]
    ]) {
      const x = toX(t) + (t === 0 ? -1 : 1) * (flip ? -gap / 2 : gap / 2)
      const side = (t === 0) !== flip ? -1 : 1
      const curve = profilePoints(mixture, x, side, depth, toY, range)
      elements.push(
        pathPart(spec, `${name}-profile`, [[x, curve[0][1]], ...curve, [x, curve.at(-1)[1]]], {
          closed: true,
          fill,
          stroke,
          width: 1
        })
      )
      elements.push(
        pathPart(
          spec,
          `${name}-base`,
          [
            [x, box.y],
            [x, box.y + box.h]
          ],
          { stroke: '#bdbdbd', width: 0.75 }
        )
      )
    }
  }
  for (const [k, t] of (spec.at ?? []).entries()) {
    if (typeof t !== 'number' || t <= 0 || t >= 1) {
      throw new Error(`${owner}: at takes times strictly between 0 and 1, not ${JSON.stringify(t)}`)
    }
    const x = toX(t)
    const curve = profilePoints(
      marginal1d(from, to, t),
      x,
      flip ? -1 : 1,
      Math.min(depth || 32, (plot.x1 - plot.x0) * 0.12),
      toY,
      range
    )
    elements.push(
      pathPart(
        spec,
        `at${k}-base`,
        [
          [x, box.y],
          [x, box.y + box.h]
        ],
        { stroke: '#c8c8c8', width: 0.75, dashed: true }
      )
    )
    elements.push(
      pathPart(spec, `at${k}-profile`, curve, { stroke: blend(gray, ink, t), width: 1.25 })
    )
  }
  if (spec.labels !== false) {
    const labels = {
      from: '$p_0$',
      to: '$p_{\\mathrm{data}}$',
      ...(typeof spec.labels === 'object' ? spec.labels : {})
    }
    const size = style.smallSize ?? 14
    for (const [name, t] of [
      ['from', 0],
      ['to', 1]
    ]) {
      if (labels[name]) {
        const outward = ((t === 0) !== flip ? -1 : 1) * (depth / 2 + gap / 2)
        elements.push(
          ...labelPart(
            spec,
            `${name}-label`,
            labels[name],
            { cx: toX(t) + outward, y: box.y + box.h + 4 },
            { size }
          )
        )
      }
    }
  }
  if (spec.axis !== false) {
    // Why between the profile labels: "p_0 ──→ p_data" reads as the direction of time.
    const size = style.smallSize ?? 14
    const y = box.y + box.h + 4 + size * 0.62
    const [a, b] = flip ? [plot.x1 - 10, plot.x0 + 10] : [plot.x0 + 10, plot.x1 - 10]
    elements.push(
      pathPart(
        spec,
        'axis',
        [
          [a, y],
          [b - Math.sign(b - a) * 6, y]
        ],
        { stroke: style.line, width: 1 }
      )
    )
    elements.push(
      headPart(spec, 'axis-head', [a, y], [b, y], { color: style.line, length: 6, width: 4.5 })
    )
    if (spec.axisLabel) {
      elements.push(
        ...labelPart(spec, 'axis-label', spec.axisLabel, { cx: (a + b) / 2, y: y + 4 }, { size })
      )
    }
  }
  return {
    elements,
    warnings: [],
    paths: values,
    extra: { plot: { x: plot.x0, y: box.y, width: plot.x1 - plot.x0, height: box.h } }
  }
}

const FIELDS = {
  rotation: ([dx, dy]) => [-dy, dx],
  sink: ([dx, dy]) => [-dx, -dy],
  source: ([dx, dy]) => [dx, dy],
  saddle: ([dx, dy]) => [dx, -dy],
  shear: ([, dy]) => [dy, 0]
}

/**
 * `field`: arrows on a grid. kind: rotation | sink | source | saddle | shear (about the box
 * centre), score (∇ log p of `mixture`), flow (velocity at time `t` between `from` and `to`), or
 * f: (u, v) => [du, dv] with u, v in shares of the box (v down). magnitude 'length' scales each
 * arrow (the longest fills 80% of its cell; under 15% is left out), 'equal' gives one length and
 * shades by strength.
 */
export function makeField(spec) {
  const owner = `field ${spec.id}`
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [140, 140])
  const kind = spec.f
    ? 'custom'
    : oneOf('kind', spec.kind ?? 'rotation', [...Object.keys(FIELDS), 'score', 'flow'])
  const [rows, cols] = Array.isArray(spec.grid) ? spec.grid : [spec.grid ?? 9, spec.grid ?? 9]
  countOption(owner, 'grid rows', rows, 9, [2, 30])
  countOption(owner, 'grid cols', cols, 9, [2, 30])
  // Why equal for a score: |∇ log p| grows without bound away from the data, so lengths would
  // show only the corners.
  const magnitude = oneOf('magnitude', spec.magnitude ?? (kind === 'score' ? 'equal' : 'length'), [
    'length',
    'equal'
  ])
  const [cw, ch] = [box.w / cols, box.h / rows]
  const unit = Math.min(box.w, box.h) / 2
  const centre = [box.x + box.w / 2, box.y + box.h / 2]
  const velocity = (() => {
    if (kind === 'custom') {
      return (point) => spec.f((point[0] - box.x) / box.w, (point[1] - box.y) / box.h)
    }
    if (kind === 'score') {
      if (!spec.mixture) {
        throw new Error(`${owner}: kind 'score' needs of: a density2d id (or dist)`)
      }
      return (point) => scoreAt(spec.mixture, point)
    }
    if (kind === 'flow') {
      if (!spec.from?.mixture || !spec.to?.mixture) {
        throw new Error(`${owner}: kind 'flow' needs from and to (density2d ids or dists)`)
      }
      const field = flowField(spec.from.mixture, spec.to.mixture)
      const t = numberOption(owner, 't', spec.t, 0.5)
      return (point) => field(point, t).velocity
    }
    return (point) => FIELDS[kind]([(point[0] - centre[0]) / unit, (point[1] - centre[1]) / unit])
  })()
  const cells = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const point = [box.x + (c + 0.5) * cw, box.y + (r + 0.5) * ch]
      const v = velocity(point)
      if (!Array.isArray(v) || !v.every(Number.isFinite)) {
        throw new Error(
          `${owner}: the field gave ${JSON.stringify(v)} at row ${r}, col ${c}; it must give [du, dv] numbers`
        )
      }
      cells.push({ r, c, point, v, size: Math.hypot(...v) })
    }
  }
  const largest = Math.max(...cells.map((cell) => cell.size)) || 1
  const reach = 0.8 * Math.min(cw, ch)
  const color = spec.color ?? 'line'
  const ink = glyphInk(style, color)
  const ramp = colorRamp(style, color)
  const width = numberOption(owner, 'strokeWidth', spec.strokeWidth, 1)
  const elements = [anchorPart(spec, box, 'field', { kind, grid: [rows, cols] })]
  let dropped = 0
  for (const { r, c, point, v, size } of cells) {
    const share = size / largest
    const length = magnitude === 'equal' ? 0.7 * Math.min(cw, ch) : reach * share
    if (length < 0.15 * reach || size === 0) {
      dropped += 1
      continue
    }
    const [ux, uy] = [v[0] / size, v[1] / size]
    const a = [point[0] - (ux * length) / 2, point[1] - (uy * length) / 2]
    const b = [point[0] + (ux * length) / 2, point[1] + (uy * length) / 2]
    const tone = magnitude === 'equal' ? ramp(0.35 + 0.65 * share) : ink
    const head = Math.min(5, length * 0.45)
    elements.push(
      pathPart(spec, `a${r}-${c}`, [a, [b[0] - ux * head * 0.6, b[1] - uy * head * 0.6]], {
        stroke: tone,
        width
      })
    )
    elements.push(
      headPart(spec, `a${r}-${c}-head`, a, b, { color: tone, length: head, width: head * 0.8 })
    )
  }
  return {
    elements,
    warnings: dropped === cells.length ? [`${owner}: every arrow was too short to draw`] : [],
    dropped
  }
}
