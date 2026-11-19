// `flow` layouts with both distributions centred: 'overlay' (one panel, every path whole with
// dots at both ends: moons inside 8 Gaussians, I-CFM against OT-CFM) and 'strip' (p_t in a row of
// panels on one scale, the samples moving through with their trails). Split from
// research-figures-glyphs-flow.mjs, which picks the layout.
import { distExtent, fitMap } from './research-figures-dist.mjs'
import { densityParts } from './research-figures-glyphs-density.mjs'
import { flowModel, unionExtent } from './research-figures-flow-model.mjs'
import {
  gridBox,
  pathDots,
  pathOpacity,
  pathParts,
  snapshotsOption
} from './research-figures-flow-parts.mjs'
import { pathBetween, pointAt } from './research-figures-interp.mjs'
import {
  anchorPart,
  blend,
  boxOption,
  dotPart,
  glyphInk,
  glyphSolid,
  headPart,
  labelPart,
  numberOption,
  pathPart
} from './research-figures-science-parts.mjs'
import { styleOf } from './research-figures-type.mjs'

const r2 = (value) => Math.round(value * 100) / 100

/** layout 'overlay' (see the file comment). */
export function makeOverlay(spec, owner) {
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [160, 160])
  const model = flowModel(spec, owner, { place: 'centre', paths: 40 })
  const map = fitMap(model.extent, box, 0.04)
  const color = spec.color ?? 'accent'
  const elements = []
  const anchors = {}
  let cut = false
  if (spec.density !== false) {
    for (const [t, look, tint] of [
      [0, 'line', spec.fromColor ?? 'mid'],
      [1, spec.fillTarget === false ? 'line' : 'filled', color]
    ]) {
      const scene = map.dist(model.marginal(t))
      const drawn = densityParts(spec, scene, gridBox(scene, box), {
        levels: look === 'filled' ? (spec.levels ?? 5) : 3,
        look,
        color: tint,
        prefix: t ? 'to-band' : 'from-band'
      })
      cut ||= drawn.cut
      elements.push(...drawn.elements)
    }
  }
  const scenePaths = model.paths.map((path) => path.map(map.point))
  const hero = spec.highlight === undefined && model.paths.length > 40 ? null : model.highlight
  elements.push(
    ...pathParts(spec, scenePaths, hero, {
      jagged: model.options.sde,
      // Why the colour's ink: with dots at both ends, many paths read as bundles of the flow's hue.
      color: model.options.color ?? (spec.ends === false ? undefined : (spec.color ?? 'accent')),
      width: model.options.width ?? 0.9,
      opacity: model.options.opacity ?? Math.min(45, pathOpacity(scenePaths.length) + 10)
    })
  )
  if (spec.ends !== false) {
    const startInk = glyphInk(style, spec.startColor ?? 'ink')
    const endInk = glyphSolid(style, color)
    const r = numberOption(owner, 'r', spec.r, scenePaths.length > 80 ? 1.3 : 1.8)
    scenePaths.forEach((points, index) => {
      elements.push(dotPart(spec, `start${index}`, points[0], { r, fill: startInk }))
    })
    scenePaths.forEach((points, index) => {
      elements.push(dotPart(spec, `end${index}`, points.at(-1), { r, fill: endInk }))
    })
  }
  if (hero !== null) {
    elements.push(...pathDots(spec, scenePaths[hero], spec.dots ?? [0, 1]))
  }
  scenePaths.forEach((points, index) => {
    anchors[`path${index}.start`] = points[0].map(r2)
    anchors[`path${index}.mid`] = pointAt(points, 0.5).map(r2)
    anchors[`path${index}.end`] = points.at(-1).map(r2)
  })
  anchors.center = [r2(box.x + box.w / 2), r2(box.y + box.h / 2)]
  return {
    elements: [
      anchorPart(spec, box, 'flow', { layout: 'overlay', coupling: model.coupling }),
      ...elements
    ],
    warnings: cut ? [`${owner}: a density is cut by its box; give it more room`] : [],
    extra: {
      anchors,
      highlight: hero,
      panels: [{ x: box.x, y: box.y, width: box.w, height: box.h, t: null }]
    }
  }
}

