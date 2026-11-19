import { fitPanels, isPanelElement, refreshPanels } from './research-figure-panel-fit'
import { settleArrow } from './research-figure-settle-arrows'
import {
  moved,
  resized,
  type SettleContext,
  type SettleOptions
} from './research-figure-settle-context'
import {
  SettleState,
  anchorPoint,
  linkFrom,
  refreshLinks,
  sameSize,
  type Link,
  type Seen,
  type SettleElement,
  type SettleMemory,
  type SettleUpdate
} from './research-figure-settle-state'

/** Room kept between a box's label and its outline when the box grows to fit it. */
const PAD_X = 8
const PAD_Y = 6

export type { SettleOptions } from './research-figure-settle-context'

type Context = SettleContext

/** Puts a follower at its link: same size it had, centred on anchor + offset. */
function place(context: Context, id: string, link: Link, owner: Seen): void {
  const anchor = anchorPoint(owner, link.anchor)
  let { dx, dy } = link
  if (link.axis && anchor.axis && link.axis !== anchor.axis) {
    // Why: the arrow turned under its label; keep the same clearance on the new side.
    const clearance =
      link.axis === 'h' ? Math.abs(dy) - link.height / 2 : Math.abs(dx) - link.width / 2
    dx = anchor.axis === 'v' ? Math.max(0, clearance) + link.width / 2 : 0
    dy = anchor.axis === 'h' ? -(Math.max(0, clearance) + link.height / 2) : 0
  }
  context.state.update(id, {
    x: anchor.point[0] + dx - link.width / 2,
    y: anchor.point[1] + dy - link.height / 2,
    width: link.width,
    height: link.height,
    ...(link.fontSize === null ? {} : { fontSize: link.fontSize })
  })
}

function relink(context: Context, id: string, link: Link): void {
  const follower = context.state.get(id)
  const owner = context.state.get(link.to)
  if (follower && owner) {
    context.memory.links.set(id, linkFrom(follower, owner, link))
  }
}

/** One follower after its owner (maybe) changed: follow, keep its size, or take a new place. */
function settleFollower(context: Context, id: string, link: Link): void {
  const owner = context.state.get(link.to)
  const follower = context.state.get(id)
  if (!owner || !follower || follower.isDeleted) {
    return
  }
  if (owner.isDeleted) {
    context.state.update(id, { isDeleted: true })
    return
  }
  const ownerMoved = moved(context, link.to)
  const followerChanged = context.changed.has(id)
  // Why: mid-resize, Excalidraw re-scales the selected labels even on moves that leave the box
  // as it was, so a selected owner counts as resized for the whole gesture.
  const ownerResizing = Boolean(context.options.resizing && context.options.selected?.has(link.to))
  if (ownerResizing && followerChanged && !sameSize(follower, link)) {
    place(context, id, link, owner)
    return
  }
  const contentEdited =
    link.kind === 'box-label' &&
    followerChanged &&
    !ownerMoved &&
    follower.fontSize === link.fontSize &&
    !sameSize(follower, link)
  if (contentEdited) {
    // Why: a label grows from its left edge as it is typed (or its TeX re-typeset); keep it
    // centred on the box.
    const sized = { ...link, width: follower.width, height: follower.height }
    context.memory.links.set(id, sized)
    place(context, id, sized, owner)
    return
  }
  if (!ownerMoved) {
    if (followerChanged) {
      relink(context, id, link)
    }
    return
  }
  if (!followerChanged) {
    place(context, id, link, owner)
    return
  }
  // Both changed: a group resize scales a label's type with its box (keep its point size);
  // anything else moved them together on purpose (a drag, an undo of a text size that grew the
  // box), so the follower keeps where and how big it is.
  if (resized(context, link.to) && scaledWithOwner(context, follower, link)) {
    place(context, id, link, owner)
  } else {
    relink(context, id, link)
  }
}

/** True when a label's type changed by the factor its owner's box did, as a group resize does. */
function scaledWithOwner(context: Context, follower: Seen, link: Link): boolean {
  const before = context.memory.seen.get(link.to)
  const owner = context.state.get(link.to)
  if (!before || !owner || follower.fontSize === null || !link.fontSize) {
    return false
  }
  const type = follower.fontSize / link.fontSize
  if (Math.abs(type - 1) < 1e-6) {
    return false
  }
  const ratios = [
    before.width > 0 ? owner.width / before.width : 0,
    before.height > 0 ? owner.height / before.height : 0
  ]
  return ratios.some((ratio) => Math.abs(ratio - type) <= 0.02 * type)
}

