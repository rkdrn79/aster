import {
  attachmentOf,
  type AsterAttachAnchor,
  type FollowerKind,
  type MetaElement
} from './research-figure-element-meta'
import type { Point } from './research-figure-orthogonal-route'

/** The element fields settling reads; Excalidraw elements and plain test objects both fit. */
export type SettleElement = MetaElement & {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly version: number
  readonly fontSize?: number
  readonly text?: string
  readonly points?: readonly (readonly [number, number])[]
  readonly elbowed?: boolean
  readonly startBinding?: { readonly elementId: string; readonly gap?: number } | null
  readonly endBinding?: { readonly elementId: string; readonly gap?: number } | null
}

export type SettleUpdate = {
  x?: number
  y?: number
  width?: number
  height?: number
  fontSize?: number
  points?: Point[]
  isDeleted?: boolean
}

/** An element as it was the last time the canvas settled. */
export type Seen = {
  version: number
  x: number
  y: number
  width: number
  height: number
  fontSize: number | null
  text: string | null
  points: Point[] | null
  isDeleted: boolean
}

/** A follower's place on its owner: centre offset from the anchor, and the size it keeps. */
export type Link = {
  to: string
  anchor: AsterAttachAnchor
  kind: FollowerKind
  dx: number
  dy: number
  width: number
  height: number
  fontSize: number | null
  /** For arrow labels: which way the arrow ran where the label sits. */
  axis: 'h' | 'v' | null
}

/** A connector's path for one placement of its two shapes, so an undo gets it back exactly. */
export type RememberedRoute = { key: string; x: number; y: number; points: Point[] }

export type SettleMemory = {
  seen: Map<string, Seen>
  links: Map<string, Link>
  routes: Map<string, RememberedRoute[]>
}

export function createSettleMemory(): SettleMemory {
  return { seen: new Map(), links: new Map(), routes: new Map() }
}

const ROUTES_KEPT = 24

/** Where a connector's two shapes sit, as a lookup key. */
export function routeKey(
  start: { x: number; y: number; width: number; height: number } | null,
  end: { x: number; y: number; width: number; height: number } | null
): string {
  const part = (box: typeof start) =>
    box ? [box.x, box.y, box.width, box.height].map((n) => n.toFixed(2)).join(',') : '-'
  return `${part(start)}|${part(end)}`
}

export function rememberedRoute(
  memory: SettleMemory,
  arrowId: string,
  key: string
): RememberedRoute | null {
  return memory.routes.get(arrowId)?.find((route) => route.key === key) ?? null
}

function rememberRoutes(memory: SettleMemory, elements: readonly SettleElement[]): void {
  const byId = new Map(elements.map((element) => [element.id, element]))
  for (const arrow of elements) {
    const startId = arrow.startBinding?.elementId
    const endId = arrow.endBinding?.elementId
    if (arrow.type !== 'arrow' || arrow.isDeleted || !arrow.points || !(startId || endId)) {
      continue
    }
    const key = routeKey((startId && byId.get(startId)) || null, (endId && byId.get(endId)) || null)
    const kept = (memory.routes.get(arrow.id) ?? []).filter((route) => route.key !== key)
    const points = arrow.points.map(([x, y]) => [x, y] as const)
    memory.routes.set(
      arrow.id,
      [{ key, x: arrow.x, y: arrow.y, points }, ...kept].slice(0, ROUTES_KEPT)
    )
  }
}

export function seenOf(element: SettleElement): Seen {
  return {
    version: element.version,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    fontSize: element.fontSize ?? null,
    text: element.text ?? null,
    points: element.points ? element.points.map(([x, y]) => [x, y] as const) : null,
    isDeleted: Boolean(element.isDeleted)
  }
}

/** The working copy settling edits: each element's geometry with the updates made so far. */
export class SettleState {
  readonly byId: Map<string, SettleElement>
  readonly updates = new Map<string, SettleUpdate>()
  private readonly geometry = new Map<string, Seen>()

  constructor(elements: readonly SettleElement[]) {
    this.byId = new Map(elements.map((element) => [element.id, element]))
    for (const element of elements) {
      this.geometry.set(element.id, seenOf(element))
    }
  }

  get(id: string): Seen | null {
    return this.geometry.get(id) ?? null
  }

  update(id: string, update: SettleUpdate): void {
    const current = this.geometry.get(id)
    if (!current) {
      return
    }
    const next: Seen = {
      ...current,
      ...(update.x === undefined ? {} : { x: update.x }),
      ...(update.y === undefined ? {} : { y: update.y }),
      ...(update.width === undefined ? {} : { width: update.width }),
      ...(update.height === undefined ? {} : { height: update.height }),
      ...(update.fontSize === undefined ? {} : { fontSize: update.fontSize }),
      ...(update.points === undefined ? {} : { points: update.points }),
      ...(update.isDeleted === undefined ? {} : { isDeleted: update.isDeleted })
    }
    if (sameGeometry(current, next) && current.isDeleted === next.isDeleted) {
      return
    }
    this.geometry.set(id, next)
    this.updates.set(id, { ...this.updates.get(id), ...update })
  }
}

