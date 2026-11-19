// `flow`: a probability path between two distributions, computed and drawn the way published
// flow-matching and diffusion figures look. layout 'panel' (default): noise left, data right in
// one panel, both as filled contour bands, p_t between them as thin unfilled contours, dozens of
// thin translucent paths with one highlighted example, an optional velocity (u_t^θ along the
// example, or u_t(x) against u_t^θ(x)), a quiver and pictures at the ends. 'overlay': both
// centred in one panel (moons inside 8 Gaussians), every path whole. 'strip': p_t at several t
// in a row of panels on one scale with the samples moving through. 'planes': p_t on planes
// standing along a time axis in 3D (research-figures-glyphs-flow-planes.mjs).
import { fitMap } from './research-figures-dist.mjs'
import { backgroundPart, densityParts } from './research-figures-glyphs-density.mjs'
import { coreSamples, flowModel } from './research-figures-flow-model.mjs'
import {
  backgroundColor,
  gridBox,
  labelFor,
  occupancy,
  pathDots,
  pathParts,
  pictureSlot,
  placePicture,
  quiverParts,
  snapshotsOption,
  velocityParts
} from './research-figures-flow-parts.mjs'
import { pointAt } from './research-figures-interp.mjs'
import { seeded } from './research-figures-science-math.mjs'
import { makeFlowPlanes } from './research-figures-glyphs-flow-planes.mjs'
import { makeOverlay, makeStrip } from './research-figures-glyphs-flow-rows.mjs'
import {
  anchorPart,
  boxOption,
  dotPart,
  labelPart,
  numberOption
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100
export const FLOW_LAYOUTS = ['panel', 'overlay', 'strip', 'planes']

/** The mean of a mixture. */
const centreOf = (dist) =>
  dist.components.reduce(
    (sum, { mean, weight }) => [sum[0] + weight * mean[0], sum[1] + weight * mean[1]],
    [0, 0]
  )

/**
 * The densities of a flow at its snapshots in one panel: t = 0 and 1 filled (fill: 'ends'),
 * the others as thin lines; 'all' fills every one, 'none' draws only lines.
 */
function snapshotParts(
  spec,
  model,
  map,
  box,
  times,
  { color, fromColor, levels, fill, background }
) {
  const elements = []
  const outlines = []
  let cut = false
  const order = times
    .map((t, k) => ({ t, k }))
    .toSorted((a, b) => filledFirst(a.t, fill) - filledFirst(b.t, fill))
  for (const { t, k } of order) {
    const scene = map.dist(model.marginal(t))
    const filled = fill === 'all' || (fill === 'ends' && (t === 0 || t === 1))
    const drawn = densityParts(spec, scene, gridBox(scene, box), {
      levels,
      inner: !filled,
      look: filled ? 'filled' : 'line',
      color: t === 0 ? fromColor : color,
      prefix: `t${k}-band`,
      background
    })
    cut ||= drawn.cut && filled
    elements.push(...drawn.elements)
    outlines.push(...drawn.outlines)
  }
  return { elements, cut, outlines }
}
const filledFirst = (t, fill) =>
  fill === 'all' || (fill === 'ends' && (t === 0 || t === 1)) ? 0 : 1

/** Picture specs: 'noise' | a photo kind | { kind | src, label, corner } | true. */
function pictureOption(value, key) {
  if (!value) {
    return null
  }
  if (value === true) {
    return key === 'x0' ? { kind: 'noise' } : { kind: 'dog' }
  }
  return typeof value === 'string'
    ? value.includes('/') || value.includes('.')
      ? { src: value }
      : { kind: value }
    : value
}

function makePanel(spec, owner) {
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [216, 160])
  const times = snapshotsOption(owner, spec, [0, 1])
  const size = spec.labelSize ?? style.textSize ?? 16
  const sides = ['x0', 'x1'].filter((key) => pictureOption(spec.pictures?.[key], key)).length
  const model = flowModel(spec, owner, {
    place: 'panel',
    paths: 40,
    aspect: (box.w / Math.max(1, box.h - size * 1.3 - 4)) * (1 - 0.12 * sides),
    inner: times.filter((t) => t > 0 && t < 1).length,
    pictures: sides
  })
  const color = spec.color ?? 'accent'
  const fromColor = spec.fromColor ?? color
  const top = spec.labels === false ? 0 : size * 1.3 + 4
  const content = { x: box.x, y: box.y + top, w: box.w, h: box.h - top }
  const pad = 0.12
  const e = model.extent
  // Why room at the sides: a picture at an end sits beside its density, not on it.
  const room = (key) => (pictureOption(spec.pictures?.[key], key) ? 0.75 : 0)
  const [left, right] =
    spec.direction === 'left' ? [room('x1'), room('x0')] : [room('x0'), room('x1')]
  // Why room below: thumbnails sit under their points, as in flow-matching blueprints.
  const under = sides ? 0.4 : 0
  const map = fitMap(
    { x0: e.x0 - pad - left, x1: e.x1 + pad + right, y0: e.y0 - pad - under, y1: e.y1 + pad },
    content,
    0.02
  )
  const occ = occupancy(4)
  const elements = []
  const warnings = []
  const anchors = {}
  if (spec.background) {
    elements.push(backgroundPart(spec, box, color, spec.background))
  }
  const fill = oneOf('fill', spec.fill ?? 'ends', ['ends', 'all', 'none'])
  if (spec.density !== false) {
    const drawn = snapshotParts(spec, model, map, box, times, {
      color,
      fromColor,
      levels: spec.levels ?? 6,
      fill,
      background: backgroundColor(spec, color)
    })
    elements.push(...drawn.elements)
    drawn.outlines.forEach((points) => occ.outline(points))
    if (drawn.cut) {
      warnings.push(
        `${owner}: a filled density is cut by the box edge; give the flow more room (w, h) or a smaller toScale`
      )
    }
  }
  times.forEach((t, k) => {
    const centre = map.point(centreOf(model.marginal(t)))
    anchors[t === 0 ? 'from' : t === 1 ? 'to' : `t${k}`] = centre.map(r2)
    if (t > 0 && t < 1) {
      anchors.pt ??= centre.map(r2)
    }
    const text = labelFor(spec, k, times, { from: '$p$', to: '$q$', t: '$p_t$' })
    if (text) {
      const label = labelPart(spec, `label${k}`, text, { cx: centre[0], y: box.y + 1 }, { size })
      label.forEach((part) => occ.rect(part))
      elements.push(...label)
    }
  })
  if (spec.field) {
    const field = spec.field === true ? {} : spec.field
    const t = numberOption(owner, 'field.t', field.t, 0.5)
    elements.push(
      ...quiverParts(
        spec,
        content,
        (p) => {
          const v = model.interp.field(map.model(p), t).velocity
          return [v[0], -v[1]]
        },
        { cols: field.grid ?? 9, color: field.color ?? 'mid' }
      )
    )
  }
  const scenePaths = model.paths.map((path) => path.map(map.point))
  const hero = model.highlight
  elements.push(
    ...pathParts(spec, scenePaths, hero, {
      jagged: model.options.sde,
      color: model.options.color,
      width: model.options.width,
      opacity: model.options.opacity,
      heroWidth: spec.highlightWidth
    })
  )
  scenePaths.forEach((points, index) => {
    anchors[`path${index}.start`] = points[0].map(r2)
    anchors[`path${index}.mid`] = pointAt(points, 0.5).map(r2)
    anchors[`path${index}.end`] = points.at(-1).map(r2)
  })
  const velocity = spec.velocity ? (spec.velocity === true ? {} : spec.velocity) : null
  const compare = Boolean(velocity?.compare)
  const tv = velocity ? numberOption(owner, 'velocity.t', velocity.t, compare ? 0.42 : 0.3) : null
  if (hero !== null) {
    occ.path(scenePaths[hero])
    const dots = spec.dots ?? [0, ...(velocity && !compare ? [tv] : []), 1]
    elements.push(...pathDots(spec, scenePaths[hero], dots))
    anchors.x0 = scenePaths[hero][0].map(r2)
    anchors.x1 = scenePaths[hero].at(-1).map(r2)
  }
  if (velocity) {
    const at =
      hero !== null && !compare ? pointAt(model.paths[hero], tv) : velocityPoint(model.marginal(tv))
    const v = model.velocity(at, tv, hero ?? undefined)
    const point = map.point(at)
    const length = numberOption(
      owner,
      'velocity.length',
      velocity.length,
      Math.min(56, Math.max(24, box.w * (compare ? 0.15 : 0.17)))
    )
    const drawn = velocityParts(spec, point, [v[0] * map.scale, -v[1] * map.scale], {
      length,
      size,
      compare,
      labels: velocity.labels ?? { model: velocity.label },
      errorColor: velocity.errorColor,
      avoid: hero !== null ? scenePaths[hero] : [],
      // Why lean: the labels grow away from the data, which lies ahead of the arrows.
      lean: spec.direction === 'left' ? 1 : -1
    })
    if (compare || hero === null) {
      drawn.elements.push(
        dotPart(spec, 'x', point, { r: 2.2, fill: style.ink, rim: '#ffffff', rimWidth: 0.6 })
      )
    }
    drawn.elements.forEach((part) => occ.rect(part))
    elements.push(...drawn.elements)
    Object.assign(anchors, drawn.anchors)
  }
  const pictures = []
  const side = Math.round(Math.max(36, Math.min(60, box.h * 0.26, box.w * 0.2)))
  for (const key of ['x0', 'x1']) {
    const picture = pictureOption(spec.pictures?.[key], key)
    if (!picture) {
      continue
    }
    const dist = key === 'x0' ? model.from : model.to
    const label = picture.label === undefined ? (key === 'x0' ? '$X_0$' : '$X_1$') : picture.label
    const own = picture.size ?? side
    const outward = (key === 'x0' ? -1 : 1) * (spec.direction === 'left' ? -1 : 1)
    const labelBox = label ? { w: size * 1.7, h: size * 1.3 } : null
    let target =
      hero !== null ? scenePaths[hero][key === 'x0' ? 0 : scenePaths[hero].length - 1] : null
    const spot = placePicture(
      target ?? map.point(edgePoint(dist, key)),
      box,
      own,
      labelBox,
      occ,
      outward
    )
    if (!target) {
      // Why the nearest sample: with no example path, the point shown is the sample closest to its picture.
      const centre = [spot.x + own / 2, spot.y + own / 2]
      target = coreSamples(dist, 160, seeded(5), 1.3)
        .map(map.point)
        .reduce((best, point) =>
          Math.hypot(point[0] - centre[0], point[1] - centre[1]) <
          Math.hypot(best[0] - centre[0], best[1] - centre[1])
            ? point
            : best
        )
    }
    const placed = pictureSlot(
      spec,
      key,
      target,
      { ...spot, side: own },
      { label, labelSize: size }
    )
    occ.rect({
      x: spot.x - size * 1.8,
      y: spot.y,
      width: own + size * 3.6,
      height: own + size * 1.3
    })
    elements.push(...placed.elements)
    pictures.push({ key, ...placed.slot, picture })
    anchors[key] = target.map(r2)
  }
  return {
    elements: [
      anchorPart(spec, box, 'flow', { layout: 'panel', coupling: model.coupling }),
      ...elements
    ],
    warnings,
    extra: {
      anchors,
      pictures,
      highlight: hero,
      panels: [{ x: box.x, y: box.y, width: box.w, height: box.h, t: null }]
    }
  }
}

