// Generative-model templates: the diffusion chain, a U-Net and a KV cache. Split from
// research-figures-templates.mjs to keep files short; the registry there spreads these in.

/**
 * A diffusion chain x_T → … → x_0 on thumbnails losing their noise: between each pair the
 * reverse step p_θ (solid, toward x_0) runs above the forward step q (dashed, toward x_T), as
 * two opposite parallel arrows (fig.lanes); the x_t, x_{t-1} pair carries their names above
 * and below the row. `steps` pictures in a row, or with `ellipsis: true` the DDPM row
 * x_T → ⋯ → x_t → x_{t-1} → ⋯ → x_0 (⋯ are fig.ellipsis items the lanes bind to). `fit: { w, h }`
 * sizes the pictures and gaps to fill that box.
 */
function diffusion(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  const steps = spec.ellipsis ? 4 : (spec.steps ?? 4)
  if (steps < 2) {
    throw new Error('diffusion needs at least 2 steps')
  }
  const names =
    spec.names ??
    Array.from({ length: steps }, (_, index) =>
      index === 0 ? 'x_T' : index === steps - 1 ? 'x_0' : index === steps - 2 ? 'x_{t-1}' : 'x_t'
    )
  // Why ⋯ between x_T and x_t and after x_{t-1}: the chain is long; two steps stand for it.
  const items = spec.ellipsis
    ? [names[0], null, names[1], names[2], null, names[3]]
    : names.map((name) => name)
  const dots = items.filter((item) => item === null).length
  const dotW = 24
  const fitted = spec.fit ?? (spec.w ? { w: spec.w, h: spec.h } : null)
  const minGap = 40
  const size =
    spec.size ??
    (fitted
      ? Math.round(
          Math.max(
            36,
            Math.min(
              (fitted.h ?? 200) - 64,
              (fitted.w - (items.length - 1) * minGap - dots * dotW) / steps
            )
          )
        )
      : 52)
  const gap =
    spec.gap ??
    (fitted
      ? Math.max(minGap, Math.floor((fitted.w - steps * size - dots * dotW) / (items.length - 1)))
      : 56)
  // Why the labels above and below the row: wider than the gap, they would sit on the pictures.
  const top = y + 24
  const ids = []
  let left = x
  let picture = 0
  const lefts = []
  for (const [index, name] of items.entries()) {
    lefts.push(left)
    if (name === null) {
      fig.ellipsis({
        id: `${id}-dots${index}`,
        cx: left + dotW / 2,
        cy: top + size / 2,
        size: dotW
      })
      ids.push(`${id}-dots${index}`)
      left += dotW + gap
    } else {
      fig.image({
        id: `${id}-x${picture}`,
        kind: spec.kind ?? 'cat',
        noise: spec.ellipsis ? [1, 0.6, 0.42, 0][picture] : 1 - picture / (steps - 1),
        seed: 3,
        x: left,
        y: top,
        w: size,
        h: size
      })
      fig.math({
        id: `${id}-l${picture}`,
        tex: name,
        cx: left + size / 2,
        y: top + size + 4,
        size: 14
      })
      ids.push(`${id}-x${picture}`)
      picture += 1
      left += size + gap
    }
    if (index) {
      // Why lanes: p_θ toward x_0 above, q back toward x_T below, each bound to its pictures.
      fig.lanes({
        id: `${id}-step${index}`,
        between: [ids[index - 1], ids[index]],
        gap: Math.round(size * 0.28),
        roles: ['data', 'aux']
      })
    }
  }
  // The pair x_t → x_{t-1} names its two steps.
  const pair = spec.ellipsis ? 3 : Math.max(1, steps - 2)
  const middle = lefts[pair] - gap / 2
  fig.math({
    id: `${id}-pl`,
    tex: spec.reverse ?? 'p_\\theta(x_{t-1}\\mid x_t)',
    cx: middle,
    y,
    size: 14
  })
  fig.math({
    id: `${id}-ql`,
    tex: spec.forward ?? 'q(x_t\\mid x_{t-1})',
    cx: middle,
    y: top + size + 26,
    size: 14
  })
  return {
    ids: {
      steps: ids.filter((item) => item.startsWith(`${id}-x`)),
      reverse: ids.slice(1).map((_, index) => `${id}-step${index + 1}-1`),
      forward: ids.slice(1).map((_, index) => `${id}-step${index + 1}-2`),
      reverseLabel: `${id}-pl`,
      forwardLabel: `${id}-ql`
    },
    in: [x, top + size / 2],
    out: [left - gap, top + size / 2],
    width: left - gap - x,
    height: top + size + 26 + 20 - y
  }
}

