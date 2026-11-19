// A probability path drawn exactly. Rows of p_t and an overlay of every path are `flow` layouts
// now (research-figures-glyphs-flow.mjs); this keeps the older name working and draws the 1D
// conditional bands of flow matching (layout 'band').
import { makeFlow } from './research-figures-glyphs-flow.mjs'
import {
  anchorPart,
  blend,
  boxOption,
  dotPart,
  glyphInk,
  headPart,
  labelPart,
  pathPart
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100
const LAYOUTS = ['row', 'overlay', 'band']

/**
 * `pathDensity`: the older name of a computed probability path. 'row' and 'overlay' are drawn by
 * `flow` (layouts 'strip' and 'overlay': filled contour bands, gray at t = 0 turning to the
 * colour); 'band' draws 1D conditional paths over t.
 */
export function makePathDensity(spec) {
  const owner = `pathDensity ${spec.id}`
  const style = styleOf(spec)
  const layout = oneOf('layout', spec.layout ?? 'row', LAYOUTS)
  if (layout === 'band') {
    return makeBands(spec, owner, style)
  }
  const paths = spec.paths === false ? false : (spec.paths ?? {})
  const highlight = paths ? [paths.highlight].flat()[0] : undefined
  const flow = makeFlow({
    ...spec,
    layout: layout === 'row' ? 'strip' : 'overlay',
    from: spec.from ?? 'gaussian',
    to: spec.to ?? '8gaussians',
    tint: layout === 'row' ? 'time' : undefined,
    fill: spec.fillRings === false ? 'none' : undefined,
    levels: spec.levels ?? 4,
    highlight: highlight ?? (paths && (paths.n ?? 12) >= 3 ? undefined : false),
    ends: layout === 'overlay' ? (spec.ends ?? true) : undefined,
    paths:
      paths === false
        ? 0
        : { ...paths, n: paths.n ?? 12, width: paths.strokeWidth, sde: undefined },
    sde: paths && paths.kind === 'sde' ? 0.2 * (paths.noise ?? 1) : undefined,
    highlightWidth: paths ? paths.highlightWidth : undefined
  })
  const anchor = flow.elements[0]
  anchor.customData = {
    ...anchor.customData,
    asterGlyph: 'pathDensity',
    asterScience: { ...anchor.customData.asterScience, kind: 'pathDensity', layout }
  }
  return flow
}

/**
 * layout 'band': 1D conditional probability paths over t (left to right), each a mean line with
 * a ±2σ band: `bands: [{ from: [mean, sigma], to: [mean, sigma], color, label }]`, the mean and
 * σ moving linearly in t. The default is flow matching's N(0, 1) → N(x_1, σ_min²) for two x_1;
 * I-CFM and OT-CFM keep σ fixed between a pair: { from: [x_0, 0.1], to: [x_1, 0.1] }.
 */
function makeBands(spec, owner, style) {
  const box = boxOption(owner, spec, [220, 120])
  const range = spec.range ?? [-3, 3]
  const bands = spec.bands ?? [
    { from: [0, 1], to: [1.6, 0.08] },
    { from: [0, 1], to: [-1.3, 0.08], color: spec.secondColor ?? 'mid' }
  ]
  if (spec.profiles) {
    return makeProfiles(spec, owner, style, { box, range, bands })
  }
  const toY = (value) => box.y + box.h * (1 - (value - range[0]) / (range[1] - range[0]))
  const toX = (t) => box.x + t * box.w
  const fills = []
  const elements = []
  const anchors = {}
  const steps = 40
  bands.forEach((band, index) => {
    const [[m0, s0], [m1, s1]] = [band.from, band.to]
    if (![m0, s0, m1, s1].every(Number.isFinite) || s0 < 0 || s1 < 0) {
      throw new Error(`${owner}: band ${index} needs from: [mean, sigma] and to: [mean, sigma]`)
    }
    const color = band.color ?? spec.color ?? 'accent'
    const ink = glyphInk(style, color)
    const at = (t) => [(1 - t) * m0 + t * m1, (1 - t) * s0 + t * s1]
    const ts = Array.from({ length: steps + 1 }, (_, k) => k / steps)
    const upper = ts.map((t) => [toX(t), toY(at(t)[0] + 2 * at(t)[1])])
    const lower = ts.map((t) => [toX(t), toY(at(t)[0] - 2 * at(t)[1])]).toReversed()
    // Why bands first, the first last: every mean line shows over the bands, the first band on top.
    fills.unshift(
      pathPart(spec, `band${index}`, [...upper, ...lower], {
        closed: true,
        fill: blend('#ffffff', ink, 0.28),
        stroke: blend('#ffffff', ink, 0.5),
        width: 0.75,
        opacity: 80
      })
    )
    elements.unshift(
      pathPart(
        spec,
        `mean${index}`,
        ts.map((t) => [toX(t), toY(at(t)[0])]),
        { stroke: ink, width: 2 }
      ),
      dotPart(spec, `end${index}`, [toX(1), toY(m1)], { r: 2.5, fill: ink, rim: '#ffffff' })
    )
    anchors[`band${index}.start`] = [r2(toX(0)), r2(toY(m0))]
    anchors[`band${index}.end`] = [r2(toX(1)), r2(toY(m1))]
    if (band.label) {
      elements.push(
        ...labelPart(
          spec,
          `label${index}`,
          band.label,
          { x: toX(1) + 6, cy: toY(m1) },
          { size: spec.labelSize }
        )
      )
    }
  })
  if (spec.axis !== false) {
    const y = box.y + box.h + 8
    elements.push(
      pathPart(
        spec,
        'axis',
        [
          [box.x, y],
          [box.x + box.w - 6, y]
        ],
        { stroke: style.line, width: 1.25 }
      ),
      headPart(spec, 'axis-head', [box.x, y], [box.x + box.w, y], {
        color: style.line,
        length: 7,
        width: 5.5
      })
    )
    const size = spec.labelSize ?? style.smallSize ?? 14
    elements.push(
      ...labelPart(spec, 't0', '$t = 0$', { x: box.x, y: y + 4 }, { size }),
      ...labelPart(spec, 't1', '$t = 1$', { cx: box.x + box.w, y: y + 4 }, { size })
    )
  }
  return {
    elements: [anchorPart(spec, box, 'pathDensity', { layout: 'band' }), ...fills, ...elements],
    warnings: [],
    extra: { anchors, panels: [{ x: box.x, y: box.y, width: box.w, height: box.h, t: null }] }
  }
}

const gauss = (x, mean, sd) =>
  Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))