/** A point on p_t for x: a little off its heaviest mode, where the flow is clearly moving. */
function velocityPoint(dist) {
  const top = dist.components.reduce((best, part) => (part.weight > best.weight ? part : best))
  const s = Math.sqrt((top.cov[0] + top.cov[2]) / 2)
  return [top.mean[0] - 0.35 * s, top.mean[1] - 0.25 * s]
}

/** A sample on a distribution's outer edge, toward the picture's corner (model units). */
function edgePoint(dist, key) {
  const top = dist.components.reduce((best, part) => (part.weight > best.weight ? part : best))
  const s = Math.sqrt((top.cov[0] + top.cov[2]) / 2)
  return key === 'x0'
    ? [top.mean[0] - 1.2 * s, top.mean[1] - 1.2 * s]
    : [top.mean[0] + 1.1 * s, top.mean[1] - 0.6 * s]
}

/** `flow`: see the file comment; `layout` picks the drawing. */
export function makeFlow(spec) {
  const owner = `flow ${spec.id}`
  const layout = oneOf(
    'layout',
    spec.layout === 'row' ? 'strip' : (spec.layout ?? 'panel'),
    FLOW_LAYOUTS
  )
  if (layout === 'planes') {
    return makeFlowPlanes(spec, owner)
  }
  return layout === 'overlay'
    ? makeOverlay(spec, owner)
    : layout === 'strip'
      ? makeStrip(spec, owner)
      : makePanel(spec, owner)
}
