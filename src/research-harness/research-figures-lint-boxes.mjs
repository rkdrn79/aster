// Boxes and backgrounds that carry nothing: a box much larger than what it holds (judges flag
// one more than about 60% empty), and a tinted background behind the whole figure that encodes
// no group or role.
import { elementBounds, isInside } from './research-figures-geometry.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
/** Padding a box may keep around what it holds: about one line of text on each side. */
const PAD = 16
/** A box emptier than this, once its content is padded, reads as an empty slab. */
const EMPTY_SHARE = 0.6
/** Panels of one tint covering this share of the drawing are a background, not a group. */
const BACKGROUND_SHARE = 0.8

/** What a box holds: its label, and any text, math, picture, shape or line drawn inside it. */
function contentOf(box, elements) {
  const outer = elementBounds(box)
  const group = box.groupIds?.[0]
  return elements
    .filter((element) => {
      if (element === box || element.type === 'frame' || element.customData?.asterPanel) {
        return false
      }
      if (element.containerId === box.id) {
        return true
      }
      const inner = element.type === 'text' ? glyphBounds(element) : elementBounds(element)
      const grouped = group && element.type === 'text' && (element.groupIds ?? []).includes(group)
      return (
        (grouped || isInside(inner, outer, 1)) &&
        inner.width * inner.height < outer.width * outer.height * 0.95
      )
    })
    .map((element) => ({
      ...(element.type === 'text' ? glyphBounds(element) : elementBounds(element)),
      words: element.type === 'text' || Boolean(element.customData?.asterTex)
    }))
}

/**
 * A box several times the size of what it holds reads as empty: much wider or taller than its
 * label, or (a card holding drawings too) over 60% empty once its content keeps a line of
 * padding. Counts every text,
 * icon and shape inside it, so a box needs no filler; bars, panels, kit glyph parts, cards and
 * `intentional` boxes pass.
 */
export function emptyBoxChecks(elements, add) {
  for (const box of elements) {
    const owner = box.customData?.asterKit
    // Why bars pass: a shared model drawn as a wide (or tall) bar spans its inputs on purpose.
    const bar =
      box.customData?.asterBar || box.width >= box.height * 5 || box.height >= box.width * 5
    const kitPart = (owner && owner !== box.id) || /-r\d+c\d+$/.test(box.id)
    const holder = ['asterCard', 'asterStage', 'asterContent', 'asterGlyph', 'asterGrid'].some(
      (key) => box.customData?.[key]
    )
    if (
      !SHAPES.has(box.type) ||
      !visible(box.backgroundColor) ||
      box.customData?.asterPanel ||
      box.customData?.asterContainer ||
      box.customData?.asterIntentional ||
      bar ||
      kitPart ||
      holder
    ) {
      continue
    }
    const ink = contentOf(box, elements)
    if (!ink.length) {
      continue
    }
    const left = Math.min(...ink.map((part) => part.x))
    const top = Math.min(...ink.map((part) => part.y))
    const width = Math.max(...ink.map((part) => part.x + part.width)) - left
    const height = Math.max(...ink.map((part) => part.y + part.height)) - top
    // Why these margins: 6–8 pt of padding fits a label; much more reads as an empty card.
    const wide = box.width - width > 72 && box.width > width * 1.8
    const tall = box.height - height > 56 && box.height > height * 3
    const padded = Math.min(box.width, width + 2 * PAD) * Math.min(box.height, height + 2 * PAD)
    const empty = 1 - padded / (box.width * box.height)
    // Why only the share for a box that holds drawings: it is a card, sized for what it shows.
    const holds = ink.some((part) => !part.words)
    if ((!holds && (wide || tall)) || empty > EMPTY_SHARE) {
      add(
        'warning',
        'empty-box',
        box,
        `is ${Math.round(box.width)} × ${Math.round(box.height)} around ${Math.round(width)} × ${Math.round(height)} of content, about ${Math.round(Math.max(empty, 0) * 100)}% empty; size it to its content (drop w and h), put the data inside, or mark a size that means something with intentional: true`
      )
    }
  }
}

