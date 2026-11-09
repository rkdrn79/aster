// Templates for loops and pipelines around a model: RL, an agent's plan-act-observe loop,
// retrieval-augmented generation, and preference pairs. Icons mark actors and tools sparingly.

/** Reinforcement learning: the agent acts on the environment, which returns state and reward. */
function rl(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  fig.box({
    id: `${id}-agent`,
    label: 'Agent',
    x,
    y: y + 40,
    w: 110,
    h: 44,
    exact: true,
    color: 'accent'
  })
  fig.box({
    id: `${id}-env`,
    label: 'Environment',
    x: x + 230,
    y: y + 40,
    w: 120,
    h: 44,
    exact: true,
    color: 'strong'
  })
  fig.icon('robot', { id: `${id}-agent-icon`, cx: x + 12, cy: y + 40, size: 20 })
  fig.icon('earth', { id: `${id}-env-icon`, cx: x + 242, cy: y + 40, size: 20 })
  fig.arrow({
    id: `${id}-act`,
    from: `${id}-agent`,
    to: `${id}-env`,
    via: [
      [x + 55, y + 12],
      [x + 290, y + 12]
    ],
    label: 'a_t'
  })
  fig.arrow({
    id: `${id}-state`,
    from: `${id}-env`,
    to: `${id}-agent`,
    via: [
      [x + 270, y + 116],
      [x + 75, y + 116]
    ],
    label: 's_{t+1}',
    labelSide: 'below'
  })
  fig.arrow({
    id: `${id}-reward`,
    from: `${id}-env`,
    to: `${id}-agent`,
    via: [
      [x + 310, y + 136],
      [x + 35, y + 136]
    ],
    label: 'r_{t+1}',
    labelSide: 'below',
    role: 'side'
  })
  return { ids: { agent: `${id}-agent`, environment: `${id}-env` } }
}

/** An LLM agent: plan, act with tools, observe, around the model. */
function agentLoop(fig, spec) {
  const { id, x = 0, y = 0, tools = ['search', 'computer', 'tools'] } = spec
  fig.box({
    id: `${id}-llm`,
    label: 'LLM',
    x: x + 120,
    y: y + 60,
    w: 90,
    h: 44,
    exact: true,
    color: 'accent'
  })
  fig.icon('brain', { id: `${id}-llm-icon`, cx: x + 132, cy: y + 60, size: 20 })
  const step = (name, label, bx, by) =>
    fig.box({ id: `${id}-${name}`, label, x: bx, y: by, w: 80, h: 30, exact: true, color: 'block' })
  step('plan', 'Plan', x + 125, y)
  step('act', 'Act', x + 250, y + 67)
  step('observe', 'Observe', x + 125, y + 134)
  fig.arrow({ id: `${id}-a1`, from: `${id}-plan`, to: `${id}-act`, route: 'hv' })
  fig.arrow({ id: `${id}-a2`, from: `${id}-act`, to: `${id}-observe`, route: 'vh' })
  fig.arrow({ id: `${id}-a3`, from: `${id}-observe`, to: `${id}-llm` })
  fig.arrow({ id: `${id}-a4`, from: `${id}-llm`, to: `${id}-plan` })
  for (const [index, tool] of tools.entries()) {
    fig.icon(tool, {
      id: `${id}-tool${index}`,
      x: x + 366 + index * 0,
      y: y + 40 + index * 26,
      size: 20,
      variant: 'line',
      color: 'muted'
    })
  }
  fig.arrow({ id: `${id}-calls`, from: `${id}-act`, to: [x + 358, y + 82], role: 'side' })
  return {
    ids: { llm: `${id}-llm`, plan: `${id}-plan`, act: `${id}-act`, observe: `${id}-observe` }
  }
}

