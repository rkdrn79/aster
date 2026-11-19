// A density drawn the way contour plots in papers look: the density is evaluated on a grid,
// cut at levels that hold set shares of its mass, and drawn as filled bands (pale outside to a
// deep shade inside, each edged with a thin dark line, as matplotlib's contourf + contour) or
// as thin unfilled lines (an intermediate p_t). Distributions come from the seeded library, so
// a short call (`dist: 'moons'`) draws a real density; samples draw from the same numbers.
import {
  DIST_NAMES,
  distExtent,
  fitMap,
  gridDensity,
  resolveDist,
  sampleDist
} from './research-figures-dist.mjs'
import {
  contourBands,
  densityEdge,
  densityLine,
  densityRamp,
  levelMasses
} from './research-figures-contours.mjs'
import { mixtureIn, seeded } from './research-figures-science-math.mjs'
import {
  anchorPart,
  boxOption,
  countOption,
  dotPart,
  glyphSolid,
  numberOption,
  pathPart
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

/** The shade (0–1 along the ramp) of band k of n: pale outside, deep at the core. */
const bandShade = (k, n) => (n === 1 ? 0.45 : 0.06 + (0.9 * k) / (n - 1))

/**
 * The contour elements of a mixture. `dist` and `box` are in one coordinate system (scene units
 * unless `map` takes points from it to the page; `map` must be affine). style 'filled' paints
 * bands from the outside in, 'line' draws each level as a thin closed line. Returns the elements
 * and whether an outline meets the box edge (the density is cut).
 */
export function densityParts(spec, dist, box, options = {}) {
  const style = styleOf(spec)
  const {
    levels = 6,
    look = 'filled',
    color = 'accent',
    prefix = 'band',
    map = (point) => point,
    unit = 1,
    background = '#ffffff',
    opacity,
    lineColor,
    edgeColor,
    strokeWidth,
    inner
  } = options
  // Why `inner`: unfilled p_t lines use the filled ends' levels minus the outermost, one set of masses.
  const masses = inner ? levelMasses(levels).slice(1) : levelMasses(levels)
  // Why per unit: the grid stays about one scene unit fine whatever units the box is in.
  const cell = Math.max(1.1 / unit, Math.min(box.w, box.h) / 110)
  const grid = gridDensity(dist, box, Math.min(cell, Math.min(box.w, box.h) / 40))
  const loops = contourBands(grid, masses, { tolerance: 0.18 / unit })
  const ramp = densityRamp(style, color)
  const edge = edgeColor ?? densityEdge(style, color)
  const line = lineColor ?? densityLine(style, color)
  const n = masses.length
  const width = strokeWidth ?? (look === 'filled' ? 0.9 : 1)
  let cut = false
  const outlines = []
  const elements = loops.map((loop, index) => {
    const onEdge = loop.points.some(
      ([px, py]) =>
        px <= box.x + grid.dx * 0.6 ||
        py <= box.y + grid.dy * 0.6 ||
        px >= box.x + box.w - grid.dx * 0.6 ||
        py >= box.y + box.h - grid.dy * 0.6
    )
    cut ||= onEdge && loop.band === 0
    const points = loop.points.map(map)
    if (loop.band === 0 && !loop.hole) {
      outlines.push(points)
    }
    const fill =
      look !== 'filled'
        ? 'transparent'
        : loop.hole
          ? loop.band === 0
            ? background
            : ramp(bandShade(loop.band - 1, n))
          : ramp(bandShade(loop.band, n))
    const part = pathPart(spec, `${prefix}${loop.band}-${index}`, points, {
      closed: true,
      fill,
      stroke: look === 'filled' ? edge : line,
      width,
      opacity
    })
    part.customData = {
      ...part.customData,
      asterRing: {
        mass: Math.round(masses[loop.band] * 1000) / 1000,
        hole: loop.hole,
        band: loop.band
      }
    }
    return part
  })
  return { elements, cut, grid, outlines }
}

/** The model box a preset is drawn in: [-1, 1]² and a little air, or wider for a wide dist. */
export function modelExtent(dist, range) {
  if (range !== undefined) {
    const r = Array.isArray(range) ? range : [-range, range]
    return { x0: r[0], x1: r[1], y0: r[0], y1: r[1] }
  }
  const own = distExtent(dist, 2.7)
  const reach = Math.max(1.12, -own.x0, own.x1, -own.y0, own.y1)
  return { x0: -reach, x1: reach, y0: -reach, y1: reach }
}

const LOOKS = ['filled', 'line', 'lines', 'samples']

/** The distribution of a density or samples glyph in scene units, with its model → page map. */
export function sceneDist(spec, owner, box) {
  if (spec.mixture) {
    return { mixture: spec.mixture, map: null }
  }
  const dist = resolveDist(spec.dist ?? 'gaussian', owner)
  const map = fitMap(modelExtent(dist, spec.range), box, 0)
  return { mixture: map.dist(dist), map, model: dist }
}

/**
 * `density`: a 2D density as filled contour bands (style 'filled', the default) or thin lines
 * ('line'): dist a preset (DIST_NAMES), a Gaussian { mean, cov }, a mixture { components } or a
 * KDE { points }, in model units ([-1, 1]² fills the box's centred square).
 */
export function makeDensity(spec) {
  const owner = `density ${spec.id}`
  const box = boxOption(owner, spec, [140, 140])
  const look = oneOf('style', spec.look ?? 'filled', LOOKS)
  const { mixture } = sceneDist(spec, owner, box)
  const color = spec.color ?? 'accent'
  const elements = []
  const warnings = []
  if (spec.background) {
    elements.push(backgroundPart(spec, box, color, spec.background))
  }
  if (look === 'samples') {
    const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
    const n = countOption(owner, 'n', spec.n, 400, [1, 4000])
    const style = styleOf(spec)
    for (const [index, point] of sampleDist(mixture, n, random).entries()) {
      elements.push(
        dotPart(spec, `s${index}`, point, {
          r: numberOption(owner, 'r', spec.r, 1.2),
          fill: glyphSolid(style, color),
          opacity: spec.opacity ?? 35
        })
      )
    }
  } else {
    const drawn = densityParts(spec, mixture, box, {
      levels: spec.levels ?? (look === 'filled' ? 6 : 5),
      look: look === 'filled' ? 'filled' : 'line',
      color,
      background: typeof spec.background === 'string' ? spec.background : '#ffffff',
      opacity: spec.opacity,
      strokeWidth: spec.strokeWidth
    })
    elements.push(...drawn.elements)
    if (drawn.cut) {
      warnings.push(
        `${owner}: its outer ring is cut by the box edge; give it a larger w and h, a narrower dist, or range: 1.4`
      )
    }
  }
  return {
    elements: [anchorPart(spec, box, 'density2d', { mixture, color }), ...elements],
    warnings,
    box,
    mixture
  }
}

/** The palest tint of the ramp over the whole box: the axes colour of a contourf plot. */
export function backgroundPart(spec, box, color, value) {
  const fill = typeof value === 'string' ? value : densityRamp(styleOf(spec), color)(0.02)
  return pathPart(
    spec,
    'background',
    [
      [box.x, box.y],
      [box.x + box.w, box.y],
      [box.x + box.w, box.y + box.h],
      [box.x, box.y + box.h]
    ],
    { closed: true, fill, stroke: 'transparent', width: 0.5 }
  )
}

/**
 * `density2d`, the older name: the same drawing; dist presets as above, but `{ components }`
 * there keeps its old meaning (means as shares of the box, v down; sigma a share of its side).
 */
export function makeDensity2d(spec) {
  const legacy = spec.dist && typeof spec.dist === 'object' && Array.isArray(spec.dist.components)
  const look = spec.look ?? (spec.fill === false ? 'line' : 'filled')
  if (!legacy) {
    return makeDensity({ ...spec, look, levels: spec.levels ?? undefined })
  }
  const box = boxOption(`density2d ${spec.id}`, spec, [120, 120])
  return makeDensity({ ...spec, look, mixture: mixtureIn(spec.dist, box) })
}

/** Points of a mixture inside the box (drawn again until n do). */
function samplesInside(mixture, box, n, random) {
  const inside = []
  for (let tries = 0; inside.length < n && tries < 20; tries += 1) {
    for (const point of sampleDist(mixture, n, random)) {
      const [px, py] = point
      if (
        inside.length < n &&
        px >= box.x &&
        px <= box.x + box.w &&
        py >= box.y &&
        py <= box.y + box.h
      ) {
        inside.push(point)
      }
    }
  }
  return inside
}

/** `samples`: a seeded point cloud of a dist (or another glyph's distribution through `of`). */
export function makeSamples(spec) {
  const owner = `samples ${spec.id}`
  const box = boxOption(owner, spec, [120, 120])
  const legacy = spec.dist && typeof spec.dist === 'object' && Array.isArray(spec.dist.components)
  const { mixture } = legacy ? { mixture: mixtureIn(spec.dist, box) } : sceneDist(spec, owner, box)
  const n = countOption(owner, 'n', spec.n, 60, [1, 2000])
  const style = styleOf(spec)
  const color = spec.color ?? 'accent'
  const fill = glyphSolid(style, color)
  const r = numberOption(owner, 'r', spec.r, n > 300 ? 1.4 : 2.2)
  const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
  const points = samplesInside(mixture, box, n, random)
  const rim = spec.rim === false || n > 300 ? undefined : (spec.rim ?? '#ffffff')
  return {
    elements: [
      anchorPart(spec, box, 'samples', { n: points.length, r, mixture }),
      ...points.map((point, index) =>
        dotPart(spec, `p${index}`, point, { r, fill, rim, opacity: spec.opacity })
      )
    ],
    warnings:
      points.length < n
        ? [`${owner}: only ${points.length} of ${n} samples fall inside its box`]
        : [],
    points,
    box,
    mixture
  }
}

export { DIST_NAMES }
