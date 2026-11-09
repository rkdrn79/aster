// Text examples and dataset counts for figures beyond method diagrams: a card holding a prompt or
// a model output, wrapped to its width, with highlighted spans, a role line ("Q:", "Model
// output") and a check or cross; and a funnel of shrinking bars for a filtering pipeline
// ("5.8B → 2.1B → 140M"). Pure, like the other makers.
import { figureElement } from './research-figures-model.mjs'
import { makePolyline } from './research-figures-shapes.mjs'
import { makeText } from './research-figures-draw.mjs'
import { styleOf } from './research-figures-type.mjs'
import { styleColor, textInk } from './research-figures-style.mjs'
import { measureText } from './research-figures-text.mjs'
import { barGray, makeMark } from './research-figures-annotate.mjs'
import { contrast } from './research-figures-palette.mjs'

const UNITS = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }

/** Prints what a kit call had to change (a card that grew, a title that shrank) for the agent. */
export function warnKit(warnings) {
  for (const message of warnings ?? []) {
    console.warn(`kit: ${message}`)
  }
}
const round = (value) => Math.round(value * 100) / 100

/** A count as a number: 5800000000, '5.8B', '140M', '12,000'; NaN when it is not one. */
export function parseCount(value) {
  if (typeof value === 'number') {
    return value
  }
  const match = /^\s*([\d.,]+)\s*([KMBT])?/i.exec(String(value ?? ''))
  return match
    ? Number(match[1].replaceAll(',', '')) * (UNITS[match[2]?.toUpperCase()] ?? 1)
    : Number.NaN
}

