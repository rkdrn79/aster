// Operators and small parts papers draw by hand: ⊕ ⊗ ⊙ ⊖ and ⓒ (concat) nodes, an SPDT switch
// whose lever picks one of two outputs (Latent Diffusion's conditioning), a code card that keeps
// indentation, and a vector pair (u_t beside u_t^θ at one point). Pure makers for the legend and
// `measure`, and the kit methods that place them.
import { warnKit } from './research-figures-cards.mjs'
import { blend } from './research-figures-science-parts.mjs'
import { makeContainer } from './research-figures-kit-arrow.mjs'
import { figureElement } from './research-figures-model.mjs'
import { oneOf } from './research-figures-options.mjs'
import { makeNode, makePolyline } from './research-figures-shapes.mjs'
import { FIGURE_LINE_WIDTH, inkColor, styleColor } from './research-figures-style.mjs'
import { MONO_FONT } from './research-figures-text.mjs'
import { makeText, styleOf } from './research-figures-type.mjs'

export const NODE_SYMBOLS = ['plus', 'times', 'dot', 'minus', 'concat']
const r2 = (value) => Math.round(value * 100) / 100

/**
 * A ⊕ (plus), ⊗ (times), ⊙ (dot), ⊖ (minus) or ⓒ (concat) node: a circle with its sign drawn
 * as lines, since the paper font lacks them. Concat is a c, never a plus, so it does not read
 * as an addition.
 */
export function makeOpNode(spec) {
  const symbol = oneOf('node symbol', spec.symbol ?? 'plus', NODE_SYMBOLS)
  if (symbol === 'plus' || symbol === 'times' || symbol === 'dot') {
    return makeNode({ ...spec, symbol })
  }
  if (symbol === 'minus') {
    return makeNode({ ...spec, symbol: 'plus' }).filter(
      (element) => element.id !== `${spec.id}-stroke2`
    )
  }
  const parts = makeNode({ ...spec, symbol: 'dot' }).filter(
    (element) => element.id !== `${spec.id}-dot`
  )
  const [circle] = parts
  const r = circle.width / 2
  const [cx, cy] = [circle.x + r, circle.y + r]
  // Why an open c: the arc stops short of the right so it reads as a letter, not a ring.
  const arc = Array.from({ length: 11 }, (_, index) => {
    const angle = Math.PI / 4 + (index / 10) * (Math.PI * 1.5)
    return [r2(cx + 0.5 * r * Math.cos(angle)), r2(cy - 0.5 * r * Math.sin(angle))]
  })
  const c = makePolyline({
    ...spec,
    id: `${spec.id}-stroke1`,
    points: arc,
    stroke: circle.strokeColor,
    strokeWidth: FIGURE_LINE_WIDTH,
    groupIds: circle.groupIds
  })
  return [...parts, c]
}

const SWITCH_DIRECTIONS = ['right', 'left', 'down', 'up']

/**
 * An SPDT switch: an input terminal, two output terminals and a lever from the input to the
 * output it selects (`to`: 0 or 1), drawn small and in ink. Arrows bind to `<id>-in`,
 * `<id>-out0` and `<id>-out1`; the id is an invisible box around it.
 */
