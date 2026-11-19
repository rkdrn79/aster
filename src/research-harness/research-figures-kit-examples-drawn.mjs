// The worked examples for the drawn glyphs (figures kit examples): a dense block of feature-map
// stacks with skip arcs, token maps by scale on a pedestal, a kernel drawn as its memory tiers and
// tiles, and a cascade of filmstrips. Generic parts in the composition of published figures, not
// copies of them; scripts are kept as text and never use template literals.

const dense_stack = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A dense block drawn, not boxed: each layer's feature maps as planes turned sideways, the input
// on the left; every earlier stack feeds every later one through a curved arc in its own colour.
const fig = await openFigure(new URL('../dense-stack.excalidraw', import.meta.url))
fig.reset()
fig.style('vision')
const { width: W, height: H } = fig.page // every position below follows the page
const n = W >= 720 ? 4 : 3
const roles = ['a', 'd', 'c', 'b'].slice(0, n)
const w = Math.min(56, W / n / 3)
const h = Math.min(96, H * 0.4)
const step = (W - 48 - n * (w + 24)) / (n - 1)
const levels = roles.map((role, i) => ({ count: 4, w, h, role, label: '$\\mathbf{x}_' + i + '$' }))
const s = fig.planes({ id: 'block', x: 24, y: 12, facing: 'side', levels, spacing: step, labelSide: 'above' })
// The operation between two stacks: a short name on the arrow from one to the next.
for (let i = 1; i < n; i += 1) {
  const [a, b] = [s.levels[i - 1], s.levels[i]]
  fig.arrow({ id: 'op' + i, from: [a.right + 4, a.bottom - 16], to: [b.x - 4, a.bottom - 16], label: '$H_' + i + '$' })
}
// The point of the figure: every earlier output reaches every later layer.
fig.skipArcs({ id: 'dense', points: s.levels.map((l) => l.anchors.center), roles, bend: 0.2 })
fig.design({ brief: 'each layer sees the feature maps of every layer before it' })
console.log(JSON.stringify(await fig.save()))
`

const var_scales = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// Generation by scale, drawn: (a) a token strip predicted one token at a time beside (b) token
// maps that grow in resolution on one model, the same picture pixelated at every scale.
const fig = await openFigure(new URL('../var-scales.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const { width: W, height: H } = fig.page // every position below follows the page
const g8 = (v) => Math.round(v / 8) * 8
const split = W >= 720 ? g8(W * 0.3) : 0
if (split) {
  const strip = fig.pills({ id: 'next-token', x: 24, y: g8(H * 0.35), groups: [{ n: 5, role: 'plain' }, { n: 1, role: 'accent' }], arrows: 'down', brace: { group: 1, label: 'next token' } })
  fig.subcaption({ id: 'cap-a', label: '(a)', text: 'one token at a time', cx: strip.x + strip.width / 2, y: H - 32 })
}
const maps = fig.tokenMaps({ id: 'scales', x: split + 16, y: 16, w: W - split - 32, h: H - 64, scales: [1, 2, 4, 8, 16], photo: { kind: 'bird' }, pedestal: { label: 'one transformer, all scales' } })
fig.subcaption({ id: 'cap-b', label: split ? '(b)' : '', text: 'the next scale at a time', cx: maps.x + maps.width / 2, y: H - 32 })
fig.focus(['scales-r5'], { brief: 'each step predicts a whole map at the next resolution' })
console.log(JSON.stringify(await fig.save()))
`

const memory_tiles = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A kernel drawn as its memory: a pyramid of memory tiers, then the matrices cut into tiles; one
// tile of each is copied to the fast tier and computed there, the loops named along their sides.
// The colours are the tiers: tiles in HBM's colour, the copied ones in SRAM's (the defaults).
const fig = await openFigure(new URL('../memory-tiles.excalidraw', import.meta.url))
fig.reset()
fig.style('systems')
const { width: W, height: H } = fig.page // every position below follows the page
const c = Math.min(18, Math.floor((H - 96) / 9)) // one tile
const left = W >= 720 ? 360 : 16
if (W >= 720) {
  fig.pyramid({ id: 'memory', x: 16, y: 24, w: 150, h: H - 56, tiers: [{ label: 'SRAM', note: 'SRAM: 19 TB/s (20 MB)' }, { label: 'HBM', note: 'HBM: 1.5 TB/s (40 GB)' }, { label: 'DRAM', note: 'DRAM: 12.8 GB/s' }] })
}
const qx = left + 64
const q = fig.tiledMatrix({ id: 'q', x: qx, y: 40 + 2 * c, rows: 8, cols: 1, cell: c, highlight: [{ row: 3 }], label: '$Q$', loops: [{ side: 'left', label: 'inner', role: 'c', gap: 8 }] })
const k = fig.tiledMatrix({ id: 'kt', x: qx + 4 * c, y: 40, rows: 1, cols: 10, cell: c, highlight: [{ col: 2 }], label: '$K^\\top$', labelSide: 'left', loops: [{ side: 'top', label: 'outer', role: 'a', gap: 6 }] })
const v = fig.tiledMatrix({ id: 'v', x: W - 40 - c, y: q.y, rows: 8, cols: 1, cell: c, highlight: [{ row: 2 }], label: '$V$' })
// The tile computed in SRAM, where the copied row and column meet.
fig.tiledMatrix({ id: 'block', x: k.x + 2 * c, y: q.y + 3 * c, rows: 1, cols: 1, cell: c, role: 'a', tone: 'solid' })
fig.arrow({ id: 'copy-q', from: 'q-r3c0', to: 'block', label: 'copy' })
fig.arrow({ id: 'copy-k', from: 'kt-r0c2', to: 'block' })
fig.arrow({ id: 'copy-v', from: 'v-r2c0', to: 'block', route: 'hv', label: 'copy' })
const out = fig.tiledMatrix({ id: 'out', x: k.x, y: q.bottom + c, rows: 1, cols: 10, cell: c, label: '$O$', labelSide: 'left' })
fig.arrow({ id: 'write', from: 'block', to: 'out-r0c2', label: 'write once' })
fig.design({ brief: 'each tile is computed in fast memory and written back once' })
console.log(JSON.stringify(await fig.save()))
`

const video_cascade = String.raw`
import { openFigure } from './aster-figures-kit.mjs'

