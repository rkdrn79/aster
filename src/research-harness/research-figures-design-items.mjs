// What the design checks look at: a scene's elements grouped into the items the kit drew (a box
// with its label, a token strip, a picture, an arrow with its label, a free text, typeset math),
// each with its kind, bounds, words and design role. Shared by the design lint, the
// say-it-once lint and `figures critique`. Pure.
import { elementBounds } from './research-figures-geometry.mjs'
import { PAGE_FRAME_ID } from './research-figures-model.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const LINES = new Set(['arrow', 'line', 'freedraw'])
const visible = (color) =>
  typeof color === 'string' && color !== 'transparent' && color !== 'none' && color !== ''

/** The union of bounds. */
export function unionBounds(boxes) {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right ?? box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.bottom ?? box.y + box.height))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

const chipOf = (element, owner) =>
  element.id !== owner &&
  new RegExp(`^${owner.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(element.id) &&
  (element.groupIds ?? []).includes(`${owner}-glyph`)

/** An item's kind from its elements: what a reader would call it. */
function kindOf(owner, members, head) {
  if (head?.customData?.asterPanel) {
    return 'panel'
  }
  if (head?.customData?.asterCard) {
    return 'card'
  }
  if (members.some((element) => element.customData?.asterLegend)) {
    return 'legend'
  }
  if (members.some((element) => chipOf(element, owner))) {
    return 'tokens'
  }
  if (head && LINES.has(head.type) && !visible(head.backgroundColor)) {
    return 'arrow'
  }
  // Why before pictures: patches cut from a photo show what changes, not the photo again, and
  // generated art (fig.art) is a drawn glyph: one plane at every level is drawn, not repeated.
  if (head?.customData?.asterGrid || members.some((element) => element.customData?.asterArt)) {
    return 'glyph'
  }
  if (members.some((element) => element.type === 'image' && element.customData?.asterPhoto)) {
    return 'picture'
  }
  if (members.some((element) => element.customData?.asterPlot)) {
    return 'plot'
  }
  if (
    head &&
    SHAPES.has(head.type) &&
    (visible(head.strokeColor) || visible(head.backgroundColor))
  ) {
    if (head.customData?.asterGrid) {
      return 'glyph'
    }
    const small = Math.max(head.width, head.height) <= 32
    return head.type === 'ellipse' && small ? 'node' : 'box'
  }
  if (members.every((element) => element.type === 'text')) {
    return 'text'
  }
  if (members.every((element) => element.type === 'text' || element.customData?.asterTex)) {
    return 'math'
  }
  return 'glyph'
}

/** The words an item shows, in reading order: its texts and its typeset math. */
function wordsOf(members) {
  return members
    .filter((element) => element.type === 'text' || element.customData?.asterMath)
    .toSorted((first, second) => first.y - second.y || first.x - second.x)
    .map((element) => (element.type === 'text' ? element.text : element.customData.asterMath))
    .filter((text) => typeof text === 'string' && text.trim())
}

/**
 * The scene as items: { id, kind, head, elements, bounds, words, role } for every kit item (an
 * arrow's label belongs to its arrow, a box's label to its box), pages and areas left out.
 */
export function designItems(elements) {
  const live = elements.filter(
    (element) => !element.isDeleted && element.type !== 'frame' && element.id !== PAGE_FRAME_ID
  )
  const byId = new Map(live.map((element) => [element.id, element]))
  const groups = new Map()
  for (const element of live) {
    const container = element.containerId ? byId.get(element.containerId) : null
    const owner = container
      ? (container.customData?.asterKit ?? container.id)
      : (element.customData?.asterKit ?? element.id)
    groups.set(owner, [...(groups.get(owner) ?? []), element])
  }
  return [...groups.entries()].map(([id, members]) => {
    const head = byId.get(id) ?? members[0]
    const kind = kindOf(id, members, byId.get(id))
    const shown = members.filter(
      (element) =>
        element.type === 'text' ||
        element.type === 'image' ||
        visible(element.strokeColor) ||
        visible(element.backgroundColor)
    )
    const bounds = unionBounds((shown.length ? shown : members).map(elementBounds))
    // Why the head's role: a card whose highlight refers to the focus is not itself the focus.
    const roles = members.map((element) => element.customData?.asterDesign).filter(Boolean)
    const own = byId.get(id)?.customData?.asterDesign
    return {
      id,
      kind,
      head,
      elements: members,
      bounds,
      words: wordsOf(members),
      role:
        own ??
        (roles.length && roles.every((role) => role === 'focus') ? 'focus' : (roles[0] ?? 'plain')),
      chips: kind === 'tokens' ? members.filter((element) => chipOf(element, id)) : []
    }
  })
}

/** An item's area in square units (an arrow's is its length times a line's width). */
export function itemArea(item) {
  if (item.kind === 'arrow') {
    const points = item.head.points ?? []
    let length = 0
    for (let index = 1; index < points.length; index += 1) {
      length += Math.hypot(
        points[index][0] - points[index - 1][0],
        points[index][1] - points[index - 1][1]
      )
    }
    return length * 2
  }
  return item.bounds.width * item.bounds.height
}

/** The median of numbers (0 for none). */
export function median(values) {
  if (!values.length) {
    return 0
  }
  const sorted = values.toSorted((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Items that read as modules: boxes, cards, token strips, pictures and plots. */
export const PEER_KINDS = new Set(['box', 'tokens', 'picture', 'plot', 'card', 'glyph'])
