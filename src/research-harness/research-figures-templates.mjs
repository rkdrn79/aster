// Module templates ML papers draw again and again, composed from the kit in the figure's style:
// each takes `{ id, x, y, ... }`, draws under ids `<id>-<part>`, and returns those ids with the
// points where data enters and leaves. Trained parts take the accent and 🔥, frozen ones gray ❄️.
import { LOOP_TEMPLATES } from './research-figures-templates-loops.mjs'
import { AGENT_TEMPLATES } from './research-figures-templates-agents.mjs'
import { moeTokens } from './research-figures-templates-routing.mjs'
import { DIT_TEMPLATES } from './research-figures-templates-dit.mjs'
import { GENERATIVE_TEMPLATES } from './research-figures-templates-generative.mjs'
import { measureText } from './research-figures-text.mjs'
import { fitStack } from './research-figures-templates-stack.mjs'

/**
 * A transformer block ×N in a titled panel, bottom to top. `variant: 'pre-norm'` (norm, attention,
 * ⊕, norm, feed-forward, ⊕) or `'post-norm'` (attention, ⊕, norm, feed-forward, ⊕, norm, as in the
 * original Transformer); `h` fills a height.
 */
function transformer(fig, spec) {
  const { id, y = 0, w = 170, n = 'N' } = spec
  const variant = spec.variant ?? 'pre-norm'
  if (!['pre-norm', 'post-norm'].includes(variant)) {
    throw new Error(`transformer variant is pre-norm or post-norm, not ${JSON.stringify(variant)}`)
  }
  // Why inset: the residual lanes and the panel's padding stay right of the given x.
  const x = (spec.x ?? 0) + 32
  const cx = x + w / 2
  const post = variant === 'post-norm'
  // Why fixed: the title, the in stub and the ⊕ nodes do not stretch.
  const { k, gap } = fitStack(spec, {
    fixed: 60 + 2 * 18 + 36 + (post ? 0 : 12),
    boxes: [34, 34, 24, 24],
    gaps: 5
  })
  const blockH = Math.round(34 * k)
  const normH = Math.round(24 * k)
  // Why intentional: a stack's blocks share one width so the residual lanes run straight, even
  // when a short label leaves room beside it.
  const part = (name, label, top, h, color) =>
    fig.box({ id: `${id}-${name}`, label, x, y: top, w, h, exact: true, color, intentional: true })
  // Top to bottom, so the stack reads bottom to top like the data.
  // Why 60: the panel's title and padding sit inside the template's box.
  let top = y + 60
  const order = post
    ? ['norm2', 'add2', 'ffn', 'norm1', 'add1', 'attn']
    : ['add2', 'ffn', 'norm2', 'add1', 'attn', 'norm1']
  for (const name of order) {
    if (name.startsWith('add')) {
      // Why 12 more before the first ⊕ of a pre-norm block: the second residual leaves the
      // arrow above it, clear of its head.
      if (name === 'add1' && !post) {
        top += 12
      }
      fig.node({ id: `${id}-${name}`, symbol: 'plus', cx, cy: top + 9 })
      top += 18 + gap
    } else if (name.startsWith('norm')) {
      part(name, spec.norm ?? 'Layer norm', top, normH, 'block')
      top += normH + gap
    } else {
      part(
        name,
        name === 'ffn' ? (spec.ffn ?? 'Feed forward') : (spec.attention ?? 'Multi-head attention'),
        top,
        blockH,
        'strong'
      )
      top += blockH + gap
    }
  }
  const bottom = top - gap + 36
  const chain = order.toReversed().map((name) => `${id}-${name}`)
  for (let index = 1; index < chain.length; index += 1) {
    fig.arrow({ id: `${id}-p${index}`, from: chain[index - 1], to: chain[index] })
  }
  fig.arrow({ id: `${id}-in`, from: [cx, bottom], to: chain[0] })
  // Residuals leave the main line below each sub-block (before its norm in pre-norm) and rejoin
  // at its ⊕, on the left.
  fig.skip({ id: `${id}-res1`, from: { on: `${id}-in`, at: 'mid' }, to: `${id}-add1`, gap: 16 })
  const split = post
    ? (fig.bounds(`${id}-norm1`).y + fig.bounds(`${id}-ffn`).bottom) / 2
    : fig.bounds(`${id}-add1`).y - 12
  fig.skip({ id: `${id}-res2`, from: { on: `${id}-p3`, y: split }, to: `${id}-add2`, gap: 16 })
  fig.panel({
    id: `${id}-panel`,
    around: [...chain, `${id}-res1`, `${id}-res2`],
    title: spec.title ?? `Transformer block ×${n}`,
    pad: 14
  })
  const parts = ['norm1', 'attn', 'add1', 'norm2', 'ffn', 'add2', 'panel', 'res1', 'res2', 'in']
  return {
    ids: Object.fromEntries(parts.map((name) => [name, `${id}-${name}`])),
    in: [cx, bottom],
    out: [cx, y + 60]
  }
}

