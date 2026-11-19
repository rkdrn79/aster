// The kit's science glyphs on top of its add/claim/insert core: densities, samples, flow paths,
// snapshots along t, 1D trajectories, vector fields, loss surfaces, manifolds and spheres. A
// glyph's id is an invisible box arrows bind to; densities keep their mixture on it, so
// `samples({ of })`, `flowPaths({ from, to })` and `field({ of })` reuse the same distribution.
import { warnKit } from './research-figures-cards.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { mixtureIn, moveMixture } from './research-figures-science-math.mjs'
import { boxOption } from './research-figures-science-parts.mjs'
import { makeFlowPaths } from './research-figures-glyphs-science.mjs'
import { makeDensity, makeDensity2d, makeSamples } from './research-figures-glyphs-density.mjs'
import { makeFlow } from './research-figures-glyphs-flow.mjs'
import { makeField, makeTrajectories } from './research-figures-glyphs-fields.mjs'
import { makeManifold, makeSphere, makeSurface3d } from './research-figures-glyphs-solid.mjs'
import {
  makeScene3d,
  makeSnapshots3d,
  makeSpacetime,
  makeTesseract,
  makeTimebar
} from './research-figures-glyphs-4d.mjs'
import { makeCurveManifold, makeEllipse } from './research-figures-glyphs-curves.mjs'
import { makePathDensity } from './research-figures-glyphs-pathdensity.mjs'
import { labelLines, makeLines, texLabel } from './research-figures-type.mjs'

/** The pure makers by kit name, for drawing and for `measure`. */
export const SCIENCE_MAKERS = {
  density: makeDensity,
  density2d: makeDensity2d,
  flow: makeFlow,
  samples: makeSamples,
  flowPaths: makeFlowPaths,
  snapshots: makeSnapshotsFlow,
  trajectories: makeTrajectories,
  field: makeField,
  surface3d: makeSurface3d,
  manifold: makeManifold,
  sphere: makeSphere,
  scene3d: makeScene3d,
  snapshots3d: makeSnapshots3d,
  spacetime: makeSpacetime,
  tesseract: makeTesseract,
  timebar: makeTimebar,
  ellipse: makeEllipse,
  curveManifold: makeCurveManifold,
  pathDensity: makePathDensity
}

/** `snapshots`, the older strip of p_t: a `flow` strip without paths, gray turning to the colour. */
function makeSnapshotsFlow(spec) {
  return makeFlow({
    ...spec,
    layout: 'strip',
    from: spec.from ?? 'gaussian',
    to: spec.to ?? '8gaussians',
    tint: 'time',
    levels: spec.levels ?? 4,
    fill: spec.fill === false ? 'none' : undefined,
    paths: spec.samples ?? 0,
    trails: false,
    highlight: false,
    outline: spec.outline ?? false
  })
}

/** Density looks named by `style` (the kit's own `style` is the colour preset, so it moves to `look`). */
const LOOK_NAMES = new Set(['filled', 'line', 'lines', 'samples'])
function withLook(spec, box) {
  const area = box ? boxArgument(box) : {}
  const out = { ...area, ...spec }
  if (typeof spec?.style === 'string' && LOOK_NAMES.has(spec.style)) {
    out.look = spec.style
    out.style = undefined
  }
  return out
}

/** A box given as the second argument: { x, y, w, h }, { x, y, width, height }, or a teaserGrid panel (its body). */
function boxArgument(box) {
  const area = box.body ?? box
  const w = area.w ?? area.width
  const h = area.h ?? area.height
  if (![area.x, area.y, w, h].every(Number.isFinite)) {
    throw new Error(
      `the box argument must be { x, y, w, h } (or a teaserGrid panel), not ${JSON.stringify(box)}`
    )
  }
  return { x: area.x, y: area.y, w, h }
}

