import { readAsterRoute } from './research-figure-element-meta'
import { routeRebound } from './research-figure-connector-edit'
import {
  isOrthogonal,
  routeOrthogonal,
  sideFraction,
  sideOfMove,
  type Point,
  type RouteEnd,
  type Side
} from './research-figure-orthogonal-route'
import { moved, type SettleContext as Context } from './research-figure-settle-context'
import {
  absolutePoints,
  bindingOf,
  rememberedRoute,
  routeKey,
  samePoints,
  type Seen,
  type SettleElement
} from './research-figure-settle-state'

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

/** Re-routes a connector whose ends moved, or re-glues one dropped on another shape. */
export function settleArrow(context: Context, element: SettleElement): void {
  const before = context.memory.seen.get(element.id)
  const now = context.state.get(element.id)
  const startId = element.startBinding?.elementId ?? null
  const endId = element.endBinding?.elementId ?? null
  if (!before?.points || !now?.points || now.isDeleted || element.elbowed || !(startId || endId)) {
    return
  }
  const binding = bindingOf(element)
  const rebound = before.binding !== null && binding !== before.binding
  // Why the fit check: an undo puts the old ends and path back together, and that path stays.
  if (
    rebound &&
    !context.options.gesture &&
    !connectorFits(context, element, absolutePoints(now))
  ) {
    // Why before the person's-own-arrow check: an end dropped on another shape is re-glued at
    // right angles, not left as a diagonal through whatever lies between.
    reglue(context, element, before, now)
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

function reglue(context: Context, element: SettleElement, before: Seen, now: Seen): void {
  const [startWas, endWas] = (before.binding ?? '|').split('|')
  const end = (id: string | null, was: string) => {
    const shape = id ? context.state.get(id) : null
    return {
      box: shape && !shape.isDeleted ? shape : null,
      round: ROUND.has((id && context.state.byId.get(id)?.type) || ''),
      changed: (id ?? '') !== was
    }
  }
  const gap = element.startBinding?.gap ?? element.endBinding?.gap ?? 4
  const next = routeRebound(
    absolutePoints(before),
    absolutePoints(now),
    end(element.startBinding?.elementId ?? null, startWas),
    end(element.endBinding?.elementId ?? null, endWas),
    gap
  )
  if (!next) {
    return
  }
  const [x, y] = next[0]
  const points = next.map(([px, py]) => [px - x, py - y] as const)
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
