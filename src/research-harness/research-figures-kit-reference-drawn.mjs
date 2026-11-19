// The kit reference for the drawn glyphs (research-figures-kit-drawn, -drawn-systems): concepts
// drawn the way the reference figures draw them, not boxed. Its own page: `figures kit drawn`.

const VIEW =
  'All share one oblique view: front faces true shape (photos stay upright), depth receding 35° up and to the right at half length (view: { angle, depth } changes it; keep one view per figure).'

export const DRAWN_REFERENCE = [
  {
    topic: 'drawn',
    name: 'tensor',
    call: "fig.tensor({ id, x, y | base | cx, w: 48, h: 48, d: 32, grid: 4 | [cols, rows, layers] | false, role: 'block', tone: 'fill' | 'strong' | 'solid', fill, photo: 'data/<fig>/x.png' | { src | kind, view }, pixelate: n, cells: [{ at: [r, c] | rows: [r0, r1], cols: [c0, c1], role }], labels: { w: '$W$', h: '$H$', d: '$C$' } | true, label, labelSide: 'below' | 'above', view }) → { x, y, width, height, right, bottom, front: { x, y, w, h }, anchors: { center, left, right, top, bottom } }",
    does: `A tensor or feature map as a cuboid (EG3D's feature volume, a latent z ∈ R^{h×w×c}, a CNN activation): the front face w × h, its depth d receding, the top face a step lighter and the side a step darker, grid lines on all three faces (grid: 4 cuts the width into 4 and the rest in proportion), size labels on the edges (labels: true writes H, W, C as math). photo puts a picture on the front face (pixelate: n shows it as n × n mean-colour cells, as a coarse token map), cells fill grid cells (a query position, a block). x, y is the top-left of what is drawn; base puts the front face's bottom on a line (peers on one baseline). ${VIEW} Binds: the id (its whole outline).`
  },
  {
    topic: 'drawn',
    name: 'planes',
    call: "fig.planes({ id, x, y, count: 3, w: 56, h: 72, gap: 8, facing: 'front' | 'side', role: 'a', ramp: true, fills, opacity, grid: n | [cols, rows], gridAll, photo, drop, levels: [{ count, w, h, grid, photo, role, label }] | n, shrink: 0.72, spacing: 24, align: 'bottom' | 'center' | 'top', arrows: false, labelSide, label }) → { x, y, width, height, levels: [{ x, y, right, bottom, planes, front, anchors }], planes: [{ id, corners, center }] }",
    does: `Stacked feature planes. facing 'front' (the default): count planes one behind another, each a true rectangle (a photo and grid on the front one), the back ones up and to the right: channels, a set of feature maps, a stack of frames. facing 'side': parallel planes turned sideways, left to right, each a parallelogram whose top edge rises (DenseNet's feature maps): pair with fig.skipArcs. The fills run on a ramp from the role's strong tone (back) to its pale fill (front); opacity lets the back ones show through. levels makes a staircase: one stack per level, left to right on one baseline (align), each smaller by shrink (levels: 3) or as given, a label under each, arrows: true joins them: a CNN or Swin encoder's shrinking resolution. ${VIEW} Anchors per level for arrows and arcs (levels[i].anchors.center). Binds: the id.`
  },
  {
    topic: 'drawn',
    name: 'tokenMaps',
    call: "fig.tokenMaps({ id, x, y, w: 360, h: 120, scales: [1, 2, 3, 4, 16] | K, photo: 'data/<fig>/x.png', last: 'photo' | 'pixelate', sizes: [shares of h], labels: true | ['$r_1$', …] | false, dots: true, guides: true, pedestal: { label, role: 'c', h: 22, depth: 64 } | false, role: 'c', view }) → { x, y, width, height, maps: [{ id, x, y, w, h, anchors }] }",
    does: `Multi-scale token maps on a pedestal (VAR): maps r_1 … r_K growing left to right, each a thin cuboid whose front shows the picture pixelated at its scale (scales[k] cells a side, mean colours from a project PNG; the last map the picture itself), standing on a long slab whose front names the model (pedestal.label), dotted guides along their corners, an ellipsis before the last. Without a photo the maps show grids of their scale. w × h is the slab's width and the largest map's side; the slab adds pedestal.h below. ${VIEW} Binds: the id.`
  },
  {
    topic: 'drawn',
    name: 'filmstrip',
    call: "fig.filmstrip({ id, x, y, frames: ['data/<fig>/f1.png', { src | kind, noise, view }, …] | count: 5 + photo | src | kind, noise: [indices] | 'first' | 'last', w: 40, h: 32, gap: 0, d: 24, role, dots: 'both' | 'start' | 'end' | false, label, labelSide }) → { x, y, width, height, frames: [{ id, x, y, w, h }], anchors: { left, right, top, bottom } }",
    does: `A video as a 3D filmstrip (Make-A-Video): frames side by side on the front of a thin box whose top and end recede, the seams between frames carried over the top, three dots before and after (the video goes on). count frames of one picture pan across it; noise frames show noise (a noised latent, fixed noise). Several strips stepped down and to the right make a staircase of stages (each stage's role colours its edges and dots: one hue per stage). ${VIEW} Binds: the id.`
  },
  {
    topic: 'drawn',
    name: 'pyramid',
    call: "fig.pyramid({ id, x, y, w: 150, h: 110, tiers: [{ label: 'GPU\\nSRAM', note: 'SRAM: 19 TB/s (20 MB)', role }], weights, tone: 'solid' | 'strong' | 'fill', notes: 'right' | 'left' | false }) → { x, y, width, height, tiers: [{ id, top, bottom, center }] }",
    does: "A memory hierarchy as a pyramid (FlashAttention, Mamba's GPU SRAM / HBM key): tiers from the top (fast, small) to the bottom (slow, large), each filled in its own colour (a, d, c, b by default: the colour is the tier, used again wherever that memory appears in the figure) with its name inside in white, and a note beside it at the slanted edge whose lead word ('SRAM:') takes the tier's colour. tone 'fill' gives pale tiers with dark names. Binds: the id."
  },
  {
    topic: 'drawn',
    name: 'tiledMatrix',
    call: "fig.tiledMatrix({ id, x, y, rows: 8, cols: 1, cell: 14 | [w, h], role: 'd', tone: 'strong' | 'solid' | 'fill', highlight: [{ row, col } | { rows: [r0, r1], cols: [c0, c1] }], highlightRole: 'accent', blocks: [{ rows, cols }], label: '$Q: N \\times d$', labelSide: 'top' | 'left' | 'right' | 'bottom', loops: [{ side: 'top' | 'bottom' | 'left' | 'right', label: 'Outer Loop', role, reverse, gap: 10 }] }) → { x, y, width, height, cell: [w, h] }",
    does: "A matrix cut into tiles (FlashAttention's Q, Kᵀ, V and the output): rows × cols cells in one tone with ink seams (a column for N × d, a row for d × N), highlighted tiles in the accent (the block copied to SRAM), dashed outlines round a block region, its name, and loop arrows along its sides in their own colours with the loop named beside them (outer loop one colour, inner loop another). Cells are <id>-r<i>c<j>; bind arrows to the id or a cell. Binds: the id."
  },
  {
    topic: 'drawn',
    name: 'voxelGrid',
    call: "fig.voxelGrid({ id, x, y, cell: 22, n: [nx, ny, nz], occupied: 'all' | [[i, j, k]] | (i, j, k) => bool, cubes: false, lattice: 'dashed' | 'dotted' | 'solid' | false, vertices: true, vertexRoles: ['a', 'd', 'c', 'b'], vertexR: 2.4, highlight: [[i, j, k]], highlightRole: 'accent', role: 'c', opacity, view }) → { x, y, width, height, point(i, j, k), center(i, j, k) }",
    does: `A voxel grid (Plenoxels' sparse grid, PerAct's voxelized scene): the occupied cells' edges as a dashed lattice with a coloured dot at every corner they use (coefficients stored per vertex), highlighted voxels as translucent cubes in the accent (the voxel a ray passes); cubes: true (or lattice: false) draws every occupied cell as a cube with only its outside faces. point and center give page points of grid corners and cell centres, for rays (fig.arrow with allowDiagonal) and zooms. ${VIEW} Binds: the id.`
  },
  {
    topic: 'drawn',
    name: 'skipArcs',
    call: "fig.skipArcs({ id, points: [[x, y] | id, …], pairs: 'dense' | 'next' | 'skip' | [[i, j]], roles: [one per source], bend: 0.22, side: 'below' | 'above', heads: 'end' }) → { arcs: [ids] }",
    does: "Curved skip connections between items in stack order (DenseNet): from every earlier point to every later one (dense; 'skip' leaves out neighbours already joined by the main path), each a smooth arc in its source's colour (the colour is the source layer), longer arcs bulging further, all to one side. points take ids (their centres) or page points such as fig.planes levels[i].anchors.center. The one place curves belong in a paper figure: a skip that jumps over the stack."
  },
  {
    topic: 'drawn',
    name: 'pills',
    call: "fig.pills({ id, x, y, groups: [{ n: 3, role: 'c' }, { n: 3, role: 'accent' }, { n: 2, role: 'plain' }], w: 18, h: 8, gap: 4, groupGap: 0, arrows: 'down' | 'out' | 'both' | false, arrowLength: 10, brace: { group, label } }) → { x, y, width, height, cells: [{ id, x, y, w, h, cx, cy, group }] }",
    does: "Token pills in one row (RT-2): small ovals in groups, each group in its colour (prompt tokens, image tokens, action tokens; 'plain' gray for the rest), short arrows down into them (arrows: 'down') or out of them ('out'), a brace under one group with its label (the action tokens). Cells are <id>-<n>; one strip says it once: never stack word chips in a column. Binds: the id or a cell."
  }
]
