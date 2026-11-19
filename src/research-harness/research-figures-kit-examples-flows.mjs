// Worked examples for computed distributions and flows on a single-column page: a flow-matching
// blueprint in four panels, a stochastic interpolant's ODE and SDE paths through p_t on planes,
// and independent against OT coupling. Each draws with fig.flow's defaults; none copies a paper.

const blueprint = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Flow matching in four panels sharing one source and one target, all computed: the data with a
// noise sample and a photo, the path p_t, the velocity regressed at a point, sampling by the ODE.
const fig = await openFigure(new URL('../flow-blueprint.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const grid = fig.teaserGrid({ id: 'g', rows: 2, panels: ['(a) Data', '(b) Path design', '(c) Training', '(d) Sampling'] })
const [a, b, c, d] = grid.panels
fig.flow({ id: 'data', paths: 0, pictures: { x0: 'noise', x1: 'dog' } }, a)
fig.flow({ id: 'path', paths: 0, snapshots: [0, 1 / 3, 2 / 3, 1] }, b)
fig.flow({ id: 'train', paths: 0, snapshots: [0, 0.5, 1], velocity: { compare: true } }, c)
fig.flow({ id: 'sample', paths: 40, velocity: true, pictures: { x1: 'dog' } }, d)
console.log(JSON.stringify(await fig.save()))
`

const planes = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A stochastic interpolant: one rho(t) from moons to a checkerboard on planes along time, sampled
// by the ODE (smooth paths) and by the SDE (jagged paths, the same rho(t)); one seed for both.
const fig = await openFigure(new URL('../interpolant-planes.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const common = { layout: 'planes', from: 'moons', to: 'checkerboard', paths: 24, seed: 3, color: 'd', labels: ['$\\rho_0$', '', '$\\rho(t)$', '$\\rho_1$'] }
fig.text({ id: 'ode-title', text: 'ODE  $\\dot X_t = b(t, X_t)$', x: 16, y: 12 })
fig.flow({ id: 'ode', ...common, x: 12, y: 37, w: 444, h: 146 })
fig.text({ id: 'sde-title', text: 'SDE  $dX_t = b_F\\,dt + \\sqrt{2\\varepsilon}\\,dW_t$', x: 16, y: 193 })
fig.flow({ id: 'sde', ...common, sde: 0.25, x: 12, y: 218, w: 444, h: 146 })
console.log(JSON.stringify(await fig.save()))
`

const couplings = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Independent against OT coupling between moons and 8 Gaussians: straight conditional paths that
// cross, then the OT plan's paths that do not, each from a dark start dot to a coloured end dot.
const fig = await openFigure(new URL('../coupling-compare.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const pair = { layout: 'overlay', from: 'moons', to: '8gaussians', paths: 60, density: false, y: 34, w: 210, h: 166 }
fig.text({ id: 'ind-title', text: 'independent $q(x_0)\\,q(x_1)$', cx: 117, y: 12 })
fig.flow({ id: 'ind', ...pair, coupling: 'independent', x: 12 })
fig.text({ id: 'ot-title', text: 'OT plan $\\pi(x_0, x_1)$', cx: 351, y: 12 })
fig.flow({ id: 'ot', ...pair, coupling: 'ot', x: 246 })
console.log(JSON.stringify(await fig.save()))
`

export const FLOW_EXAMPLES = [
  {
    name: 'flow-blueprint',
    title: 'flow matching in four panels: data, path design, training, sampling, all computed',
    page: '3.25x2.6',
    uses: 'teaserGrid (rows: 2) and fig.flow on each panel: paths: 0, snapshots, velocity: { compare: true }, paths + velocity + pictures',
    render:
      'four panels in a 2 × 2 grid: a small orange Gaussian on the left and a two-mode orange data density on the right in each, drawn as filled contour bands with thin dark edges; X_0 noise and X_1 photo thumbnails pointing at samples; p_t as thin unfilled contours between them; arrows u_t(x) and u_t^θ(x) with a dotted red error; forty thin gray ODE paths with one bold example, a velocity arrow and a photo at its end',
    script: blueprint
  },
  {
    name: 'interpolant-planes',
    title: 'a stochastic interpolant: rho(t) on planes along time, ODE above SDE paths',
    page: '3.25x2.6',
    uses: "fig.flow layout 'planes' twice with one seed (sde: 0.25 for the second), labels per plane",
    render:
      'two rows of four slanted planes standing along a time arrow: blue moons on the first, two blurred intermediate densities, a blue checkerboard on the last; thin dark paths run from plane to plane behind each density, smooth in the top row and jagged in the bottom one, one bold',
    script: planes
  },
  {
    name: 'coupling-compare',
    title: 'independent against OT coupling: crossing against non-crossing straight paths',
    page: '3.25x1.5',
    uses: "fig.flow layout 'overlay' with density: false, coupling 'independent' and 'ot'",
    render:
      'two square panels: dark start dots on two moons in the middle, orange end dots on eight clusters around them, sixty thin orange lines joining them: tangled across the panel on the left, short and parallel on the right',
    script: couplings
  }
]
