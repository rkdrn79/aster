// Data pipelines, split from research-figures-kit-genres.mjs: a stage card (a step, an icon and a
// title on top, a note for its rule, thumbnails or a text snippet, chips for its sub-steps, a
// count bar at the bottom) and a row of them joined by arrows, each stage as wide as it needs.
import { makeBox, makeText } from './research-figures-draw.mjs'
import { figureElement } from './research-figures-model.mjs'
import { labelLines, makeLines } from './research-figures-type.mjs'
import { styleColor } from './research-figures-style.mjs'
import { measureText } from './research-figures-text.mjs'
import { barGray, makeStep } from './research-figures-annotate.mjs'
import { countShares, formatCount, makeCard, warnKit } from './research-figures-cards.mjs'
import { wrapLabel } from './research-figures-wrap.mjs'

const round = (value) => Math.round(value * 100) / 100
const PAD = 8
const CHIP_H = 22
const CHIP_GAP = 4

/** A photo cell: a kind ('cat'), a project image ({ src }) or a full image() spec. */
export const pictureSpec = (cell) =>
  typeof cell === 'string' ? { kind: cell } : cell.src ? { src: cell.src, ...cell } : cell

/** The room a stage's title row leaves for the title, beside its step and icon. */
const titleRoom = (spec) =>
  (spec.w ?? 132) - 2 * PAD - (spec.step !== undefined ? 26 : 0) - (spec.icon ? 24 : 0)

/**
 * A stage's title as it fits beside its step and icon: at the label size, else the small size,
 * else broken over two lines; `shrunk` says it no longer prints at the label size.
 */
function stageTitle(style, spec) {
  const room = titleRoom(spec)
  const title = String(spec.title ?? '')
  const sizes = spec.titleSize ? [spec.titleSize] : [style.textSize, style.smallSize]
  for (const size of sizes) {
    if (measureText(title, size, style.fontFamily).width <= room) {
      return { text: title, size, lines: 1, shrunk: size < style.textSize }
    }
  }
  const words = title.split(' ')
  const cut = Math.max(1, Math.ceil(words.length / 2))
  return {
    text: `${words.slice(0, cut).join(' ')}\n${words.slice(cut).join(' ')}`,
    size: style.smallSize,
    lines: 2,
    shrunk: true
  }
}

/** The stage's note wrapped to its card (`\n` breaks a line), and how many lines it takes. */
function stageNote(style, spec) {
  if (!spec.note) {
    return { label: null, lines: 0 }
  }
  const wrapped = wrapLabel(spec.note, (spec.w ?? 132) - 2 * PAD, style.smallSize, style)
  return { label: wrapped.label, lines: wrapped.lines }
}

/** Chips (a stage's sub-steps or filters) in rows that fit the card: `{ text, x, y, w }`. */
function chipRows(style, spec) {
  const room = (spec.w ?? 132) - 2 * PAD
  const rows = [[]]
  let left = 0
  for (const text of spec.chips ?? []) {
    const w = Math.ceil(measureText(String(text), style.smallSize, style.fontFamily).width + 12)
    if (rows.at(-1).length && left + w > room) {
      rows.push([])
      left = 0
    }
    rows.at(-1).push({ text: String(text), x: left, w })
    left += w + CHIP_GAP
  }
  return rows.filter((row) => row.length)
}

/** A stage card's thumbnail size, title, note, chips and natural height. */
function stageLayout(style, spec) {
  const w = spec.w ?? 132
  const small = style.smallSize
  const thumbs = spec.thumbs ?? []
  const room = (w - 2 * PAD - (thumbs.length - 1) * 4) / Math.max(1, thumbs.length)
  const thumb = spec.thumbSize ?? Math.min(48, room)
  const heading = stageTitle(style, spec)
  const note = stageNote(style, spec)
  const titleH = Math.max(style.textSize, heading.lines * heading.size) * 1.25
  const noteH = note.lines * small * 1.25
  const countH = spec.count !== undefined ? small * 1.25 + 4 : 0
  const snippetH = spec.snippet
    ? Math.ceil(
        measureText(String(spec.snippet), small, style.fontFamily).width / (w - 2 * PAD - 6) + 0.2
      ) *
        small *
        1.3 +
      6
    : 0
  const middle = thumbs.length ? thumb + 4 : snippetH
  const chips = chipRows(style, spec)
  const chipsH = chips.length ? chips.length * (CHIP_H + CHIP_GAP) : 0
  const body = (middle ? middle + 4 : 0) + chipsH
  return {
    thumb,
    room,
    heading,
    note,
    chips,
    titleH,
    noteH,
    // Why 40 without a body: a title-only stage is a slim card, never an empty box.
    height: Math.max(body || countH ? 56 : 40, round(2 * PAD + titleH + noteH + body + countH))
  }
}

