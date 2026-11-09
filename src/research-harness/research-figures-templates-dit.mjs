// The DiT block with adaLN-Zero: the conditioning (timestep and class) regresses scale, shift
// and gate for each sub-block. The conditioning path is this block's contribution, so it is drawn
// `main` and the modulations in the accent; residuals are side lines. Options vary it: a height
// to fill, token rows in and out, or in-context conditioning (the paper's baseline).
import { fitStack } from './research-figures-templates-stack.mjs'

/**
 * The names of the token rows: `labels: { zt, eps }` (TeX) or the defaults, z_t in and ε_θ out
 * (Σ_θ too with `sigma: true`, as the last block's learned covariance).
 */
export function rowNames(spec) {
  return {
    zt: spec.labels?.zt ?? 'z_t',
    eps:
      spec.labels?.eps ??
      (spec.sigma ? '\\epsilon_\\theta,\\ \\Sigma_\\theta' : '\\epsilon_\\theta')
  }
}

/** A row of `n` noise tokens centred on cx (the latent patches), tinted for a prediction. */
function noiseRow(fig, id, n, cx, y, predicted) {
  const size = 22
  const width = n * size + (n - 1) * 3
  fig.tokens({
    id,
    x: cx - width / 2,
    y,
    h: size,
    gap: 3,
    // Why tinted: the predicted noise is the model's output, in the accent; the input is gray.
    items: Array.from({ length: n }, (_, index) =>
      predicted
        ? { noise: true, tint: 'accent', w: size, seed: index + 11 }
        : { noise: true, w: size, seed: index + 1 }
    )
  })
  return { x: cx - width / 2, width, bottom: y + size }
}

/**
 * A DiT block, bottom to top: adaLN-Zero (its MLP on the right; α starts at zero) or, with
 * `variant: 'in-context'`, a plain block whose input row carries the t and c tokens. `h` fills a
 * height; `tokens: n` draws the noised latent tokens in and the predicted noise out.
 */
function dit(fig, given) {
  // Why 180: the lanes' inset (32), the conditioning bus and MLP right of the block and the
  // panel's padding; fit: { w } takes them off the block width.
  const spec = given.fit
    ? { ...given, w: Math.max(120, given.fit.w - 180), h: given.fit.h ?? given.h }
    : given
  const drawn = ditBlock(fig, spec)
  const panel = fig.bounds(`${spec.id}-panel`)
  const left = Math.min(
    panel.x,
    ...['zt', 'eps'].flatMap((row) => (drawn.ids[row] ? [fig.bounds(drawn.ids[row]).x] : []))
  )
  const top = Math.min(panel.y, ...(drawn.ids.eps ? [fig.bounds(drawn.ids.eps).y] : []))
  const bottom = Math.max(panel.bottom, ...(drawn.ids.zt ? [fig.bounds(drawn.ids.zt).bottom] : []))
  // Why the labels handled: z_t and ε_θ are TeX on token rows, named here, not renamed after.
  return {
    ...drawn,
    width: Math.round(panel.right - Math.min(left, spec.x ?? 0)),
    height: Math.round(bottom - Math.min(top, spec.y ?? 0)),
    handled: ['zt', 'eps']
  }
}

