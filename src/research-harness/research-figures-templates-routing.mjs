// Mixture-of-experts with several tokens (Switch Transformer's figure): each token has its own
// router, which sends it to one expert of a shared row, and leaves as its own output. Split from
// research-figures-templates.mjs; moe() draws this when given `tokens`.

const round = (value) => Math.round(value * 10) / 10

/**
 * `tokens: [{ label: 'x_1', expert: 2, gate: 0.65 }]`: below the expert row, each token's router
 * (shared weights, drawn once per token) picks its expert (1-based) with probability `gate`;
 * above the row, that expert's output y_i scaled by the gate.
 */
export function moeTokens(fig, spec) {
  const { id, x = 0, y = 0, experts = 4, tokens } = spec
  const width = spec.fit?.w ?? spec.w ?? Math.max(300, tokens.length * 150)
  const gap = 10
  const eh = spec.h ?? 34
  const ew = (width - gap * (experts - 1)) / experts
  const chosen = new Set(tokens.map((token) => token.expert))
  for (const token of tokens) {
    if (!(token.expert >= 1 && token.expert <= experts)) {
      throw new Error(
        `moe: token ${token.label} goes to expert ${token.expert}; experts are 1–${experts}`
      )
    }
  }
  const outY = y
  const expertY = y + 70
  const routerY = expertY + eh + 44
  const tokenY = routerY + 28 + 32
  // Why each token under its expert: its route runs straight up, and the expert it was sent to
  // reads at a glance; tokens sharing an expert split its width.
  const lane = (index) => {
    const expert = tokens[index].expert
    const sharing = tokens.filter((token) => token.expert === expert)
    const k = tokens.slice(0, index).filter((token) => token.expert === expert).length
    const left = x + (expert - 1) * (ew + gap)
    return left + (ew * (k + 0.5)) / sharing.length
  }
  const experts_ = []
  for (let index = 0; index < experts; index += 1) {
    const expert = `${id}-e${index + 1}`
    fig.box({
      id: expert,
      label: spec.expertLabel
        ? spec.expertLabel(index + 1)
        : [{ tex: `\\mathrm{FFN}_{${index + 1}}` }],
      x: round(x + index * (ew + gap)),
      y: expertY,
      w: round(ew),
      h: eh,
      exact: true,
      intentional: true,
      color: chosen.has(index + 1) ? 'accent' : 'block'
    })
    experts_.push(expert)
  }
  const ids = { experts: experts_, tokens: [], routers: [], outputs: [] }
  for (const [index, token] of tokens.entries()) {
    const cx = lane(index)
    const share = tokens.filter((other) => other.expert === token.expert).length
    const rw = Math.min(90, ew / share - 6)
    const tokenId = `${id}-t${index + 1}`
    const routerId = `${id}-router${index + 1}`
    const outId = `${id}-y${index + 1}`
    const tokenLabel = [{ tex: token.label ?? `x_{${index + 1}}` }]
    const tw = Math.min(
      Math.max(56, fig.measure('box', { label: tokenLabel, h: 28 }).width),
      (ew + gap) / share - 6
    )
    fig.box({
      id: tokenId,
      label: tokenLabel,
      x: round(cx - tw / 2),
      y: tokenY,
      w: round(tw),
      h: 28,
      exact: true,
      color: 'white'
    })
    fig.box({
      id: routerId,
      label: spec.router ?? 'Router',
      x: round(cx - rw / 2),
      y: routerY,
      w: round(rw),
      h: 28,
      exact: true,
      color: 'strong'
    })
    fig.box({
      id: outId,
      label: [{ tex: token.output ?? `y_{${index + 1}}` }],
      x: round(cx - Math.min(28, rw / 2)),
      y: outY,
      w: round(Math.min(56, rw)),
      h: 28,
      exact: true,
      color: 'white'
    })
    fig.arrow({ id: `${id}-in${index + 1}`, from: tokenId, to: routerId })
    const expert = `${id}-e${token.expert}`
    fig.arrow({
      id: `${id}-route${index + 1}`,
      from: routerId,
      to: expert,
      role: 'main',
      ...(token.gate !== undefined ? { label: `p = ${token.gate}`, labelSide: 'right' } : {})
    })
    fig.arrow({ id: `${id}-out${index + 1}`, from: expert, to: outId })
    ids.tokens.push(tokenId)
    ids.routers.push(routerId)
    ids.outputs.push(outId)
  }
  return {
    ids,
    in: ids.tokens,
    out: ids.outputs,
    width,
    height: tokenY + 28 - y
  }
}