export function makeSwitch(spec) {
  const direction = oneOf('switch direction', spec.direction ?? 'right', SWITCH_DIRECTIONS)
  const flowsAcross = direction === 'right' || direction === 'left'
  const w = spec.w ?? (flowsAcross ? 32 : 24)
  const h = spec.h ?? (flowsAcross ? 24 : 32)
  const x = spec.cx !== undefined ? spec.cx - w / 2 : (spec.x ?? 0)
  const y = spec.cy !== undefined ? spec.cy - h / 2 : (spec.y ?? 0)
  const to = spec.to ?? 0
  if (to !== 0 && to !== 1) {
    throw new Error(`switch ${spec.id}: to is the output the lever touches, 0 or 1, not ${to}`)
  }
  const r = spec.r ?? 2.5
  const style = styleOf(spec)
  const ink = inkColor(style, spec.color, 'ink')
  const pivot = {
    right: [x + r, y + h / 2],
    left: [x + w - r, y + h / 2],
    down: [x + w / 2, y + r],
    up: [x + w / 2, y + h - r]
  }[direction]
  const outs = {
    right: [
      [x + w - r, y + r],
      [x + w - r, y + h - r]
    ],
    left: [
      [x + r, y + r],
      [x + r, y + h - r]
    ],
    down: [
      [x + r, y + h - r],
      [x + w - r, y + h - r]
    ],
    up: [
      [x + r, y + r],
      [x + w - r, y + r]
    ]
  }[direction]
  const groupIds = [...(spec.groupIds ?? []), `${spec.id}-switch`]
  const terminal = (id, [px, py]) =>
    figureElement('ellipse', {
      id,
      x: r2(px - r),
      y: r2(py - r),
      width: r2(2 * r),
      height: r2(2 * r),
      strokeColor: ink,
      backgroundColor: '#ffffff',
      strokeWidth: 1.5,
      boundElements: [],
      frameId: spec.frame ?? null,
      groupIds,
      customData: { asterSwitch: spec.id }
    })
  const target = outs[to]
  const [dx, dy] = [target[0] - pivot[0], target[1] - pivot[1]]
  const length = Math.hypot(dx, dy)
  // Why short of the contact: an open lever that stops before the terminal reads as a switch.
  const reach = (length - r - 3) / length
  const lever = makePolyline({
    ...spec,
    id: `${spec.id}-lever`,
    points: [
      [r2(pivot[0] + (dx * r) / length), r2(pivot[1] + (dy * r) / length)],
      [r2(pivot[0] + dx * reach), r2(pivot[1] + dy * reach)]
    ],
    stroke: ink,
    strokeWidth: FIGURE_LINE_WIDTH,
    groupIds
  })
  lever.customData = { asterSwitch: spec.id }
  const box = makeContainer(
    { id: spec.id, pad: 0, frame: spec.frame },
    { x, y, width: w, height: h }
  )
  box.customData = { ...box.customData, asterSwitch: spec.id }
  return [
    box,
    lever,
    terminal(`${spec.id}-in`, pivot),
    terminal(`${spec.id}-out0`, outs[0]),
    terminal(`${spec.id}-out1`, outs[1])
  ]
}

/** Cascadia's advance: every character of a code line is this many font sizes wide. */
export const CODE_ADVANCE = 1200 / 2048

/** Lines of code with the indentation they share removed and tabs as spaces. */
export function codeLines(code, tab = 4) {
  const lines = String(code ?? '')
    .replace(/\t/g, ' '.repeat(tab))
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
  while (lines.length && !lines[0].trim()) {
    lines.shift()
  }
  while (lines.length && !lines.at(-1).trim()) {
    lines.pop()
  }
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)[0].length)
  const shared = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(shared))
}

/** The spans each highlight covers: [{ line (0-based), from, to (columns), whole, color }]. */
function highlightSpans(owner, lines, highlights = []) {
  return [highlights]
    .flat()
    .filter((item) => item !== undefined && item !== null)
    .map((item) => {
      const entry = typeof item === 'number' ? { line: item } : item
      const color = entry.color ?? 'accent'
      if (entry.text !== undefined) {
        const rows = entry.line !== undefined ? [entry.line - 1] : lines.map((_, index) => index)
        const row = rows.find((index) => lines[index]?.includes(entry.text))
        if (row === undefined) {
          const elsewhere = lines.findIndex((line) => line.includes(entry.text))
          throw new Error(
            `${owner}: ${entry.line === undefined ? 'no line' : `line ${entry.line}`} does not hold "${entry.text}" to highlight${elsewhere !== -1 ? ` (line ${elsewhere + 1} does; lines count from 1 after the shared indent is removed)` : ''}`
          )
        }
        const from = lines[row].indexOf(entry.text)
        return { line: row, from, to: from + entry.text.length, color }
      }
      const row = (entry.line ?? 0) - 1
      if (!Number.isInteger(row) || row < 0 || row >= lines.length) {
        throw new Error(
          `${owner}: highlight line ${entry.line} is not a line of the code (1 to ${lines.length})`
        )
      }
      if (entry.from === undefined) {
        return { line: row, whole: true, color }
      }
      return { line: row, from: entry.from, to: entry.to ?? lines[row].length, color }
    })
}