function ditBlock(fig, spec) {
  const { id, w = 200 } = spec
  const variant = spec.variant ?? 'adaLN-Zero'
  if (!['adaLN-Zero', 'in-context'].includes(variant)) {
    throw new Error(`dit variant is adaLN-Zero or in-context, not ${JSON.stringify(variant)}`)
  }
  const tokens = spec.tokens ?? 0
  // Why 44 more: the predicted tokens sit above the block, the noised ones below it.
  const y = (spec.y ?? 0) + (tokens ? 44 : 0)
  if (variant === 'in-context') {
    return inContext(fig, { ...spec, y, w, tokens })
  }
  // Why inset: the residual lanes and the panel's padding stay right of the given x.
  const x = (spec.x ?? 0) + 32
  const cx = x + w / 2
  const busX = x + w + 70
  const { k, gap } = fitStack(
    { h: spec.h === undefined ? undefined : spec.h - (tokens ? 88 : 0) },
    { fixed: 50 + 36 + 12 + 10 + 36, boxes: [22, 30, 22, 22, 22, 30, 22, 22], gaps: 10 }
  )
  const thin = Math.round(22 * k)
  const thick = Math.round(30 * k)
  let top = y + 50
  const node = (name) => {
    fig.node({ id: `${id}-${name}`, symbol: 'plus', cx, cy: top + 9 })
    top += 18 + gap
  }
  // Why intentional: the stack's blocks share one width so the residual lanes run straight.
  const block = (name, label, h, color) => {
    fig.box({ id: `${id}-${name}`, label, x, y: top, w, h, exact: true, color, intentional: true })
    top += h + gap
  }
  node('add2')
  block('scale2', 'Scale', thin, 'accent')
  block('ffn', spec.ffn ?? 'Pointwise feedforward', thick, 'strong')
  block('mod2', 'Scale, shift', thin, 'accent')
  block('norm2', 'Layer norm', thin, 'block')
  // Why 12 more: the second residual leaves the arrow above the ⊕, clear of its head.
  top += 12
  node('add1')
  block('scale1', 'Scale', thin, 'accent')
  block('attn', spec.attention ?? 'Multi-head self-attention', thick, 'strong')
  block('mod1', 'Scale, shift', thin, 'accent')
  block('norm1', 'Layer norm', thin, 'block')
  const bottom = top - gap + 10
  const chain = [
    'norm1',
    'mod1',
    'attn',
    'scale1',
    'add1',
    'norm2',
    'mod2',
    'ffn',
    'scale2',
    'add2'
  ]
  for (let index = 1; index < chain.length; index += 1) {
    fig.arrow({
      id: `${id}-p${index}`,
      from: `${id}-${chain[index - 1]}`,
      to: `${id}-${chain[index]}`
    })
  }
  const rows = tokens ? latentRows(fig, id, tokens, cx, y, bottom + 36, rowNames(spec)) : null
  fig.arrow({ id: `${id}-in`, from: rows ? `${id}-zt` : [cx, bottom + 36], to: `${id}-norm1` })
  fig.arrow({ id: `${id}-out`, from: `${id}-add2`, to: rows ? `${id}-eps` : [cx, y + 30] })
  // Why skips: each residual leaves the main path below its sub-block and rejoins at its ⊕.
  fig.skip({
    id: `${id}-res1`,
    // Why higher with a token row: the panel around the split stays clear of the tokens.
    from: { on: `${id}-in`, at: tokens ? 0.7 : 'mid' },
    to: `${id}-add1`,
    gap: 16
  })
  const split = fig.bounds(`${id}-add1`).y - 12
  fig.skip({ id: `${id}-res2`, from: { on: `${id}-p5`, y: split }, to: `${id}-add2`, gap: 16 })
  // The conditioning: an MLP regresses γ, β (scale, shift) and α (gate) for each sub-block.
  fig.box({
    id: `${id}-mlp`,
    label: 'MLP',
    x: busX - 30,
    y: bottom - 34,
    w: 60,
    h: 28,
    exact: true,
    color: 'accent'
  })
  fig.math({
    id: `${id}-cond`,
    tex: spec.condition ?? 'c,\\ t',
    cx: busX,
    y: bottom + 22,
    size: 14
  })
  fig.arrow({ id: `${id}-c`, from: [busX, bottom + 20], to: `${id}-mlp`, role: 'main' })
  const topModulation = fig.bounds(`${id}-scale2`)
  fig.arrow({
    id: `${id}-bus`,
    from: `${id}-mlp`,
    to: [busX, topModulation.y + topModulation.height / 2],
    heads: 'none',
    role: 'main'
  })
  for (const [name, tex] of [
    ['scale2', '\\alpha_2'],
    ['mod2', '\\gamma_2,\\beta_2'],
    ['scale1', '\\alpha_1'],
    ['mod1', '\\gamma_1,\\beta_1']
  ]) {
    const box = fig.bounds(`${id}-${name}`)
    fig.arrow({
      id: `${id}-to-${name}`,
      from: { on: `${id}-bus`, y: box.y + box.height / 2 },
      to: `${id}-${name}`,
      role: 'main',
      label: tex,
      labelSize: 14
    })
  }
  // Why drawn: the zero-initialised gate is the detail that names adaLN-Zero.
  fig.text({
    id: `${id}-zero`,
    runs: [{ tex: '\\alpha_1 = \\alpha_2 = 0' }, ' at init'],
    cx: busX,
    y: bottom + 40,
    size: 14
  })
  fig.panel({
    id: `${id}-panel`,
    around: [
      ...chain.map((name) => `${id}-${name}`),
      `${id}-res1`,
      `${id}-res2`,
      `${id}-mlp`,
      `${id}-bus`,
      `${id}-zero`
    ],
    title: spec.title ?? 'DiT block ×N',
    pad: 14
  })
  return {
    ids: Object.fromEntries(
      [...chain, 'mlp', 'panel', 'bus', 'res1', 'res2', ...(rows ? ['zt', 'eps'] : [])].map(
        (name) => [name, `${id}-${name}`]
      )
    ),
    in: [cx, rows ? rows.bottom : bottom + 36],
    out: [cx, rows ? y - 44 : y + 30],
    condition: [busX, bottom + 20]
  }
}

/** Noised latent tokens under the block (`<id>-zt`) and the predicted noise over it (`<id>-eps`). */
function latentRows(fig, id, n, cx, y, inY, names) {
  const below = noiseRow(fig, `${id}-zt`, n, cx, inY + 4, false)
  fig.math({
    id: `${id}-ztl`,
    tex: names.zt,
    x: below.x - 8,
    align: 'right',
    cy: inY + 15,
    size: 14
  })
  const above = noiseRow(fig, `${id}-eps`, n, cx, y - 40, true)
  fig.math({
    id: `${id}-epsl`,
    tex: names.eps,
    x: above.x - 8,
    align: 'right',
    cy: y - 29,
    size: 14
  })
  return { bottom: below.bottom }
}

