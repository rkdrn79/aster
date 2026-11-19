// Templates for generative-model and optimisation figures: a sampling teaser (noise → data,
// ODE vs SDE in 1D, or two kinds of transport paths in 2D), a loss landscape with optimisation
// runs in 3D beside its contour map, and a three-panel teaser that sets a schematic beside two
// real plots. The registry in research-figures-templates.mjs spreads these in.
import { warnKit } from './research-figures-cards.mjs'

const TITLES = {
  ode: 'Probability-flow ODE',
  sde: 'Reverse-time SDE',
  straight: 'Straight paths',
  curved: 'Curved paths (ODE)',
  stochastic: 'Stochastic paths (SDE)'
}

/**
 * Two panels side by side on one prior and one data distribution: in 1D (kind '1d') value
 * paths over t with the densities as end profiles, ode beside sde by default; in 2D the prior
 * (gray) and the data (accent) blobs joined by flow paths, curved beside straight by default.
 * Titles sit above each panel; `direction: 'left'` puts the data first (diffusion's t = 0).
 */
function flowTeaser(fig, spec) {
  const { id, x = 0, y = 0, w = 900, h = 240, gap = 40, seed = 3 } = spec
  const kind = spec.kind ?? '1d'
  if (!['1d', '2d'].includes(kind)) {
    throw new Error(`flow-teaser kind must be '1d' or '2d', not ${JSON.stringify(kind)}`)
  }
  const pair = spec.pair ?? (kind === '1d' ? ['ode', 'sde'] : ['curved', 'straight'])
  const allowed = kind === '1d' ? ['ode', 'sde', 'straight'] : ['curved', 'straight', 'stochastic']
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((item) => allowed.includes(item))) {
    throw new Error(`flow-teaser pair for kind ${kind} takes two of ${allowed.join(', ')}`)
  }
  const titles = spec.titles ?? pair.map((item) => TITLES[item])
  const size = 16
  const top = titles ? size * 1.25 + 8 : 0
  const pw = (w - gap) / 2
  // Why close together: the paths are the subject, so the two blobs frame them tightly. On a
  // narrow panel (a single column) the blobs take more of its width, and title and blobs sit in
  // the middle of the height, so they print large rather than leaving the lower half blank.
  const side = Math.min(h - top - 24, pw * (pw < 300 ? 0.42 : 0.34))
  const down = kind === '2d' ? Math.max(0, (h - top - 24 - side) / 2) : 0
  const ids = {}
  pair.forEach((style, k) => {
    const name = k === 0 ? 'a' : 'b'
    const px = x + k * (pw + gap)
    if (titles?.[k]) {
      fig.text({ id: `${id}-${name}-title`, text: titles[k], x: px, y: y + down, size })
      ids[`${name}Title`] = `${id}-${name}-title`
    }
    if (kind === '1d') {
      fig.trajectories({
        id: `${id}-${name}`,
        x: px,
        y: y + top,
        w: pw,
        h: h - top - 26,
        style,
        n: spec.n ?? 14,
        seed,
        from: spec.from,
        to: spec.to,
        direction: spec.direction,
        labels: spec.profileLabels,
        color: spec.color
      })
    } else {
      const span = Math.min(pw, side * 3.4)
      const left0 = px + (pw - span) / 2
      const [left, right] = spec.direction === 'left' ? ['data', 'noise'] : ['noise', 'data']
      const blob = (which, bx) =>
        fig.density2d({
          id: `${id}-${name}-${which}`,
          x: bx,
          y: y + top + down,
          w: side,
          h: side,
          dist: which === 'noise' ? 'gaussian' : (spec.data ?? '8gaussians'),
          color: which === 'noise' ? 'mid' : (spec.color ?? 'accent'),
          label:
            spec.profileLabels === false
              ? undefined
              : which === 'noise'
                ? (spec.profileLabels?.from ?? 'p_0')
                : (spec.profileLabels?.to ?? 'p_{\\mathrm{data}}'),
          labelSize: 14
        })
      blob(left, left0)
      blob(right, left0 + span - side)
      // Why allowed: the gap inside a panel (the paths' run) and between panels differ by design.
      fig.allow('uneven-spacing', [`${id}-${name}-noise`, `${id}-${name}-data`])
      fig.flowPaths({
        id: `${id}-${name}`,
        from: `${id}-${name}-noise`,
        to: `${id}-${name}-data`,
        style,
        n: spec.n ?? 12,
        seed,
        color: spec.color
      })
    }
    ids[name] = `${id}-${name}`
  })
  return { ids, in: [x, y + h / 2], out: [x + w, y + h / 2] }
}

