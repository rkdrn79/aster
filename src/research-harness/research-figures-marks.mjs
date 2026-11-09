// Grid and badge glyphs: feature grids, attention masks, and frozen or trainable badges.
import { makeText } from './research-figures-draw.mjs'
import { makeGrid, makePolyline } from './research-figures-shapes.mjs'
import { inkColor, paintValue } from './research-figures-style.mjs'
import { makeMath, styleOf } from './research-figures-type.mjs'
import { measureText } from './research-figures-text.mjs'

/** An N × D grid of shades of one colour: features, latents, embeddings. */
export function makeFeatures(spec, random = Math.random) {
  const style = styleOf(spec)
  const { rows = 4, cols = 6 } = spec
  const base = inkColor(style, spec.color ?? 'line')
  const rgb = [1, 3, 5].map((index) => Number.parseInt(base.slice(index, index + 2), 16))
  let state = (spec.seed ?? 3) * 7919
  const shade = () => {
    state = (state * 9301 + 49297) % 233280
    const t = 0.2 + (state / 233280) * 0.65
    return `#${rgb
      .map((channel) =>
        Math.round(channel + (255 - channel) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`
  }
  const fills = Array.from({ length: rows }, () => Array.from({ length: cols }, shade))
  return {
    elements: makeGrid(
      {
        ...spec,
        rows,
        cols,
        // Why 12: a cell under 1/12 in (24 px at print) reads as a speck.
        cell: spec.cell ?? 12,
        fills,
        cellStroke: '#ffffff',
        groupIds: [...(spec.groupIds ?? []), `${spec.id}-glyph`]
      },
      random
    ),
    pictures: []
  }
}

/** The left edge and width of drawn text elements. */
function inkExtent(elements) {
  const x = Math.min(...elements.map((element) => element.x))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  return { x, width: right - x }
}

/** Whether position `row` attends to `col` under `spec.mask` (see makeAttention). */
function attends(spec, groups) {
  const mask = spec.mask ?? (spec.causal === false ? 'full' : 'causal')
  if (typeof mask === 'function') {
    return (row, col) => Boolean(mask(row, col))
  }
  if (!['causal', 'full', 'block-causal', 'window', 'sink'].includes(mask)) {
    throw new Error(
      `Unknown attention mask "${mask}"; use causal, full, block-causal, window, sink or (row, col) => true`
    )
  }
  const groupOf = groups.flatMap((group, index) => Array.from({ length: group.n }, () => index))
  // Why named blocks: a frame's tokens and its action token are one step of an interleaved
  // sequence, so they see each other both ways.
  const blockOf = []
  for (const [index, group] of groups.entries()) {
    const previous = groups[index - 1]
    const joins = index > 0 && group.block !== undefined && group.block === previous.block
    blockOf.push(joins ? blockOf[index - 1] : index)
  }
  const window = spec.window ?? 3
  const sinks = spec.sinks ?? 1
  const rule = {
    full: () => true,
    causal: (row, col) => col <= row,
    'block-causal': (row, col) => blockOf[groupOf[col]] <= blockOf[groupOf[row]],
    // Why: a sliding window sees the last `window` positions; StreamingLLM keeps `sinks` too.
    window: (row, col) => col <= row && row - col < window,
    sink: (row, col) => col <= row && (col < sinks || row - col < window)
  }[mask]
  return (row, col) =>
    rule(row, col) || (groupOf[row] === groupOf[col] && Boolean(groups[groupOf[row]].full))
}

/**
 * An attention mask: `groups` ([{ label, n, full, block }]) of positions along both axes; a
 * cell is filled where attention is allowed: `mask` causal (j ≤ i, the default), full
 * (`causal: false` too), block-causal (a position sees its whole block and every earlier one:
 * interleaved frames and actions; groups sharing a `block` name form one block, else each group
 * is its own), window (the last `window` positions), sink (`sinks` first positions and the
 * window: StreamingLLM) or a function (row, col) → true; everywhere inside a group with `full`
 * (an image both ways). `fills` ((row, col, allowed) → colour, or [[colour]]) colours cells
 * itself; `title` names the mask above it.
 */
