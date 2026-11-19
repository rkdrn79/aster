// The design numbers of a scene, computed once for the design lint and `figures critique`: is
// the declared focus dominant (its size against its peers, what competes with it), which hues
// are drawn and what each means, and the craft counts (box styles, text sizes, peers of unequal
// size, gap steps, stacked token chips, photos of mixed sizes, captions without their picture).
// Pure.
import { hexToOklch, hueDistance } from './research-figures-color-space.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { isSemanticColor, pageStyle, styleColor } from './research-figures-style.mjs'
import { figurePage } from './research-figures-model.mjs'
import { PAPER_STROKE } from './research-figures-paper.mjs'
import { DESIGN_LIMITS, designFrame, hueOf, pageDesign } from './research-figures-design.mjs'
import { PEER_KINDS, designItems, itemArea, median } from './research-figures-design-items.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) =>
  typeof color === 'string' && color !== 'transparent' && color !== 'none' && color !== ''
const round = (value, step = 1) => Math.round(value / step) * step
const ratio = (values) =>
  values.length > 1 ? Math.max(...values) / Math.max(1, Math.min(...values)) : 1

/** The label size of an item: its largest word or typeset label. */
const labelSize = (item) =>
  Math.max(
    0,
    ...item.elements.map((element) =>
      element.type === 'text'
        ? (element.fontSize ?? 16)
        : element.customData?.asterTex
          ? (element.customData.asterTexSize ?? 0)
          : 0
    )
  )

/** Whether the declared focus leads: its size against its peers, and what competes with it. */
export function focusMeasure(items, design) {
  const focus = items.filter((item) => item.role === 'focus')
  const peers = items.filter((item) => PEER_KINDS.has(item.kind) && item.role !== 'focus')
  if (!design?.focus?.length || !focus.length) {
    return {
      declared: Boolean(design?.focus?.length),
      ids: design?.focus ?? [],
      items: [],
      peers: peers.length
    }
  }
  const solid = focus.filter((item) => item.kind !== 'arrow' && item.kind !== 'text')
  const area = solid.length ? Math.max(...solid.map(itemArea)) : 0
  // Why modules only: a photo or a card of text is content; the focus leads the modules.
  const modules = peers.filter((item) => item.kind === 'box' || item.kind === 'tokens')
  const peerArea = median((modules.length ? modules : peers).map(itemArea))
  const focusSize = Math.max(0, ...focus.map(labelSize))
  const competing = []
  for (const item of peers) {
    const head = item.head
    const fill = hueOf(head?.backgroundColor)
    if (
      fill &&
      fill.C >= 0.08 &&
      item.role !== 'data' &&
      !isSemanticColor(head.backgroundColor) &&
      !head.customData?.asterSwatch
    ) {
      competing.push({ id: item.id, why: 'a saturated fill' })
    } else if (area && ['box', 'tokens'].includes(item.kind) && itemArea(item) > area * 1.05) {
      competing.push({ id: item.id, why: 'larger than the focus' })
    } else if (
      SHAPES.has(head?.type) &&
      head.strokeWidth > PAPER_STROKE &&
      visible(head.strokeColor)
    ) {
      competing.push({ id: item.id, why: 'a heavier outline' })
    }
  }
  // Why one entry: when the focus's label is the small one, the fix is the focus's, not theirs.
  const louder = peers.filter(
    (item) => item.kind === 'box' && focusSize && labelSize(item) > focusSize
  )
  if (louder.length) {
    competing.push({
      id: louder[0].id,
      why: `${louder.length} part${louder.length > 1 ? 's have' : ' has'} larger labels (${louder.length > 1 ? `${louder[0].id}, …` : louder[0].id}) than the focus's ${focusSize / 2} pt: set the focus's label at the body size or larger`
    })
  }
  const share = focus.length / Math.max(1, focus.length + peers.length)
  const pathOnly = !solid.length
  const leads = pathOnly || (peerArea ? area / peerArea : Infinity) >= DESIGN_LIMITS.focusArea
  return {
    declared: true,
    ids: design.focus,
    items: focus.map((item) => item.id),
    area: Math.round(area),
    peerArea: Math.round(peerArea),
    ratio: peerArea ? Math.round((area / peerArea) * 100) / 100 : null,
    pathOnly,
    share: Math.round(share * 100) / 100,
    competing,
    dominant: leads && !competing.length && share <= DESIGN_LIMITS.accentShare
  }
}

