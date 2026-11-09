// Marks drawn on an arrow (the stop-gradient slashes and a direction chevron), split from
// research-figures-shapes.mjs to keep files short; shapes re-exports them.
import { FIGURE_LINE_WIDTH } from './research-figures-style.mjs'
import { makePolyline } from './research-figures-shapes.mjs'

/**
 * Two parallel slashes across an arrow at `at` (0–1 along it): stop-gradient. `size` (14) is a
 * slash's length, `spacing` (5) their distance, `angle` (60°) their lean off the arrow,
 * `direction` 1 or -1 which way they lean.
 */
export function makeStopGrad(arrow, spec = {}, random = Math.random) {
  const points = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py])
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = total * (spec.at ?? 0.5)
  let index = 0
  while (index < lengths.length - 1 && remaining > lengths[index]) {
    remaining -= lengths[index]
    index += 1
  }
  const [ax, ay] = points[index]
  const [bx, by] = points[index + 1]
  const length = lengths[index] || 1
  const ux = (bx - ax) / length
  const uy = (by - ay) / length
  const cx = ax + ux * remaining
  const cy = ay + uy * remaining
  const half = (spec.size ?? 14) / 2
  const angle = ((spec.angle ?? 60) * Math.PI) / 180
  const sign = spec.direction === -1 ? -1 : 1
  const dx = ux * half * Math.cos(angle) - sign * uy * half * Math.sin(angle)
  const dy = uy * half * Math.cos(angle) + sign * ux * half * Math.sin(angle)
  const spacing = (spec.spacing ?? 5) / 2
  const id = spec.id ?? `${arrow.id}-stopgrad`
  return [-spacing, spacing].map((shift, slash) =>
    makePolyline(
      {
        id: `${id}-${slash + 1}`,
        points: [
          [cx + ux * shift - dx, cy + uy * shift - dy],
          [cx + ux * shift + dx, cy + uy * shift + dy]
        ],
        color: spec.color ?? arrow.strokeColor,
        strokeWidth: spec.strokeWidth ?? Math.max(FIGURE_LINE_WIDTH, arrow.strokeWidth ?? 1),
        frame: arrow.frameId ?? null,
        groupIds: [`${id}-group`],
        customData: { asterMark: 'stop-grad' }
      },
      random
    )
  )
}

/**
 * An open chevron head for `arrow` (its end, or `at: 'start'`), `length` along the arrow and
 * `width` across, for heads Excalidraw draws only at fixed sizes.
 */
export function makeChevron(arrow, spec = {}, random = Math.random) {
  const absolute = arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py])
  const atStart = spec.at === 'start'
  const [tx, ty] = atStart ? absolute[0] : absolute.at(-1)
  const [px, py] = atStart ? absolute[1] : absolute.at(-2)
  const length = Math.hypot(tx - px, ty - py) || 1
  const ux = (tx - px) / length
  const uy = (ty - py) / length
  const back = spec.length ?? 8
  const half = (spec.width ?? 8) / 2
  return makePolyline(
    {
      id: spec.id ?? `${arrow.id}-head${spec.at === 'start' ? '-start' : ''}`,
      points: [
        [tx - ux * back - uy * half, ty - uy * back + ux * half],
        [tx, ty],
        [tx - ux * back + uy * half, ty - uy * back - ux * half]
      ],
      color: spec.color ?? arrow.strokeColor,
      strokeWidth: spec.strokeWidth ?? arrow.strokeWidth,
      frame: arrow.frameId ?? null,
      groupIds: spec.groupIds ?? []
    },
    random
  )
}