/** layout 'strip' (see the file comment). */
export function makeStrip(spec, owner) {
  const style = styleOf(spec)
  const box = boxOption(owner, spec, [440, 150])
  const model = flowModel(spec, owner, { place: 'centre', paths: 12 })
  const times = snapshotsOption(owner, spec, [0, 1 / 3, 2 / 3, 1])
  const size = spec.labelSize ?? style.smallSize ?? 14
  const gap = numberOption(owner, 'gap', spec.gap, 12)
  const below = (spec.labels === false ? 0 : size * 1.4 + 6) + (spec.axis === false ? 0 : 16)
  const side = Math.min(box.h - below, (box.w - gap * (times.length - 1)) / times.length)
  if (side < 24) {
    throw new Error(
      `${owner}: each panel would be ${Math.round(side)} units across; give it more w or h, or fewer snapshots`
    )
  }
  const warnings = []
  if (side < 72) {
    warnings.push(
      `${owner}: its panels are ${Math.round(side)} units (${(side / 144).toFixed(2)} in) across, too small to read p_t at print; use fewer snapshots (${Math.max(2, Math.floor((box.w + gap) / (72 + gap)))} fit), a taller box or a second row`
    )
  }
  const color = spec.color ?? 'accent'
  const left = box.x + (box.w - (side * times.length + gap * (times.length - 1))) / 2
  const extent = unionExtent(
    times.map((t) => distExtent(model.marginal(t), 2.4)),
    model.paths
  )
  const elements = []
  const anchors = {}
  const panels = []
  let cut = false
  const hero = model.highlight
  const ink = style.ink
  times.forEach((t, k) => {
    const panel = { x: left + k * (side + gap), y: box.y, w: side, h: side }
    const map = fitMap(extent, panel, 0.05)
    if (spec.outline !== false) {
      elements.push(
        pathPart(
          spec,
          `t${k}-frame`,
          [
            [panel.x, panel.y],
            [panel.x + side, panel.y],
            [panel.x + side, panel.y + side],
            [panel.x, panel.y + side]
          ],
          {
            closed: true,
            fill: 'transparent',
            stroke: '#c9c4bf',
            width: 0.75
          }
        )
      )
    }
    const tint =
      spec.tint === 'time'
        ? blend('#9a9a9a', glyphSolid(style, color), t)
        : t === 0
          ? (spec.fromColor ?? color)
          : color
    if (spec.density !== false) {
      const scene = map.dist(model.marginal(t))
      const drawn = densityParts(spec, scene, gridBox(scene, panel), {
        levels: spec.levels ?? 5,
        look: spec.fill === 'none' ? 'line' : 'filled',
        color: tint,
        prefix: `t${k}-band`
      })
      cut ||= drawn.cut
      elements.push(...drawn.elements)
    }
    const scenePaths = model.paths.map((path) => path.map(map.point))
    const order = [...scenePaths.keys()].toSorted((a, b) => (a === hero) - (b === hero))
    for (const index of order) {
      const lit = index === hero
      const here = pointAt(scenePaths[index], t)
      if (spec.trails !== false && t > 0) {
        elements.push(
          pathPart(spec, `t${k}-trail${index}`, pathBetween(scenePaths[index], 0, t), {
            stroke: lit ? ink : '#6f6a66',
            width: lit ? 1.8 : 0.9,
            opacity: lit ? undefined : 60
          })
        )
      }
      elements.push(
        dotPart(spec, `t${k}-p${index}`, here, {
          r: numberOption(owner, 'r', spec.r, 2.2) * (lit ? 1.25 : 1),
          fill: lit ? ink : '#3d3935',
          rim: '#ffffff',
          rimWidth: 0.6
        })
      )
      anchors[`t${k}.path${index}`] = here.map(r2)
    }
    anchors[`t${k}.center`] = [r2(panel.x + side / 2), r2(panel.y + side / 2)]
    panels.push({ x: r2(panel.x), y: r2(panel.y), width: r2(side), height: r2(side), t })
    if (spec.labels !== false) {
      const text = Array.isArray(spec.labels)
        ? spec.labels[k]
        : `$t = ${Math.round(t * 100) / 100}$`
      if (text) {
        elements.push(
          ...labelPart(
            spec,
            `t${k}-label`,
            text,
            { cx: panel.x + side / 2, y: panel.y + side + 6 },
            { size }
          )
        )
      }
    }
  })
  if (spec.axis !== false) {
    const y = box.y + side + (spec.labels === false ? 8 : size * 1.4 + 12)
    const [x0, x1] = [panels[0].x + side * 0.15, panels.at(-1).x + side * 0.85]
    elements.push(
      pathPart(
        spec,
        'axis',
        [
          [x0, y],
          [x1 - 6, y]
        ],
        { stroke: style.line, width: 1.25 }
      ),
      headPart(spec, 'axis-head', [x0, y], [x1, y], { color: style.line, length: 7, width: 5.5 })
    )
  }
  if (cut) {
    warnings.push(
      `${owner}: a density is cut by its panel's edge; use narrower dists or larger panels`
    )
  }
  return {
    elements: [
      anchorPart(spec, box, 'flow', { layout: 'strip', coupling: model.coupling, t: times }),
      ...elements
    ],
    warnings,
    extra: { anchors, panels, highlight: hero }
  }
}