/** A run's label in its path's colour: a role's ink, a #hex as is, gray runs in ink. */
function labelColor(color) {
  if (!color || ['muted', 'ink', 'line', 'mid'].includes(color)) {
    return 'ink'
  }
  return color.startsWith('#') ? color : `${color}-ink`
}

/**
 * A loss surface in 3D beside its contour map from above, the same optimisation runs on both
 * (gradient descent from each `from`), each named at its end on the map in its own colour.
 */
function lossLandscape(fig, spec) {
  const { id, x = 0, y = 0, w = 640, h = 240, gap = 24 } = spec
  const view = spec.view ?? 'both'
  if (!['both', '3d', 'top'].includes(view)) {
    throw new Error(`loss-landscape view must be both, 3d or top, not ${JSON.stringify(view)}`)
  }
  const runs = spec.paths ?? [
    { from: [-0.8, 0.9], lr: 0.04, steps: 120, label: 'SGD', color: 'muted' },
    { from: [0.15, 0.95], lr: 0.04, momentum: 0.4, steps: 160, label: 'ours', color: 'accent' }
  ]
  const paths = runs.map(({ label: _label, ...run }) => ({ ...run, color: run.color ?? 'ink' }))
  // Why a neutral surface under coloured runs: an accent surface hid the accent run on it.
  const surfaceColor =
    spec.color ??
    (runs.some((run) => run.color === 'accent' || run.color === 'a') ? 'mid' : undefined)
  const ids = {}
  const side = Math.min(h, view === 'top' ? w : (w - gap) * 0.42)
  const surfaceW = view === 'both' ? w - gap - side : w
  if (view !== 'top') {
    fig.surface3d({
      id: `${id}-surface`,
      x,
      y,
      w: surfaceW,
      h,
      f: spec.f,
      paths,
      azimuth: spec.azimuth,
      elevation: spec.elevation,
      color: surfaceColor
    })
    ids.surface = `${id}-surface`
  }
  if (view !== '3d') {
    const mx = view === 'top' ? x + (w - side) / 2 : x + surfaceW + gap
    const map = fig.surface3d({
      id: `${id}-map`,
      x: mx,
      y: y + (h - side) / 2,
      w: side,
      h: side,
      f: spec.f,
      view: 'top',
      paths,
      color: surfaceColor
    })
    ids.map = `${id}-map`
    // Why measured and searched: runs often end in one minimum, so fixed offsets overlapped each
    // other, the end dots and the page edge on a small figure.
    const placed = map.paths.flatMap(({ end: [ex, ey], points = [] }) => [
      { x: ex - 5, y: ey - 5, width: 10, height: 10 },
      ...points.map(([px, py]) => ({ x: px - 1, y: py - 1, width: 2, height: 2 }))
    ])
    const hits = (a, b) =>
      a.x < b.x + b.width + 2 &&
      b.x < a.x + a.width + 2 &&
      a.y < b.y + b.height + 1 &&
      b.y < a.y + a.height + 1
    runs.forEach((run, k) => {
      if (!run.label) {
        return
      }
      const [ex, ey] = map.paths[k].end
      const labelId = `${id}-label${k}`
      fig.text({ id: labelId, text: run.label, size: 14, color: labelColor(run.color), x: 0, y: 0 })
      const box = fig.bounds(labelId)
      const inside = ({ x: lx, y: ly }) => ({
        x: Math.max(mx, Math.min(lx, x + w - box.width)),
        y: Math.max(y, Math.min(ly, y + h - box.height))
      })
      const candidates = [
        [ex + 7, ey - box.height - 3],
        [ex - 7 - box.width, ey - box.height - 3],
        [ex + 7, ey + 3],
        [ex - 7 - box.width, ey + 3],
        [ex - box.width / 2, ey - box.height - 7],
        [ex - box.width / 2, ey + 7]
      ].map(([lx, ly]) => ({ ...inside({ x: lx, y: ly }), width: box.width, height: box.height }))
      const spot =
        candidates.find((at) => !placed.some((other) => hits(at, other))) ?? candidates[0]
      fig.move(labelId, spot.x - box.x, spot.y - box.y)
      placed.push(spot)
      ids[`label${k}`] = labelId
    })
  }
  return { ids, in: [x, y + h / 2], out: [x + w, y + h / 2] }
}