/**
 * Cuts a line into runs at its highlights and at gaps of two or more spaces, each with the
 * column it starts at, so every run is placed by its column and spaces never collapse.
 */
function lineRuns(line, spans) {
  const cuts = new Set([0, line.length])
  for (const span of spans) {
    cuts.add(Math.max(0, Math.min(line.length, span.from)))
    cuts.add(Math.max(0, Math.min(line.length, span.to)))
  }
  const edges = [...cuts].toSorted((a, b) => a - b)
  const runs = []
  for (let k = 0; k < edges.length - 1; k += 1) {
    const [from, to] = [edges[k], edges[k + 1]]
    const span = spans.find((item) => item.from <= from && item.to >= to)
    const piece = line.slice(from, to)
    const words = /\S+(?: \S+)*/g
    for (let match = words.exec(piece); match; match = words.exec(piece)) {
      runs.push({ text: match[0], column: from + match.index, span })
    }
  }
  return runs
}

/**
 * A code card that keeps indentation: lines set in Cascadia (Excalidraw's monospace), each run
 * placed by its column, highlights as a tint behind a span (`{ line, text }` or `{ line, from,
 * to }`) or a whole line (a line number), an optional title row and line numbers.
 */
export function makeCode(spec) {
  const owner = `code ${spec.id}`
  const style = styleOf(spec)
  const size = spec.size ?? style.smallSize ?? 14
  const lines = codeLines(spec.code, spec.tab ?? 4)
  if (!lines.length) {
    throw new Error(`${owner}: code is empty`)
  }
  const advance = size * CODE_ADVANCE
  const pad = spec.pad ?? 10
  const pitch = r2(size * (spec.lineHeight ?? 1.4))
  const gutter = spec.lineNumbers ? (String(lines.length).length + 1.5) * advance : 0
  const longest = Math.max(...lines.map((line) => line.length))
  const need = r2(longest * advance + gutter + pad * 2)
  const w = spec.w ?? Math.ceil(need / 8) * 8
  const titleSize = spec.titleSize ?? style.smallSize ?? 14
  const titleH = spec.title ? Math.round(titleSize * 1.25 + 10) : 0
  const h =
    spec.h ?? Math.ceil((titleH + pad * 2 + lines.length * pitch - (pitch - size * 1.25)) / 8) * 8
  const x = spec.x ?? 0
  const y = spec.y ?? 0
  const warnings = []
  if (need > w + 0.5) {
    const row = lines.findIndex((line) => line.length === longest)
    warnings.push(
      `${owner}: line ${row + 1} needs ${Math.round(need)} units but the card is ${w} wide; code keeps its lines, so widen w, shorten that line or drop it`
    )
  }
  // Why white in the paper look: a listing in a paper is framed by a thin line, not filled.
  const fill = spec.color ?? (style.look === 'paper' ? 'white' : 'panel')
  const paint = styleColor(style, fill)
  const card = figureElement('rectangle', {
    id: spec.id,
    x,
    y,
    width: w,
    height: h,
    strokeColor: spec.stroke ? inkColor(style, spec.stroke) : paint.stroke,
    backgroundColor: paint.fill,
    strokeWidth: 1,
    roundness: style.radius > 0 ? { type: 3, value: Math.min(6, style.radius) } : null,
    boundElements: [],
    frameId: spec.frame ?? null,
    customData: { asterCode: spec.id, asterIntentional: true }
  })
  const elements = [card]
  const text = (id, value, at, color, extra = {}) => {
    const [element] = makeText({
      id,
      text: value,
      size,
      font: MONO_FONT,
      x: at[0],
      y: at[1],
      color,
      style,
      frame: spec.frame,
      ...extra
    })
    // Why the raw text: code prints exactly as written, never math substitutes.
    element.text = value
    element.originalText = value
    element.width = r2(Array.from(value).length * advance)
    element.customData = { asterCode: spec.id }
    return element
  }
  if (spec.title) {
    const [title] = makeText({
      id: `${spec.id}-title`,
      text: spec.title,
      size: titleSize,
      x: x + pad,
      y: y + 5,
      color: spec.titleColor ?? 'ink',
      style,
      frame: spec.frame
    })
    title.customData = { asterCode: spec.id }
    elements.push(title)
    const rule = makePolyline({
      id: `${spec.id}-rule`,
      points: [
        [x, y + titleH],
        [x + w, y + titleH]
      ],
      // Why mid: a pale card's own outline can be transparent; the rule must show.
      stroke: paint.stroke && paint.stroke !== 'transparent' ? paint.stroke : style.mid,
      strokeWidth: 1,
      style,
      frame: spec.frame
    })
    rule.customData = { asterCode: spec.id }
    elements.push(rule)
  }
  const spans = highlightSpans(owner, lines, spec.highlight)
  const top = y + titleH + pad
  const left = x + pad + gutter
  const rows = []
  lines.forEach((line, index) => {
    const rowY = r2(top + index * pitch)
    rows.push({ line: index + 1, y: rowY, height: r2(size * 1.25) })
    for (const [k, span] of spans.filter((item) => item.line === index).entries()) {
      const tint = styleColor(style, span.color)
      const [from, to] = span.whole ? [null, null] : [span.from, span.to]
      const band = figureElement('rectangle', {
        id: `${spec.id}-h${index + 1}-${k}`,
        x: span.whole ? x + 3 : r2(left + from * advance - 2),
        y: r2(rowY - (pitch - size * 1.25) / 2),
        width: span.whole ? w - 6 : r2((to - from) * advance + 4),
        height: pitch,
        strokeColor: 'transparent',
        // Why paler for a whole line: a band across the card must not outweigh the code.
        backgroundColor: span.whole ? blend('#ffffff', tint.fill, 0.5) : tint.fill,
        strokeWidth: 1,
        roundness: { type: 3, value: 2 },
        frameId: spec.frame ?? null,
        customData: { asterCode: spec.id }
      })
      elements.push(band)
    }
    if (spec.lineNumbers) {
      elements.push(text(`${spec.id}-n${index + 1}`, String(index + 1), [x + pad, rowY], 'muted'))
    }
    const own = spans.filter((item) => item.line === index && !item.whole)
    for (const [k, run] of lineRuns(line, own).entries()) {
      const color = run.span ? styleColor(style, run.span.color).ink : (spec.textColor ?? 'ink')
      elements.push(
        text(
          `${spec.id}-l${index + 1}-${k}`,
          run.text,
          [r2(left + run.column * advance), rowY],
          color
        )
      )
    }
  })
  return { elements, warnings, extra: { char: r2(advance), pitch, rows, lines } }
}