function union(elements) {
  const boxes = elements.map(elementBounds)
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/** A glyph's label (TeX unless `labelText`) on `labelSide`: below (default), above, left, right. */
function labelElements(spec, elements, style) {
  if (spec.label === undefined && spec.labelText === undefined) {
    return []
  }
  // Why the glyph's own box: densities in a row then carry their labels on one line.
  const anchor = elements.find(
    (element) => element.id === spec.id && element.customData?.asterScience
  )
  const box = anchor
    ? {
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height,
        right: anchor.x + anchor.width,
        bottom: anchor.y + anchor.height
      }
    : union(
        elements.filter(
          (element) =>
            element.backgroundColor !== 'transparent' || element.strokeColor !== 'transparent'
        )
      )
  const size = spec.labelSize ?? style.textSize ?? 16
  const label =
    spec.labelText !== undefined
      ? [String(spec.labelText).replaceAll('$', '\\$')]
      : texLabel(spec.label)
  const lines = labelLines(label, size, undefined, style)
  const side = spec.labelSide ?? 'below'
  const where =
    side === 'above'
      ? { cx: box.x + box.width / 2, baseline: undefined, y: box.y - 6 - size * 1.25 }
      : side === 'left'
        ? { x: box.x - 6, align: 'right', cy: box.y + box.height / 2 }
        : side === 'right'
          ? { x: box.right + 6, cy: box.y + box.height / 2 }
          : { cx: box.x + box.width / 2, y: box.bottom + 6 }
  const groupIds = [...(spec.groupIds ?? []), `${spec.id}-glyph`]
  return makeLines(
    {
      id: `${spec.id}-label`,
      size,
      color: spec.labelColor,
      style,
      frame: spec.frame,
      groupIds,
      ...where
    },
    lines
  ).elements
}

export function scienceMethods(core, figOf = () => null) {
  const styleNow = () => core.styled({}).style
  /** A distribution: a glyph id (its mixture and box), or `{ x, y, w, h, dist }`. */
  const distribution = (owner, role, value) => {
    if (typeof value === 'string') {
      const anchor = core.need(value)
      const science = anchor.customData?.asterScience
      if (!science?.mixture) {
        throw new Error(
          `${owner}: ${role} ${value} is not a density2d or samples glyph (it carries no distribution)`
        )
      }
      return {
        mixture: science.mixture,
        box: { x: anchor.x, y: anchor.y, w: anchor.width, h: anchor.height }
      }
    }
    if (value && typeof value === 'object') {
      const box = boxOption(`${owner} ${role}`, value, [100, 100])
      return { mixture: mixtureIn(value.dist ?? 'gaussian', box), box }
    }
    throw new Error(`${owner}: ${role} must be a density2d id or { x, y, w, h, dist }`)
  }
  const draw = (name, spec, extra = {}) => {
    if (!spec?.id) {
      throw new Error(`${name}({ id, … }) needs an id`)
    }
    const result = SCIENCE_MAKERS[name](core.styled({ ...spec, ...extra }))
    const style = styleNow()
    const elements = [...result.elements, ...labelElements(spec, result.elements, style)]
    ;(core.warn ?? warnKit)(result.warnings ?? [])
    core.claim(spec.id, elements)
    core.insert(elements)
    const bounds = core.bounds(spec.id)
    return { id: spec.id, ...bounds, ...result.extra, warnings: result.warnings ?? [] }
  }
  /**
   * `of: id` reuses a density's mixture: in its box unless x, y, w, h are given, else moved into
   * that box (one scale, centred), so a score field or a cloud can sit beside its density.
   */
  const fromGlyph = (owner, spec) => {
    if (!spec.of) {
      return {}
    }
    const { mixture, box } = distribution(owner, 'of', spec.of)
    const own = ['x', 'y', 'w', 'h'].some((key) => spec[key] !== undefined)
    const target = {
      x: spec.x ?? box.x,
      y: spec.y ?? box.y,
      w: spec.w ?? box.w,
      h: spec.h ?? box.h
    }
    return { mixture: own ? moveMixture(mixture, box, target) : mixture, ...target }
  }
  /** Pictures a flow asked for at its ends, placed as kit images in the slots it left. */
  const placePictures = (spec, result) => {
    const fig = figOf()
    for (const slot of result.pictures ?? []) {
      const { picture } = slot
      const image = {
        id: `${spec.id}-${slot.key}-image`,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        ...(picture.src ? { src: picture.src } : { kind: picture.kind ?? 'noise' }),
        ...(picture.seed !== undefined ? { seed: picture.seed } : {}),
        ...(picture.tint ? { tint: picture.tint } : {}),
        // Why an icon: an end's thumbnail (X_0, X_1) is a marker beside its density, small by design.
        ...(slot.w < 72 ? { icon: true } : {})
      }
      if (!fig) {
        throw new Error(`flow ${spec.id}: pictures need the figure (open it with openFigure)`)
      }
      fig.image(image)
    }
    return result
  }
  return {
    density: (spec, box) => draw('density', withLook(spec, box)),
    density2d: (spec, box) => draw('density2d', withLook(spec, box)),
    flow: (spec, box) =>
      placePictures(spec, draw('flow', box ? { ...boxArgument(box), ...spec } : spec)),
    samples: (spec, box) => {
      const full = box ? { ...boxArgument(box), ...spec } : spec
      return draw('samples', full, fromGlyph(`samples ${spec?.id}`, full ?? {}))
    },
    flowPaths: (spec) =>
      draw('flowPaths', spec, {
        from: distribution(`flowPaths ${spec?.id}`, 'from', spec?.from),
        to: distribution(`flowPaths ${spec?.id}`, 'to', spec?.to),
        // Why `kind`: `style` is the kit's colour preset everywhere else; both name the path shape.
        style: undefined,
        kind: spec?.kind ?? spec?.style
      }),
    snapshots: (spec) => draw('snapshots', spec),
    trajectories: (spec) =>
      draw('trajectories', spec, { style: undefined, kind: spec?.kind ?? spec?.style }),
    field: (spec) =>
      draw('field', spec, {
        ...fromGlyph(`field ${spec?.id}`, spec ?? {}),
        ...(spec?.from ? { from: distribution(`field ${spec.id}`, 'from', spec.from) } : {}),
        ...(spec?.to ? { to: distribution(`field ${spec.id}`, 'to', spec.to) } : {})
      }),
    surface3d: (spec) => draw('surface3d', spec),
    manifold: (spec) => draw('manifold', spec),
    sphere: (spec) => draw('sphere', spec),
    scene3d: (spec) => draw('scene3d', spec),
    snapshots3d: (spec) => draw('snapshots3d', spec),
    spacetime: (spec) => draw('spacetime', spec),
    tesseract: (spec) => draw('tesseract', spec),
    timebar: (spec) => draw('timebar', spec),
    ellipse: (spec) => draw('ellipse', spec),
    curveManifold: (spec) => draw('curveManifold', spec),
    pathDensity: (spec, box) => draw('pathDensity', box ? { ...boxArgument(box), ...spec } : spec)
  }
}