/**
 * Mixture of experts: a router sends a token to its top-k experts (accent), the rest stay idle.
 * `h` sets the experts' height; `gate: true` scales each chosen expert's output by its router
 * weight at a ⊗ before the sum (Switch Transformer), with g_i beside it.
 */
function moe(fig, spec) {
  if (spec.tokens?.length) {
    return moeTokens(fig, spec)
  }
  const { id, x = 0, y = 0, experts = 4, selected = [0, 2] } = spec
  const width = spec.w ?? 300
  const gap = 10
  const eh = spec.h ?? 34
  const gated = spec.gate === true
  const ew = (width - gap * (experts - 1)) / experts
  // Why 40 more with gates: the ⊗ nodes sit between the experts and the sum.
  const expertY = y + 44 + (gated ? 40 : 0)
  const ids = []
  for (let index = 0; index < experts; index += 1) {
    const chosen = selected.includes(index)
    const expert = `${id}-e${index + 1}`
    fig.box({
      id: expert,
      label: [{ tex: `E_{${index + 1}}` }],
      x: x + index * (ew + gap),
      y: expertY,
      w: ew,
      h: eh,
      exact: true,
      color: chosen ? 'accent' : 'block'
    })
    ids.push(expert)
  }
  fig.node({ id: `${id}-sum`, symbol: 'plus', cx: x + width / 2, cy: y + 9 })
  fig.box({
    id: `${id}-router`,
    label: spec.router ?? 'Router',
    x: x + width / 2 - 45,
    y: expertY + eh + 40,
    w: 90,
    h: 28,
    exact: true,
    color: 'accent'
  })
  const gates = []
  for (const [index, expert] of ids.entries()) {
    const chosen = selected.includes(index)
    fig.arrow({
      id: `${id}-g${index + 1}`,
      from: `${id}-router`,
      to: expert,
      role: chosen ? 'main' : 'side',
      ...(chosen && !gated
        ? { label: `g_{${index + 1}}`, labelSide: index < experts / 2 ? 'left' : undefined }
        : {})
    })
    if (!chosen) {
      continue
    }
    if (gated) {
      const box = fig.bounds(expert)
      const gate = `${id}-x${index + 1}`
      fig.node({ id: gate, symbol: 'times', cx: box.x + box.width / 2, cy: y + 49 })
      fig.math({
        id: `${id}-gl${index + 1}`,
        tex: `g_{${index + 1}}`,
        x: box.x + box.width / 2 + 13,
        cy: y + 49,
        size: 14
      })
      fig.arrow({ id: `${id}-o${index + 1}`, from: expert, to: gate })
      fig.arrow({ id: `${id}-s${index + 1}`, from: gate, to: `${id}-sum`, route: 'vh' })
      gates.push(gate)
    } else {
      fig.arrow({ id: `${id}-o${index + 1}`, from: expert, to: `${id}-sum`, route: 'vh' })
    }
  }
  const router = fig.bounds(`${id}-router`)
  fig.arrow({
    id: `${id}-in`,
    from: [router.x + router.width / 2, router.bottom + 28],
    to: `${id}-router`
  })
  return {
    ids: {
      router: `${id}-router`,
      experts: ids,
      sum: `${id}-sum`,
      ...(gated ? { gates } : {})
    },
    in: [router.x + router.width / 2, router.bottom + 28],
    out: [x + width / 2, y]
  }
}