/** Retrieval-augmented generation: query → retriever → top-k documents → LLM → answer. */
function rag(fig, spec) {
  const { id, x = 0, y = 0, k = 3 } = spec
  fig.icon('chat', { id: `${id}-query`, x, y: y + 30, size: 26 })
  fig.box({
    id: `${id}-ret`,
    label: 'Retriever',
    x: x + 60,
    y: y + 26,
    w: 86,
    h: 34,
    exact: true,
    color: 'strong'
  })
  fig.icon('database', { id: `${id}-db`, x: x + 91, y: y + 92, size: 24 })
  for (let index = 0; index < k; index += 1) {
    fig.icon('document', {
      id: `${id}-doc${index}`,
      x: x + 196 + index * 12,
      y: y + 30 + (index - (k - 1) / 2) * 6,
      size: 26
    })
  }
  fig.text({ id: `${id}-topk`, text: `top-${k}`, size: 14, cx: x + 221, y: y + 72, color: 'muted' })
  fig.box({
    id: `${id}-llm`,
    label: 'LLM',
    x: x + 300,
    y: y + 26,
    w: 70,
    h: 34,
    exact: true,
    color: 'accent'
  })
  fig.arrow({ id: `${id}-a1`, from: `${id}-query`, to: `${id}-ret` })
  fig.arrow({ id: `${id}-a2`, from: `${id}-db`, to: `${id}-ret`, role: 'side' })
  // Why points: both arrows meet the stack at the row's height, not at one tilted page.
  fig.arrow({ id: `${id}-a3`, from: `${id}-ret`, to: [x + 190, y + 43] })
  fig.arrow({ id: `${id}-a4`, from: [x + 226 + (k - 1) * 12, y + 43], to: `${id}-llm` })
  fig.arrow({ id: `${id}-a5`, from: `${id}-llm`, to: [x + 420, y + 43] })
  fig.text({ id: `${id}-ans`, text: 'answer', size: 14, x: x + 424, cy: y + 43 })
  return {
    ids: {
      retriever: `${id}-ret`,
      llm: `${id}-llm`,
      documents: Array.from({ length: k }, (_, index) => `${id}-doc${index}`)
    }
  }
}

/** Preference pairs: a prompt, a chosen and a rejected response, scored against each other. */
function preference(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  fig.box({
    id: `${id}-x`,
    label: [{ tex: 'x' }],
    x,
    y: y + 40,
    w: 40,
    h: 34,
    exact: true,
    color: 'block'
  })
  fig.box({
    id: `${id}-yw`,
    label: [{ tex: 'y_w' }],
    x: x + 90,
    y: y + 4,
    w: 56,
    h: 34,
    exact: true,
    color: 'accent'
  })
  fig.box({
    id: `${id}-yl`,
    label: [{ tex: 'y_l' }],
    x: x + 90,
    y: y + 78,
    w: 56,
    h: 34,
    exact: true,
    color: 'strong'
  })
  fig.icon('thumbs-up', { id: `${id}-up`, cx: x + 160, cy: y + 21, size: 20 })
  fig.icon('thumbs-down', { id: `${id}-down`, cx: x + 160, cy: y + 95, size: 20 })
  fig.arrow({ id: `${id}-a1`, from: `${id}-x`, to: `${id}-yw`, route: 'vh' })
  fig.arrow({ id: `${id}-a2`, from: `${id}-x`, to: `${id}-yl`, route: 'vh' })
  fig.loss({
    id: `${id}-loss`,
    label: spec.loss ?? '\\mathcal{L}_{\\text{DPO}}',
    x: x + 200,
    y: y + 40,
    compare: [`${id}-yw`, `${id}-yl`],
    outline: false
  })
  return {
    ids: { prompt: `${id}-x`, chosen: `${id}-yw`, rejected: `${id}-yl`, loss: `${id}-loss` }
  }
}

export const LOOP_TEMPLATES = {
  rl: [rl, 'agent and environment: action, state, reward', '{ id, x, y }'],
  agent: [
    agentLoop,
    'LLM agent: plan, act with tools, observe',
    "{ id, x, y, tools: ['search', 'computer', 'tools'] }"
  ],
  rag: [rag, 'query → retriever → top-k documents → LLM → answer', '{ id, x, y, k: 3 }'],
  preference: [
    preference,
    'prompt, chosen 👍 and rejected 👎 responses, a preference loss',
    "{ id, x, y, loss: '\\mathcal{L}_{\\text{DPO}}' }"
  ]
}