/** The role names a style's colours carry, for saying what an undeclared colour means. */
function roleNames(style) {
  const names = new Map()
  const notes = {
    a: 'ours',
    b: 'outputs',
    c: 'machinery',
    d: 'inputs',
    frozen: 'frozen',
    accent: 'accent'
  }
  for (const role of Object.keys(notes)) {
    try {
      const color = styleColor(style, role)
      for (const hex of [color.fill, color.stroke, color.ink, color.solid]) {
        if (typeof hex === 'string' && !names.has(hex.toLowerCase())) {
          names.set(hex.toLowerCase(), `${role} (${notes[role]})`)
        }
      }
    } catch {
      // A preset without that role.
    }
  }
  return names
}

/** The hues drawn (pictures aside), clustered within 25°, each with what it means. */
export function colourMeasure(elements, page, design) {
  let names = new Map()
  try {
    names = roleNames(pageStyle(page))
  } catch {
    names = new Map()
  }
  const found = []
  for (const element of elements) {
    if (
      element.isDeleted ||
      element.type === 'frame' ||
      element.type === 'image' ||
      element.opacity === 0
    ) {
      continue
    }
    const colors = [
      element.strokeColor,
      SHAPES.has(element.type) || element.type === 'line' ? element.backgroundColor : null
    ]
    for (const color of colors) {
      const hue = visible(color) ? hueOf(color) : null
      if (!hue) {
        continue
      }
      const role = element.customData?.asterDesign
      const meaning = element.customData?.asterSwatch
        ? 'data'
        : isSemanticColor(color)
          ? 'right/wrong'
          : role === 'focus'
            ? 'focus'
            : role === 'dim'
              ? 'dimension'
              : role === 'data'
                ? 'data'
                : (names.get(color.toLowerCase()) ?? 'undeclared')
      found.push({ h: hue.h, color, meaning, owner: element.customData?.asterKit ?? element.id })
    }
  }
  const clusters = []
  for (const entry of found.toSorted((first, second) => first.h - second.h)) {
    const last = clusters.at(-1)
    if (last && entry.h - last.h <= 25) {
      last.entries.push(entry)
      last.h = entry.h
    } else {
      clusters.push({ h: entry.h, entries: [entry] })
    }
  }
  if (clusters.length > 1 && clusters[0].entries[0].h + 360 - clusters.at(-1).h <= 25) {
    clusters[0].entries.push(...clusters.pop().entries)
  }
  const hues = clusters.map((cluster) => {
    const counts = new Map()
    for (const entry of cluster.entries) {
      counts.set(entry.color, (counts.get(entry.color) ?? 0) + 1)
    }
    const owners = [...new Set(cluster.entries.map((entry) => entry.owner))]
    return {
      color: [...counts.entries()].toSorted((first, second) => second[1] - first[1])[0][0],
      meanings: [...new Set(cluster.entries.map((entry) => entry.meaning))],
      items: owners
    }
  })
  const sameHue = elements.filter((element) => {
    if (element.isDeleted || !SHAPES.has(element.type) || element.customData?.asterSwatch) {
      return false
    }
    const fill = hueOf(element.backgroundColor)
    const stroke = visible(element.strokeColor) ? hueOf(element.strokeColor) : null
    return Boolean(fill && stroke && hueDistance(fill.h, stroke.h) < 30 && stroke.L < fill.L - 0.1)
  })
  return {
    declared: Boolean(design),
    hues,
    sameHueOutline: [
      ...new Set(sameHue.map((element) => element.customData?.asterKit ?? element.id))
    ]
  }
}