/**
 * Three panels: (a) a schematic of the method (the prior and the data joined by its paths, the
 * model named over them) and (b), (c) two real plots placed with fig.plots (plot figures or SVG
 * files), all at one height with sub-captions under them. Async: await fig.template(…).
 */
async function teaser(fig, spec) {
  const { id, x = 0, y = 0, w = 900, gap = 28 } = spec
  if (spec.plots !== undefined && (!Array.isArray(spec.plots) || spec.plots.length !== 2)) {
    throw new Error(
      "teaser takes plots: [{ figure: '<plot slug>' }, { figure | svg }] (figures plot new makes them)"
    )
  }
  // Why stand-ins: the layout can be settled before the plots exist; the lint keeps asking for them.
  const plots = spec.plots ?? [
    { svg: standInPlot('curves'), standIn: true },
    { svg: standInPlot('bars'), standIn: true }
  ]
  if (!spec.plots) {
    warnKit([
      `teaser ${id}: (b) and (c) are stand-ins; make the real plots (figures plot new) and pass plots: [{ figure: '<slug>' }, { figure: '<slug>' }]`
    ])
  }
  const captions = spec.captions ?? [
    'Straight sampling paths',
    'Fewer steps, same quality',
    'Samples match the data'
  ]
  const cw = (w - 2 * gap) / 3
  const grid = await fig.plots({
    id: `${id}-plots`,
    x: x + cw + gap,
    y,
    w: 2 * cw + gap,
    gap,
    grid: [1, 2],
    items: plots.map((item, k) => ({ ...item, id: `${id}-${k === 0 ? 'b' : 'c'}` })),
    labels: ['(b)', '(c)'],
    captions: captions.slice(1),
    labelPosition: 'below'
  })
  const height = Math.max(...grid.cells.map((cell) => cell.height))
  const top = grid.cells[0].y
  // Why one row: the prior, its paths and the data read left to right like the plots beside them;
  // the model is named over the paths it draws, no box between them.
  const labelRoom = 22
  const side = Math.min(cw * 0.36, height - labelRoom - 34)
  const blobY = top + 30 + (height - labelRoom - 30 - side) / 2
  fig.density2d({
    id: `${id}-a-noise`,
    x,
    y: blobY,
    w: side,
    h: side,
    dist: 'gaussian',
    color: 'mid',
    label: spec.from ?? 'p_0',
    labelSize: 14
  })
  fig.density2d({
    id: `${id}-a-data`,
    x: x + cw - side,
    y: blobY,
    w: side,
    h: side,
    dist: spec.data ?? '8gaussians',
    color: spec.color,
    label: spec.to ?? 'p_{\\mathrm{data}}',
    labelSize: 14
  })
  fig.flowPaths({
    id: `${id}-a-paths`,
    from: `${id}-a-noise`,
    to: `${id}-a-data`,
    style: spec.style ?? 'straight',
    n: spec.n ?? 9,
    seed: spec.seed ?? 2,
    color: spec.color
  })
  fig.text({
    id: `${id}-a-model`,
    text: `$${spec.model ?? 'v_\\theta(x_t, t)'}$`,
    cx: x + cw / 2,
    y: blobY - 26,
    size: 16,
    color: `${spec.color ?? 'accent'}-ink`
  })
  fig.text({
    id: `${id}-a-caption`,
    text: `(a) ${captions[0]}`,
    cx: x + cw / 2,
    y: top + height + 6,
    size: 14
  })
  return {
    ids: {
      model: `${id}-a-model`,
      noise: `${id}-a-noise`,
      data: `${id}-a-data`,
      paths: `${id}-a-paths`,
      b: `${id}-b`,
      c: `${id}-c`
    },
    in: [x, top + height / 2],
    out: [x + w, top + height / 2]
  }
}

