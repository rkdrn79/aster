// A return path in the nearest clear band: `arrow({ route: 'under' | 'over' })` leaves its source
// from the bottom (top), runs level just clear of everything between its ends, and comes up
// (down) into the part it updates. Published figures keep a gradient or a feedback this close to
// the row, never as a loop round the whole figure.
import { elementBounds } from './research-figures-geometry.mjs'

export const CORRIDOR_ROUTES = ['under', 'over']
/** Units between the band and the lowest (highest) thing it passes. */
const CLEARANCE = 12

const shown = (element) =>
  element.type === 'text' ||
  element.type === 'image' ||
  [element.strokeColor, element.backgroundColor].some(
    (color) => typeof color === 'string' && color !== 'transparent' && color !== 'none'
  )

/** Where an end leaves its box along x: `{ x }` as a share (0–1) or a coordinate, else the centre. */
function endX(box, at) {
  const x = at && typeof at === 'object' ? at.x : undefined
  if (!Number.isFinite(x)) {
    return box.x + box.width / 2
  }
  return x >= 0 && x <= 1 ? box.x + x * box.width : x
}

/** The arrow spec with the band's corners as `via`, or the spec as given for any other route. */
export function withCorridor(spec, core) {
  if (!CORRIDOR_ROUTES.includes(spec.route)) {
    return spec
  }
  if (typeof spec.from !== 'string' || typeof spec.to !== 'string') {
    throw new Error(`arrow ${spec.id}: route '${spec.route}' joins two items given by id`)
  }
  const under = spec.route === 'under'
  const a = core.bounds(spec.from)
  const b = core.bounds(spec.to)
  const ax = endX(a, spec.fromAt)
  const bx = endX(b, spec.toAt)
  const [lo, hi] = [Math.min(ax, bx), Math.max(ax, bx)]
  const own = new Set(
    [spec.id, ...core.owned(spec.from), ...core.owned(spec.to)].map((item) => item.id ?? item)
  )
  const blockers = core.elements
    .filter((element) => !element.isDeleted && element.type !== 'frame' && !own.has(element.id))
    .filter((element) => !(element.customData?.asterKit === spec.id) && shown(element))
    .map(elementBounds)
    .filter((box) => box.right > lo - 4 && box.x < hi + 4)
  let y = under ? Math.max(a.bottom, b.bottom) + CLEARANCE : Math.min(a.y, b.y) - CLEARANCE
  for (let step = 0; step < blockers.length + 1; step += 1) {
    const hit = blockers.find((box) => box.y - CLEARANCE / 2 < y && box.bottom + CLEARANCE / 2 > y)
    if (!hit) {
      break
    }
    y = under ? hit.bottom + CLEARANCE : hit.y - CLEARANCE
  }
  const side = under ? 'bottom' : 'top'
  return {
    ...spec,
    route: undefined,
    fromSide: side,
    toSide: side,
    fromAt: spec.fromAt ?? { x: ax },
    toAt: spec.toAt ?? { x: bx },
    via: [
      [ax, y],
      [bx, y]
    ]
  }
}
