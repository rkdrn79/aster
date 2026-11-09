// Templates for LLM-agent and reasoning papers: an agent loop with memories (Reflexion), a
// side-by-side comparison of prompting strategies (IO, CoT, CoT-SC, a tree of thoughts) and a
// ReAct-style trajectory panel. Each fills a box (`w`, `h`, or `fit: { w, h }`) and returns its
// part ids, so arrows and labels can join them.
import { measureText } from './research-figures-text.mjs'
import { figureStyle, styleColor } from './research-figures-style.mjs'

const round = (value) => Math.round(value * 10) / 10

/** A colour role the style knows: `good`/`bad` once the presets have them, else green/rose. */
function tone(fig, name) {
  const fallback = { good: 'green', bad: 'rose' }[name] ?? name
  try {
    styleColor(figureStyle(fig.page?.style, fig.page?.accent), name)
    return name
  } catch {
    return fallback
  }
}

/** The box `w`/`h` a template fills: `fit: { w, h }` (a page box) or its own `w`/`h`. */
const boxOf = (spec, w, h) => ({ w: spec.fit?.w ?? spec.w ?? w, h: spec.fit?.h ?? spec.h ?? h })

/**
 * An agent with memories that learns from its own feedback (Reflexion): the actor acts on the
 * environment, the trajectory (short-term memory) goes to an evaluator, whose feedback the
 * self-reflection model turns into text kept in long-term memory for the actor's next trial.
 * The inner loop is drawn in the accent, the outer one in ink.
 */
function reflexion(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  const { w, h } = boxOf(spec, 440, 330)
  const pad = 16
  const titleH = 26
  const bh = spec.boxHeight ?? 40
  const envH = 32
  const envGap = 44
  const vgap = Math.max(28, (h - (titleH + 2 * pad + 3 * bh + envGap + envH)) / 2)
  const rows = [0, 1, 2].map((row) => y + titleH + pad + row * (bh + vgap))
  const labels = {
    reflection: 'Self-reflection\n(LM)',
    evaluator: 'Evaluator\n(LM)',
    experience: 'Experience\n(long-term memory)',
    trajectory: 'Trajectory\n(short-term memory)',
    actor: 'Actor (LM)',
    environment: 'Environment',
    ...spec.names
  }
  const edges = {
    action: 'action',
    observation: 'obs / reward',
    feedback: 'internal feedback',
    reflection: 'reflective text',
    ...spec.edges
  }
  // Why widths from the labels: each box holds its two lines, and a column's boxes share a
  // centre so the arrows between them run straight.
  const family = figureStyle(fig.page?.style, fig.page?.accent).fontFamily
  const fits = (name) =>
    Math.max(
      ...String(labels[name])
        .split('\n')
        .map((line) => measureText(line, 16, family).width)
    ) + 20
  const sideW = (names) => Math.max(88, ...names.map(fits))
  const leftW = sideW(['reflection', 'experience'])
  const rightW = sideW(['evaluator', 'trajectory'])
  // Why whole units and even widths: a column's boxes then share their centre exactly.
  const centres = [x + pad + leftW / 2, x + w / 2, x + w - pad - rightW / 2].map(Math.round)
  const box = (name, column, by, color) => {
    const bw = 2 * Math.ceil(Math.max(88, fits(name)) / 2)
    return fig.box({
      id: `${id}-${name}`,
      label: labels[name],
      x: round(centres[column] - bw / 2),
      y: round(by),
      w: round(bw),
      h: bh,
      exact: true,
      intentional: true,
      color
    })
  }
  const model = spec.modelColor ?? 'accent'
  const memory = spec.memoryColor ?? 'white'
  box('reflection', 0, rows[0], model)
  box('evaluator', 2, rows[0], model)
  box('experience', 0, rows[1], memory)
  box('trajectory', 2, rows[1], memory)
  box('actor', 1, rows[2], model)
  const panelBottom = rows[2] + bh + pad
  fig.panel({
    id: `${id}-panel`,
    x,
    y,
    w,
    h: round(panelBottom - y),
    title: spec.title ?? 'Agent'
  })
  // Why narrow: the observation's label needs the run from its side to the trajectory column.
  const envW = Math.max(fits('environment') + 8, 112)
  fig.box({
    id: `${id}-environment`,
    label: labels.environment,
    x: round(centres[1] - envW / 2),
    y: round(panelBottom + envGap),
    w: round(envW),
    h: envH,
    exact: true,
    color: 'strong'
  })
  const inner = spec.emphasize === false ? {} : { color: 'accent-ink', strokeWidth: 2 }
  const arrow = (name, from, to, label, extra = {}) =>
    fig.arrow({
      id: `${id}-${name}`,
      from: `${id}-${from}`,
      to: `${id}-${to}`,
      ...(label ? { labelText: label } : {}),
      ...extra
    })
  arrow('act', 'actor', 'environment', edges.action, { labelSide: 'right' })
  arrow('observe', 'environment', 'trajectory', edges.observation, {
    route: 'hv',
    labelSegment: 1,
    labelSide: 'right'
  })
  arrow('evaluate', 'trajectory', 'evaluator', edges.trajectory)
  arrow('feedback', 'evaluator', 'reflection', edges.feedback, { ...inner, labelSide: 'above' })
  arrow('reflect', 'reflection', 'experience', edges.reflection, { ...inner, labelSide: 'right' })
  arrow('recall', 'experience', 'actor', edges.memory, { ...inner, route: 'vh' })
  if (spec.shortTerm) {
    arrow('context', 'trajectory', 'actor', edges.context, { route: 'vh', dashed: true })
  }
  if (spec.loopIcon !== false) {
    const cy = rows[1] - vgap / 2
    fig.icon('repeat', {
      id: `${id}-loop`,
      cx: round(x + w / 2),
      cy: round(cy),
      size: 22,
      color: 'accent-ink'
    })
    if (spec.loopLabel !== false) {
      fig.text({
        id: `${id}-loop-label`,
        text: spec.loopLabel ?? 'next trial',
        cx: round(x + w / 2),
        y: round(cy + 14),
        size: 14,
        color: 'accent-ink'
      })
    }
  }
  const ids = Object.fromEntries(
    ['reflection', 'evaluator', 'experience', 'trajectory', 'actor', 'environment', 'panel'].map(
      (name) => [name, `${id}-${name}`]
    )
  )
  return { ids, width: w, height: round(panelBottom + envGap + envH - y) }
}