/**
 * A plot-shaped stand-in (2.1 × 1.5 in, axes and marks, no text) for a panel whose real plot is
 * not made yet: 'curves' (three falling lines, the last in the accent) or 'bars'.
 */
export function standInPlot(kind = 'curves', accent = '#2784d5') {
  const axes = '<path d="M 28 8 L 28 96 L 146 96" stroke="#333333" stroke-width="0.8" fill="none"/>'
  const marks =
    kind === 'bars'
      ? [
          [40, 70, '#8c8c8c'],
          [74, 44, '#8c8c8c'],
          [108, 24, accent]
        ]
          .map(
            ([bx, height, color]) =>
              `<rect x="${bx}" y="${96 - height}" width="24" height="${height}" fill="${color}"/>`
          )
          .join('')
      : [
          [0.9, '#8c8c8c'],
          [0.6, '#1e1e1e'],
          [0.3, accent]
        ]
          .map(([level, color]) => {
            const points = Array.from(
              { length: 12 },
              (_, k) => `${30 + k * 10},${(96 - 80 * level * Math.exp(-k / 3.5) - 6).toFixed(1)}`
            )
            return `<polyline points="${points.join(' ')}" stroke="${color}" stroke-width="1.2" fill="none"/>`
          })
          .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="151.2pt" height="108pt" viewBox="0 0 151.2 108">${axes}${marks}</svg>`
}

export const SCIENCE_TEMPLATES = {
  'flow-teaser': [
    flowTeaser,
    'noise → data in two panels: ODE beside SDE (1D paths with density profiles) or two kinds of 2D transport paths',
    "{ id, x, y, w: 900, h: 240, kind: '1d' | '2d', pair: ['ode', 'sde'] (1d: ode, sde, straight; 2d: curved, straight, stochastic), titles, n, seed, from, to (1d: { modes, widths, weights }), data (2d dist: '8gaussians'), direction: 'right' | 'left', profileLabels: { from, to } | false, color }"
  ],
  'loss-landscape': [
    lossLandscape,
    'a loss surface in 3D beside its contour map, optimisation runs on both, named at their ends',
    "{ id, x, y, w: 640, h: 240, view: 'both' | '3d' | 'top', f: 'multimodal' | 'bowl' | 'valley' | 'saddle' | 'sharp-flat' | (u, v) => z, paths: [{ from: [u, v], lr, momentum, steps, label, color }], azimuth, elevation, color }"
  ],
  teaser: [
    teaser,
    'three panels: (a) the method as a schematic (prior → data along its paths, the model above), (b) and (c) two real plots (stand-ins until given); await it',
    "{ id, x, y, w: 900, gap: 28, plots: [{ figure: '<plot slug>' } | { svg }, …two], captions: ['…', '…', '…'], model: 'v_\\\\theta(x_t, t)' (TeX over the paths), from, to (TeX labels), data, style: 'straight' | 'curved', n, seed, color }"
  ]
}