/** A count as papers print it: 5.8B, 2.1B, 140M, 12K; a string stays as written. */
export function formatCount(value) {
  if (typeof value !== 'number') {
    return String(value)
  }
  for (const [unit, size] of [
    ['T', 1e12],
    ['B', 1e9],
    ['M', 1e6],
    ['K', 1e3]
  ]) {
    if (Math.abs(value) >= size) {
      const scaled = value / size
      return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toPrecision(2))}${unit}`
    }
  }
  return String(value)
}

/**
 * Each count's share of the largest, 0–1: on a log scale by default (counts that shrink by
 * orders of magnitude still show), with `floor` the share of the smallest.
 */
export function countShares(counts, { scale = 'log', floor = 0.22 } = {}) {
  const values = counts.map(parseCount)
  const max = Math.max(...values.filter(Number.isFinite))
  const min = Math.min(...values.filter(Number.isFinite))
  return values.map((value) => {
    if (!Number.isFinite(value) || !(max > 0)) {
      return 1
    }
    if (scale === 'linear') {
      return Math.max(0.04, value / max)
    }
    if (max === min) {
      return 1
    }
    const t = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))
    return floor + (1 - floor) * t
  })
}

/** `prefixes` as [prefix, colour] pairs, from an object or a list. */
const prefixPairs = (prefixes) =>
  Array.isArray(prefixes) ? prefixes : Object.entries(prefixes ?? {})

/**
 * Words of a text with their highlight colour (every occurrence of a phrase) and, for a line
 * that starts with one of `prefixes` ("Thought:", "Act:"), that prefix's ink; '\n' breaks.
 */
function wordsOf(text, highlights, prefixes, tone = 'accent') {
  const words = []
  const leads = prefixPairs(prefixes)
  for (const [index, line] of String(text ?? '')
    .split('\n')
    .entries()) {
    if (index) {
      words.push({ text: '\n' })
    }
    const parts = line.split(/\s+/).filter(Boolean)
    const lead = leads.find(([prefix]) => line.trimStart().startsWith(String(prefix).trim()))
    const leadWords = lead ? String(lead[0]).split(/\s+/).filter(Boolean).length : 0
    for (const [position, word] of parts.entries()) {
      words.push(position < leadWords ? { text: word, lead: lead[1] } : { text: word })
    }
  }
  const plain = (word) => word.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  for (const mark of highlights ?? []) {
    const phrase = String(mark.text ?? mark)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => plain({ text: word }))
    let start = 0
    while (phrase.length && start + phrase.length <= words.length) {
      const hit = phrase.every((part, offset) => plain(words[start + offset]) === part)
      if (hit) {
        for (let offset = 0; offset < phrase.length; offset += 1) {
          words[start + offset].color = mark.color ?? tone
        }
        start += phrase.length
      } else {
        start += 1
      }
    }
  }
  return words
}

/** Words broken into lines no wider than `width(row)`. */
function wrap(words, width, size, family) {
  const lines = [[]]
  const widthOf = (line) => measureText(line.map((word) => word.text).join(' '), size, family).width
  for (const word of words) {
    if (word.text === '\n') {
      lines.push([])
      continue
    }
    const line = lines.at(-1)
    if (line.length && widthOf([...line, word]) > width(lines.length - 1)) {
      lines.push([word])
    } else {
      line.push(word)
    }
  }
  return lines.filter((line, index) => line.length || index < lines.length - 1)
}

/**
 * A highlight's tint: the colour's fill, lightened toward white until ink text on it reads
 * (4.5:1), so 'red' or a solid swatch makes a pale band rather than a dark block.
 */
function spanFill(style, color) {
  const fill = styleColor(style, color).fill
  const channels = /^#([0-9a-f]{6})$/i.exec(String(fill))
  if (!channels) {
    return fill
  }
  const rgb = [0, 2, 4].map((index) => Number.parseInt(channels[1].slice(index, index + 2), 16))
  let tint = fill
  for (let share = 0.1; contrast(tint, style.ink) < 4.5 && share < 1; share += 0.1) {
    tint = `#${rgb
      .map((value) =>
        Math.round(value + (255 - value) * share)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`
  }
  return tint
}

/**
 * Whether a card's role leads its first line: a short one ("Q:", "A:") or a field label ending
 * in a colon ("Instruction:"); `roleInline` decides it either way. Otherwise it heads the card.
 */
export function roleIsInline(spec) {
  if (!spec.role) {
    return false
  }
  const role = String(spec.role)
  return spec.roleInline ?? (role.length <= 3 || /:\s*$/.test(role))
}

/**
 * A card's height and its top padding: `h` when given, the padding shrinking (to 2) so the
 * text still fits; the text's own height, with a warning, when even that is too small.
 */
function cardHeight(spec, { pad, content, id }) {
  const natural = round(2 * pad + content)
  if (spec.h === undefined || spec.h >= natural) {
    // Why warn: a box much bigger than what it holds reads as a big module (judges: size
    // carries weight), unless it is meant to line up with taller neighbours.
    const roomy = spec.h - natural >= 40 && spec.h >= 1.8 * natural && !spec.intentional
    return {
      h: Math.max(spec.h ?? 0, natural),
      top: pad,
      warnings: roomy
        ? [
            `card ${id}: h ${spec.h} is far taller than its text (${natural}); drop h, or say intentional: true when it lines up with taller cards`
          ]
        : []
    }
  }
  const top = round(Math.max(2, (spec.h - content) / 2))
  if (spec.h >= content + 4) {
    return { h: spec.h, top, warnings: [] }
  }
  const h = round(content + 4)
  return {
    h,
    top: 2,
    warnings: [
      `card ${id}: its text needs ${h} units but h is ${spec.h}, so the card grew; widen w, shorten the text or set a smaller size`
    ]
  }
}

/**
 * A text example on a card: `text` wrapped to `w`, `role` a small first line ("Q:", "Model
 * output") in the accent's ink, `highlights` ([{ text: 'Paris', color }]) as tinted spans
 * behind the words, `mark` ('check' | 'cross') in the top-right corner. White with a light
 * edge by default (`color`). `h` is kept, the padding shrinking to fit. Returns the elements,
 * the card's size, its text lines and `warnings`.
 */
export function makeCard(spec) {
  const style = styleOf(spec)
  const size = spec.size ?? style.smallSize ?? 14
  const family = style.fontFamily
  const w = spec.w ?? 200
  // Why narrower on a narrow card: 8 units a side wraps a short caption in a 96-unit cell.
  const pad = spec.pad ?? Math.max(4, Math.min(8, Math.round(w * 0.05)))
  const { id, x = 0, y = 0 } = spec
  const lineH = round(size * (spec.lineHeight ?? 1.3))
  const markRoom = spec.mark ? size + 4 : 0
  // Why inline: a short role ("Q:") or a field label ("Instruction:") leads its line; a longer
  // one ("Model output") heads the card.
  const inline = roleIsInline(spec)
  const roleColor =
    spec.roleColor === 'ink' ? style.ink : textInk(style, spec.roleColor ?? 'accent')
  const prefixes = prefixPairs(spec.prefixes).map(([prefix, color]) => [
    prefix,
    color === 'ink' ? style.ink : styleColor(style, color).ink
  ])
  // Why: on a card marked right or wrong, the decisive span takes that meaning's tint.
  const tone = { check: 'good', cross: 'bad' }[spec.mark] ?? 'accent'
  const words = wordsOf(spec.text, spec.highlights, prefixes, tone)
  const head = spec.role && !inline ? lineH : 0
  // Why the first line only: the mark sits beside the first line, the rest run full width.
  const lines = wrap(
    inline ? [{ text: String(spec.role), lead: roleColor, role: true }, ...words] : words,
    (row) => w - 2 * pad - (row === 0 && !head ? markRoom : 0),
    size,
    family
  )
  const {
    h,
    top: padTop,
    warnings
  } = cardHeight(spec, {
    pad,
    content: head + lines.length * lineH,
    id
  })
  const paint = styleColor(style, spec.color ?? 'white')
  const card = figureElement('rectangle', {
    id,
    x,
    y,
    width: w,
    height: h,
    strokeColor: spec.stroke ?? paint.stroke,
    backgroundColor: paint.fill,
    strokeWidth: spec.strokeWidth ?? 1.5,
    roundness: style.radius > 0 ? { type: 3, value: style.radius } : null,
    boundElements: [],
    frameId: spec.frame ?? null,
    customData: { asterCard: true, ...(spec.intentional ? { asterIntentional: true } : {}) }
  })
  const spans = []
  const texts = []
  const common = { size, style, frame: spec.frame }
  if (spec.role && !inline) {
    texts.push(
      makeText({
        id: `${id}-role`,
        text: spec.role,
        x: x + pad,
        y: y + padTop,
        color: roleColor,
        ...common
      })[0]
    )
  }
  lines.forEach((line, row) => {
    const top = y + padTop + head + row * lineH
    // Why a lead of its own: the role or a line's prefix ("Thought:") prints in its colour.
    const count = line.findIndex((word) => !word.lead || word.lead !== line[0].lead)
    const leading = line[0]?.lead ? line.slice(0, count === -1 ? line.length : count) : []
    const lead = leading.map((word) => word.text).join(' ')
    const sentence = line
      .slice(leading.length)
      .map((word) => word.text)
      .join(' ')
    const indent = lead ? measureText(`${lead} `, size, family).width : 0
    if (lead) {
      texts.push(
        makeText({
          id: leading[0].role ? `${id}-role` : `${id}-p${row}`,
          text: lead,
          x: x + pad,
          y: top,
          color: leading[0].lead,
          ...common
        })[0]
      )
    }
    if (sentence) {
      texts.push(
        makeText({
          id: `${id}-t${row}`,
          text: sentence,
          x: x + pad + indent,
          y: top,
          color: spec.textColor,
          ...common
        })[0]
      )
    }
    // Why measured prefixes: a span starts where the words before it end.
    let start = 0
    while (start < line.length) {
      const color = line[start].color
      if (!color) {
        start += 1
        continue
      }
      let end = start
      while (end + 1 < line.length && line[end + 1].color === color) {
        end += 1
      }
      const before = line.slice(0, start).map((word) => word.text)
      const left =
        x + pad + (before.length ? measureText(`${before.join(' ')} `, size, family).width : 0)
      const span = measureText(
        line
          .slice(start, end + 1)
          .map((word) => word.text)
          .join(' '),
        size,
        family
      ).width
      spans.push(
        figureElement('rectangle', {
          id: `${id}-h${row}-${start}`,
          x: round(left - 2),
          y: round(top + 1),
          width: round(span + 4),
          height: round(lineH - 1),
          strokeColor: 'transparent',
          backgroundColor: spanFill(style, color),
          roundness: { type: 3, value: 2 },
          frameId: spec.frame ?? null,
          customData: { asterHighlight: color }
        })
      )
      start = end + 1
    }
  })
  const marks = spec.mark
    ? makeMark({
        id: `${id}-mark`,
        kind: spec.mark,
        cx: x + w - pad - size / 2 + 2,
        cy: y + padTop + size / 2,
        size,
        style,
        frame: spec.frame
      })
    : []
  return {
    elements: [card, ...spans, ...texts, ...marks],
    width: w,
    height: h,
    lines: lines.length,
    warnings
  }
}

/**
 * A funnel of shrinking bars, one per stage (`stages: [{ label, count }]`), left to right:
 * each bar's height is its count's share (log scale unless `scale: 'linear'`), pale bands join
 * neighbours, the count sits above each bar and the stage's name below. The last bar takes the
 * accent: the dataset that remains.
 */
export function makeFunnel(spec) {
  const style = styleOf(spec)
  const { id, x = 0, y = 0, w = 360, h = 96 } = spec
  const stages = spec.stages ?? []
  if (stages.length < 2) {
    throw new Error('funnel needs two or more stages: [{ label, count }]')
  }
  const size = spec.size ?? style.smallSize ?? 14
  const lineH = size * 1.25
  const barW = spec.barWidth ?? 14
  const top = y + lineH + 4
  const height = h - 2 * (lineH + 4)
  const middle = top + height / 2
  const shares = countShares(
    stages.map((stage) => stage.count),
    { scale: spec.scale ?? 'log' }
  )
  const step = (w - barW) / (stages.length - 1)
  const accent = styleColor(style, spec.color ?? 'accent')
  const band = spec.band ?? style.panel
  const bars = stages.map((stage, index) => {
    const tall = Math.max(4, height * shares[index])
    return { x: round(x + index * step), y: round(middle - tall / 2), h: round(tall) }
  })
  const elements = []
  bars.slice(1).forEach((bar, index) => {
    const prev = bars[index]
    const join = makePolyline({
      id: `${id}-band${index + 1}`,
      points: [
        [prev.x + barW, prev.y],
        [bar.x, bar.y],
        [bar.x, bar.y + bar.h],
        [prev.x + barW, prev.y + prev.h]
      ],
      closed: true,
      fill: band,
      stroke: 'transparent',
      strokeWidth: 1,
      style,
      frame: spec.frame
    })
    elements.push(join)
  })
  bars.forEach((bar, index) => {
    const last = index === bars.length - 1
    elements.push(
      figureElement('rectangle', {
        id: index ? `${id}-bar${index}` : id,
        x: bar.x,
        y: bar.y,
        width: barW,
        height: bar.h,
        strokeColor: 'transparent',
        backgroundColor: last
          ? styleColor(style, `${spec.color ?? 'accent'}-strong`).fill
          : barGray(style),
        roundness: { type: 3, value: 2 },
        boundElements: [],
        frameId: spec.frame ?? null,
        customData: { asterBar: true, asterFunnel: index }
      })
    )
    const stage = stages[index]
    const cx = bar.x + barW / 2
    elements.push(
      makeText({
        id: `${id}-n${index}`,
        text: formatCount(stage.count),
        cx,
        y: round(top - lineH - 2),
        size,
        color: last ? accent.ink : style.ink,
        style,
        frame: spec.frame
      })[0],
      makeText({
        id: `${id}-l${index}`,
        text: String(stage.label ?? ''),
        cx,
        y: round(top + height + 2),
        size,
        style,
        frame: spec.frame
      })[0]
    )
  })
  return { elements, width: w, height: h, bars }
}