/**
 * Two vectors at one point (the target velocity u_t and the network's u_t^θ, a gradient and its
 * estimate): a dot, the first vector solid in its colour, the second dashed in ink.
 */
export function makeVectorPair(spec) {
  const owner = `vectorPair ${spec.id}`
  const at = spec.at
  if (!Array.isArray(at) || at.length !== 2) {
    throw new Error(`${owner}: at is the point [x, y] both vectors start from`)
  }
  const style = styleOf(spec)
  const vectors = [spec.u, spec.v].filter(Boolean)
  if (!vectors.length) {
    throw new Error(`${owner}: give u (and v) as [dx, dy] in scene units`)
  }
  const colors = [
    styleColor(style, spec.color ?? 'accent').ink,
    inkColor(style, spec.secondColor ?? 'ink')
  ]
  const groupIds = [...(spec.groupIds ?? []), `${spec.id}-glyph`]
  const elements = [
    makeContainer(
      { id: spec.id, pad: 2, frame: spec.frame },
      {
        x: Math.min(at[0], ...vectors.map((vector) => at[0] + vector[0])),
        y: Math.min(at[1], ...vectors.map((vector) => at[1] + vector[1])),
        width: Math.max(1, ...vectors.map((vector) => Math.abs(vector[0]))),
        height: Math.max(1, ...vectors.map((vector) => Math.abs(vector[1])))
      }
    )
  ]
  vectors.forEach(([dx, dy], index) => {
    elements.push(
      figureElement('arrow', {
        id: `${spec.id}-v${index}`,
        x: at[0],
        y: at[1],
        width: Math.abs(dx),
        height: Math.abs(dy),
        points: [
          [0, 0],
          [dx, dy]
        ],
        strokeColor: colors[index],
        strokeWidth: index === 0 ? 2.5 : 2,
        strokeStyle: index === 0 ? 'solid' : 'dashed',
        startArrowhead: null,
        endArrowhead: 'triangle',
        frameId: spec.frame ?? null,
        groupIds,
        customData: { asterDiagonal: true, asterVectorPair: spec.id }
      })
    )
  })
  elements.push(
    figureElement('ellipse', {
      id: `${spec.id}-dot`,
      x: at[0] - 3,
      y: at[1] - 3,
      width: 6,
      height: 6,
      strokeColor: '#ffffff',
      strokeWidth: 0.8,
      backgroundColor: style.ink,
      frameId: spec.frame ?? null,
      groupIds,
      customData: { asterGlyphPart: true }
    })
  )
  return { elements, warnings: [] }
}