const STRATEGIES = {
  io: { weight: 0.75, caption: '(a) Input-Output\nprompting (IO)' },
  cot: { weight: 0.75, caption: '(b) Chain of thought\nprompting (CoT)' },
  'cot-sc': { weight: 1.25, caption: '(c) Self-consistency\nwith CoT (CoT-SC)' },
  tot: { weight: 1.5, caption: '(d) Tree of thoughts\n(ToT)' }
}

/** One thought: a rounded box with two short lines of "text" (or a word), in its colour. */
function thought(fig, id, cx, cy, tw, th, color, spec) {
  fig.box({
    id,
    x: round(cx - tw / 2),
    y: round(cy - th / 2),
    w: round(tw),
    h: th,
    exact: true,
    intentional: true,
    color,
    ...(spec.dashed ? { dashed: true } : {}),
    ...(typeof spec.thoughts === 'string' && spec.thoughts !== 'lines'
      ? { label: spec.thoughts, size: 12 }
      : {})
  })
  if (spec.thoughts === 'lines' || spec.thoughts === undefined) {
    for (const [index, share] of [0.62, 0.4].entries()) {
      const ly = round(cy - th / 2 + th * (index ? 0.66 : 0.36))
      fig.polyline({
        id: `${id}-line${index}`,
        points: [
          [round(cx - tw * 0.31), ly],
          [round(cx - tw * 0.31 + tw * share), ly]
        ],
        color: '#5c5c5c',
        strokeWidth: 1.5
      })
    }
  }
}

/** A tree edge: a trunk down from the parent, a bar, and an arrow down to each child. */
function branch(fig, id, parent, children, barY) {
  const from = fig.bounds(parent)
  const cx = round(from.x + from.width / 2)
  const centres = children.map((child) => {
    const box = fig.bounds(child)
    return round(box.x + box.width / 2)
  })
  const low = Math.min(cx, ...centres)
  const high = Math.max(cx, ...centres)
  fig.polyline({
    id: `${id}-trunk`,
    points: [
      [cx, round(from.bottom + 4)],
      [cx, barY]
    ]
  })
  if (high - low > 1) {
    fig.polyline({
      id: `${id}-bar`,
      points: [
        [low, barY],
        [high, barY]
      ]
    })
    fig.dot({ id: `${id}-dot`, cx, cy: barY, r: 2.5 })
  }
  children.forEach((child, index) =>
    fig.arrow({ id: `${id}-to${index}`, from: [centres[index], barY], to: child })
  )
}