/**
 * One tint behind (nearly) the whole drawing encodes nothing: judges read a uniform peach or
 * gray background as decoration. Panels that group parts apart, or tint only the
 * contribution, pass.
 */
export function backgroundChecks(elements, add) {
  const panels = elements.filter(
    (element) =>
      element.customData?.asterPanel &&
      SHAPES.has(element.type) &&
      visible(element.backgroundColor) &&
      element.backgroundColor.toLowerCase() !== '#ffffff'
  )
  const drawn = elements
    .filter((element) => element.type !== 'frame' && !element.customData?.asterPanel)
    .map(elementBounds)
  if (!panels.length || !drawn.length) {
    return
  }
  const fills = new Set(panels.map((panel) => panel.backgroundColor.toLowerCase()))
  if (fills.size > 1) {
    return
  }
  const x = Math.min(...drawn.map((box) => box.x))
  const y = Math.min(...drawn.map((box) => box.y))
  const right = Math.max(...drawn.map((box) => box.right))
  const bottom = Math.max(...drawn.map((box) => box.bottom))
  const area = (right - x) * (bottom - y)
  const covered = panels.reduce((sum, panel) => {
    const box = elementBounds(panel)
    const w = Math.min(box.right, right) - Math.max(box.x, x)
    const h = Math.min(box.bottom, bottom) - Math.max(box.y, y)
    return sum + (w > 0 && h > 0 ? w * h : 0)
  }, 0)
  if (area > 0 && covered / area >= BACKGROUND_SHARE) {
    add(
      'warning',
      'flat-background',
      panels[0],
      `${panels.length > 1 ? `${panels.length} panels share one tint (${[...fills][0]}) and cover` : `${panels[0].id} (${[...fills][0]}) covers`} ${Math.round((covered / area) * 100)}% of the drawing, a background that encodes nothing; keep groups as titles with a thin outline (panel({ color: 'none', outline: true })), and tint only the panel that is the contribution`
    )
  }
}

/**
 * A box's label drawn as runs (words and math side by side, which never wrap) that runs past
 * the box's edges: the same overflow as a bound label's, one finding per box.
 */
export function runLabelChecks(elements, add) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const parts = new Map()
  for (const element of elements) {
    const owner = byId.get(element.customData?.asterKit)
    const label = element.type === 'text' || element.customData?.asterTex
    // Why only <id>-label parts (a panel's <id>-title): a glyph's headers and its tokens' names are
    // placed by the kit.
    if (
      !label ||
      element.containerId ||
      !owner ||
      owner === element ||
      !element.id.startsWith(`${owner.id}-${owner.customData?.asterPanel ? 'title' : 'label'}`) ||
      !SHAPES.has(owner.type) ||
      !(visible(owner.backgroundColor) || visible(owner.strokeColor))
    ) {
      continue
    }
    parts.set(owner.id, [...(parts.get(owner.id) ?? []), element])
  }
  for (const [id, labels] of parts) {
    const box = elementBounds(byId.get(id))
    const ink = labels.map((part) =>
      part.type === 'text' ? glyphBounds(part) : elementBounds(part)
    )
    const left = Math.min(...ink.map((part) => part.x))
    const right = Math.max(...ink.map((part) => part.x + part.width))
    const top = Math.min(...ink.map((part) => part.y))
    const bottom = Math.max(...ink.map((part) => part.y + part.height))
    const centre = [(left + right) / 2, (top + bottom) / 2]
    // Why the centre: a glyph's name above or below it is placed outside on purpose.
    const inside =
      centre[0] > box.x && centre[0] < box.right && centre[1] > box.y && centre[1] < box.bottom
    const out = Math.max(box.x - left, right - box.right, box.y - top, bottom - box.bottom)
    if (inside && out > 0.5) {
      add(
        'error',
        'text-overflow',
        labels[0],
        `${id}'s ${byId.get(id).customData?.asterPanel ? 'title' : 'label'} needs ${Math.round(right - left)} × ${Math.round(bottom - top)} but the box is ${Math.round(box.width)} × ${Math.round(box.height)} (runs of words and math do not wrap); widen the box, or break the label with \\n`
      )
    }
  }
}
