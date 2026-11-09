import { readAsterRoute } from './research-figure-element-meta'
import {
  isOrthogonal,
  routeOrthogonal,
  sideFraction,
  sideOfMove,
  type Point,
  type RouteEnd,
  type Side
} from './research-figure-orthogonal-route'
import {
  SettleState,
  absolutePoints,
  anchorPoint,
  linkFrom,
  refreshLinks,
  rememberedRoute,
  routeKey,
  sameGeometry,
  samePoints,
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

export type SettleOptions = {
  /** A resize gesture is under way (Excalidraw rescales the selection on every move). */
  resizing?: boolean
  selected?: ReadonlySet<string>
}

type Context = {
  memory: SettleMemory
  state: SettleState
  changed: ReadonlySet<string>
  options: SettleOptions
}

function moved(context: Context, id: string): boolean {
  const seen = context.memory.seen.get(id)
  const now = context.state.get(id)
  return Boolean(seen && now && !sameGeometry(seen, now))
}

function resized(context: Context, id: string): boolean {
  const seen = context.memory.seen.get(id)
  const now = context.state.get(id)
  return Boolean(seen && now && !sameSize(now, seen))
}

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
  // Both changed: a group resize scales a label's type (keep its point size); anything else
  // moved them together on purpose (a drag, an undo), so the follower keeps where it is.
  if (
    resized(context, link.to) &&
    follower.fontSize !== null &&
    follower.fontSize !== link.fontSize
  ) {
    place(context, id, link, owner)
  } else {
    relink(context, id, link)
  }
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

/** The end of a connector as it was: which side of which shape, and how far along. */
function routeEnd(
  context: Context,
  shapeId: string | null,
  path: readonly Point[],
  arriving: boolean
): RouteEnd | null {
  const [from, to] = arriving ? [path.at(-2), path.at(-1)] : [path[0], path[1]]
  if (!from || !to) {
    return null
  }
  const side: Side | null = sideOfMove(from, to, arriving)
  if (!side) {
    return null
  }
  const shape = shapeId ? context.state.get(shapeId) : null
  const before = shapeId ? context.memory.seen.get(shapeId) : null
  const kind = shapeId ? context.state.byId.get(shapeId)?.type : null
  if (!shape || !before || shape.isDeleted) {
    return { kind: 'point', point: arriving ? to : from, side }
  }
  const end = arriving ? to : from
  return {
    kind: 'shape',
    box: shape,
    side,
    t: sideFraction(before, side, end),
    round: kind === 'ellipse' || kind === 'diamond'
  }
}

const ROUND = new Set(['ellipse', 'diamond'])

/** True when a path end sits on `side` of a shape, its gap off the outline, within the side. */
function onSide(point: Point, box: Seen, side: Side, gap: number, round: boolean): boolean {
  const horizontalSide = side === 'left' || side === 'right'
  const [along, low, length] = horizontalSide
    ? [point[1], box.y, box.height]
    : [point[0], box.x, box.width]
  if (along < low - 0.5 || along > low + length + 0.5) {
    return false
  }
  const edge =
    side === 'left'
      ? box.x - point[0]
      : side === 'right'
        ? point[0] - box.x - box.width
        : side === 'top'
          ? box.y - point[1]
          : point[1] - box.y - box.height
  const depth = (horizontalSide ? box.width : box.height) / 2
  // Why: an ellipse or diamond's outline lies inside its box away from the side's middle.
  return round ? edge >= -depth && edge <= gap + 1.5 : Math.abs(edge - gap) <= 1.5
}

/** Axis-aligned, and each bound end sits its gap off the side it leaves or enters by. */
function connectorFits(context: Context, element: SettleElement, path: readonly Point[]): boolean {
  if (path.length < 2 || !isOrthogonal(path)) {
    return false
  }
  const gap = element.startBinding?.gap ?? element.endBinding?.gap ?? 4
  const last = path.at(-1) ?? path[0]
  const beforeLast = path.at(-2) ?? path[0]
  const ends = [
    {
      id: element.startBinding?.elementId,
      point: path[0],
      side: sideOfMove(path[0], path[1], false)
    },
    { id: element.endBinding?.elementId, point: last, side: sideOfMove(beforeLast, last, true) }
  ]
  return ends.every(({ id, point, side }) => {
    const shape = id ? context.state.get(id) : null
    if (!id || !shape || shape.isDeleted) {
      return true
    }
    const round = ROUND.has(context.state.byId.get(id)?.type ?? '')
    return side !== null && onSide(point, shape, side, gap, round)
  })
}

function settleArrow(context: Context, element: SettleElement): void {
  const before = context.memory.seen.get(element.id)
  const now = context.state.get(element.id)
  const startId = element.startBinding?.elementId ?? null
  const endId = element.endBinding?.elementId ?? null
  if (!before?.points || !now?.points || now.isDeleted || element.elbowed || !(startId || endId)) {
    return
  }
  const endsMoved = [startId, endId].some((id) => id !== null && moved(context, id))
  const arrowChanged = context.changed.has(element.id)
  if (!endsMoved && (!arrowChanged || context.options.selected?.has(element.id))) {
    // Why: an arrow the person is editing directly is theirs to shape.
    return
  }
  const path = absolutePoints(before)
  if (path.length < 2 || !(isOrthogonal(path) || readAsterRoute(element))) {
    return
  }
  const key = routeKey(
    startId ? context.state.get(startId) : null,
    endId ? context.state.get(endId) : null
  )
  // Why first: an undo puts the shapes back and Excalidraw then re-binds the ends; the path
  // they had there is the one to restore.
  const remembered = endsMoved ? rememberedRoute(context.memory, element.id, key) : null
  if (!remembered && connectorFits(context, element, absolutePoints(now))) {
    return
  }
  const next = remembered
    ? remembered.points.map(([px, py]) => [remembered.x + px, remembered.y + py] as const)
    : routeAgain(context, element, path, startId, endId)
  if (!next) {
    return
  }
  const [x, y] = next[0]
  const points = next.map(([px, py]) => [px - x, py - y] as const)
  if (samePoints(points, now.points) && Math.abs(now.x - x) < 0.01 && Math.abs(now.y - y) < 0.01) {
    return
  }
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  context.state.update(element.id, {
    x,
    y,
    points,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  })
}

function routeAgain(
  context: Context,
  element: SettleElement,
  path: readonly Point[],
  startId: string | null,
  endId: string | null
): Point[] | null {
  const start = routeEnd(context, startId, path, false)
  const end = routeEnd(context, endId, path, true)
  if (!start || !end) {
    return null
  }
  const route = readAsterRoute(element)
  const gap = element.startBinding?.gap ?? element.endBinding?.gap ?? 4
  return routeOrthogonal(start, end, gap, route === 'hv' || route === 'vh' ? route : null)
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
  if (!changed.size) {
    refreshLinks(memory, state)
    return state.updates
  }
  const context: Context = { memory, state, changed, options }
  const links = [...memory.links.entries()]
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
  refreshLinks(memory, state)
  return state.updates
}