/**
 * Prompting strategies side by side, as in Tree of Thoughts' figure 1: IO (input → output),
 * CoT (a chain of thoughts), CoT-SC (several chains and a majority vote) and ToT (a tree whose
 * thoughts are evaluated: the kept path in `good`, pruned ones in `bad`).
 */
function prompting(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  const { w, h } = boxOf(spec, 900, 300)
  const chosen = spec.strategies ?? ['io', 'cot', 'cot-sc', 'tot']
  for (const name of chosen) {
    if (!STRATEGIES[name]) {
      throw new Error(
        `prompting: strategies are ${Object.keys(STRATEGIES).join(', ')}, not ${name}`
      )
    }
  }
  const depth = spec.depth ?? 3
  const paths = spec.paths ?? 3
  const branching = spec.branching ?? 3
  const gap = spec.gap ?? 24
  const total = chosen.reduce((sum, name) => sum + STRATEGIES[name].weight, 0)
  const unit = (w - gap * (chosen.length - 1)) / total
  const captionH = spec.captions === false ? 0 : 40
  const ioH = 26
  const good = tone(fig, 'good')
  const bad = tone(fig, 'bad')
  const inputLabel = spec.input ?? 'Input'
  const outputLabel = spec.output ?? 'Output'
  const top = y
  const outTop = y + h - captionH - ioH
  const span = outTop - (top + ioH)
  const ids = {}
  let left = x
  for (const [column, name] of chosen.entries()) {
    const colW = unit * STRATEGIES[name].weight
    const cx = left + colW / 2
    const key = `${id}-${name}`
    const io = (part, label, by, wide = Math.min(colW * 0.86, 140)) =>
      fig.box({
        id: `${key}-${part}`,
        label,
        x: round(cx - wide / 2),
        y: round(by),
        w: round(wide),
        h: ioH,
        exact: true,
        intentional: true,
        color: 'white'
      })
    const levels = name === 'io' ? 0 : depth + (name === 'cot-sc' ? 1 : 0)
    const step = span / (levels + 1)
    const th = Math.min(22, step * 0.5)
    const tw = Math.min(
      64,
      (colW * 0.9) / (name === 'cot-sc' ? paths : name === 'tot' ? branching : 1) - 10
    )
    const rowY = (level) => round(top + ioH + step * (level + 1))
    const wideIn = colW * 0.86
    /** The centre of item `index` of `count` spread so the outer ones meet the input's edges. */
    const spread = (index, count) =>
      count === 1 ? cx : cx - wideIn / 2 + tw / 2 + ((wideIn - tw) * index) / (count - 1)
    io('in', inputLabel, top, name === 'cot-sc' || name === 'tot' ? wideIn : undefined)
    io('out', outputLabel, outTop)
    if (name === 'io') {
      fig.arrow({ id: `${key}-a`, from: `${key}-in`, to: `${key}-out` })
    } else if (name === 'cot') {
      let previous = `${key}-in`
      for (let level = 0; level < depth; level += 1) {
        thought(fig, `${key}-t${level}`, cx, rowY(level), tw, th, 'block', spec)
        fig.arrow({ id: `${key}-a${level}`, from: previous, to: `${key}-t${level}` })
        previous = `${key}-t${level}`
      }
      fig.arrow({ id: `${key}-a${depth}`, from: previous, to: `${key}-out` })
    } else if (name === 'cot-sc') {
      // Why the outer chains on the input's edges: columns line up exactly.
      const lastIds = []
      for (let path = 0; path < paths; path += 1) {
        const px = spread(path, paths)
        let previous = `${key}-in`
        for (let level = 0; level < depth; level += 1) {
          const tid = `${key}-p${path}t${level}`
          thought(fig, tid, px, rowY(level), tw, th, 'block', spec)
          fig.arrow({ id: `${key}-p${path}a${level}`, from: previous, to: tid })
          previous = tid
        }
        lastIds.push(previous)
      }
      const voteY = rowY(depth) - ioH / 2
      fig.box({
        id: `${key}-vote`,
        label: spec.vote ?? 'Majority vote',
        x: round(cx - wideIn / 2),
        y: round(voteY),
        w: round(wideIn),
        h: ioH,
        exact: true,
        intentional: true,
        color: 'strong',
        size: 14
      })
      lastIds.forEach((last, path) =>
        fig.arrow({ id: `${key}-p${path}v`, from: last, to: `${key}-vote` })
      )
      fig.arrow({ id: `${key}-vo`, from: `${key}-vote`, to: `${key}-out` })
    } else {
      // Why a fixed kept path: the tree reads as a search when the kept node moves.
      const keep = spec.keep ?? Array.from({ length: depth }, (_, level) => [0, 2, 1][level % 3])
      let parent = `${key}-in`
      for (let level = 0; level < depth; level += 1) {
        const children = []
        for (let index = 0; index < branching; index += 1) {
          const tid = `${key}-l${level}n${index}`
          const kept = index === keep[level] % branching
          const pruned = !kept && index === (keep[level] + 1) % branching
          const color = kept ? good : pruned ? bad : 'block'
          thought(fig, tid, spread(index, branching), rowY(level), tw, th, color, {
            ...spec,
            dashed: pruned
          })
          children.push(tid)
        }
        const barY = round(rowY(level) - th / 2 - (step - th) * 0.5)
        branch(fig, `${key}-e${level}`, parent, children, barY)
        parent = children[keep[level] % branching]
      }
      fig.arrow({ id: `${key}-a`, from: parent, to: `${key}-out` })
    }
    if (captionH) {
      fig.text({
        id: `${key}-caption`,
        text: spec.captions?.[column] ?? STRATEGIES[name].caption,
        cx: round(cx),
        y: round(outTop + ioH + 6),
        size: 14,
        textAlign: 'center',
        align: 'center'
      })
    }
    ids[name] = { input: `${key}-in`, output: `${key}-out` }
    left += colW + gap
  }
  if (spec.legend !== false && chosen.includes('tot')) {
    const names = spec.legendLabels ?? ['kept', 'pruned']
    // Why beside the tree's output: the space there is free, and the legend sits by what it keys.
    const out = fig.bounds(`${id}-tot-out`)
    const legend = fig.legend({
      id: `${id}-legend`,
      direction: 'column',
      x: round(out.right + 16),
      y: out.y,
      items: [
        { label: names[0], color: good },
        { label: names[1], color: bad }
      ]
    })
    fig.move(`${id}-legend`, 0, round(out.y + out.height / 2 - legend.height / 2 - out.y))
  }
  return { ids, width: w, height: h }
}