/** A U-Net: encoder blocks shrink, a bottleneck, decoder blocks grow back, with skip links. */
function unet(fig, spec) {
  const { id, x = 0, y = 0, levels = 3 } = spec
  const bw = 34
  // Why 60: blocks 42 wide leave each arrow a visible shaft.
  const step = 60
  const heights = Array.from({ length: levels }, (_, index) => 90 - index * 22)
  const bottom = y + 150
  for (let index = 0; index < levels; index += 1) {
    const h = heights[index]
    const top = y + index * 30
    fig.box({
      id: `${id}-d${index}`,
      label: '',
      x: x + index * step,
      y: top,
      w: bw,
      h,
      exact: true,
      color: 'strong'
    })
    fig.box({
      id: `${id}-u${index}`,
      label: '',
      x: x + (2 * levels - index) * step,
      y: top,
      w: bw,
      h,
      exact: true,
      color: 'strong'
    })
    if (index) {
      fig.arrow({
        id: `${id}-down${index}`,
        from: `${id}-d${index - 1}`,
        to: `${id}-d${index}`,
        route: 'hv'
      })
      fig.arrow({
        id: `${id}-up${index}`,
        from: `${id}-u${index}`,
        to: `${id}-u${index - 1}`,
        route: 'hv'
      })
    }
    // Why near the top: inner blocks sit lower, so an outer level's skip link passes above them.
    fig.arrow({
      id: `${id}-skip${index}`,
      from: `${id}-d${index}`,
      to: `${id}-u${index}`,
      points: [
        [x + index * step + bw + 4, top + 10],
        [x + (2 * levels - index) * step - 4, top + 10]
      ],
      role: 'aux'
    })
  }
  fig.box({
    id: `${id}-mid`,
    label: '',
    x: x + levels * step,
    y: y + levels * 30,
    w: bw,
    h: 34,
    exact: true,
    color: 'accent'
  })
  fig.arrow({ id: `${id}-into`, from: `${id}-d${levels - 1}`, to: `${id}-mid`, route: 'hv' })
  fig.arrow({ id: `${id}-outof`, from: `${id}-mid`, to: `${id}-u${levels - 1}`, route: 'hv' })
  return {
    ids: {
      down: heights.map((_, index) => `${id}-d${index}`),
      up: heights.map((_, index) => `${id}-u${index}`),
      bottleneck: `${id}-mid`
    },
    in: [x, y + 45],
    out: [x + 2 * levels * step + bw, y + 45],
    bottom
  }
}

/** A KV cache: past keys and values (gray) and the new step's (accent), read by the query. */
function kvcache(fig, spec) {
  const { id, x = 0, y = 0, steps = 4 } = spec
  for (const [row, name] of ['K', 'V'].entries()) {
    fig.tokens({
      id: `${id}-${name.toLowerCase()}`,
      x: x + 26,
      y: y + row * 34,
      h: 24,
      gap: 3,
      items: Array.from({ length: steps }, (_, index) => ({
        tex: `${name.toLowerCase()}_{${index + 1}}`,
        w: 34,
        color: index === steps - 1 ? 'accent' : 'block'
      }))
    })
    fig.math({ id: `${id}-${name}`, tex: name, x: x, y: y + row * 34 + 2 })
  }
  const right = x + 26 + steps * 37
  fig.box({
    id: `${id}-q`,
    label: [{ tex: `q_{${steps}}` }],
    x: right + 30,
    y: y + 14,
    w: 36,
    h: 30,
    exact: true,
    color: 'accent'
  })
  fig.arrow({
    id: `${id}-read`,
    from: `${id}-q`,
    to: [right + 4, y + 29]
  })
  fig.text({ id: `${id}-note`, text: 'cached', size: 14, x: x + 26, y: y + 66, color: 'muted' })
  return {
    ids: { keys: `${id}-k`, values: `${id}-v`, query: `${id}-q` },
    in: [right + 66, y + 29],
    out: [x, y + 29]
  }
}

export const GENERATIVE_TEMPLATES = {
  diffusion: [
    diffusion,
    'x_T → … → x_0 on thumbnails losing noise; p_θ (solid) and q (dashed) as opposite arrows',
    "{ id, x, y, steps: 4 (any number), ellipsis: false (true: x_T ⋯ x_t x_{t-1} ⋯ x_0), size: 52, gap: 56 | fit: { w, h }, names, kind: 'cat', reverse: 'p_\\\\theta(x_{t-1}\\\\mid x_t)', forward: 'q(x_t\\\\mid x_{t-1})' }"
  ],
  unet: [unet, 'down blocks, bottleneck, up blocks, skip links', '{ id, x, y, levels: 3 }'],
  kvcache: [kvcache, 'cached keys and values, the new step in the accent', '{ id, x, y, steps: 4 }']
}