/**
 * LoRA: the frozen square weight W (d × d) beside the trained low-rank pair, A narrowing from d to
 * an r-wide waist and B widening back, their outputs summed; `init` writes A = N(0, σ²), B = 0.
 * `size` (W's side, 96) scales the whole module.
 */
function lora(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  // Why these sums: the module is 2 × size + 182 wide and size + 102 tall, so fit fills a box.
  const size =
    spec.size ??
    (spec.fit ? Math.floor(Math.min((spec.fit.w - 182) / 2, (spec.fit.h ?? 1e4) - 102)) : 96)
  // Why a gap at the waist: the r-wide narrow ends must read as a bottleneck, not one shape.
  const waist = 10
  const ratio = spec.ratio ?? 0.3
  const half = (size - waist) / 2
  const top = y + 44
  const ax = x + size + 80
  const mx = (x + size / 2 + ax + size / 2) / 2
  fig.node({ id: `${id}-sum`, symbol: 'plus', cx: mx, cy: y + 9 })
  fig.box({
    id: `${id}-w`,
    label: [{ tex: spec.weight ?? 'W_0' }],
    math: spec.shape === false ? undefined : (spec.shape ?? '\\in\\mathbb{R}^{d\\times d}'),
    x,
    y: top,
    w: size,
    h: size,
    exact: true,
    color: 'strong',
    intentional: true
  })
  fig.frozen(`${id}-w`)
  fig.trapezoid({
    id: `${id}-b`,
    label: [{ tex: 'B' }],
    x: ax,
    y: top,
    w: size,
    h: half,
    narrow: 'bottom',
    ratio,
    color: 'accent'
  })
  fig.trapezoid({
    id: `${id}-a`,
    label: [{ tex: 'A' }],
    x: ax,
    y: top + half + waist,
    w: size,
    h: half,
    narrow: 'top',
    ratio,
    color: 'accent'
  })
  // Why one flame: A and B are one adapter, and A's corner is its narrow end.
  fig.trainable(`${id}-b`)
  // Why at the waist: r is the width of the narrow ends, the rank the adapter squeezes through.
  fig.math({
    id: `${id}-r`,
    tex: spec.rank ?? 'r',
    x: ax + size / 2 + (size * ratio) / 2 + 8,
    cy: top + half + waist / 2,
    size: 14
  })
  if (spec.init !== false) {
    fig.math({
      id: `${id}-binit`,
      tex: 'B = 0',
      x: ax + size + 10,
      cy: top + half / 2,
      size: 14
    })
    fig.math({
      id: `${id}-ainit`,
      tex: 'A = \\mathcal{N}(0, \\sigma^2)',
      x: ax + size + 10,
      cy: top + half + waist + half / 2,
      size: 14
    })
  }
  // Why no arrow between A and B: they meet at the waist, as the paper draws them.
  const inY = top + size + 40
  fig.arrow({ id: `${id}-in`, from: [mx, inY], to: [mx, inY - 18], heads: 'none' })
  fig.dot({ id: `${id}-split`, cx: mx, cy: inY - 18, r: 2.5 })
  fig.arrow({ id: `${id}-tw`, from: [mx, inY - 18], to: `${id}-w`, route: 'hv' })
  fig.arrow({ id: `${id}-ta`, from: [mx, inY - 18], to: `${id}-a`, route: 'hv' })
  fig.arrow({ id: `${id}-wo`, from: `${id}-w`, to: `${id}-sum`, route: 'vh' })
  fig.arrow({ id: `${id}-bo`, from: `${id}-b`, to: `${id}-sum`, route: 'vh' })
  fig.math({ id: `${id}-x`, tex: 'x', cx: mx, y: inY + 2 })
  return {
    ids: {
      weight: `${id}-w`,
      a: `${id}-a`,
      b: `${id}-b`,
      sum: `${id}-sum`,
      rank: `${id}-r`,
      split: `${id}-split`
    },
    in: [mx, inY],
    out: [mx, y],
    width: 2 * size + 182,
    height: size + 102
  }
}

