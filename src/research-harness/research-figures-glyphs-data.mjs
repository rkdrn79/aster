// Data glyphs for what a model outputs: a probability distribution as bars (a softmax, a router's
// gate, a teacher's sharpened target) and a matrix with a TeX entry in each cell (a CLIP
// similarity matrix, logits). Pure: each returns elements under one id that arrows bind to.
import { makeMath } from './research-figures-draw.mjs'
import { figureElement } from './research-figures-model.mjs'
import { paintValue, styleColor } from './research-figures-style.mjs'
import { labelLines, makeLines, measureLines, styleOf } from './research-figures-type.mjs'

const common = (spec, extra = []) => ({
  frameId: spec.frame ?? null,
  groupIds: [...(spec.groupIds ?? []), `${spec.id}-glyph`, ...extra]
})

const fillOf = (style, name) => paintValue(style, name, 'fill') ?? styleColor(style, name).fill

/** Halfway between two #rrggbb colours. */
function midway(a, b) {
  const channels = (hex) =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const [x, y] = [channels(a), channels(b)]
  return `#${x
    .map((value, index) =>
      Math.round((value + y[index]) / 2)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/**
 * A colour's mid tone (for bars and nodes) and its ink (for the one that stands out): an
 * accent's strong and ink; muted, line and ink themselves; a block gray between the heavy block
 * and muted, which stays visible on a panel; a hex as given.
 */
export function shadesOf(style, color) {
  if (color.startsWith('#')) {
    return { strong: color, lit: color }
  }
  if (['muted', 'line', 'ink'].includes(color)) {
    return { strong: style[color], lit: style.ink }
  }
  if (['block', 'strong', 'panel', 'white', 'gray'].includes(color)) {
    // Why not the heavy block: #cecece bars (#ececec in illustrative) vanish on a panel tint.
    return { strong: midway(style.strong, style.muted), lit: style.line }
  }
  return {
    strong: styleColor(style, `${color}-strong`).fill,
    lit: styleColor(style, `${color}-ink`).fill
  }
}

/** A peaked set of values for a distribution drawn without data. */
function sample(count, seed = 1) {
  let state = seed * 9301 + 49297
  const next = () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
  const peak = Math.floor(next() * count)
  return Array.from(
    { length: count },
    (_, index) => Math.exp(-((index - peak) ** 2) / 3) + next() * 0.25
  )
}

/**
 * A distribution as bars on a baseline: `values` (any scale; normalised), `highlight` the bar
 * to mark (an index), `sharp: true` sharpens it (a teacher's low temperature). Bars are
 * `<id>-b<n>`; `labels` names each bar under the baseline (words, `$…$` math or `{ tex }`).
 */
export function makeDistribution(spec, random = Math.random) {
  const style = styleOf(spec)
  const { x = 0, y = 0, w = 64, h = 40 } = spec
  const raw = spec.values ?? sample(spec.bins ?? 6, spec.seed)
  const powered = spec.sharp ? raw.map((value) => value ** 4) : raw
  const max = Math.max(...powered) || 1
  const values = powered.map((value) => value / max)
  const gap = spec.gap ?? 2
  const bar = (w - gap * (values.length - 1)) / values.length
  const { strong, lit } = shadesOf(style, spec.color ?? 'accent')
  // Why a colour of its own: the chosen bar may match the accent the figure marks it with.
  const marked = spec.highlightColor ? fillOf(style, spec.highlightColor) : lit
  const highlighted = new Set([spec.highlight].flat())
  const elements = [
    figureElement(
      'rectangle',
      {
        id: spec.id,
        x,
        y,
        width: w,
        height: h,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        boundElements: [],
        customData: { asterGlyph: 'distribution' },
        ...common(spec)
      },
      random
    )
  ]
  values.forEach((value, index) => {
    const height = Math.max(1.5, value * (h - 2))
    elements.push(
      figureElement(
        'rectangle',
        {
          id: `${spec.id}-b${index}`,
          x: x + index * (bar + gap),
          y: y + h - height,
          width: bar,
          height,
          strokeColor: 'transparent',
          backgroundColor: highlighted.has(index) ? marked : strong,
          ...common(spec)
        },
        random
      )
    )
  })
  elements.push(
    figureElement(
      'line',
      {
        id: `${spec.id}-base`,
        x,
        y: y + h,
        width: w,
        height: 0,
        points: [
          [0, 0],
          [w, 0]
        ],
        strokeColor: style.line,
        strokeWidth: 1.5,
        ...common(spec)
      },
      random
    )
  )
  const size = spec.labelsSize ?? style.smallSize
  const names = (spec.labels ?? []).map((name) =>
    name === undefined || name === null || name === ''
      ? null
      : labelLines(typeof name === 'object' ? [name] : String(name), size, undefined, style)
  )
  // Why staggered: names wider than their bars would run into each other on one line.
  const crowded = names.some(
    (lines) => lines && measureLines(lines, size, style).width > bar + gap - 2
  )
  for (const [index, lines] of names.entries()) {
    if (!lines) {
      continue
    }
    elements.push(
      ...makeLines(
        {
          id: `${spec.id}-l${index}`,
          cx: x + index * (bar + gap) + bar / 2,
          y: y + h + 3 + (crowded && index % 2 ? size * 1.25 : 0),
          size,
          style: spec.style,
          frame: spec.frame,
          group: `${spec.id}-glyph`
        },
        lines,
        random
      ).elements
    )
  }
  return { elements, pictures: [], values, width: w, height: h }
}

/** Where an ellipsis band goes: before row (or column) `at`, by default before the last one. */
function ellipsisAt(option, axis, count) {
  if (option === true || option === axis) {
    return count - 1
  }
  const at = option?.[axis]
  return typeof at === 'number' ? at : null
}

/** The matrix's cell size [w, h]: `cell` (a number or [w, h]), or wide enough for its entries. */
function cellSize(spec, entries, size, style) {
  if (Array.isArray(spec.cell)) {
    const [w, h] = spec.cell.map(Number)
    if (!(w > 0 && h > 0)) {
      throw new Error(
        `matrix ${spec.id}: cell is a number or [w, h], not ${JSON.stringify(spec.cell)}`
      )
    }
    return [w, h]
  }
  if (spec.cell !== undefined) {
    if (!(Number(spec.cell) > 0)) {
      throw new Error(
        `matrix ${spec.id}: cell is a number or [w, h], not ${JSON.stringify(spec.cell)}`
      )
    }
    return [Number(spec.cell), Number(spec.cell)]
  }
  // Why fit the entries: a fixed 24-unit cell printed `I_1·T_1` at 11 units, too small to read.
  const widest = Math.max(
    0,
    ...entries.map((tex) => makeMath({ id: 'probe', tex, size, style, auto: true }).width)
  )
  if (!entries.length) {
    return [24, 24]
  }
  const height = Math.max(24, Math.ceil((size * 1.8) / 4) * 4)
  return [Math.max(height, Math.ceil((widest + 10) / 4) * 4), height]
}

/**
 * A matrix of cells, each with an optional TeX entry: `cells` is a function (i, j) → tex or a 2D
 * array (`label` as a function or table too, from older scripts; a string `label` names the
 * matrix); `fills` a function or 2D array of colour names; `diagonal` colours i = j; row and
 * column labels sit left and above. `cell` is a number or [w, h]; without it cells fit their
 * entries at the small text size. `ellipsis` (true, 'row', 'col' or { row, col }) adds a band of
 * ⋮ / ⋯ before that row or column (the last by default). Cells are `<id>-r<i>c<j>`; highlight()
 * rings one.
 */
export function makeMatrix(spec, random = Math.random) {
  const style = styleOf(spec)
  const { x = 0, y = 0, rows = 4, cols = 4 } = spec
  const pick = (source, i, j) =>
    typeof source === 'function' ? source(i, j) : Array.isArray(source) ? source[i]?.[j] : source
  const size = spec.size ?? style.smallSize
  const entrySource = spec.cells ?? (typeof spec.label === 'string' ? undefined : spec.label)
  const entryOf = (i, j) => {
    const tex = pick(entrySource, i, j)
    return tex === undefined || tex === null || tex === '' ? null : String(tex)
  }
  const entries = []
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const tex = entryOf(i, j)
      if (tex !== null) {
        entries.push(tex)
      }
    }
  }
  const textSize = spec.cellSize ?? size
  const [cellW, cellH] = cellSize(spec, entries, textSize, style)
  const rowBand = ellipsisAt(spec.ellipsis, 'row', rows)
  const colBand = ellipsisAt(spec.ellipsis, 'col', cols)
  const bandW = Math.round(cellW * 0.6)
  const bandH = Math.round(cellH * 0.6)
  const left = (j) => x + j * cellW + (colBand !== null && j >= colBand ? bandW : 0)
  const top = (i) => y + i * cellH + (rowBand !== null && i >= rowBand ? bandH : 0)
  const width = cols * cellW + (colBand !== null ? bandW : 0)
  const height = rows * cellH + (rowBand !== null ? bandH : 0)
  const stroke = style.boxStroke === 'transparent' ? '#ffffff' : style.boxStroke
  // Why last: a ring on the matrix (compared, highlighted) draws on its frame, over the cells.
  const frame = figureElement(
    'rectangle',
    {
      id: spec.id,
      x,
      y,
      width,
      height,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      boundElements: [],
      customData: { asterGrid: { rows, cols, cell: [cellW, cellH], gap: 0 } },
      ...common(spec)
    },
    random
  )
  const math = (id, tex, where, mathSize = size) =>
    makeMath(
      { id, tex, size: mathSize, style: spec.style, group: `${spec.id}-glyph`, ...where },
      random
    ).elements
  const elements = []
  const shrunk = []
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const name =
        (i === j && spec.diagonal ? spec.diagonal : pick(spec.fills, i, j)) ?? spec.color ?? 'block'
      const fill = fillOf(style, name)
      // Why gray on white cells: white rules between white cells leave no grid at all.
      const blank = ['#ffffff', '#fff', 'transparent'].includes(String(fill).toLowerCase())
      elements.push(
        figureElement(
          'rectangle',
          {
            id: `${spec.id}-r${i}c${j}`,
            x: left(j),
            y: top(i),
            width: cellW,
            height: cellH,
            strokeColor: blank && stroke === '#ffffff' ? style.strong : stroke,
            strokeWidth: 1.5,
            backgroundColor: fill,
            // Why intentional: a cell is sized for the matrix, not for its entry (empty-box).
            customData: { asterIntentional: true },
            ...common(spec)
          },
          random
        )
      )
      const tex = entryOf(i, j)
      if (tex !== null) {
        const probe = makeMath({ id: 'probe', tex, size: textSize, style, auto: true })
        // Why shrink only an entry too wide for its cell: the agent chose that cell.
        const fit = Math.min(1, (cellW - 4) / probe.width, (cellH - 2) / probe.height)
        const entrySize = Math.max(10, Math.floor(textSize * fit * 10) / 10)
        if (entrySize < Math.min(14, textSize)) {
          shrunk.push(entrySize)
        }
        elements.push(
          ...math(
            `${spec.id}-t${i}-${j}`,
            tex,
            { cx: left(j) + cellW / 2, cy: top(i) + cellH / 2, auto: true },
            entrySize
          )
        )
      }
    }
  }
  // Why bands: a matrix of N rows shows 1, 2, …, N with the dots where rows are left out.
  const dots = []
  if (rowBand !== null) {
    for (let j = 0; j < cols; j += 1) {
      dots.push([`r-dots${j}`, '\\vdots', left(j) + cellW / 2, top(rowBand) - bandH / 2])
    }
  }
  if (colBand !== null) {
    for (let i = 0; i < rows; i += 1) {
      dots.push([`c-dots${i}`, '\\cdots', left(colBand) - bandW / 2, top(i) + cellH / 2])
    }
  }
  if (rowBand !== null && colBand !== null) {
    dots.push(['x-dots', '\\ddots', left(colBand) - bandW / 2, top(rowBand) - bandH / 2])
  }
  for (const [name, tex, cx, cy] of dots) {
    elements.push(...math(`${spec.id}-${name}`, tex, { cx, cy }))
  }
  for (const [index, tex] of (spec.rowLabels ?? []).entries()) {
    elements.push(
      ...math(`${spec.id}-row${index}`, String(tex), {
        x: x - 6,
        align: 'right',
        cy: top(index) + cellH / 2,
        auto: true
      })
    )
  }
  for (const [index, tex] of (spec.colLabels ?? []).entries()) {
    elements.push(
      ...math(`${spec.id}-col${index}`, String(tex), {
        cx: left(index) + cellW / 2,
        y: y - size * 1.4,
        auto: true
      })
    )
  }
  if (rowBand !== null && spec.rowLabels?.length) {
    elements.push(
      ...math(`${spec.id}-row-dots`, '\\vdots', {
        x: x - 6,
        align: 'right',
        cy: top(rowBand) - bandH / 2
      })
    )
  }
  if (colBand !== null && spec.colLabels?.length) {
    elements.push(
      ...math(`${spec.id}-col-dots`, '\\cdots', {
        cx: left(colBand) - bandW / 2,
        y: y - size * 1.4
      })
    )
  }
  elements.push(frame)
  const warnings = shrunk.length
    ? [
        `matrix ${spec.id}: entries shrink to ${Math.min(...shrunk)} units to fit cells ${cellW} × ${cellH}, under the 14-unit floor; widen cell (or leave it out to fit the entries)`
      ]
    : []
  return { elements, pictures: [], width, height, warnings }
}
