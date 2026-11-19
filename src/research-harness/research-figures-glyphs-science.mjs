// Flow paths between two density glyphs drawn in their own boxes (straight, curved ODE or
// stochastic SDE), computed from the mixture maths so they land on the data. The densities,
// samples and snapshots themselves are drawn by research-figures-glyphs-density.mjs and
// research-figures-glyphs-flow.mjs. Pure makers.
import { seeded, simplifyPath } from './research-figures-science-math.mjs'
import { couple, integratePaths, sampleCore } from './research-figures-science-flow.mjs'
import {
  anchorPart,
  countOption,
  dotPart,
  glyphInk,
  glyphSolid,
  headPart,
  numberOption,
  pathPart,
  timeColor,
  TIME_START
} from './research-figures-science-parts.mjs'
import { oneOf } from './research-figures-options.mjs'
import { styleOf } from './research-figures-type.mjs'

const STYLES = ['straight', 'curved', 'stochastic']

/**
 * `flowPaths`: n paths from samples of `from` to `to` (each `{ mixture, box }`). straight with
 * coupling 'ot' never cross; 'random' pairs cross. curved follows the marginal ODE, stochastic
 * the SDE. tone 'ramp' runs gray → colour along t, 'fade' raises opacity, 'flat' one colour.
 */
export function makeFlowPaths(spec) {
  const owner = `flowPaths ${spec.id}`
  const style = styleOf(spec)
  const kind = oneOf('style', spec.kind ?? 'curved', STYLES)
  const coupling = oneOf('coupling', spec.coupling ?? 'ot', ['ot', 'random'])
  const tone = oneOf('tone', spec.tone ?? 'ramp', ['ramp', 'fade', 'flat'])
  const n = countOption(owner, 'n', spec.n, 10, [1, 64])
  const segments = countOption(owner, 'segments', spec.segments, tone === 'flat' ? 1 : 6, [1, 24])
  const width = numberOption(owner, 'strokeWidth', spec.strokeWidth, 1.25)
  const random = seeded(numberOption(owner, 'seed', spec.seed, 1))
  const { from, to } = spec
  if (!from?.mixture || !to?.mixture) {
    throw new Error(
      `${owner}: from and to need a distribution: a density2d or samples id, or { x, y, w, h, dist }`
    )
  }
  const raw =
    kind === 'straight'
      ? couple(from.mixture, to.mixture, n, { coupling, random }).map(([a, b]) => [a, b])
      : integratePaths(from.mixture, to.mixture, sampleCore(from.mixture, n, random, 1.8), {
          kind: kind === 'curved' ? 'ode' : 'sde',
          steps: kind === 'curved' ? 40 : 64,
          noise: numberOption(owner, 'noise', spec.noise, 1),
          random
        })
  const paths = raw.map((path) =>
    kind === 'stochastic'
      ? simplifyPath(path, 0.15)
      : kind === 'curved'
        ? simplifyPath(path, 0.2)
        : path
  )
  const color = spec.color ?? 'accent'
  const ink = glyphInk(style, color)
  const start = spec.startColor ? glyphInk(style, spec.startColor) : TIME_START
  const elements = []
  paths.forEach((path, p) => {
    const pieces = splitPath(path, segments)
    pieces.forEach((piece, s) => {
      const t = pieces.length === 1 ? 1 : (s + 1) / pieces.length
      elements.push(
        pathPart(spec, `path${p}-${s}`, piece, {
          stroke: tone === 'ramp' ? timeColor(style, color, t, start) : ink,
          width,
          opacity: tone === 'fade' ? Math.round(30 + 70 * t) : spec.opacity
        })
      )
    })
    if (spec.ends !== false) {
      elements.push(dotPart(spec, `start${p}`, path[0], { r: 1.6, fill: start }))
      elements.push(
        dotPart(spec, `end${p}`, path.at(-1), {
          r: 2,
          fill: glyphSolid(style, color),
          rim: '#ffffff',
          rimWidth: 0.6
        })
      )
    }
    if (spec.head) {
      elements.push(
        headPart(spec, `head${p}`, path.at(-2), path.at(-1), { color: ink, length: 5, width: 4 })
      )
    }
  })
  const xs = paths.flat().map((point) => point[0])
  const ys = paths.flat().map((point) => point[1])
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs) || 1,
    h: Math.max(...ys) - Math.min(...ys) || 1
  }
  const anchor = anchorPart(spec, box, 'flowPaths', { style: kind, n })
  // Why placed: its box is wherever the paths run, not a place to line up with others.
  anchor.customData.asterPlaced = true
  return {
    elements: [anchor, ...elements],
    warnings: [],
    paths,
    extra: { ends: paths.map((path) => [path[0], path.at(-1)]) }
  }
}

/** A path cut into `count` runs of equal point share, each starting where the last ended. */
export function splitPath(path, count) {
  if (count <= 1 || path.length < 3) {
    if (count > 1 && path.length === 2) {
      const [[ax, ay], [bx, by]] = path
      return Array.from({ length: count }, (_, k) => [
        [ax + ((bx - ax) * k) / count, ay + ((by - ay) * k) / count],
        [ax + ((bx - ax) * (k + 1)) / count, ay + ((by - ay) * (k + 1)) / count]
      ])
    }
    return [path]
  }
  const pieces = []
  const step = (path.length - 1) / count
  for (let k = 0; k < count; k += 1) {
    const a = Math.round(k * step)
    const b = Math.max(a + 1, Math.round((k + 1) * step))
    pieces.push(path.slice(a, b + 1))
  }
  return pieces.filter((piece) => piece.length >= 2)
}