/**
 * band with `profiles: n`: the same conditional paths as density curves in n rows, t = 1 (the
 * data) at the top down to t = 0 (the noise): each band's N(mean(t), σ(t)²) in its colour, the
 * noise and data densities in ink on the end rows (`marginals: { from: [mean, sd], to: { modes, sd } }`).
 */
function makeProfiles(spec, owner, style, { box, range, bands }) {
  const rows = Math.max(2, Math.min(12, Math.round(spec.profiles === true ? 6 : spec.profiles)))
  const rowH = box.h / rows
  const toX = (value) => box.x + ((value - range[0]) / (range[1] - range[0])) * box.w
  const xs = Array.from({ length: 121 }, (_, k) => range[0] + ((range[1] - range[0]) * k) / 120)
  const curves = []
  const anchors = {}
  const at = (band, t) => [
    (1 - t) * band.from[0] + t * band.to[0],
    (1 - t) * band.from[1] + t * band.to[1]
  ]
  const marginals = spec.marginals ?? {}
  const source = marginals.from ?? [0, 1]
  const targetModes = marginals.to?.modes ?? bands.map((band) => band.to[0])
  const targetSd = marginals.to?.sd ?? 0.32
  for (let k = 0; k < rows; k += 1) {
    const t = 1 - k / (rows - 1)
    const base = box.y + (k + 1) * rowH
    if (k === 0 || k === rows - 1) {
      const density = (x) =>
        k === 0
          ? targetModes.reduce((sum, mode) => sum + gauss(x, mode, targetSd), 0) /
            targetModes.length
          : gauss(x, source[0], source[1])
      curves.push({ id: `row${k}-marginal`, color: style.ink, base, density, width: 1.8 })
    }
    bands.forEach((band, index) => {
      const [mean, sd] = at(band, t)
      if (!(sd > 0)) {
        throw new Error(`${owner}: band ${index} needs sigma above 0 at every t for profiles`)
      }
      curves.push({
        id: `row${k}-band${index}`,
        color: glyphInk(style, band.color ?? spec.color ?? 'accent'),
        base,
        density: (x) => gauss(x, mean, sd),
        mean,
        sd,
        width: 1.5
      })
      anchors[`row${k}.band${index}`] = [r2(toX(mean)), r2(base)]
    })
  }
  const peak = Math.max(...curves.map((curve) => Math.max(...xs.map(curve.density))))
  const elements = curves.map((curve) => {
    const own = Math.max(...xs.map(curve.density))
    // Why a power: narrow peaks stay a row tall while the widest curves still rise clearly.
    const height = rowH * 0.92 * (own / peak) ** 0.4
    const span = curve.sd ? xs.filter((x) => Math.abs(x - curve.mean) <= 3.6 * curve.sd) : xs
    return pathPart(
      spec,
      curve.id,
      span.map((x) => [toX(x), curve.base - (height * curve.density(x)) / own]),
      {
        stroke: curve.color,
        width: curve.width
      }
    )
  })
  anchors.top = [r2(box.x + box.w / 2), r2(box.y)]
  return {
    elements: [
      anchorPart(spec, box, 'pathDensity', { layout: 'band', profiles: rows }),
      ...elements
    ],
    warnings: [],
    extra: { anchors, panels: [{ x: box.x, y: box.y, width: box.w, height: box.h, t: null }] }
  }
}