/** Words of a step with the highlight colour each one takes (every occurrence of a phrase). */
function stepWords(text, highlights = []) {
  const words = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ text: word }))
  const plain = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  for (const mark of highlights) {
    const phrase = String(mark.text ?? mark)
      .split(/\s+/)
      .filter(Boolean)
      .map(plain)
    for (let start = 0; start + phrase.length <= words.length; start += 1) {
      if (phrase.every((part, offset) => plain(words[start + offset].text) === part)) {
        for (let offset = 0; offset < phrase.length; offset += 1) {
          words[start + offset].color = mark.color ?? 'accent'
        }
      }
    }
  }
  return words
}

const KIND_COLORS = { thought: 'accent', act: 'teal', action: 'teal', obs: 'ink' }

/**
 * A ReAct-style trajectory: a titled card of steps, each a coloured tag ("Thought 1:", "Act 1:",
 * "Obs 1:") and its text with a hanging indent, highlighted phrases tinted behind the words, and
 * a ✓ or ✗ after a step (`mark`).
 */
function trajectory(fig, spec) {
  const { id, x = 0, y = 0 } = spec
  const { w } = boxOf(spec, 320, 0)
  const size = spec.size ?? 14
  const pad = spec.pad ?? 10
  const lineH = round(size * 1.3)
  const style = figureStyle(fig.page?.style, fig.page?.accent)
  const family = style.fontFamily
  const counts = {}
  const steps = (spec.steps ?? []).map((step) => {
    const kind = String(step.kind ?? 'thought').toLowerCase()
    counts[kind] = (counts[kind] ?? 0) + 1
    const name = kind === 'obs' ? 'Obs' : kind[0].toUpperCase() + kind.slice(1)
    const tag = step.tag ?? `${name}${spec.numbered === false ? '' : ` ${counts[kind]}`}:`
    return { ...step, kind, tag }
  })
  const tagW = Math.max(0, ...steps.map((step) => measureText(step.tag, size, family).width))
  const textX = x + pad + tagW + 6
  const markRoom = size + 6
  const widthOf = (words) =>
    measureText(words.map((word) => word.text).join(' '), size, family).width
  const wrap = (words, room) => {
    const lines = [[]]
    for (const word of words) {
      const line = lines.at(-1)
      if (line.length && widthOf([...line, word]) > room) {
        lines.push([word])
      } else {
        line.push(word)
      }
    }
    return lines
  }
  const titleLines = spec.title ? wrap(stepWords(spec.title), w - 2 * pad) : []
  const titleH = titleLines.length ? titleLines.length * lineH + 8 : 0
  const laid = steps.map((step) => ({
    ...step,
    lines: wrap(
      stepWords(step.text, step.highlights),
      x + w - pad - (step.mark ? markRoom : 0) - textX
    )
  }))
  const rowGap = spec.rowGap ?? 3
  const height = round(
    2 * pad + titleH + laid.reduce((sum, step) => sum + step.lines.length * lineH + rowGap, -rowGap)
  )
  fig.box({
    id: `${id}-frame`,
    x,
    y,
    w,
    h: Math.max(height, spec.h ?? 0),
    exact: true,
    intentional: true,
    color: 'white'
  })
  titleLines.forEach((line, row) =>
    fig.text({
      id: `${id}-title${row ? `-${row}` : ''}`,
      text: line.map((word) => word.text).join(' '),
      x: x + pad,
      y: round(y + pad + row * lineH),
      size,
      color: 'ink'
    })
  )
  if (titleLines.length) {
    const ruleY = round(y + pad + titleH - 3)
    fig.polyline({
      id: `${id}-rule`,
      points: [
        [x + pad, ruleY],
        [x + w - pad, ruleY]
      ],
      color: 'strong',
      strokeWidth: 1
    })
  }
  const rows = []
  let top = y + pad + titleH
  for (const [index, step] of laid.entries()) {
    const rid = `${id}-s${index}`
    const tagColor = step.color ?? spec.tagColors?.[step.kind] ?? KIND_COLORS[step.kind] ?? 'ink'
    step.lines.forEach((line, row) => {
      // Why one group a line: a highlight sits under its words on purpose.
      const groupIds = [`${rid}-l${row}`]
      let start = 0
      while (start < line.length) {
        const color = line[start].color
        let end = start
        while (end + 1 < line.length && line[end + 1].color === color) {
          end += 1
        }
        if (color) {
          const before = line.slice(0, start)
          const sx =
            textX + (before.length ? widthOf(before) + measureText(' ', size, family).width : 0)
          fig.box({
            id: `${rid}-h${row}-${start}`,
            x: round(sx - 2),
            y: round(top + row * lineH),
            w: round(widthOf(line.slice(start, end + 1)) + 4),
            h: round(lineH - 1),
            exact: true,
            intentional: true,
            color: color === 'good' || color === 'bad' ? tone(fig, color) : color,
            groupIds
          })
        }
        start = end + 1
      }
      fig.text({
        id: `${rid}-t${row}`,
        text: line.map((word) => word.text).join(' '),
        x: textX,
        y: round(top + row * lineH),
        size,
        color: 'ink',
        groupIds
      })
    })
    fig.text({ id: `${rid}-tag`, text: step.tag, x: x + pad, y: top, size, color: tagColor })
    if (step.mark) {
      fig.mark({
        id: `${rid}-mark`,
        kind: step.mark,
        cx: round(x + w - pad - size / 2),
        cy: round(top + (step.lines.length * lineH) / 2),
        size
      })
    }
    rows.push(rid)
    top += step.lines.length * lineH + rowGap
  }
  return { ids: { frame: `${id}-frame`, steps: rows }, width: w, height }
}