export function opsMethods(core, figOf) {
  const warn = (list) => (core.warn ?? warnKit)(list)
  const place = (spec, made, labelled) => {
    core.claim(spec.id, made.elements)
    core.insert(made.elements)
    warn(made.warnings ?? [])
    const box = core.bounds(spec.id)
    if (labelled && spec.label !== undefined) {
      labelled(box)
    }
    return { id: spec.id, ...box, ...made.extra }
  }
  return {
    /** ⊕ ⊗ ⊙ ⊖ ⓒ: `symbol` plus, times, dot, minus or concat. Binds: the circle. */
    node(spec) {
      if (!spec?.id) {
        throw new Error('node({ id, cx, cy, symbol }) needs an id')
      }
      const parts = makeOpNode(core.styled(spec))
      core.claim(spec.id, parts)
      core.insert(parts)
      return parts[0]
    },
    /** An SPDT switch; arrows bind to <id>-in, <id>-out0 and <id>-out1. */
    switch(spec) {
      if (!spec?.id) {
        throw new Error('switch({ id, x, y, direction, to }) needs an id')
      }
      const result = place(spec, { elements: makeSwitch(core.styled(spec)) }, (box) => {
        const side = spec.labelSide ?? 'below'
        figOf().text({
          id: `${spec.id}-label`,
          text: spec.label,
          size: spec.size,
          cx: box.x + box.width / 2,
          ...(side === 'above' ? { baseline: box.y - 5 } : { y: box.bottom + 3 })
        })
      })
      return { ...result, in: `${spec.id}-in`, out: [`${spec.id}-out0`, `${spec.id}-out1`] }
    },
    /** A code card that keeps indentation, with highlights; returns its box, rows and char width. */
    code(spec) {
      if (!spec?.id) {
        throw new Error('code({ id, x, y, code }) needs an id')
      }
      return place(spec, makeCode(core.styled(spec)))
    },
    /** u_t beside u_t^θ at one point: the first vector solid in its colour, the second dashed. */
    vectorPair(spec) {
      if (!spec?.id) {
        throw new Error('vectorPair({ id, at, u, v }) needs an id')
      }
      const result = place(spec, makeVectorPair(core.styled(spec)))
      for (const [index, label] of (spec.labels ?? []).entries()) {
        const vector = [spec.u, spec.v][index]
        if (!vector || label === undefined || label === null) {
          continue
        }
        const [dx, dy] = vector
        const norm = Math.hypot(dx, dy) || 1
        const tip = [spec.at[0] + dx + (dx / norm) * 6, spec.at[1] + dy + (dy / norm) * 6]
        figOf().text({ id: `${spec.id}-l${index}`, text: label, x: 0, y: 0 })
        const box = core.bounds(`${spec.id}-l${index}`)
        const left = dx >= 0 ? tip[0] : tip[0] - box.width
        const top = tip[1] - box.height / 2
        figOf().move(`${spec.id}-l${index}`, left - box.x, top - box.y)
      }
      return result
    }
  }
}

/** The width a code card needs for `code` at `size`, for laying it out before drawing it. */
export function codeWidth(code, size = 14, pad = 10) {
  const lines = codeLines(code)
  return r2(Math.max(...lines.map((line) => line.length)) * size * CODE_ADVANCE + pad * 2)
}
