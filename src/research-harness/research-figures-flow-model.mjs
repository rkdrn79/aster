// The numbers of a flow glyph before anything is drawn: the two distributions placed in model
// units for the layout (side by side for a panel, both centred for a strip, planes or an
// overlay), the coupling and its paths (marginal-flow ODE or SDE, straight independent or OT
// pairs), p_t at any t (closed form, or a KDE of OT pairs), the highlighted path and the
// velocity at a point. Shared by every flow layout; pure.
import { distExtent, placeDist, resolveDist, sampleDist } from './research-figures-dist.mjs'
import {
  assignment,
  interpolant,
  odePaths,
  pairMarginal,
  pairSamples,
  pointAt,
  sdePaths,
  straightPaths
} from './research-figures-interp.mjs'
import { inv2, seeded } from './research-figures-science-math.mjs'
import { countOption, numberOption } from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'

export const COUPLINGS = ['marginal', 'ot', 'independent']
const COUPLING_ALIASES = {
  random: 'independent',
  icfm: 'independent',
  'i-cfm': 'independent',
  ode: 'marginal',
  'ot-cfm': 'ot'
}

/**
 * A panel's source (left) and target (right), scaled (fromScale 0.5, toScale 1) and spread so the
 * pair fills a box of `aspect` (w / h): the gap between them grows with a wide box, never under
 * room for the p_t between them (`inner` intermediate snapshots).
 */
function panelPlace(from, to, spec, { aspect = 1.45, inner = 0, pictures = 0 }) {
  const a = placeDist(from, { scale: spec.fromScale ?? 0.5 })
  // Why smaller with pictures: the thumbnails need the corners the data would otherwise fill.
  const b = placeDist(to, { scale: spec.toScale ?? (pictures ? 0.88 : 1) })
  const [ea, eb] = [distExtent(a, 2.5), distExtent(b, 2.5)]
  const height = Math.max(ea.y1 - ea.y0, eb.y1 - eb.y0) + 0.24
  const [wa, wb] = [ea.x1 - ea.x0, eb.x1 - eb.x0]
  const least = wa / 2 + wb / 2 + (inner ? 0.55 + 0.42 * inner : 0.5)
  const spread = Math.min(least + 1.6, Math.max(least, aspect * height - 0.24 - wa / 2 - wb / 2))
  const flip = spec.direction === 'left' ? -1 : 1
  const shift = (dist, extent, x) =>
    placeDist(dist, { at: [flip * x - (extent.x0 + extent.x1) / 2, -(extent.y0 + extent.y1) / 2] })
  return [shift(a, ea, -spread / 2), shift(b, eb, spread / 2)]
}

/** Samples within `reach` standard deviations of their component, so paths start inside the rings. */
export function coreSamples(dist, n, random, reach = 2) {
  const points = []
  for (let tries = 0; points.length < n && tries < 40; tries += 1) {
    for (const point of sampleDist(dist, n, random)) {
      const near = dist.components.some(({ mean, cov }) => {
        const [dx, dy] = [point[0] - mean[0], point[1] - mean[1]]
        const [p, q, r] = inv2(cov)
        return p * dx * dx + 2 * q * dx * dy + r * dy * dy <= reach * reach
      })
      if (near && points.length < n) {
        points.push(point)
      }
    }
  }
  return points
}

/** The paths option as { n, kind, seed, eps, opacity, width, color }. */
export function pathsOption(owner, spec, fallback) {
  const raw =
    spec.paths === false
      ? { n: 0 }
      : typeof spec.paths === 'number'
        ? { n: spec.paths }
        : (spec.paths ?? {})
  const n = countOption(owner, 'paths', raw.n, fallback, [0, 400])
  const sde = raw.kind === 'sde' || (spec.sde !== undefined && spec.sde !== false)
  const eps =
    typeof spec.sde === 'number'
      ? spec.sde
      : numberOption(owner, 'paths.eps', raw.eps ?? raw.noise, 0.2)
  if (eps < 0) {
    throw new Error(`${owner}: sde (ε) must be 0 or more, not ${eps}`)
  }
  return {
    ...raw,
    n,
    sde,
    eps: raw.noise !== undefined && raw.eps === undefined ? 0.2 * raw.noise : eps
  }
}

/** The coupling, from `coupling` or an older paths.kind ('straight' with paths.coupling). */
export function couplingOption(spec) {
  const raw =
    spec.coupling ?? (spec.paths?.kind === 'straight' ? (spec.paths.coupling ?? 'ot') : 'marginal')
  return oneOf('coupling', COUPLING_ALIASES[raw] ?? raw, COUPLINGS)
}

/**
 * The model of a flow: `{ from, to, interp, paths, marginal(t), velocity(x, t), highlight }`.
 * `place` is 'panel' (source left, target right) or 'centre' (both at the origin).
 */