export const AGENT_TEMPLATES = {
  reflexion: [
    reflexion,
    'agent loop with memories (Reflexion): actor, evaluator, self-reflection, short- and long-term memory, environment; the inner loop in the accent',
    "{ id, x, y, w: 440, h: 330 | fit: { w, h }, title: 'Agent', names: { actor, evaluator, reflection, trajectory, experience, environment }, edges: { action, observation, trajectory, feedback, reflection, memory }, shortTerm, emphasize: true, loopLabel: 'next trial' }"
  ],
  prompting: [
    prompting,
    'prompting strategies side by side (Tree of Thoughts fig. 1): IO, CoT, CoT-SC with a majority vote, a ToT tree with kept and pruned thoughts',
    "{ id, x, y, w: 900, h: 300 | fit: { w, h }, strategies: ['io', 'cot', 'cot-sc', 'tot'], depth: 3, paths: 3, branching: 3, keep: [0, 2, 1], thoughts: 'lines' | 'none' | 'word', input, output, vote, captions, legend: true }"
  ],
  trajectory: [
    trajectory,
    'a ReAct-style trajectory card: Thought / Act / Obs steps with coloured tags, a hanging indent, highlighted phrases and ✓/✗',
    "{ id, x, y, w: 320, title, steps: [{ kind: 'thought' | 'act' | 'obs', text, highlights: [{ text, color: 'good' | 'bad' | 'accent' }], mark: 'check' | 'cross', tag }], size: 14, numbered: true, tagColors }"
  ]
}