const near = (a: number, b: number, tolerance = 0.01): boolean => Math.abs(a - b) <= tolerance

export function samePoints(a: readonly Point[] | null, b: readonly Point[] | null): boolean {
  if (!a || !b) {
    return a === b
  }
  return (
    a.length === b.length &&
    a.every((point, i) => near(point[0], b[i][0]) && near(point[1], b[i][1]))
  )
}

export function sameGeometry(a: Seen, b: Seen): boolean {
  return (
    near(a.x, b.x) &&
    near(a.y, b.y) &&
    near(a.width, b.width) &&
    near(a.height, b.height) &&
    a.fontSize === b.fontSize &&
    samePoints(a.points, b.points)
  )
}

export function sameSize(a: Seen, b: { width: number; height: number; fontSize: number | null }) {
  return near(a.width, b.width, 0.05) && near(a.height, b.height, 0.05) && a.fontSize === b.fontSize
}

export function absolutePoints(seen: Seen): Point[] {
  return (seen.points ?? []).map(([x, y]) => [seen.x + x, seen.y + y] as const)
}

/** The midpoint along a path, and which way the path runs there. */
export function pathMiddle(points: readonly Point[]): { point: Point; axis: 'h' | 'v' } {
  const lengths = points
    .slice(1)
    .map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (const [i, length] of lengths.entries()) {
    const [a, b] = [points[i], points[i + 1]]
    const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'h' : 'v'
    if (remaining <= length || i === lengths.length - 1) {
      const f = length ? Math.min(1, remaining / length) : 0
      return { point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], axis }
    }
    remaining -= length
  }
  return { point: points[0] ?? [0, 0], axis: 'h' }
}

/** Where a follower's anchor sits on its owner. */
export function anchorPoint(
  owner: Seen,
  anchor: AsterAttachAnchor
): { point: Point; axis: 'h' | 'v' | null } {
  switch (anchor) {
    case 'top-right':
      return { point: [owner.x + owner.width, owner.y], axis: null }
    case 'top-left':
      return { point: [owner.x, owner.y], axis: null }
    case 'offset':
      return { point: [owner.x + owner.width / 2, owner.y + owner.height / 2], axis: null }
    case 'arrow-mid':
      return owner.points ? pathMiddle(absolutePoints(owner)) : anchorPoint(owner, 'offset')
  }
}

/** A link from where the follower sits now. */
export function linkFrom(
  follower: Seen,
  owner: Seen,
  attachment: { to: string; anchor: AsterAttachAnchor; kind: FollowerKind }
): Link {
  const { point, axis } = anchorPoint(owner, attachment.anchor)
  return {
    ...attachment,
    dx: follower.x + follower.width / 2 - point[0],
    dy: follower.y + follower.height / 2 - point[1],
    width: follower.width,
    height: follower.height,
    fontSize: follower.fontSize,
    axis
  }
}

/** Links for followers not yet linked; drops links whose follower or owner went away. */
export function refreshLinks(memory: SettleMemory, state: SettleState): void {
  for (const [id, link] of memory.links) {
    const follower = state.get(id)
    const owner = state.get(link.to)
    if (!follower || !owner) {
      memory.links.delete(id)
    }
  }
  for (const element of state.byId.values()) {
    if (memory.links.has(element.id) || element.isDeleted) {
      continue
    }
    const attachment = attachmentOf(element, state.byId)
    const follower = state.get(element.id)
    const owner = attachment ? state.get(attachment.to) : null
    if (attachment && follower && owner) {
      memory.links.set(element.id, linkFrom(follower, owner, attachment))
    }
  }
}

/** Records the scene as settled: the next change is measured from here. */
export function commitSettled(memory: SettleMemory, elements: readonly SettleElement[]): void {
  const ids = new Set<string>()
  for (const element of elements) {
    ids.add(element.id)
    memory.seen.set(element.id, seenOf(element))
  }
  rememberRoutes(memory, elements)
  for (const [id, seen] of memory.seen) {
    // Why keep deleted ones: an undo can bring back what a replacement took off the canvas.
    if (!ids.has(id) && !seen.isDeleted) {
      memory.seen.delete(id)
    }
  }
}

/** Forgets everything: the scene was replaced (an agent's version, a reload). */
export function baselineSettled(memory: SettleMemory, elements: readonly SettleElement[]): void {
  memory.seen.clear()
  memory.links.clear()
  memory.routes.clear()
  commitSettled(memory, elements)
  refreshLinks(memory, new SettleState(elements))
}

/**
 * The scene was replaced on a canvas already settled: what is there now is settled, and what the
 * replacement took away is remembered as deleted. An undo that brings it back (Excalidraw then
 * re-binds arrow ends, sometimes off the axis) is settled like any other change.
 */
export function rebaselineSettled(memory: SettleMemory, elements: readonly SettleElement[]): void {
  const present = new Set(elements.map((element) => element.id))
  const gone = [...memory.seen].filter(([id]) => !present.has(id))
  baselineSettled(memory, elements)
  for (const [id, seen] of gone) {
    memory.seen.set(id, { ...seen, isDeleted: true })
  }
}