/** How wide a stage must be for its title row, its thumbnails at 32 and its widest chip. */
function stageNeed(style, spec) {
  const title =
    2 * PAD +
    (spec.step !== undefined ? 26 : 0) +
    (spec.icon ? 24 : 0) +
    measureText(String(spec.title ?? ''), style.textSize, style.fontFamily).width +
    4
  const thumbs = spec.thumbs?.length
    ? 2 * PAD + spec.thumbs.length * (spec.thumbSize ?? 32) + (spec.thumbs.length - 1) * 4
    : 0
  const chips = (spec.chips ?? []).map(
    (text) => 2 * PAD + measureText(String(text), style.smallSize, style.fontFamily).width + 12
  )
  return Math.ceil(Math.max(title, thumbs, ...chips))
}

/**
 * Card widths for a row sharing `room`: a stage's own `w` is kept, the rest share what is left
 * evenly, and one that needs more (a long title, four filters) takes what it needs first.
 */
function stageWidths(room, fixed, needs) {
  const widths = fixed.map((w) => w ?? null)
  let free = widths.flatMap((w, index) => (w === null ? [index] : []))
  let left = room - widths.reduce((sum, w) => sum + (w ?? 0), 0)
  const wanted = free.reduce((sum, index) => sum + needs[index], 0)
  if (wanted > left) {
    // Why in proportion: when nothing fits, every card gives up the same share of its need.
    for (const index of free) {
      widths[index] = Math.floor((needs[index] * left) / wanted)
    }
    return widths
  }
  for (;;) {
    const share = Math.floor(left / Math.max(1, free.length))
    const big = free.filter((index) => needs[index] > share)
    if (!big.length || big.length === free.length) {
      for (const index of free) {
        widths[index] = big.length ? Math.max(share, needs[index]) : share
      }
      return widths
    }
    for (const index of big) {
      widths[index] = needs[index]
      left -= needs[index]
    }
    free = free.filter((index) => !big.includes(index))
  }
}