/** Learned queries read a frozen image encoder's features through a Q-Former (BLIP-2 style). */
function qformer(fig, spec) {
  const { id, x = 0, y = 0, queries = 4 } = spec
  fig.image({ id: `${id}-img`, kind: spec.kind ?? 'cat', x, y: y + 40, w: 56, h: 56 })
  fig.box({
    id: `${id}-enc`,
    label: ['Image', '\n', 'encoder'],
    x: x + 76,
    y: y + 36,
    w: 74,
    h: 64,
    exact: true,
    color: 'strong'
  })
  fig.frozen(`${id}-enc`)
  const q = fig.tokens({
    id: `${id}-q`,
    x: x + 176,
    y: y + 120,
    h: 22,
    gap: 3,
    color: 'accent',
    items: Array.from({ length: queries }, () => ({ text: '', w: 22 }))
  })
  fig.box({
    id: `${id}-qf`,
    label: 'Q-Former',
    x: x + 170,
    y: y + 41,
    w: q.width + 12,
    h: 54,
    exact: true,
    color: 'accent'
  })
  fig.trainable(`${id}-qf`)
  fig.arrow({ id: `${id}-a1`, from: `${id}-img`, to: `${id}-enc` })
  fig.arrow({ id: `${id}-a2`, from: `${id}-enc`, to: `${id}-qf` })
  fig.arrow({ id: `${id}-a3`, from: `${id}-q`, to: `${id}-qf`, role: 'side' })
  fig.text({
    id: `${id}-ql`,
    text: 'learned queries',
    size: 14,
    cx: x + 176 + q.width / 2,
    y: y + 146,
    color: 'muted'
  })
  const out = [x + 182 + q.width + 16, y + 68]
  fig.arrow({ id: `${id}-out`, from: `${id}-qf`, to: [out[0] + 24, out[1]] })
  return {
    ids: { image: `${id}-img`, encoder: `${id}-enc`, queries: `${id}-q`, qformer: `${id}-qf` },
    in: [x, y + 68],
    out: [out[0] + 24, out[1]]
  }
}

/** CLIP: image and text encoders, and the n × n similarity matrix with its matching diagonal. */
function clip(fig, spec) {
  const { id, x = 0, y = 0, n = 4, cell = 22 } = spec
  const gx = x + 190
  const gy = y + 80
  const fills = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => (row === col ? 'accent' : 'block'))
  )
  fig.grid({ id: `${id}-sim`, x: gx, y: gy, rows: n, cols: n, cell, fills })
  for (let index = 0; index < n; index += 1) {
    fig.math({
      id: `${id}-i${index}`,
      tex: `I_{${index + 1}}`,
      x: gx - 6,
      align: 'right',
      cy: gy + (index + 0.5) * cell,
      size: 14
    })
    fig.math({
      id: `${id}-t${index}`,
      tex: `T_{${index + 1}}`,
      cx: gx + (index + 0.5) * cell,
      y: gy - 22,
      size: 14
    })
  }
  fig.box({
    id: `${id}-ienc`,
    label: ['Image', '\n', 'encoder'],
    x: x + 56,
    y: gy + (n * cell) / 2 - 24,
    w: 74,
    h: 48,
    exact: true,
    color: 'strong'
  })
  fig.box({
    id: `${id}-tenc`,
    label: 'Text encoder',
    x: gx + (n * cell) / 2 - 55,
    y: y,
    w: 110,
    h: 30,
    exact: true,
    color: 'strong'
  })
  fig.image({
    id: `${id}-img`,
    kind: spec.kind ?? 'dog',
    x,
    y: gy + (n * cell) / 2 - 14,
    w: 28,
    h: 28
  })
  fig.arrow({ id: `${id}-a1`, from: `${id}-img`, to: `${id}-ienc` })
  fig.arrow({ id: `${id}-a2`, from: `${id}-ienc`, to: [gx - 30, gy + (n * cell) / 2] })
  fig.arrow({ id: `${id}-a3`, from: `${id}-tenc`, to: [gx + (n * cell) / 2, gy - 26] })
  return {
    ids: { similarity: `${id}-sim`, imageEncoder: `${id}-ienc`, textEncoder: `${id}-tenc` },
    in: [x, gy + (n * cell) / 2],
    out: [gx + n * cell, gy + (n * cell) / 2]
  }
}