/** Grows a box around its centre when its label no longer fits. */
function fitBox(context: Context, ownerId: string, labels: readonly string[]): void {
  const owner = context.state.get(ownerId)
  const rects = labels.flatMap((id) => {
    const label = context.state.get(id)
    return label && !label.isDeleted ? [label] : []
  })
  if (!owner || owner.isDeleted || !rects.length) {
    return
  }
  const left = Math.min(...rects.map((rect) => rect.x))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const top = Math.min(...rects.map((rect) => rect.y))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  const cx = owner.x + owner.width / 2
  const cy = owner.y + owner.height / 2
  const width = Math.max(owner.width, 2 * Math.max(cx - left, right - cx) + 2 * PAD_X)
  const height = Math.max(owner.height, 2 * Math.max(cy - top, bottom - cy) + 2 * PAD_Y)
  if (width > owner.width + 0.5 || height > owner.height + 0.5) {
    context.state.update(ownerId, {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height
    })
  }
}

function settleBoxes(context: Context, followers: readonly [string, Link][]): void {
  const byOwner = new Map<string, string[]>()
  for (const [id, link] of followers) {
    byOwner.set(link.to, [...(byOwner.get(link.to) ?? []), id])
  }
  for (const [ownerId, labels] of byOwner) {
    const edited = labels.some((id) => {
      const seen = context.memory.seen.get(id)
      const now = context.state.get(id)
      return Boolean(seen && now && (seen.text !== now.text || !sameSize(now, seen)))
    })
    for (const id of labels) {
      const link = context.memory.links.get(id)
      if (link) {
        settleFollower(context, id, link)
      }
    }
    if (edited || resized(context, ownerId)) {
      fitBox(context, ownerId, labels)
    }
  }
}

function settleChanged(
  context: Context,
  elements: readonly SettleElement[],
  links: readonly [string, Link][]
): void {
  settleBoxes(
    context,
    links.filter(([, link]) => link.kind === 'box-label')
  )
  for (const [id, link] of links.filter(([, l]) => l.kind === 'badge' || l.kind === 'title')) {
    settleFollower(context, id, link)
  }
  for (const element of elements) {
    if (element.type === 'arrow') {
      settleArrow(context, element)
    }
  }
  for (const [id, link] of links.filter(
    ([, l]) => l.kind === 'arrow-label' || l.kind === 'other'
  )) {
    settleFollower(context, id, link)
  }
}

/**
 * Keeps an edited figure whole: labels and badges follow their shapes, kit labels keep their
 * point size through a resize, boxes grow to fit an edited label, and connectors bound to a moved
 * shape re-route with horizontal and vertical segments. Returns the element updates to apply.
 */
export function settleFigure(
  elements: readonly SettleElement[],
  memory: SettleMemory,
  options: SettleOptions = {}
): Map<string, SettleUpdate> {
  const state = new SettleState(elements)
  const changed = new Set(
    elements
      .filter((element) => {
        const seen = memory.seen.get(element.id)
        return seen && seen.version !== element.version
      })
      .map((element) => element.id)
  )
  const context: Context = { memory, state, changed, options }
  // Why before any update: a panel counts as the person's own edit only if it changed itself.
  const panelsMoved = new Set(
    elements
      .filter((element) => isPanelElement(element) && moved(context, element.id))
      .map((element) => element.id)
  )
  const personMoved = (id: string): boolean => panelsMoved.has(id)
  // Why the scene before the edit: a panel first seen now is learned as it was drawn.
  refreshPanels(memory, state, () => false, {
    geometry: (id) => memory.seen.get(id),
    gesture: options.gesture
  })
  const links = [...memory.links.entries()]
  if (changed.size) {
    settleChanged(context, elements, links)
  }
  // Why also with nothing changed: a drag settles as it goes, and its panels grow when it ends.
  if (!options.gesture) {
    const grown = new Set(fitPanels(memory, state, personMoved))
    for (const [id, link] of links.filter(([, l]) => l.kind === 'title' && grown.has(l.to))) {
      settleFollower(context, id, link)
    }
  }
  refreshLinks(memory, state)
  refreshPanels(memory, state, personMoved, { gesture: options.gesture })
  return state.updates
}
