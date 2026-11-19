// The worked examples drawn flat (figures kit examples): a diffusion teaser, operators with a
// switch and a code card, and a loss landscape. Scripts are kept
// as text (orcad ships the harness as one bundle) and never use template literals.

const landscape = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A loss surface in 3D beside its contour map; each optimiser's descent is computed on it.
const fig = await openFigure(new URL('../loss-landscape.excalidraw', import.meta.url))
fig.reset()
fig.style('training')
const { width: W, height: H } = fig.page // every position below follows the page
fig.template('loss-landscape', {
  id: 'land',
  x: 16,
  y: 12,
  w: W - 32,
  h: H - 26,
  f: 'sharp-flat',
  // Baselines muted or in the given hue, ours in the accent; the surface stays neutral under them.
  paths: [
    { from: [-0.8, 0.85], lr: 0.05, label: 'GD', color: 'muted' },
    { from: [0.9, 0.9], lr: 0.05, momentum: 0.6, label: 'momentum', color: 'd' },
    { from: [-0.9, -0.6], lr: 0.1, label: 'ours', color: 'accent' }
  ]
})
console.log(JSON.stringify(await fig.save()))
`

const teaser = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Noise to data: p_t computed exactly at four times on one scale, the same samples moving through
// them, then every ODE path in one panel with the most curved one highlighted.
const fig = await openFigure(new URL('../diffusion-teaser.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
fig.pathDensity({ id: 'pt', x: 16, y: 16, w: 680, h: 196, labels: ['noise $p_0$', '$t = 1/3$', '$t = 2/3$', 'data $p_1$'] })
fig.pathDensity({ id: 'all', layout: 'overlay', x: 736, y: 16, w: 220, h: 160 })
fig.text({ id: 'all-cap', text: 'ODE paths $p_0 \\to p_1$', cx: 846, y: 188 })
console.log(JSON.stringify(await fig.save()))
`

const switchCode = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A routing switch, a concat node, a minus node and a code card that keeps indentation.
const fig = await openFigure(new URL('../switch-code.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
// The conditions in the paper's notation, one per modality (no icons in the paper look).
fig.text({ id: 'txt', text: 'text $c_t$', x: 12, cy: 36 })
fig.text({ id: 'img', text: 'image $c_i$', x: 12, cy: 84 })
fig.box({ id: 'enc', label: '$\\phi$', x: 112, y: 40, w: 48, h: 40, color: 'c' })
fig.merge({ id: 'in', from: ['txt', 'img'], to: 'enc' })
fig.switch({ id: 'sw', x: 176, y: 48, label: 'route' })
fig.arrow({ id: 'enc-sw', from: 'enc', to: 'sw-in' })
fig.box({ id: 'h', label: '$h$', x: 192, y: 128, w: 48, h: 32, color: 'd' })
fig.node({ id: 'cat', cx: 280, cy: 144, symbol: 'concat' })
fig.trapezoid({ id: 'net', label: 'denoiser $D_\\theta$', x: 320, y: 24, w: 120, h: 144, color: 'a' })
fig.arrow({ id: 'sw-attn', from: 'sw-out0', to: 'net', label: 'attend', role: 'cond' })
fig.arrow({ id: 'sw-cat', from: 'sw-out1', to: 'cat', route: 'vh', role: 'cond' })
fig.arrow({ id: 'h-cat', from: 'h', to: 'cat' })
fig.arrow({ id: 'cat-net', from: 'cat', to: 'net' })
fig.node({ id: 'sub', cx: 496, cy: 96, symbol: 'minus' })
fig.box({ id: 'tgt', label: 'target', x: 456, y: 136, w: 80, h: 32, color: 'd' })
fig.arrow({ id: 'tgt-sub', from: 'tgt', to: 'sub' })
fig.arrow({ id: 'net-sub', from: 'net', to: 'sub', label: '$\\hat y$' })
const code = [
  'for x, c in loader:',
  '    h = encode(x)',
  '    y = make_target(h)',
  '    y_hat = model(h, phi(c))',
  '    loss = mse(y_hat - y)',
  '    loss.backward()'
].join('\n')
fig.code({ id: 'code', x: 568, y: 12, w: 380, title: 'training step', highlight: [{ line: 4, text: 'phi(c)' }], code })
console.log(JSON.stringify(await fig.save()))
`

export const DIAGRAM_EXAMPLES = [
  {
    name: 'loss-landscape',
    title: 'a 3D loss surface with optimisation paths beside its contour map',
    page: '3.25x1.6',
    uses: "template('loss-landscape') (surface3d with computed descent paths)",
    render:
      'a gray meshed surface tilted in 3D on the left, its gray contour map on the right; three runs from their start rings to end dots (gray GD in the side minimum, blue momentum and red ours in the sharp one), each named at its end on the map',
    script: landscape
  },
  {
    name: 'diffusion-teaser',
    title: 'noise to data: p_t at four times with the samples moving through, then all ODE paths',
    page: '6.75x1.6',
    uses: "pathDensity (row of p_t snapshots on one scale, layout 'overlay' for the paths), text with math",
    render:
      'a row of four square panels from a gray noise blob (p_0) through two intermediate densities to eight orange modes on a ring (p_1), the same dots moving panel to panel with faint trails and one highlighted path; on the right one panel with every ODE path from the gray centre to the orange ring, the most curved one dark',
    script: teaser
  },
  {
    name: 'switch-code',
    title: 'a routing switch, concat and minus operators, and a code card that keeps indentation',
    page: '6.75x1.4',
    uses: "the conditions as words with their symbols, merge, switch (ports <id>-in, -out0, -out1), node({ symbol: 'concat' | 'minus' }), trapezoid, cond arrows, code (highlight a span)",
    render:
      '"text c_t" and "image c_i" merge into a small encoder φ that feeds a switch whose upper output runs as an "attend" arrow into an orange denoiser trapezoid and whose lower output drops into a ⓒ concat node with h, then into the denoiser; ŷ and the target meet at a ⊖ node; on the right a thin-framed listing titled "training step" with six indented lines of code, phi(c) highlighted',
    script: switchCode
  }
]