/** VQ: encoder outputs snap to their nearest codebook vector (a row of the K × D codebook). */
function vq(fig, spec) {
  const { id, x = 0, y = 0, codes = 5, chosen = 2 } = spec
  fig.features({ id: `${id}-ze`, x, y: y + 34, rows: 3, cols: 3, cell: 14 })
  fig.math({ id: `${id}-zel`, tex: 'z_e(x)', cx: x + 21, y: y + 6, size: 14 })
  const bx = x + 120
  const fills = Array.from({ length: codes }, (_, row) =>
    Array.from({ length: 6 }, () => (row === chosen ? 'accent' : 'block'))
  )
  // Why centred on the features: the codebook sits in their row, not a few units off it.
  const top = y + 55 - (codes * 11) / 2
  fig.grid({ id: `${id}-book`, x: bx, y: top, rows: codes, cols: 6, cell: 11, fills })
  fig.text({ id: `${id}-bl`, text: 'codebook', size: 14, cx: bx + 33, y: top - 22, color: 'muted' })
  const rowY = top + (chosen + 0.5) * 11
  fig.math({ id: `${id}-ek`, tex: `e_{${chosen + 1}}`, x: bx + 70, cy: rowY - 12, size: 14 })
  const zx = bx + 140
  fig.features({ id: `${id}-zq`, x: zx, y: y + 34, rows: 3, cols: 3, cell: 14, color: 'accent' })
  fig.math({ id: `${id}-zql`, tex: 'z_q(x)', cx: zx + 21, y: y + 6, size: 14 })
  fig.arrow({ id: `${id}-look`, from: `${id}-ze`, to: `${id}-book` })
  fig.text({ id: `${id}-nl`, text: 'nearest', size: 14, cx: x + 84, y: y + 84, color: 'muted' })
  fig.arrow({ id: `${id}-out`, from: [bx + 70, rowY], to: `${id}-zq` })
  return {
    ids: { encoded: `${id}-ze`, codebook: `${id}-book`, quantized: `${id}-zq` },
    in: [x, y + 55],
    out: [zx + 42, y + 55]
  }
}