/** In-context conditioning: t and c ride as two more tokens through a plain block. */
function inContext(fig, spec) {
  const { id, w, tokens } = spec
  const x = (spec.x ?? 0) + 32
  const cx = x + w / 2
  const { k, gap } = fitStack(
    { h: spec.h === undefined ? undefined : spec.h - (tokens ? 88 : 0) },
    { fixed: 50 + 36 + 12 + 36, boxes: [30, 22, 30, 22], gaps: 5 }
  )
  let top = spec.y + 50
  const parts = [
    ['add2'],
    ['ffn', spec.ffn ?? 'Pointwise feedforward', Math.round(30 * k), 'strong'],
    ['norm2', 'Layer norm', Math.round(22 * k), 'block'],
    ['add1'],
    ['attn', spec.attention ?? 'Multi-head self-attention', Math.round(30 * k), 'strong'],
    ['norm1', 'Layer norm', Math.round(22 * k), 'block']
  ]
  for (const [name, label, h, color] of parts) {
    if (!label) {
      top += name === 'add1' ? 12 : 0
      fig.node({ id: `${id}-${name}`, symbol: 'plus', cx, cy: top + 9 })
      top += 18 + gap
      continue
    }
    fig.box({ id: `${id}-${name}`, label, x, y: top, w, h, exact: true, color, intentional: true })
    top += h + gap
  }
  const chain = ['norm1', 'attn', 'add1', 'norm2', 'ffn', 'add2']
  for (let index = 1; index < chain.length; index += 1) {
    fig.arrow({
      id: `${id}-p${index}`,
      from: `${id}-${chain[index - 1]}`,
      to: `${id}-${chain[index]}`
    })
  }
  // Why 48: the row sits clear below the panel that holds the residual's split.
  const inY = top - gap + 48
  // The input row: latent tokens (noise) with the timestep and class tokens beside them.
  const n = tokens || 4
  const size = 22
  const items = [
    ...Array.from({ length: n }, (_, index) => ({ noise: true, w: size, seed: index + 1 })),
    { tex: 't', w: size, color: 'accent' },
    { tex: 'c', w: size, color: 'accent' }
  ]
  const width = items.length * size + (items.length - 1) * 3
  fig.tokens({ id: `${id}-zt`, x: cx - width / 2, y: inY + 4, h: size, gap: 3, items })
  fig.math({
    id: `${id}-ztl`,
    tex: rowNames(spec).zt,
    x: cx - width / 2 - 8,
    align: 'right',
    cy: inY + 15,
    size: 14
  })
  fig.arrow({ id: `${id}-in`, from: `${id}-zt`, to: `${id}-norm1`, role: 'main' })
  fig.skip({
    id: `${id}-res1`,
    // Why higher with a token row: the panel around the split stays clear of the tokens.
    from: { on: `${id}-in`, at: tokens ? 0.7 : 'mid' },
    to: `${id}-add1`,
    gap: 16
  })
  const split = fig.bounds(`${id}-add1`).y - 12
  fig.skip({ id: `${id}-res2`, from: { on: `${id}-p3`, y: split }, to: `${id}-add2`, gap: 16 })
  if (tokens) {
    const above = noiseRow(fig, `${id}-eps`, tokens, cx, spec.y - 40, true)
    fig.math({
      id: `${id}-epsl`,
      tex: rowNames(spec).eps,
      x: above.x - 8,
      align: 'right',
      cy: spec.y - 29,
      size: 14
    })
    fig.arrow({ id: `${id}-out`, from: `${id}-add2`, to: `${id}-eps` })
  } else {
    fig.arrow({ id: `${id}-out`, from: `${id}-add2`, to: [cx, spec.y + 30] })
  }
  fig.panel({
    id: `${id}-panel`,
    around: [...chain.map((name) => `${id}-${name}`), `${id}-res1`, `${id}-res2`],
    title: spec.title ?? 'DiT block ×N',
    pad: 14
  })
  return {
    ids: Object.fromEntries(
      [...chain, 'panel', 'zt', 'res1', 'res2', ...(tokens ? ['eps'] : [])].map((name) => [
        name,
        `${id}-${name}`
      ])
    ),
    in: [cx, inY + 4 + size],
    out: [cx, tokens ? spec.y - 40 : spec.y + 30]
  }
}

export const DIT_TEMPLATES = {
  dit: [
    dit,
    'DiT block: adaLN-Zero (the conditioning MLP gates each sub-block, α = 0 at init) or in-context conditioning',
    "{ id, x, y, w: 200 (the block's width; the whole module is about w + 180 wide, returned as width, height) | fit: { w, h } (the whole module), h, variant: 'adaLN-Zero' | 'in-context', tokens: 0, labels: { zt: 'z_t', eps: '\\\\epsilon_\\\\theta' } (TeX row names; any box part too), sigma: false (adds \\\\Sigma_\\\\theta for the last block), condition: 'c,\\\\ t', attention, ffn, title }; draws right of x and below y"
  ]
}