export function makeAttention(spec, random = Math.random) {
  const style = styleOf(spec)
  const cell = spec.cell ?? 12
  const groups = spec.groups ?? [{ label: '', n: 6 }]
  const n = groups.reduce((sum, group) => sum + group.n, 0)
  const { x = 0, y = 0 } = spec
  const on = inkColor(style, spec.color ?? 'line')
  const allowed = attends(spec, groups)
  const own = (row, col) =>
    typeof spec.fills === 'function'
      ? spec.fills(row, col, allowed(row, col))
      : spec.fills?.[row]?.[col]
  const fills = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => {
      const named = own(row, col)
      return named === undefined || named === null
        ? allowed(row, col)
          ? on
          : '#ffffff'
        : paintValue(style, named, 'fill')
    })
  )
  const grid = makeGrid(
    {
      ...spec,
      x,
      y,
      rows: n,
      cols: n,
      cell,
      fills,
      omit: undefined,
      cellStroke: '#d8d8d8',
      strokeWidth: 1.5,
      color: 'white',
      stroke: style.ink,
      outline: undefined,
      groupIds: [...(spec.groupIds ?? []), `${spec.id}-glyph`]
    },
    random
  )
  const labels = []
  const size = spec.size ?? style.smallSize
  const text = (id, value, where) =>
    makeText(
      {
        id: `${spec.id}-${id}`,
        text: value,
        size,
        style: spec.style,
        frame: spec.frame,
        groupIds: [`${spec.id}-shape`],
        ...where
      },
      random
    )
  // Why per position: rows and columns named by their tokens read without a note beside them.
  const positions = spec.labels ?? []
  const rowWidth = Math.max(0, ...positions.map((value) => measureText(value, size).width))
  const colFits = positions.every((value) => measureText(value, size).width <= cell + 2)
  for (const [index, value] of positions.entries()) {
    labels.push(
      ...text(`row${index}`, value, { x: x - 4, align: 'right', cy: y + (index + 0.5) * cell })
    )
    if (colFits) {
      labels.push(
        ...text(`col${index}`, value, { cx: x + (index + 0.5) * cell, y: y - size * 1.35 })
      )
    }
  }
  const sideX = x - 4 - (positions.length ? rowWidth + 8 : 0)
  const topY = y - size * 1.35 * (positions.length && colFits ? 2 : 1)
  // Why TeX for a label with TeX in it: group names like t_0 or x_{1:T} are math; `image` or
  // `<EOI>` print as written; tex is always TeX.
  const groupLabel = (id, group, where) => {
    const value = String(group.tex ?? group.label)
    if (group.tex === undefined && !/[_^\\{}$]/.test(value)) {
      const elements = text(id, value, where)
      return { elements, ...inkExtent(elements) }
    }
    return makeMath(
      {
        id: `${spec.id}-${id}`,
        tex: value,
        auto: group.tex === undefined,
        size,
        style: spec.style,
        frame: spec.frame,
        group: `${spec.id}-shape`,
        ...where
      },
      random
    )
  }
  let offset = 0
  let lifted = false
  let previousRight = -Infinity
  for (const [index, group] of groups.entries()) {
    const mid = (offset + group.n / 2) * cell
    const name = group.label ?? group.tex
    if (name !== undefined && name !== '') {
      // Why lift only on a clash: a narrow group's name would run into its neighbour's on one
      // line, but a name that clears it stays in the row with the others.
      const probe = groupLabel(`top${index}`, group, { cx: x + mid, y: topY })
      const clash = probe.x < previousRight + 4
      const lift = clash && !lifted ? size * 1.3 : 0
      lifted = lift > 0
      labels.push(
        ...(lift ? groupLabel(`top${index}`, group, { cx: x + mid, y: topY - lift }) : probe)
          .elements
      )
      previousRight = lift ? previousRight : probe.x + probe.width
      labels.push(
        ...groupLabel(`side${index}`, group, { x: sideX, align: 'right', cy: y + mid }).elements
      )
    }
    offset += group.n
  }
  if (spec.title !== undefined) {
    // Why above the group names: the title names the whole mask, the names its parts.
    const top = Math.min(y, ...labels.map((element) => element.y))
    const title = makeMath(
      {
        id: `${spec.id}-title`,
        tex: String(spec.title),
        auto: true,
        size: spec.titleSize ?? style.textSize,
        style: spec.style,
        frame: spec.frame,
        group: `${spec.id}-shape`,
        cx: x + (n * cell) / 2,
        y: 0
      },
      random
    )
    for (const element of title.elements) {
      element.y += top - 6 - title.height
    }
    labels.push(...title.elements)
  }
  return { elements: [...grid, ...labels], pictures: [] }
}

