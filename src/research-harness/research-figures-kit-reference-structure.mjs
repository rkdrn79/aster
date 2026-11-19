// The kit reference for key structure (topic structure, its own page): the U-Net helper, the
// bus, the rails, the ring, the cylinder and fig.structure, split from research-figures-kit-reference.mjs.

export const STRUCTURE_REFERENCE = [
  {
    topic: 'structure',
    name: 'structure',
    call: 'fig.structure({ loops: [[ids in order]], fanouts: [{ from, to: [ids] }], skips: [[from, to]], feedback: [[from, to]], text }) → motifs',
    does: "The paper's key structural motifs, listed before you draw (structure first): the U-shape and its skips, a state fanning out to A, B_t and C_t, a loop such as a curriculum or an agent's act–check–refine cycle, what feeds back where. Kept on the page; `figures check` warns for each one the drawing does not connect (missing-loop, missing-fanout, missing-link), says when a loop's items sit in a row, and with text (the sentence from the paper) warns when it says the method loops (loop, iterative, feedback, curriculum, 반복…) but nothing is drawn as a cycle. An id may be a list or a fig.group (a column of cells: any cell's wire counts). A skip or feedback link counts when an arrow joins the two, when a chain passes only through small connectors (a dot, ⊕, a stop-grad node, under 40 × 40 units), or when every arrow of a chain has one role that is not plain flow (role: 'grad' from the loss through the rendering back to the weights; role: 'feedback' through an errors note); a chain of data arrows through modules is the forward path and does not count. A missing id is named with the drawn ids that look like it."
  },
  {
    topic: 'structure',
    name: 'unet',
    call: "fig.unet({ id, x, y, w, h, shape: 'u' | 'hourglass', levels: 3, direction: 'right' | 'left', blocks, resolutions: ['64²', …], bottleneck, label, color: 'c', blockColor: 'a', blockW, cardH, cardSize, skips: true | false | 'above' | 'below' | 'both', skipCount: levels, skipRole: 'skip', role }) → { in, out, down, up, mid, skips, cards }",
    does: "A U-Net or encoder–decoder with its structure drawn, never a row of boxes. shape 'u': down blocks stepping lower and smaller per resolution level, a bottleneck, up blocks rising back, a dashed skip arrow across each level, resolutions under the down blocks, blocks: { down: [labels], up: [labels] } or (side, level) => label. shape 'hourglass' (Latent Diffusion): an encoder trapezoid narrowing into a decoder widening out, `blocks` as cards inside the halves: a list split evenly, or { enc: [...], dec: [...], mid: [...] } (Q K V cross-attention; mid sits at the waist), skipCount skips over the top (below: under it; both: both) in a thin band so the halves keep the height on a small page. A card is as wide as its label needs ('QKV' about 44 units at 8 pt; cardSize 14 makes them smaller), up to its slot (the kit warns when a label does not fit: widen w or give fewer cards); a block entry may be { label, color } for a card of its own colour; cardH sets their height; cards: { enc, dec, mid } returns their ids, so K, V arrows can feed a mid or attention card from below (fig.fork({ from: 'tau', to: [cards.enc[1], cards.dec[0]] })). direction 'left' when data flows right to left. Wire into `in` and out of `out`; skips are role 'skip' (dashed gray, exempt from long-dash) and record the halves they join, so fig.structure({ skips: [['<id>', '<id>']] }) or [['<id>-enc', '<id>-dec']] (u: ['<id>-d0', '<id>-u0']) is satisfied by them. The hourglass halves grow to the width their cards need at 7 pt (side by side, or stacked when the halves are tall enough), with a kit warning saying by how much; grow: false keeps the given w."
  },
  {
    topic: 'structure',
    name: 'bus',
    call: 'fig.bus({ id, from: id | [ids], to: id | [ids], n, fromSide, toSide, fromAt: [shares | coordinates], toAt: [...], turn, reach: 24, spacing: 12, gap: 4, role, color, heads, labels: [...], arrows: [{ … }] }) → { wires, crossings: { wires, lanes } }',
    does: "Several wires at once, one arrow each (<id>-1 …), routed so none crosses another: of the port and turn orders it keeps the one that crosses least, and the kit warns when every order crosses. One box to one box with n wires: port to port (ports spacing apart, centred, or at fromAt / toAt; parallel wires turn in nested order round turn; two ports on the same side, both left, join by a C turning reach units outside both). A list pairs item i with item i, or meets one box at a port each (a column of cells into C_t: every cell leaves the same side, away from its neighbours). A line or arrow id is a rail: wires tap it at a junction dot, or join it at a dot with no head (they carry the flow on); onto rails a wire turns reach units out from its box. Wires that must cross a stack of lanes are counted in crossings.lanes and warned: tap stacked lanes at their open ends, or run them through bars (fig.rails({ through })). Recipes: Mamba's state, N lanes through B_t, A and C_t: fig.rails({ id: 'h', from: 'hprev', to: 'ht', ys, through: ['B', 'A', 'C'] }), then one fork from the projection into the bars. A pair of encoders that each send two outputs (pooled, hidden) to the same two targets cannot be wired without a crossing: outline the pair as one block (fig.panel({ around, outline: true })) and run one bus from it, to: ['mlp', 'concat']. Into a small node (⊕, ⓒ) use fig.merge."
  },
  {
    topic: 'structure',
    name: 'rails',
    call: 'fig.rails({ id, n: 4, x, y, w | from, to, spacing: 24, ys, through: [bar ids], gap: 4, role, color, heads, dashed: [per stretch], arrows: [per lane] }) → { ys, lanes, stretches }',
    does: "N parallel lanes for a state of N components (Mamba's h with N = 4): lane i at ys[i] (or y + i × spacing), from x (or the right side of from, a column of cells) to x + w (or the left side of to), broken at every bar in through (tall boxes spanning all lanes: B_t, A, C_t), so each component enters and leaves every bar and no wire crosses. Ids <id>-<lane> (one stretch) or <id>-<lane>-<stretch>; lanes[i] lists lane i's arrows left to right, stretches[k] the arrows between two bars, which fig.bus can join or tap. A bar that does not span every lane is an error naming the lane."
  },
  {
    topic: 'structure',
    name: 'ring',
    call: 'fig.ring({ id, items: [ids], cx, cy, r | rx, ry, start: -90, clockwise: true, open: false, bend, labels, role, color, dashed }) → { arcs }',
    does: "A loop drawn as a loop: moves the items onto a ring (the first at the top), then joins each to the next with an outward arc, the last back to the first (open: true leaves it open). For a curriculum, an agent cycle, a data engine, RLHF: the reader sees the cycle, not a row. Arcs bind like curve; labels per arc (7 pt). Keep what feeds back inside the ring (an errors note joined in role: 'feedback') and stores outside it, joined to one item, so no arrow crosses an arc. On a small page give rx, ry that keep the items on the page: the kit warns when one leaves it."
  },
  {
    topic: 'structure',
    name: 'cylinder',
    call: 'fig.cylinder({ id, x, y, w: 72, h: 56, label, color, cap }) → element',
    does: 'A store drawn as a store: a memory, a skill library, a replay buffer, a database, a KV cache on disk. Binds and takes a label like a box. Shapes carry meaning: trapezoid for an encoder or decoder, cylinder for a store, stack for a set of items, node or plain text for an operation (⊕, concat, softmax).'
  }
]