export function pipelineMethods(core, figure) {
  const { styled } = core
  const styleNow = () => styled({}).style
  /**
   * One stage of a data pipeline: a card with a step, an icon and a title on top, a `note`
   * under it, `thumbs` (photo kinds or { src }) or a `snippet` of text, `chips` for its
   * sub-steps, and its `count` at the bottom as a bar (its `share` of the largest) and the
   * number. Binds: the id (the card).
   */
  async function stage(spec) {
    const style = styleNow()
    const { id, x = 0, y = 0, w = 132 } = spec
    const size = style.textSize
    const small = style.smallSize
    const thumbs = spec.thumbs ?? []
    const layout = stageLayout(style, spec)
    const { heading, note, titleH, noteH } = layout
    const h = Math.max(spec.h ?? 0, layout.height)
    // Why grow: in a row as tall as its tallest card, small photos leave a half-empty card.
    const thumb =
      spec.thumbSize === undefined && thumbs.length
        ? round(Math.min(layout.room, layout.thumb + (h - layout.height), 96))
        : layout.thumb
    const warnings = []
    if (heading.shrunk && !spec.inRow) {
      warnings.push(
        `stage ${id}: its title "${spec.title}" prints at ${heading.size}${heading.lines > 1 ? ' on two lines' : ''}; widen w or shorten it`
      )
    }
    if (spec.h !== undefined && !spec.inRow && spec.h - layout.height >= 48) {
      warnings.push(
        `stage ${id}: h ${spec.h} leaves ${round(spec.h - layout.height)} units empty under its content; drop h or add chips`
      )
    }
    const paint = styleColor(style, spec.color ?? 'white')
    const accentCard = spec.color === 'accent'
    const card = figureElement('rectangle', {
      id,
      x,
      y,
      width: w,
      height: h,
      strokeColor: spec.stroke ?? paint.stroke,
      backgroundColor: paint.fill,
      strokeWidth: 1.5,
      roundness: style.radius > 0 ? { type: 3, value: Math.max(style.radius, 6) } : null,
      boundElements: [],
      frameId: spec.frame ?? null,
      customData: { asterStage: true, asterIntentional: true }
    })
    const elements = [card]
    let left = x + PAD
    const rowMiddle = y + PAD + (size * 1.25) / 2
    if (spec.step !== undefined) {
      // Why in the title row: a number on the card's corner would cross its edge.
      elements.push(
        ...makeStep(
          styled({ id: `${id}-step`, n: spec.step, cx: left + 10, cy: rowMiddle, size: 20 })
        )
      )
      left += 26
    }
    const iconAt = left
    if (spec.icon) {
      left += 24
    }
    elements.push(
      ...makeLines(
        styled({
          id: `${id}-title`,
          x: left,
          y: heading.lines > 1 ? y + PAD : y + PAD + ((size - heading.size) * 1.25) / 2,
          size: heading.size,
          frame: spec.frame
        }),
        labelLines(heading.text, heading.size, undefined, style)
      ).elements
    )
    if (note.label) {
      // Why under the title: the stage's rule ("fastText en ≥ 0.65") belongs to the stage.
      elements.push(
        ...makeLines(
          styled({
            id: `${id}-note`,
            x: x + PAD,
            y: y + PAD + titleH,
            size: small,
            // Why not muted on the accent: gray on a tint fails contrast.
            color: accentCard ? undefined : 'muted',
            frame: spec.frame
          }),
          labelLines(note.label, small, undefined, style)
        ).elements
      )
    }
    const bodyTop = y + PAD + titleH + noteH + 4
    let chipsTop = bodyTop + (thumbs.length ? thumb + 4 : 0)
    if (spec.snippet) {
      const snippet = makeCard(
        styled({
          id: `${id}-snippet`,
          x: x + PAD,
          y: bodyTop,
          w: w - 2 * PAD,
          text: spec.snippet,
          size: small,
          pad: 3,
          color: 'panel',
          stroke: 'transparent'
        })
      )
      elements.push(...snippet.elements)
      chipsTop = bodyTop + snippet.height + 4
    }
    for (const [row, chips] of layout.chips.entries()) {
      for (const [index, chip] of chips.entries()) {
        elements.push(
          ...makeBox(
            styled({
              id: `${id}-chip${row}-${index}`,
              x: x + PAD + chip.x,
              y: round(chipsTop + row * (CHIP_H + CHIP_GAP)),
              w: chip.w,
              h: CHIP_H,
              exact: true,
              label: chip.text,
              size: small,
              color: accentCard || spec.color === 'panel' ? 'white' : 'panel',
              stroke: 'transparent',
              frame: spec.frame
            })
          )
        )
      }
    }
    if (spec.count !== undefined) {
      const bottom = y + h - PAD
      const number = formatCount(spec.count)
      const numberW = measureText(number, small, style.fontFamily).width
      const room = w - 2 * PAD - numberW - 6
      const share = spec.share ?? 1
      const accent = accentCard || spec.final
      // Why ink on an accent card: the accent's ink on its own tint fails contrast.
      elements.push(
        figureElement('rectangle', {
          id: `${id}-bar`,
          x: x + PAD,
          y: round(bottom - small * 0.62 - 3),
          width: round(Math.max(4, room * share)),
          height: 6,
          strokeColor: 'transparent',
          backgroundColor: accent ? styleColor(style, 'accent-strong').fill : barGray(style),
          roundness: { type: 3, value: 2 },
          frameId: spec.frame ?? null,
          customData: { asterBar: true }
        }),
        makeText(
          styled({
            id: `${id}-count`,
            text: number,
            x: x + w - PAD - numberW,
            y: round(bottom - small * 1.25),
            size: small,
            color: accent && !accentCard ? 'accent-ink' : undefined,
            frame: spec.frame
          })
        )[0]
      )
    }
    core.claim(id, elements)
    core.insert(elements)
    // Why after the card: drawn first, the card's fill would hide the icon and photos.
    if (spec.icon) {
      figure().icon(spec.icon, {
        id: `${id}-icon`,
        x: iconAt,
        y: y + PAD + (style.textSize * 1.25 - 18) / 2,
        size: 18,
        color: spec.iconColor ?? (accentCard ? 'accent-ink' : undefined)
      })
    }
    for (const [index, cell] of thumbs.entries()) {
      const picture = pictureSpec(cell)
      await figure().image({
        ...picture,
        mark: undefined,
        id: `${id}-th${index}`,
        x: round(x + PAD + index * (thumb + 4)),
        y: round(bodyTop),
        w: thumb,
        h: thumb
      })
      if (picture.mark) {
        figure().mark({
          id: `${id}-th${index}-mark`,
          kind: picture.mark,
          on: `${id}-th${index}`,
          size: 12
        })
      }
    }
    warnKit(warnings)
    return { id, x, y, width: w, height: h, right: x + w, bottom: y + h, warnings }
  }

  /**
   * A data pipeline left to right: stage cards (`stages: [{ title, icon, note, count, thumbs,
   * snippet, chips, w, color }]`) joined by arrows with `labels` (the filter between two
   * stages), each count drawn as a bar on a log scale so the shrinking shows; `loop: { from,
   * to, label }` draws a data-engine loop under the row. The last stage is the dataset.
   */
  async function pipeline(spec) {
    const style = styleNow()
    const { id, x = 0, y = 0 } = spec
    const stages = spec.stages ?? []
    const labels = spec.labels ?? []
    const small = style.smallSize
    const stepOf = (stage, index) => stage.step ?? (spec.numbered ? index + 1 : undefined)
    const labelW = labels.map((label) =>
      label ? measureText(String(label), small, style.fontFamily).width + 20 : 0
    )
    const gapBase = spec.gap ?? 32
    let gaps = stages.slice(1).map((_, index) => Math.max(gapBase, labelW[index] ?? 0))
    const needs = stages.map((stage, index) =>
      stageNeed(style, { ...stage, step: stepOf(stage, index) })
    )
    const total = spec.w ?? 600
    const room = (list) => total - list.reduce((sum, gap) => sum + gap, 0)
    // Why: the cards' needs come first; the gaps give way down to 24 before a card is
    // narrower than its title.
    const wanted = stages.reduce((sum, stage, index) => sum + (stage.w ?? needs[index]), 0)
    if (!spec.stageWidth && room(gaps) < wanted) {
      const spare = total - wanted
      const each = Math.max(24, Math.floor(spare / Math.max(1, stages.length - 1)))
      gaps = gaps.map((gap) => Math.min(gap, Math.max(each, labelW[0] ? 24 : each)))
    }
    const widths = spec.stageWidth
      ? stages.map((stage) => stage.w ?? spec.stageWidth)
      : stageWidths(
          room(gaps),
          stages.map((stage) => stage.w),
          needs
        )
    const sized = stages.map((stage, index) => ({
      ...stage,
      w: widths[index],
      step: stepOf(stage, index)
    }))
    // Why one size: if one title has to print small, all of them do, so the row reads evenly.
    const titles = sized.map((stage) => stageTitle(style, stage))
    const titleSize = titles.every((title) => !title.shrunk) ? style.textSize : style.smallSize
    const warnings = titles.flatMap((title, index) =>
      title.shrunk
        ? [
            `pipeline ${id}: stage "${stages[index].title}" prints its title at ${title.size}${title.lines > 1 ? ' on two lines' : ''}, so every title does; give it w, widen the row or shorten the title`
          ]
        : []
    )
    const shares = countShares(stages.map((stage) => stage.count ?? 1))
    // Why one height: cards of one row share their top and bottom edges.
    const tallest =
      spec.h ??
      Math.max(...sized.map((stage) => stageLayout(style, { ...stage, titleSize }).height))
    const ids = []
    let left = x
    const boxes = []
    for (const [index, item] of sized.entries()) {
      const stageId = item.id ?? `${id}-s${index}`
      const last = index === stages.length - 1
      boxes.push(
        await stage({
          ...item,
          id: stageId,
          x: left,
          y,
          h: tallest,
          inRow: true,
          share: item.count === undefined ? undefined : shares[index],
          titleSize,
          color: item.color ?? (last && spec.final !== false ? 'accent' : 'white'),
          frame: spec.frame
        })
      )
      ids.push(stageId)
      left += widths[index] + (gaps[index] ?? 0)
    }
    ids.slice(1).forEach((stageId, index) => {
      const label = labels[index]
      figure().arrow({
        id: `${id}-a${index + 1}`,
        from: ids[index],
        to: stageId,
        ...(label ? (Array.isArray(label) ? { label } : { labelText: label }) : {}),
        frame: spec.frame
      })
    })
    if (spec.loop) {
      const from = ids[spec.loop.from ?? ids.length - 1]
      const to = ids[spec.loop.to ?? 0]
      const a = core.bounds(from)
      const b = core.bounds(to)
      const below = Math.max(a.bottom, b.bottom) + (spec.loop.depth ?? 24)
      figure().arrow({
        id: `${id}-loop`,
        from,
        to,
        via: [
          [a.x + a.width / 2, below],
          [b.x + b.width / 2, below]
        ],
        role: spec.loop.role ?? 'main',
        ...(spec.loop.label ? { labelText: spec.loop.label, labelSegment: 1 } : {}),
        frame: spec.frame
      })
    }
    warnKit(warnings)
    return { ids, boxes, widths, width: left - x, height: tallest, warnings }
  }
  return { stage, pipeline }
}