/** A box style: fill kind, outline kind and weight, dash, corners (hue aside). */
function boxStyle(element) {
  const fill = visible(element.backgroundColor) ? hexToOklch(element.backgroundColor) : null
  const fillKind = !fill
    ? 'no fill'
    : element.backgroundColor.toLowerCase() === '#ffffff'
      ? 'white'
      : fill.C >= 0.03
        ? 'tint'
        : fill.L >= 0.85
          ? 'light gray'
          : 'gray'
  const stroke = visible(element.strokeColor) ? hexToOklch(element.strokeColor) : null
  const strokeKind = !stroke ? 'no outline' : stroke.C >= 0.03 ? 'coloured outline' : 'outline'
  const weight = stroke && element.strokeWidth > PAPER_STROKE ? ' heavy' : ''
  const dash =
    element.strokeStyle && element.strokeStyle !== 'solid' ? ` ${element.strokeStyle}` : ''
  return `${fillKind}, ${strokeKind}${weight}${dash}`
}

/**
 * Rows (or columns) of peers: items whose centres line up (or, with `edge`, whose tops or left
 * edges do: a column of photos set flush left) and that sit near each other.
 */
function lines(items, axis, edge = false) {
  const centre = (item) =>
    edge
      ? axis === 'row'
        ? item.bounds.y
        : item.bounds.x
      : axis === 'row'
        ? item.bounds.y + item.bounds.height / 2
        : item.bounds.x + item.bounds.width / 2
  const along = (item) => (axis === 'row' ? item.bounds.x : item.bounds.y)
  const groups = []
  for (const item of items.toSorted((first, second) => centre(first) - centre(second))) {
    const group = groups.find((entry) => Math.abs(centre(entry[0]) - centre(item)) <= 3)
    if (group) {
      group.push(item)
    } else {
      groups.push([item])
    }
  }
  // Why runs: two boxes level with each other in different panels are not peers; a row is a
  // run of neighbours at most 64 units apart.
  const end = (item) => (axis === 'row' ? item.bounds.right : item.bounds.bottom)
  const runs = []
  for (const group of groups) {
    const sorted = group.toSorted((first, second) => along(first) - along(second))
    let run = [sorted[0]]
    for (const item of sorted.slice(1)) {
      if (along(item) - end(run.at(-1)) <= 64) {
        run.push(item)
      } else {
        runs.push(run)
        run = [item]
      }
    }
    runs.push(run)
  }
  return runs.filter((run) => run.length >= 2)
}

/** Gaps between neighbours of a row or column, up to 96 units (farther apart is not a run). */
function gaps(group, axis) {
  const values = []
  for (let index = 1; index < group.length; index += 1) {
    const before = group[index - 1].bounds
    const after = group[index].bounds
    const gap = axis === 'row' ? after.x - before.right : after.y - before.bottom
    if (gap > 0 && gap <= 96) {
      values.push(gap)
    }
  }
  return values
}

/** Free texts set beside pictures as their captions, and a text like them with no picture. */
function orphanCaptions(items) {
  const pictures = items.filter((item) => item.kind === 'picture')
  const texts = items.filter((item) => item.kind === 'text' || item.kind === 'math')
  const near = (text) =>
    pictures.some((picture) => {
      const a = text.bounds
      const b = picture.bounds
      const dx = Math.max(0, b.x - a.right, a.x - b.right)
      const dy = Math.max(0, b.y - a.bottom, a.y - b.bottom)
      return dx <= 24 && dy <= 24
    })
  const size = (item) => item.elements[0]?.fontSize ?? 16
  const captions = texts.filter(near)
  return texts.filter(
    (text) =>
      !near(text) &&
      captions.some(
        (caption) =>
          size(caption) === size(text) &&
          Math.abs(caption.bounds.x - text.bounds.x) <= 4 &&
          caption.words.join(' ').split(/\s+/).length >= 3 &&
          text.words.join(' ').split(/\s+/).length >= 3
      )
  )
}