/**
 * A badge as SVG (24-unit box), drawn to be told apart at 8 pt: a solid flame with a white inner
 * tongue (an outlined flame reads as a swirl), and a six-armed snowflake with a branch pair on each
 * arm, on a white disc so it stays legible over a box's corner.
 */
export function badgeSvg(name, color) {
  if (name === 'fire') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 1.5c.6 3.2 2.6 5.2 4.3 7.2 1.9 2.2 3.2 4.4 3.2 7.1A7.5 7.5 0 0 1 12 23.3a7.5 7.5 0 0 1-7.5-7.5c0-2.6 1.2-4.6 2.6-6.2.2 1.9 1 3.2 2.3 3.9C9 10 9.6 5.3 12 1.5Z" fill="${color}" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 22c-2.1 0-3.6-1.5-3.6-3.5 0-2.1 1.6-3.6 3.6-6.2 2 2.6 3.6 4.1 3.6 6.2 0 2-1.5 3.5-3.6 3.5Z" fill="#ffffff"/></svg>`
  }
  const round = (value) => Math.round(value * 100) / 100
  let path = ''
  for (let arm = 0; arm < 6; arm += 1) {
    const angle = (arm * Math.PI) / 3
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    path += `M12 12L${round(12 + ux * 10.2)} ${round(12 + uy * 10.2)}`
    const [bx, by] = [12 + ux * 6.4, 12 + uy * 6.4]
    for (const side of [1, -1]) {
      path += `M${round(bx)} ${round(by)}L${round(bx + ux * 3.2 - side * uy * 3)} ${round(by + uy * 3.2 + side * ux * 3)}`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.6" fill="#ffffff"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/></svg>`
}

/** A snowflake badge (frozen weights) centred at (cx, cy), in the line colour. */
export function makeSnowflake(spec, random = Math.random) {
  const { cx = 0, cy = 0 } = spec
  const r = (spec.size ?? 14) / 2
  const color = inkColor(styleOf(spec), spec.color ?? 'line')
  const arms = []
  for (let index = 0; index < 3; index += 1) {
    const angle = (index * Math.PI) / 3
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)]
    arms.push([
      [cx - ux * r, cy - uy * r],
      [cx + ux * r, cy + uy * r]
    ])
    for (const sign of [1, -1]) {
      const [tx, ty] = [cx + sign * ux * r * 0.62, cy + sign * uy * r * 0.62]
      const [px, py] = [-uy * r * 0.3, ux * r * 0.3]
      arms.push([
        [tx + px - sign * ux * r * 0.25, ty + py - sign * uy * r * 0.25],
        [tx, ty],
        [tx - px - sign * ux * r * 0.25, ty - py - sign * uy * r * 0.25]
      ])
    }
  }
  return arms.map((points, index) =>
    makePolyline(
      {
        id: `${spec.id}-${index}`,
        points,
        stroke: color,
        strokeWidth: 1.5,
        frame: spec.frame,
        groupIds: [`${spec.id}-badge`],
        customData: { asterBadge: 'frozen' }
      },
      random
    )
  )
}

/** A flame badge (trained weights) centred at (cx, cy). */
export function makeFlame(spec, random = Math.random) {
  const { cx = 0, cy = 0 } = spec
  const s = (spec.size ?? 12) / 12
  const outline = [
    [0, 6],
    [-4.5, 2.5],
    [-4, -2],
    [-1.5, 0],
    [-1, -6],
    [3, -1.5],
    [3.2, -3.5],
    [5, 1],
    [3.5, 5]
  ]
  return [
    makePolyline(
      {
        id: spec.id,
        points: outline.map(([px, py]) => [cx + px * s, cy + py * s]),
        closed: true,
        stroke: 'transparent',
        fill: spec.color ? inkColor(styleOf(spec), spec.color) : '#f08c00',
        frame: spec.frame,
        groupIds: [`${spec.id}-badge`],
        // Why: the flame's orange is a sign, like an icon, not one of the figure's hues.
        customData: { asterBadge: 'trainable' }
      },
      random
    )
  ]
}