export function flowModel(
  spec,
  owner,
  { place = 'panel', paths: defaultPaths = 40, aspect, inner, pictures } = {}
) {
  const coupling = couplingOption(spec)
  const noise = numberOption(owner, 'noise', spec.noise, 0)
  let from = resolveDist(spec.from ?? 'gaussian', `${owner} from`)
  let to = resolveDist(spec.to ?? 'data', `${owner} to`)
  if (place === 'panel') {
    ;[from, to] = panelPlace(from, to, spec, { aspect, inner, pictures })
  }
  const interp = interpolant(from, to, { noise })
  const options = pathsOption(owner, spec, defaultPaths)
  const random = seeded(numberOption(owner, 'seed', spec.seed ?? options.seed, 1))
  const starts = options.n ? coreSamples(from, options.n, random, 1.9) : []
  let pairs = null
  let paths = []
  if (options.n) {
    if (coupling === 'marginal') {
      paths = options.sde
        ? sdePaths(interp, starts, { eps: options.eps, steps: 140, random })
        : odePaths(interp, starts, { steps: 64 })
    } else {
      const targets = coreSamples(to, starts.length, random, 1.9)
      pairs = coupling === 'ot' ? otPairs(starts, targets) : starts.map((a, k) => [a, targets[k]])
      paths = straightPaths(pairs, 32)
    }
  }
  let kdePairs = null
  const marginal = (t) => {
    if (coupling !== 'ot') {
      return interp.marginal(t)
    }
    kdePairs ??= pairSamples(from, to, 260, { coupling: 'ot', random: seeded(7) })
    return pairMarginal(kdePairs, t, { from, to })
  }
  const velocity = (x, t, index) => {
    if (coupling === 'marginal' || index === undefined || !pairs) {
      return interp.field(x, t).velocity
    }
    const [a, b] = pairs[index]
    return [b[0] - a[0], b[1] - a[1]]
  }
  return {
    coupling,
    from,
    to,
    interp,
    paths,
    pairs,
    options,
    marginal,
    velocity,
    highlight: chooseHighlight(spec, owner, paths, to),
    extent: unionExtent([distExtent(from, 2.5), distExtent(to, 2.5)], paths)
  }
}

/** OT pairs of these exact points: the drawn lines are the plan of this minibatch. */
function otPairs(starts, targets) {
  const n = Math.min(starts.length, targets.length)
  const [a, b] = [starts.slice(0, n), targets.slice(0, n)]
  const match = assignment(a, b)
  return a.map((point, index) => [point, b[match[index]]])
}

/** The extent of some boxes and the points of some paths (model units). */
export function unionExtent(boxes, paths = []) {
  const all = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
  for (const box of boxes) {
    all.x0 = Math.min(all.x0, box.x0)
    all.x1 = Math.max(all.x1, box.x1)
    all.y0 = Math.min(all.y0, box.y0)
    all.y1 = Math.max(all.y1, box.y1)
  }
  for (const path of paths) {
    for (const [x, y] of path) {
      all.x0 = Math.min(all.x0, x)
      all.x1 = Math.max(all.x1, x)
      all.y0 = Math.min(all.y0, y)
      all.y1 = Math.max(all.y1, y)
    }
  }
  return all
}

/**
 * The example path: `highlight` (an index, false, or true for a typical one: among the paths
 * that land deepest in the data, the one that travels farthest across, so its curve shows).
 */
function chooseHighlight(spec, owner, paths, to) {
  if (spec.highlight === false || !paths.length) {
    return null
  }
  if (Number.isInteger(spec.highlight)) {
    if (spec.highlight < 0 || spec.highlight >= paths.length) {
      throw new Error(`${owner}: highlight must be a path index from 0 to ${paths.length - 1}`)
    }
    return spec.highlight
  }
  const scored = paths.map((path, index) => {
    const end = path.at(-1)
    const near = Math.min(
      ...to.components.map(({ mean, cov }) => {
        const [dx, dy] = [end[0] - mean[0], end[1] - mean[1]]
        const [p, q, r] = inv2(cov)
        return p * dx * dx + 2 * q * dx * dy + r * dy * dy
      })
    )
    const mid = pointAt(path, 0.5)
    const chord = [(path[0][0] + end[0]) / 2, (path[0][1] + end[1]) / 2]
    return {
      index,
      near,
      bend: Math.hypot(mid[0] - chord[0], mid[1] - chord[1]),
      rise: Math.abs(end[1] - path[0][1])
    }
  })
  const deep = scored
    .toSorted((a, b) => a.near - b.near)
    .slice(0, Math.max(1, Math.ceil(paths.length / 2)))
  // Why apart from the bulk: an example that ends where few others do stays visible over the bundle.
  const ends = paths.map((path) => path.at(-1))
  const mean = ends.reduce(
    (sum, [x, y]) => [sum[0] + x / ends.length, sum[1] + y / ends.length],
    [0, 0]
  )
  const apart = ({ index }) => Math.hypot(ends[index][0] - mean[0], ends[index][1] - mean[1])
  return deep.toSorted(
    (a, b) => apart(b) + 0.5 * (b.rise + b.bend) - (apart(a) + 0.5 * (a.rise + a.bend))
  )[0].index
}