/** The craft counts: box styles, text sizes, peers, gaps, token chips, photos, orphan captions. */
export function craftMeasure(elements, items) {
  const boxes = items.filter((item) => ['box', 'card'].includes(item.kind))
  const styles = new Map()
  const styleOf = (element, id) => {
    const key = boxStyle(element)
    styles.set(key, [...(styles.get(key) ?? []), id])
  }
  for (const item of boxes) {
    styleOf(item.head, item.id)
  }
  for (const item of items.filter((entry) => entry.kind === 'tokens' && entry.chips.length)) {
    styleOf(item.chips[0], item.id)
  }
  const sizes = new Map()
  for (const element of elements) {
    if (element.isDeleted) {
      continue
    }
    const size =
      element.type === 'text'
        ? element.fontSize
        : element.customData?.asterTex
          ? element.customData.asterTexSize
          : null
    if (Number.isFinite(size)) {
      sizes.set(size, (sizes.get(size) ?? 0) + 1)
    }
  }
  const mixed = boxes.filter(
    (item) =>
      new Set(item.elements.filter((e) => e.type === 'text').map((e) => e.fontSize)).size > 1
  )
  const unequal = []
  const gapValues = []
  for (const axis of ['row', 'column']) {
    // Why not the focus: it is meant to stand out from its row.
    const plain = boxes.filter((item) => item.kind === 'box' && item.role !== 'focus')
    for (const group of lines(plain, axis)) {
      const run = gaps(group, axis)
      gapValues.push(...run)
      // Why only neighbours: a row's peers stand within a box's width of each other.
      const span = group.map((item) => (axis === 'row' ? item.bounds.height : item.bounds.width))
      // Why at most 2×: a small Q box over a wide Linear is another kind of part, not a peer.
      if (run.length && ratio(span) > DESIGN_LIMITS.peerRatio && ratio(span) <= 2) {
        unequal.push({
          axis,
          ids: group.map((item) => item.id),
          ratio: Math.round(ratio(span) * 100) / 100
        })
      }
    }
  }
  const photos = []
  for (const axis of ['row', 'column']) {
    const pictures = items.filter((item) => item.kind === 'picture' && item.role !== 'focus')
    // Why the photo alone: a label above one picture is not a bigger picture.
    const photo = (item) => {
      const shown = item.elements.filter(
        (element) => element.type === 'image' && element.customData?.asterPhoto
      )
      const box = shown.length ? elementBounds(shown[0]) : item.bounds
      return box.width * box.height
    }
    const seen = new Set()
    for (const group of [...lines(pictures, axis), ...lines(pictures, axis, true)]) {
      const areas = group.map(photo)
      const key = group.map((item) => item.id).join('|')
      if (ratio(areas) > 1.2 && !seen.has(key)) {
        seen.add(key)
        photos.push({
          axis,
          ids: group.map((item) => item.id),
          ratio: Math.round(ratio(areas) * 100) / 100
        })
      }
    }
  }
  const stacked = items.filter((item) => {
    if (item.kind !== 'tokens' || item.chips.length < 3) {
      return false
    }
    const ys = new Set(item.chips.map((chip) => round(chip.y, 4)))
    const xs = new Set(item.chips.map((chip) => round(chip.x, 4)))
    return ys.size > xs.size
  })
  const dashed = boxes.filter(
    (item) => item.head.strokeStyle === 'dashed' && visible(item.head.strokeColor)
  )
  const steps = [...new Set(gapValues.map((gap) => round(gap, 4)))].toSorted((a, b) => a - b)
  return {
    boxStyles: [...styles.entries()].map(([style, ids]) => ({ style, ids })),
    textSizes: [...sizes.entries()]
      .toSorted((a, b) => a[0] - b[0])
      .map(([size, count]) => ({ size, count })),
    mixedInBox: mixed.map((item) => item.id),
    unequalPeers: unequal,
    gapSteps: steps,
    mixedPhotos: photos,
    stackedTokens: stacked.map((item) => item.id),
    dashedBoxes: dashed.map((item) => item.id),
    orphanCaptions: orphanCaptions(items).map((item) => item.id)
  }
}

/** Everything the design checks and the critique read, for one scene's elements. */
export function designSummary(elements) {
  const live = elements.filter((element) => !element.isDeleted)
  const frame = designFrame(live)
  const design = pageDesign(frame)
  const page = figurePage(live)
  const items = designItems(live)
  return {
    design,
    items,
    focus: focusMeasure(items, design),
    colours: colourMeasure(live, page, design),
    craft: craftMeasure(live, items),
    bounds: (id) => {
      const item = items.find((entry) => entry.id === id)
      return item ? item.bounds : elementBounds(live.find((element) => element.id === id))
    }
  }
}
