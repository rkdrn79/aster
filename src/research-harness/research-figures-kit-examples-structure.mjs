// The worked examples for key structure (figures kit examples): a U-Net with its skips beside an
// hourglass, state lanes fanning out through bars without a crossing, an agent loop with its
// feedback, score distillation back through a renderer, and an encoder pair with two outputs.
// Generic parts, not any paper's figure; scripts are kept as text (orcad ships the harness as one
// bundle) and never use template literals.

const unet = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// (a) A U-Net drawn as a U: levels step down and back up, a skip across each level.
// (b) The same idea as an hourglass whose cards fit their labels, fed by a context fork.
// On a single column only (b) is drawn, full width: the form an LDM-style figure needs.
const fig = await openFigure(new URL('../unet-skips.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const { width: W, height: H } = fig.page // every position below follows the page
const g8 = (v) => Math.round(v / 8) * 8
const wide = W >= 720
const right = wide ? g8(W * 0.66) : 0
if (wide) {
  const side = Math.min(104, H - 88)
  const cy = g8((H - 24) / 2)
  fig.image({ id: 'xin', kind: 'cat', noise: 0.6, x: 16, y: cy - side / 2, w: side, h: side })
  const u = fig.unet({ id: 'u', x: side + 48, y: 16, w: right - 2 * side - 96, h: H - 52, levels: 3, resolutions: ['64²', '32²', '16²'], label: 'denoiser $D_\\theta$' })
  fig.image({ id: 'xout', kind: 'cat', x: right - side - 16, y: cy - side / 2, w: side, h: side })
  fig.arrow({ id: 'in', from: 'xin', to: u.in })
  fig.arrow({ id: 'out', from: u.out, to: 'xout' })
  fig.subcaption({ id: 'ca', label: '(a)', text: 'U-shape', cx: right / 2, y: H - 30 })
}
const [hx, hw] = [right + 24, W - right - 48]
const hh = fig.unet({ id: 'h', shape: 'hourglass', x: hx, y: 16, w: hw, h: g8(H * 0.5), levels: 2, blocks: { enc: ['conv', 'attn'], dec: ['attn', 'conv'] } })
fig.box({ id: 'ctx', label: 'context', x: g8(hx + hw / 2 - 40), y: g8(H * 0.5) + 48, w: 80, h: 32, color: 'model' })
fig.fork({ id: 'kv', from: 'ctx', to: [hh.cards.enc[1], hh.cards.dec[0]], role: 'cond' })
// The skips are the point: list them, and figures check confirms they are drawn.
fig.structure({ skips: wide ? [['u-d0', 'u-u0'], ['h', 'h']] : [['h', 'h']] })
if (wide) {
  fig.subcaption({ id: 'cb', label: '(b)', text: 'hourglass', cx: hx + hw / 2, y: H - 30 })
}
console.log(JSON.stringify(await fig.save()))
`

const lanes = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// N = 4 state lanes pass every bar (write, decay, read) with no crossing (fig.rails through),
// and one fork sends the mixed input to the bars it parameterises.
const fig = await openFigure(new URL('../state-fanout.excalidraw', import.meta.url))
fig.reset()
fig.style('systems')
const cells = { rows: 4, cols: 1, cell: [40, 24], gap: 8, fills: Array(4).fill(['c']) }
fig.grid({ id: 'sprev', x: 40, y: 28, label: 's_{k-1}', ...cells })
fig.grid({ id: 'snext', x: 888, y: 28, label: 's_k', ...cells })
for (const [id, tex, x, color] of [['W', 'W_k', 252, 'a'], ['L', '\\Lambda', 464, 'block'], ['R', 'R_k', 676, 'a']]) {
  fig.box({ id, label: '$' + tex + '$', x, y: 24, w: 40, h: 128, bar: true, color })
}
// Lanes in the state's own hue and the side weight: four parallel wires must not read as heavy bars.
fig.rails({ id: 's', from: 'sprev', to: 'snext', ys: [40, 72, 104, 136], through: ['W', 'L', 'R'], role: 'side', color: 'c-ink' })
fig.box({ id: 'u', label: '$u_k$', x: 40, y: 228, w: 56, h: 32, color: 'block' })
fig.box({ id: 'mix', label: 'Mix', x: 152, y: 228, w: 96, h: 32, color: 'a' })
fig.box({ id: 'gate', label: '$g_k$', x: 456, y: 168, w: 56, h: 28, color: 'a' })
fig.box({ id: 'o', label: '$o_k$', x: 872, y: 228, w: 72, h: 32, color: 'block' })
fig.arrow({ id: 'u-mix', from: 'u', to: 'mix' })
fig.fork({ id: 'sel', from: 'mix', to: ['W', 'gate', { id: 'R', toAt: { x: 684 } }], role: 'cond', split: { y: 212 } })
fig.arrow({ id: 'gate-L', from: 'gate', to: 'L', role: 'cond' })
fig.arrow({ id: 'R-o', from: 'R', to: 'o', fromAt: { x: 708 }, route: 'vh' })
fig.structure({ fanouts: [{ from: 'mix', to: ['W', 'gate', 'R'] }, { from: 'sprev', to: ['W', 'L', 'R'] }] })
console.log(JSON.stringify(await fig.save()))
`

const loop = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// An agent loop on a ring (propose, write, run, check, and around again); run errors feed back
// into the code inside the ring; a store sits beside the loop, outside the cycle.
const fig = await openFigure(new URL('../agent-loop.excalidraw', import.meta.url))
fig.reset()
fig.style('language')
const steps = [['task', 'propose task'], ['code', 'write code'], ['env', 'run in env'], ['check', 'self-check']]
for (const [id, label] of steps) fig.box({ id, label, w: 112, h: 36, color: id === 'code' ? 'a' : 'model' })
fig.ring({ id: 'loop', items: steps.map(([id]) => id), cx: 360, cy: 136, rx: 288, ry: 96, role: 'main' })
fig.box({ id: 'err', label: 'errors', x: 312, y: 120, w: 96, h: 32, color: 'white' })
fig.arrow({ id: 'env-err', from: 'env', to: 'err', role: 'feedback' })
fig.arrow({ id: 'err-code', from: 'err', to: 'code', role: 'feedback' })
fig.cylinder({ id: 'skills', label: 'skill library', x: 760, y: 64, w: 176, h: 144, color: 'output' })
fig.arrow({ id: 'get', from: 'skills', to: 'code', role: 'cond', label: 'retrieve' })
// The loop and the feedback through 'errors' are listed, so figures check follows the chain.
fig.structure({ loops: [['task', 'code', 'env', 'check']], feedback: [['env', 'code']] })
console.log(JSON.stringify(await fig.save()))
`

const pair = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Two encoders that each give a pooled and a per-token output: outline the pair as one block
// and run one bus from it, one wire per output; the bus picks the port order with no crossing.
const fig = await openFigure(new URL('../encoder-pair.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
fig.box({ id: 'prompt', label: '"a red chair"', x: 16, y: 96, w: 136, h: 32, color: 'input' })
fig.box({ id: 'e1', label: 'encoder 1', x: 232, y: 56, w: 120, h: 40, color: 'frozen' })
fig.box({ id: 'e2', label: 'encoder 2', x: 232, y: 128, w: 120, h: 40, color: 'frozen' })
fig.fork({ id: 'p-enc', from: 'prompt', to: ['e1', 'e2'], axis: 'x' })
fig.box({ id: 'mlp', label: 'MLP', x: 440, y: 16, w: 72, h: 32, color: 'model' })
fig.node({ id: 'cat', symbol: 'concat', cx: 496, cy: 128 })
fig.box({ id: 'g', label: '$g$', x: 576, y: 16, w: 56, h: 32, color: 'output' })
fig.box({ id: 'tok', label: '$c$', x: 576, y: 112, w: 56, h: 32, color: 'output' })
fig.panel({ id: 'pair', around: ['e1', 'e2'], outline: true, pad: 8 })
fig.bus({ id: 'out', from: 'pair', to: ['mlp', 'cat'], fromSide: 'right', fromAt: [0.3, 0.5], labels: ['pooled', 'tokens'], arrows: [{}, { role: 'cond' }] })
fig.arrow({ id: 'mlp-g', from: 'mlp', to: 'g' })
fig.arrow({ id: 'cat-tok', from: 'cat', to: 'tok' })
console.log(JSON.stringify(await fig.save()))
`

const distill = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Score distillation through a renderer: a 3D field (an MLP) is rendered, noised and denoised by
// a frozen model; the noise residual flows back through the rendering to the MLP's weights.
const fig = await openFigure(new URL('../score-distill.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const { width: W, height: H } = fig.page // every position below follows the page
const g8 = (v) => Math.round(v / 8) * 8
const [row, y2, y3, s, n] = [g8(H * 0.34), g8(H * 0.72), g8(H * 0.9), Math.min(80, g8(H * 0.28)), 48]
const bird = { kind: 'bird', crop: [0.1, 0, 0.75, 1] }
fig.box({ id: 'mlp', label: 'MLP $\\theta$', x: 24, y: row - 20, w: 72, h: 40, color: 'a' })
fig.trainable('mlp')
const v = fig.perspective({ id: 'field', template: 'volume-boxes', x: 112, y: 8, w: W * 0.37, h: y2 - 24,
  options: { photos: [null, bird], light: false },
  labels: [{ at: 'box1.bottom', tex: '\\sigma', side: 'below' }, { at: 'box2.bottom', tex: '\\mathbf{c}', side: 'below' }] })
fig.arrow({ id: 'mlp-field', from: 'mlp', to: [v.x + 4, row] })
const x0 = g8(v.right + 32)
fig.image({ id: 'x', ...bird, x: x0, y: row - s / 2, w: s, h: s, label: '$\\mathbf{x}$', labelSide: 'above' })
fig.arrow({ id: 'render', from: v.anchors.cam, to: 'x' })
const ax = x0 + s + 40
fig.node({ id: 'add', symbol: 'plus', cx: ax, cy: row })
fig.image({ id: 'eps', kind: 'noise', x: ax - n / 2, y: y2 - n / 2, w: n, h: n, label: '$\\epsilon$', labelSide: 'left' })
fig.image({ id: 'zt', kind: 'bird', noise: 0.7, crop: bird.crop, x: ax + 32, y: row - s / 2, w: s, h: s, label: '$z_t$', labelSide: 'above' })
const ux = ax + s + 64
fig.trapezoid({ id: 'unet', label: 'U-Net', x: ux, y: row - 30, w: 80, h: 60, color: 'frozen' })
fig.frozen('unet')
const ex = ux + 120
fig.image({ id: 'epshat', kind: 'noise', x: ex, y: row - n / 2, w: n, h: n, label: '$\\hat\\epsilon$', labelSide: 'above' })
fig.node({ id: 'sub', symbol: 'minus', cx: ex + n / 2, cy: y2 })
for (const [id, from, to] of [['x-add', 'x', 'add'], ['add-zt', 'add', 'zt'], ['eps-add', 'eps', 'add'], ['zt-unet', 'zt', 'unet'], ['unet-hat', 'unet', 'epshat'], ['hat-sub', 'epshat', 'sub'], ['eps-sub', 'eps', 'sub']]) {
  fig.arrow({ id, from, to })
}
// The update runs back through the rendering to the weights it changes, each step labelled.
fig.arrow({ id: 'g-x', from: 'sub', to: 'x', role: 'grad', toAt: { x: x0 + s * 0.7 }, via: [[ex + n / 2, y3], [x0 + s * 0.7, y3]], label: 'stopgrad$[\\hat\\epsilon - \\epsilon]$' })
fig.arrow({ id: 'g-mlp', from: 'x', to: 'mlp', role: 'grad', fromAt: { x: x0 + s * 0.3 }, via: [[x0 + s * 0.3, y2], [60, y2]], label: 'update $\\theta$' })
fig.structure({ feedback: [['sub', 'mlp']] })
console.log(JSON.stringify(await fig.save()))
`

export const STRUCTURE_EXAMPLES = [
  {
    name: 'unet-skips',
    title:
      'a U-Net with resolution levels and a skip across each, beside an hourglass with attention cards',
    page: '6.75x1.9',
    uses: 'unet (shape u with resolutions; hourglass with blocks and cards), fork into the cards, structure({ skips }), subcaption; on a single column only the hourglass',
    render:
      'a noisy photo into a U of orange blocks stepping down three levels (64², 32², 16² under them) to a bottleneck and back up, dashed gray skips across every level, the clean photo out; on the right two trapezoid halves meeting at a waist with conv and attn cards, a blue fork from a context box up into both attn cards',
    script: unet
  },
  {
    name: 'state-fanout',
    title:
      'four state lanes passing three parameter bars with no crossing, one input fork into the bars',
    page: '6.75x1.95',
    uses: 'grid (state cells), rails({ through }), bar boxes, fork with a per-branch toAt and split, structure({ fanouts })',
    render:
      'four thin lanes in the hue of the state cells, from a column of four cells on the left to one on the right, each lane passing three tall bars (W_k, Λ, R_k) so every state meets every bar; under them u_k → Mix, whose blue fork rises into W_k, a small g_k box (that feeds Λ) and R_k; R_k drops to o_k at the bottom right',
    script: lanes
  },
  {
    name: 'agent-loop',
    title: 'an agent loop on a ring with a feedback chain inside it and a store beside it',
    page: '6.75x1.9',
    uses: 'ring (items on an ellipse, main role arcs), feedback arrows through a note, cylinder, cond arrow, structure({ loops, feedback })',
    render:
      'four boxes on an ellipse (propose task, write code in the accent, run in env, self-check) joined clockwise by dark arcs; inside the ring a white "errors" note with red-brown feedback arrows from run in env into it and on to write code; to the right a cylinder "skill library" with a blue "retrieve" arrow into write code',
    script: loop
  },
  {
    name: 'score-distill',
    title:
      'score distillation: a 3D field rendered, noised, denoised by a frozen model, the residual back to its weights',
    page: '6.75x2.2',
    uses: "perspective template 'volume-boxes', image (noise, noised photo), node plus / minus, trapezoid with frozen and trainable marks (words in paper style), grad arrows with via ending on the MLP, structure({ feedback })",
    render:
      'an orange MLP θ box marked trainable feeding glass boxes (splats σ, a bird picture c) rendered by a small camera into the picture x; x and a noise square ε meet at ⊕ into a noised z_t, a gray U-Net marked frozen gives ε̂; ε̂ and ε meet at ⊖ and an orange "stopgrad[ε̂ − ε]" arrow runs under the figure back into x, from which an orange "update θ" arrow returns to the MLP',
    script: distill
  },
  {
    name: 'encoder-pair',
    title: 'two encoders with two outputs each, wired into two targets without a crossing',
    page: '4.5x1.3',
    uses: "fork (axis 'x'), panel around the pair, bus from the panel (fromAt, labels, per-wire role), node concat",
    render:
      'a prompt box forking into two gray encoders outlined as one pair; from the pair a "pooled" wire rises to an MLP and on to g, a blue "tokens" wire runs right into a ⓒ concat node and on to c, the two wires nested so they never cross',
    script: pair
  }
]
