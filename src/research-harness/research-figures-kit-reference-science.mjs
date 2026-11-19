// The kit reference for distributions, flows, surfaces and fields (topic science) and for plots
// placed in diagrams (topic plots); KIT_REFERENCE appends these.

import { DYNAMIC_REFERENCE } from './research-figures-kit-reference-4d.mjs'
import { DENSITY_REFERENCE } from './research-figures-kit-reference-density.mjs'

const LABEL =
  "label (TeX) | labelText, labelSide: 'below' | 'above' | 'left' | 'right', labelSize, labelColor"
const COLOR =
  "accent (default) | a role (secondary, panel-1, teal…) | ink | line | mid | '#hex': the colour the glyph ramps to; neutral names stay gray"

export const SCIENCE_REFERENCE = [
  ...DENSITY_REFERENCE,
  {
    topic: 'science',
    name: 'density2d',
    call: 'fig.density2d({ id, x, y, w: 120, h: 120, dist, levels: 6, color, fill: true, label }) → { id, x, y, width, height }',
    does: "The older name of density. The same drawing (fill: false is style 'line'); dist { components } here keeps its old meaning: means as shares of the box (v down), sigma a share of its side.",
    options: [
      ['dist', 'gaussian', 'a preset or { components }, see density'],
      ['color', 'accent', COLOR],
      ['label', '', LABEL]
    ]
  },
  {
    topic: 'science',
    name: 'samples',
    call: "fig.samples({ id, of: densityId | dist, x, y, w, h, n: 60, seed: 1, r: 2.2, color: 'accent', rim: '#ffffff', opacity }, box?) → { id, x, y, width, height }",
    does: 'A seeded point cloud from a density or a dist. n dots drawn from a density (of: its id, in its box; give x, y, w, h to draw the same distribution elsewhere) or a dist (the presets and forms of density), kept inside the box. The same seed draws the same cloud on every run. Dots have a thin white rim so they read over bands (none past 300 dots); r 1.5–2.5 (under 1.2 the lint warns they vanish). Ids <id>-p<n>.'
  },
  {
    topic: 'science',
    name: 'flowPaths',
    call: "fig.flowPaths({ id, from, to, n: 10, style: 'straight' | 'curved' | 'stochastic', coupling: 'ot' | 'random', seed: 1, noise: 1, color: 'accent', tone: 'ramp' | 'fade' | 'flat', segments: 6, strokeWidth: 1.25, ends: true, head: false }) → { id, x, y, width, height }",
    does: "Paths between two densities: straight, ODE or SDE. from, to: density2d ids or { x, y, w, h, dist }; the paths are computed from the interpolation x_t = (1 − t) x_0 + t x_1: curved follows the marginal ODE (paths bend and never cross, as in flow matching and probability-flow sampling), stochastic follows the matching SDE (jagged, landing on the data), straight joins coupled pairs with lines (coupling 'ot' sorts them so they do not cross: rectified flow, optimal transport; 'random' pairs them independently, so they cross: the conditional paths before rectification). tone ramp runs gray → colour along t, fade raises opacity, flat is one colour (segments: 1 makes each path one editable line). ends marks the start (gray) and end (the colour); head adds an arrowhead. Paths are lines, not connectors, so they may slant. Ids <id>-path<n>-<k>."
  },
  {
    topic: 'science',
    name: 'snapshots',
    call: "fig.snapshots({ id, x, y, w: 440, h: 130, from: 'gaussian', to: '8gaussians', t: [0, 1/3, 2/3, 1] | steps: 4, gap: 16, levels: 3, samples: 0, seed, color: 'accent', labels: true | ['…'], labelSize, axis: true, fill: true }) → { id, x, y, width, height }",
    does: "p_t along t: density panels from noise to data. A flow strip without paths (flow draws more). A row of square panels, from `from` (t = 0, gray) to `to` (t = 1, the colour), computed exactly for the linear interpolation, so the middle panels show the real intermediate shapes. samples: n seeded points that move with t (the same dots in every panel). Each panel is labelled $t = …$ (labels: a list renames them, false drops them) over a time-axis arrow (axis: false drops it). Flip the meaning for diffusion by naming the panels (labels: ['$x_T$', …, '$x_0$'])."
  },
  {
    topic: 'science',
    name: 'trajectories',
    call: "fig.trajectories({ id, x, y, w: 320, h: 140, style: 'ode' | 'sde' | 'straight', n: 14, seed, noise: 0.8, from: { modes: [0] }, to: { modes: [-1.3, 1.15], widths, weights }, range: [-3, 3], direction: 'right' | 'left', profiles: true, profileWidth, at: [t, …], labels: { from: '$p_0$', to: '$p_{\\\\mathrm{data}}$' } | false, color: 'accent', tone: 'ramp' | 'flat', strokeWidth: 1, ends: true }) → { id, x, y, width, height }",
    does: "1D paths over t between two densities, ODE or SDE. The diffusion or flow-matching teaser: the prior's density standing on the left edge (gray) and the data's on the right (the colour), with n paths between them: ode curves smoothly and never crosses (probability flow), sde jitters and still lands on the data's modes, straight joins sorted pairs. at: [0.5] adds the density of p_t at those times as outline profiles. direction: 'left' puts the data on the left (diffusion's t = 0). Draw an ODE and an SDE one above the other with one seed to compare them."
  },
  {
    topic: 'science',
    name: 'field',
    call: "fig.field({ id, x, y, w: 140, h: 140, kind: 'rotation' | 'sink' | 'source' | 'saddle' | 'shear' | 'score' | 'flow', of: densityId, from, to, t: 0.5, f: (u, v) => [du, dv], grid: 9 | [rows, cols], magnitude: 'length' | 'equal', color: 'line', strokeWidth: 1 }) → { id, x, y, width, height }",
    does: 'A vector field as a grid of short arrows. A named field about the box centre, score (∇ log p of a density: of, drawn over it unless x, y, w, h move it), flow (the velocity at time t between from and to), or f with u, v shares of the box (v down). magnitude length scales each arrow (the longest fills 80% of its cell; under 15% is left out); equal draws one length and shades by strength (the default for score, whose size grows without bound). Ids <id>-a<row>-<col>.'
  },
  {
    topic: 'science',
    name: 'surface3d',
    call: "fig.surface3d({ id, x, y, w: 220, h: 160, f: 'multimodal' | 'bowl' | 'valley' | 'saddle' | 'sharp-flat' | (u, v) => z, view: '3d' | 'top', grid: 18, azimuth: -60, elevation: 34, zScale: 0.7, shade: 'height' | 'light' | 'white' | 'none', levels: 9, color: 'accent', strokeWidth: 0.6, paths: [[[u, v], …] | { from: [u, v], steps: 40, lr: 0.08, momentum: 0, color: 'ink' }] }) → { id, x, y, width, height }",
    does: "A loss surface as a 3D mesh or contour map, with descent paths. z = f(u, v) over u, v in −1…1 as a projected mesh drawn back to front (each face an editable closed line), shaded by height and light so the minima read darker; shade 'white' gives a hidden-line wireframe, 'none' a see-through one. view 'top' draws the same surface as filled contour bands seen from above (put both side by side). paths are optimisation runs: points, or gradient descent from `from` (lr, momentum: 0.9 for heavy ball) computed on the surface, drawn in ink (a second run in 'muted' or the accent) with an open start ring and a solid end dot. Faces <id>-f<i>-<j>, paths <id>-path<n>."
  },
  {
    topic: 'science',
    name: 'manifold',
    call: "fig.manifold({ id, x, y, w: 200, h: 150, kind: 'swiss-roll' | 's-curve' | 'sheet' | 'torus', grid: 36 | [s, t], azimuth: -80, elevation: 12, color: 'accent', samples: 0, seed, paths: [{ from: [s, t], to: [s, t], kind: 'geodesic' | 'chord', color }], strokeWidth: 0.6 }) → { id, x, y, width, height }",
    does: 'A Swiss roll or other sheet, with geodesics. Coloured along its own coordinate s (pale → the colour), back to front: the Swiss roll of manifold learning, an S-curve, a curved sheet or a torus. samples puts seeded dots on it (hidden behind its folds); paths join two (s, t) points along the sheet (geodesic, in the colour) or straight through space (chord, dashed ink): the geodesic-versus-Euclidean picture.'
  },
  {
    topic: 'science',
    name: 'sphere',
    call: "fig.sphere({ id, cx, cy, r: 56 | x, y, w, azimuth: 25, elevation: 22, grid: true, back: 'hidden' | 'dotted', shade: true, fill: '#f1f1f1', color: 'accent', geodesics: [{ from: [lat, lon], to: [lat, lon], color }], points: [[lat, lon]] }) → { id, x, y, width, height }",
    does: 'A sphere with latitude lines, geodesics and points. For a hypersphere of normalised embeddings or a Riemannian manifold: latitude and longitude lines, the far half hidden (or dotted), a soft Lambert shading, geodesics as great-circle arcs (front solid in the colour, behind dashed and paler) and marked points. Degrees for lat and lon.'
  },
  ...DYNAMIC_REFERENCE,
  {
    topic: 'plots',
    name: 'plot',
    call: "await fig.plot({ id, figure: '<plot slug>' | svg: 'path.svg' | '<svg…>', x, y, w, h, fit: 'contain' | 'width' | 'height' | 'exact', align: 'center' | 'top-left', scale, frame }) → { id, x, y, width, height, right, bottom, scale, panels: [{ id, label, x, y, width, height }] }",
    does: "A rendered data plot placed as a vector image. A plot figure (figures plot new/run: its <slug>.embed.svg, text as outlines) placed in the diagram: the diagram's SVG and PDF keep it vector. It keeps its shape: at its natural size (made at the size it is shown: the best case), or w, h or scale (w and h together: the largest that fits, centred; align: 'top-left' keeps it at x, y). fit: 'width' or 'height' sets the scale from w or h and places it at x, y; 'exact' fills x, y, w, h exactly, for a plot made at that cell (ap.figure(size=(w / 144, h / 144), panel=True)); a plot of another shape is fitted inside with a warning naming the size to make it at. Name a plot made for a drawing's cell <drawing>-<part> (g2-otcfm-1-flows), never the drawing's own slug (both would write <slug>.pdf; that throws). Shrunk until its smallest text prints under 6.5 pt, or blown up past 1.25×, it prints a warning with both fixes: make the plot at the cell's size (the inches it names) and place it with fit: 'exact', or make the cell larger. panels are the plot's axes (from its manifest) in scene units, for labels and arrows; plotPoint aims at a spot inside. After the plot is rendered again, rerun this script or `figures refresh` to show the new one; `figures check` reports a stale plot. Binds: the id."
  },
  {
    topic: 'plots',
    name: 'plots',
    call: "await fig.plots({ id, x, y, w, h, grid: [rows, cols], items: [{ figure | svg, id }], gap: 16 | [gx, gy], labels: '(a)' | 'a' | 'A' | ['…'] | false, labelSize: 16, captions: ['…'], labelPosition: 'top-left' | 'below', grow: false }) → { id, ids, cells: [{ id, x, y, width, height }], scale, x, y, width, height }",
    does: "Several plots in one panel at one scale, labelled (a), (b). A grid of cells w wide (h tall when given), every plot at one common scale (the largest at which each fits its cell, never past natural size unless grow), centred in its cell, rows top-aligned, so their text prints at one size. labels '(a)' puts (a), (b), … at each plot's top-left in the label size (a plot whose manifest has its own labels is left as it is); captions put '(a) caption' under each plot instead. Cells are <id>-<n> (or each item's id): arrows and plotPoint use them; the id is a box around them all."
  },
  {
    topic: 'plots',
    name: 'plotPoint',
    call: "fig.plotPoint(plotId, [u, v] | { panel: 'a', at: [u, v] } | { panel: 'a', data: [x, y] }) → [x, y]",
    does: "A scene point inside a placed plot, for arrows and labels. For an arrow's end (fig.arrow({ from: 'note', to: fig.plotPoint('res-0', { panel: 'a', at: [0.1, 0.2] }) })) or a label: [u, v] shares of the whole plot, at: shares of a panel's data area, data: a data point (when the plot's manifest gives that panel's xlim and ylim, log axes too). u, v count from the bottom-left, like matplotlib's axes fraction."
  },
  {
    topic: 'plots',
    name: 'refreshPlots',
    call: 'await fig.refreshPlots() → [ids]',
    does: 'Swaps in plots rendered since they were embedded. Reads every plot this figure shows again (same place and width; the height follows the new shape). Returns the ids it changed. `figures refresh --figure <slug>` (or `--plot <plot slug>` for every diagram showing it) does the same without a script.'
  }
]