export const TEMPLATES = {
  transformer: [
    transformer,
    'transformer block ×N in a titled panel, pre-norm or post-norm',
    "{ id, x, y, w: 170, h, n: 'N', variant: 'pre-norm' | 'post-norm', attention, ffn, norm, title }"
  ],
  moe: [
    moe,
    'router and experts, top-k in the accent; gate: true scales each output at a ⊗ (Switch); tokens: several tokens, each routed by its own router to its expert',
    "{ id, x, y, w: 300, h: 34, experts: 4, selected: [0, 2], gate: false, router, tokens: [{ label: 'x_1', expert: 2, gate: 0.65, output: 'y_1' }] }"
  ],
  lora: [
    lora,
    'frozen square W beside trained A·B through an r-wide waist, summed; A = N(0, σ²), B = 0',
    "{ id, x, y, size: 96 | fit: { w, h } (the module is 2 × size + 182 wide, size + 102 tall), weight: 'W_0', shape: '\\\\in\\\\mathbb{R}^{d\\\\times d}' | false, rank: 'r', ratio: 0.3, init: true }"
  ],
  qformer: [
    qformer,
    'learned queries over a frozen image encoder (BLIP-2)',
    "{ id, x, y, queries: 4, kind: 'cat' }"
  ],
  clip: [
    clip,
    'image and text encoders, similarity matrix with its diagonal',
    "{ id, x, y, n: 4, cell: 22, kind: 'dog' }"
  ],
  vq: [vq, 'nearest codebook lookup, z_e → z_q', '{ id, x, y, codes: 5, chosen: 2 }'],
  ...GENERATIVE_TEMPLATES,
  ...DIT_TEMPLATES,
  ...LOOP_TEMPLATES,
  ...AGENT_TEMPLATES
}

/** The template list as text, for `figures kit templates`. */
export function templateListText() {
  return [
    'fig.template(name, { id, x, y, ... }) → { ids, in, out }',
    '  Composites in the figure style; parts are <id>-<part>; arrows bind to the returned ids.',
    "  `figures kit <name>` prints one template's options.",
    '',
    ...Object.entries(TEMPLATES).map(([name, entry]) => `  ${name.padEnd(12)} ${String(entry[1])}`)
  ].join('\n')
}

/** One template's call, options and what it draws, for `figures kit <name>`; null if none. */
export function templateText(name) {
  const entry = Object.hasOwn(TEMPLATES, name) ? TEMPLATES[name] : null
  return entry
    ? [
        `fig.template('${name}', ${String(entry[2])}) → { ids, in, out }`,
        `  ${String(entry[1])}`,
        '  Parts are <id>-<part> (the returned ids); arrows bind to them. labels: { <part>: text }',
        '  renames plain box labels; for other changes draw the module by hand with the kit.'
      ].join('\n')
    : null
}

/**
 * Renames a template's plain box labels: `labels: { <ids key>: 'text' }` (ViT-L/14 for the
 * image encoder). A part labelled with math, or a glyph, is drawn by hand instead.
 */
export function relabelTemplate(fig, drawn, labels = {}) {
  for (const [key, text] of Object.entries(labels)) {
    // Why skip: a template that names a part itself (a TeX row label) took it while drawing.
    if (drawn.handled?.includes(key)) {
      continue
    }
    const id = drawn.ids?.[key]
    if (typeof id !== 'string') {
      throw new Error(
        `No part "${key}" to relabel; parts: ${Object.keys(drawn.ids ?? {}).join(', ')}`
      )
    }
    const box = fig.get(id)
    // Why both: a one-line label is bound to its box; a multi-line one is text drawn over it.
    const parts = fig.elements.filter(
      (element) =>
        !element.isDeleted &&
        (element.containerId === id ||
          (element.customData?.asterKit === id && element.id.startsWith(`${id}-label`)))
    )
    if (!parts.length || parts.some((part) => part.type !== 'text')) {
      throw new Error(`${id} has no plain text label to rename; draw that part by hand`)
    }
    const [label, ...rest] = parts
    const gone = new Set(rest.map((part) => part.id))
    fig.elements.splice(
      0,
      fig.elements.length,
      ...fig.elements.filter((element) => !gone.has(element.id))
    )
    const size = measureText(String(text), label.fontSize, label.fontFamily)
    const height = (size.height / 1.25) * (label.lineHeight ?? 1.25)
    Object.assign(label, {
      text: String(text),
      originalText: String(text),
      width: size.width,
      height,
      textAlign: 'center',
      x: box.x + (box.width - size.width) / 2,
      y: box.y + (box.height - height) / 2
    })
  }
  return drawn
}