// A video model as a cascade of filmstrips stepping down to the right: each stage the same clip
// at a higher frame rate or resolution, its edges and dots in the stage's colour, the last largest.
const fig = await openFigure(new URL('../video-cascade.excalidraw', import.meta.url))
fig.reset()
fig.style('generative')
const { width: W, height: H } = fig.page // every position below follows the page
const stages = [
  { id: 'decode', name: 'decoder $D^t$', role: 'c', count: 4, noise: 'first' },
  { id: 'interp', name: 'frame interpolation $\\uparrow_F$', role: 'd', count: 6 },
  { id: 'sr', name: 'super-resolution $SR$', role: 'a', count: 6 }
]
const prompt = W >= 720 ? fig.card({ id: 'prompt', x: 16, y: 40, w: 120, text: '"a person doing yoga at sunrise"' }) : null
const x0 = prompt ? 176 : 24
const fw = Math.min(72, (W - x0 - 56) / 9.2)
let previous = prompt ? 'prompt' : null
stages.forEach((stage, i) => {
  const scale = 0.7 + 0.15 * i // later stages are larger: the last one is the result
  const strip = fig.filmstrip({ id: stage.id, x: x0 + i * fw * 1.6, y: 12 + i * (H - 40) / 3.1, count: stage.count, photo: { kind: 'landscape' }, noise: stage.noise, w: fw * scale, h: fw * scale * 0.75, role: stage.role, label: stage.name, labelSide: 'above' })
  if (previous) fig.arrow({ id: 'to-' + stage.id, from: previous, to: stage.id, route: i ? 'vh' : 'hv' })
  previous = stage.id
})
fig.design({ brief: 'one clip refined stage by stage, the last stage largest' })
console.log(JSON.stringify(await fig.save()))
`

export const DRAWN_EXAMPLES = [
  {
    name: 'dense-stack',
    title:
      'a dense block drawn: feature-map stacks turned sideways, every earlier stack joined to every later one by a curved arc in its own colour',
    page: '6.75x2.4',
    uses: "planes (facing 'side', levels with names above), skipArcs (dense pairs, roles per source), arrows with an operation name",
    render:
      "four stacks of four parallelograms (orange, green, blue, yellow, dark at the back, pale at the front) in a row, x_0 … x_3 over them, gray arrows H_1 … H_3 between them; below, curved arcs from each stack to every later one in the source stack's colour, the longest bulging lowest",
    script: dense_stack
  },
  {
    name: 'var-scales',
    title:
      'generation by scale: token maps growing in resolution on one model beside a token strip predicted one at a time',
    page: '6.75x2.2',
    uses: 'tokenMaps (stock photo pixelated per scale, pedestal label, dots), pills (groups, arrows down, brace), subcaption, focus on the last map',
    render:
      'left: a row of six small pills (five gray, one orange "next token" under a brace) with arrows into them, "(a) one token at a time" below; right: five maps r_1 … r_K standing on a white slab named "one transformer, all scales", the bird photo in 1, 4, 16 and 64 mean-colour cells, then itself, the last map in the accent, dotted guides along their corners',
    script: var_scales
  },
  {
    name: 'memory-tiles',
    title:
      'a kernel drawn as its memory: a pyramid of tiers, matrices cut into tiles, one tile copied to the fast tier and written back once',
    page: '6.75x2.3',
    uses: 'pyramid (tiers with notes), tiledMatrix (columns and rows, highlighted tiles, loop arrows), arrows to and from one tile, design brief',
    render:
      'left: a pyramid SRAM (teal), HBM (salmon), DRAM (blue) with "SRAM: 19 TB/s (20 MB)" … beside it; right: a salmon column Q with a blue "inner" loop arrow, a row Kᵀ with a teal "outer" loop arrow over it, a column V at the right, one teal tile of each copied by arrows into a teal tile in the middle, which writes down into a row O',
    script: memory_tiles
  },
  {
    name: 'video-cascade',
    title:
      'a video model as a cascade of 3D filmstrips stepping down to the right, one colour per stage, the last largest',
    page: '6.75x2.6',
    uses: 'card (the prompt), filmstrip (count frames of one photo, a noise frame, role per stage, label above), elbow arrows from stage to stage, design brief',
    render:
      'a prompt card at the top left with an arrow into a short pink strip (a noise frame then three frames) named "decoder D^t"; below and to the right a longer blue strip "frame interpolation", then the largest orange strip "super-resolution SR"; each strip a thin box whose top recedes with the seams, three dots in its colour at either end',
    script: video_cascade
  }
]
