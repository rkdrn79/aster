// Several wires at once, drawn so they do not cross: fig.bus (one wire per state component: port
// to port between boxes, from a box onto parallel rails, from rails into a box, or source i to
// target i) tries the port and turn orders and keeps the one that crosses least; fig.rails draws
// N parallel state lanes broken by the bars they run through (Mamba's B_t, A and C_t).
import { warnKit } from './research-figures-cards.mjs'
import { oneOf } from './research-figures-options.mjs'

const SIDES = ['left', 'right', 'top', 'bottom']
const upright = (side) => side === 'left' || side === 'right'
const list = (value) => (Array.isArray(value) ? value : [value])
const r2 = (value) => Math.round(value * 100) / 100

/** A point on `side` of a box at `at` (a share 0–1, or a scene coordinate above 1), `gap` out. */
function portOn(box, side, at, gap) {
  const along = upright(side)
    ? at <= 1
      ? box.y + at * box.height
      : at
    : at <= 1
      ? box.x + at * box.width
      : at
  return upright(side)
    ? [side === 'left' ? box.x - gap : box.right + gap, along]
    : [along, side === 'top' ? box.y - gap : box.bottom + gap]
}

/** n shares of a side, `spacing` units apart and centred, or the given ones. */
function shares(n, length, given, spacing) {
  if (given) {
    if (given.length !== n) {
      throw new Error(`bus: ${given.length} ports given for ${n} wires`)
    }
    return given
  }
  const step = Math.min(spacing ?? 16, length / (n + 1))
  return Array.from({ length: n }, (_, index) => 0.5 + ((index - (n - 1) / 2) * step) / length)
}

/** The side of `box` that faces `other`. */
function facing(box, other) {
  const dx = other.x + other.width / 2 - (box.x + box.width / 2)
  const dy = other.y + other.height / 2 - (box.y + box.height / 2)
  return Math.abs(dx) / (box.width || 1) >= Math.abs(dy) / (box.height || 1)
    ? dx < 0
      ? 'left'
      : 'right'
    : dy < 0
      ? 'top'
      : 'bottom'
}

function union(boxes) {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { x, y, right, bottom, width: right - x, height: bottom - y }
}

/** A straight line or arrow a wire can join or tap (a rail): its level and extent, or null. */
function railOf(element) {
  if (!element || (element.type !== 'line' && element.type !== 'arrow')) {
    return null
  }
  const points = (element.points ?? []).map(([px, py]) => [element.x + px, element.y + py])
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const flat = (values) => Math.max(...values) - Math.min(...values) < 0.5
  if (points.length < 2 || !(flat(ys) || flat(xs))) {
    return null
  }
  const horizontal = flat(ys)
  const along = horizontal ? xs : ys
  return {
    horizontal,
    level: horizontal ? ys[0] : xs[0],
    lo: Math.min(...along),
    hi: Math.max(...along)
  }
}

/** Whether two axis-parallel segments cross, or run along each other for more than a unit. */
export function segmentsMeet([a, b], [c, d]) {
  const flat = (p, q) => Math.abs(p[1] - q[1]) < 0.5
  const [h1, h2] = [flat(a, b), flat(c, d)]
  const span = (p, q, axis) => [Math.min(p[axis], q[axis]), Math.max(p[axis], q[axis])]
  if (h1 !== h2) {
    const [[p, q], [r, s]] = h1
      ? [
          [a, b],
          [c, d]
        ]
      : [
          [c, d],
          [a, b]
        ]
    const [x0, x1] = span(p, q, 0)
    const [y0, y1] = span(r, s, 1)
    return r[0] > x0 + 0.5 && r[0] < x1 - 0.5 && p[1] > y0 + 0.5 && p[1] < y1 - 0.5
  }
  const axis = h1 ? 0 : 1
  if (Math.abs(a[1 - axis] - c[1 - axis]) > 0.5) {
    return false
  }
  const [lo1, hi1] = span(a, b, axis)
  const [lo2, hi2] = span(c, d, axis)
  return Math.min(hi1, hi2) - Math.max(lo1, lo2) > 1
}

const runs = (points) => points.slice(1).map((point, index) => [points[index], point])

/** Crossings among the wires, and between each wire and the rails it does not join. */
export function wireCrossings(paths, rails = [], own = []) {
  let wires = 0
  let lanes = 0
  paths.forEach((path, i) => {
    for (const other of paths.slice(i + 1)) {
      wires += runs(path).filter((run) =>
        runs(other).some((next) => segmentsMeet(run, next))
      ).length
    }
    rails.forEach((rail, k) => {
      if (own[i]?.includes(k)) {
        return
      }
      lanes += runs(path).filter((run) => segmentsMeet(run, rail)).length
    })
  })
  return { wires, lanes }
}

export function wiringMethods(core, figOf) {
  const fig = () => figOf()
  const warn = (message) => (core.warn ?? warnKit)([message])
  const endOf = (id) => {
    const rail = railOf(core.lookup(id))
    return { id, box: core.bounds(id), rail }
  }
  return {
    /**
     * Several wires at once, one arrow `<id>-<n>` each, routed so none crosses another. `from`
     * and `to` are ids or lists: one box to one box with `n` wires runs port to port; a list
     * pairs item i with item i, or meets one box at its own port each; a line or arrow id is a
     * rail: wires tap it (a junction dot) or join it (a dot, no head). Ports sit `spacing`
     * apart, centred, or at `fromAt` / `toAt` (shares 0–1 or coordinates); `turn` sets where
     * parallel wires turn, `reach` how far from a box wires turn onto rails. Of the port and
     * turn orders, the one with the fewest crossings wins; returns `{ wires, crossings }`.
     */
    bus(spec) {
      if (!spec?.id || spec.from === undefined || spec.to === undefined) {
        throw new Error('bus({ id, from, to, n }) needs an id, from and to')
      }
      const spacing = spec.spacing ?? 12
      const gap = spec.gap ?? 4
      const sources = list(spec.from).map(endOf)
      const targets = list(spec.to).map(endOf)
      if (sources.length > 1 && targets.length > 1 && sources.length !== targets.length) {
        throw new Error(
          `bus ${spec.id}: ${sources.length} sources and ${targets.length} targets; a list pairs item i with item i, so give as many of each (or one id on one side)`
        )
      }
      const count =
        sources.length === 1 && targets.length === 1
          ? Math.max(1, spec.n ?? 1)
          : Math.max(sources.length, targets.length)
      const pick = (ends, index) => ends[ends.length === 1 ? 0 : index]
      if (
        Array.from(
          { length: count },
          (_, i) => pick(sources, i).rail && pick(targets, i).rail
        ).some(Boolean)
      ) {
        throw new Error(
          `bus ${spec.id}: a wire needs a box at one end at least; join two rails with fig.arrow`
        )
      }
      const farBox = (ends) => union(ends.map((end) => end.box))
      /** Each wire's port on a box end: point, travel axis (0 across a left/right side). */
      const ports = (ends, others, sideKey, atKey) => {
        const given = oneOf(sideKey, spec[sideKey], SIDES)
        if (ends.length === 1 && !ends[0].rail) {
          const box = ends[0].box
          const side = given ?? facing(box, farBox(others))
          const along = upright(side) ? box.height : box.width
          const at = shares(count, along, spec[atKey], spacing)
          return {
            fixed: Boolean(spec[atKey]),
            list: at.map((share) => ({
              point: portOn(box, side, share, gap),
              axis: upright(side) ? 0 : 1,
              side
            }))
          }
        }
        // Why one side for a column (or row): wires leave stacked cells away from each other,
        // never through the next cell.
        const boxes = ends.filter((end) => !end.rail).map((end) => end.box)
        const overlap = (axis) =>
          boxes.every((box) =>
            axis === 0
              ? box.x < boxes[0].right - 1 && boxes[0].x < box.right - 1
              : box.y < boxes[0].bottom - 1 && boxes[0].y < box.bottom - 1
          )
        const all = union(boxes)
        const there = farBox(others)
        const centre = (box, axis) => (axis === 0 ? box.x + box.width / 2 : box.y + box.height / 2)
        const shared =
          boxes.length < 2
            ? null
            : overlap(0)
              ? centre(there, 0) < centre(all, 0)
                ? 'left'
                : 'right'
              : overlap(1)
                ? centre(there, 1) < centre(all, 1)
                  ? 'top'
                  : 'bottom'
                : null
        return {
          fixed: true,
          list: Array.from({ length: count }, (_, index) => {
            const end = ends[index]
            if (end.rail) {
              return { rail: end.rail, axis: end.rail.horizontal ? 1 : 0 }
            }
            const side = given ?? shared ?? facing(end.box, pick(others, index).box)
            const at = spec[atKey]?.[index] ?? 0.5
            return { point: portOn(end.box, side, at, gap), axis: upright(side) ? 0 : 1, side }
          })
        }
      }
      const starts = ports(sources, targets, 'fromSide', 'fromAt')
      const ends = ports(targets, sources, 'toSide', 'toAt')
      /** A wire's path for a port order and a rank (its place among the turns). */
      const route = (start, end, rank, index) => {
        if (start.rail || end.rail) {
          const [port, rail] = start.rail ? [end, start.rail] : [start, end.rail]
          const level = rail.level
          const level2 = (value) => (rail.horizontal ? [value, level] : [level, value])
          let path
          if (port.axis === (rail.horizontal ? 1 : 0)) {
            // Why straight: a port facing the rail meets it head on.
            path = [port.point, level2(port.point[rail.horizontal ? 0 : 1])]
          } else {
            const axis = rail.horizontal ? 0 : 1
            const owner = start.rail ? pick(targets, index).box : pick(sources, index).box
            const out =
              port.point[axis] >=
              (axis === 0 ? owner.x + owner.width / 2 : owner.y + owner.height / 2)
                ? 1
                : -1
            const reach = spec.reach ?? 24
            const edge = port.point[axis]
            const base =
              out > 0 ? Math.max(edge + reach, rail.lo + 12) : Math.min(edge - reach, rail.hi - 12)
            const t =
              spec.turn !== undefined
                ? spec.turn + out * rank * spacing
                : base + out * rank * spacing
            if (t < rail.lo - 0.5 || t > rail.hi + 0.5) {
              throw new Error(
                `bus ${spec.id}: wire ${index + 1} would meet its rail at ${Math.round(t)}, past the rail's end (${Math.round(rail.lo)}–${Math.round(rail.hi)}); lengthen the rails, move the box, or give turn`
              )
            }
            const corner = rail.horizontal ? [t, port.point[1]] : [port.point[0], t]
            path = [port.point, corner, level2(t)]
          }
          return start.rail ? path.toReversed() : path
        }
        const [p, q] = [start.point, end.point]
        if (start.axis !== end.axis) {
          return [p, start.axis === 0 ? [q[0], p[1]] : [p[0], q[1]], q]
        }
        const axis = start.axis
        // Why outside: two ports on the same side (both left) are joined by a C round both.
        const sameWay = start.side === end.side
        if (!sameWay && Math.abs(p[1 - axis] - q[1 - axis]) < 0.5) {
          return [p, q]
        }
        const out = start.side === 'left' || start.side === 'top' ? -1 : 1
        const t = sameWay
          ? (spec.turn ?? (out < 0 ? Math.min(p[axis], q[axis]) : Math.max(p[axis], q[axis]))) +
            out * ((spec.reach ?? 16) + rank * spacing)
          : (spec.turn ?? (p[axis] + q[axis]) / 2) + (rank - (count - 1) / 2) * spacing
        return axis === 0 ? [p, [t, p[1]], [t, q[1]], q] : [p, [p[0], t], [q[0], t], q]
      }
      const railRuns = [...sources, ...targets]
        .filter((end) => end.rail)
        .map((end) =>
          end.rail.horizontal
            ? [
                [end.rail.lo, end.rail.level],
                [end.rail.hi, end.rail.level]
              ]
            : [
                [end.rail.level, end.rail.lo],
                [end.rail.level, end.rail.hi]
              ]
        )
      const railIndex = [...sources, ...targets].filter((end) => end.rail).map((end) => end.id)
      const own = Array.from({ length: count }, (_, index) =>
        [pick(sources, index), pick(targets, index)]
          .filter((end) => end.rail)
          .map((end) => railIndex.indexOf(end.id))
      )
      const order = (fixed, reversed) => (index) => (fixed || !reversed ? index : count - 1 - index)
      const candidates = []
      for (const [flipStart, flipEnd, flipRank] of [
        [false, false, false],
        [false, false, true],
        [true, false, false],
        [false, true, false],
        [true, false, true],
        [false, true, true]
      ]) {
        const s = order(starts.fixed, flipStart)
        const e = order(ends.fixed, flipEnd)
        const paths = Array.from({ length: count }, (_, index) =>
          route(
            starts.list[s(index)],
            ends.list[e(index)],
            flipRank ? count - 1 - index : index,
            index
          )
        )
        const crossings = wireCrossings(paths, railRuns, own)
        candidates.push({ paths, crossings, score: crossings.wires * 4 + crossings.lanes })
      }
      const best = candidates.reduce((kept, next) => (next.score < kept.score ? next : kept))
      const ending = (end, index, at) => {
        const item = pick(end, index)
        if (!item.rail) {
          return item.id
        }
        return item.rail.horizontal ? { on: item.id, x: r2(at[0]) } : { on: item.id, y: r2(at[1]) }
      }
      const wires = best.paths.map((points, index) =>
        fig().arrow({
          role: spec.role,
          color: spec.color,
          dashed: spec.dashed,
          strokeWidth: spec.strokeWidth,
          layer: spec.layer,
          // Why no head onto a rail: the wire joins the lane, which carries the flow on.
          ...(pick(targets, index).rail ? { heads: 'none' } : {}),
          ...(spec.heads ? { heads: spec.heads } : {}),
          ...(spec.labels?.[index] !== undefined ? { label: spec.labels[index] } : {}),
          ...spec.arrows?.[index],
          id: `${spec.id}-${index + 1}`,
          from: ending(sources, index, points[0]),
          to: ending(targets, index, points.at(-1)),
          points: points.map(([px, py]) => [r2(px), r2(py)])
        })
      )
      if (best.crossings.wires) {
        warn(
          `bus ${spec.id}: ${best.crossings.wires} crossing${best.crossings.wires > 1 ? 's' : ''} between its wires in every port order; move a box so its ports face the other end, or give fromSide / toSide`
        )
      }
      if (best.crossings.lanes) {
        warn(
          `bus ${spec.id}: wires cross other rails ${best.crossings.lanes} times; stacked lanes are tapped without crossings only at their open ends, or run the lanes through tall bars (fig.rails({ through }))`
        )
      }
      return { wires, crossings: best.crossings }
    },
    /**
     * N parallel lanes (a state of N components): `n` lanes `spacing` apart from `y` (or at
     * `ys`), from `x` (or the right side of `from`) to `x + w` (or the left side of `to`),
     * broken at each bar in `through` (tall boxes spanning every lane: B_t, A, C_t), so each
     * component enters and leaves every bar and no wire crosses. Returns `{ ys, lanes, stretches }`:
     * lanes[i] the arrow ids of lane i left to right, stretches[k] the ids between two bars.
     */
    rails(spec) {
      const { id } = spec ?? {}
      if (!id) {
        throw new Error('rails({ id, n, x, y, w, spacing, through }) needs an id')
      }
      const n = spec.ys?.length ?? spec.n ?? 4
      const spacing = spec.spacing ?? 24
      const ys = spec.ys ?? Array.from({ length: n }, (_, index) => spec.y + index * spacing)
      if (!ys.every(Number.isFinite)) {
        throw new Error(`rails ${id}: give y (the first lane) and spacing, or ys`)
      }
      const gap = spec.gap ?? 4
      const start = spec.from ? core.bounds(spec.from).right + gap : spec.x
      const finish = spec.to ? core.bounds(spec.to).x - gap : spec.x + (spec.w ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) {
        throw new Error(
          `rails ${id}: give x and w, or from and to (boxes the lanes leave and enter)`
        )
      }
      const bars = (spec.through ?? [])
        .map((bar) => ({ id: bar, box: core.bounds(bar) }))
        .toSorted((a, b) => a.box.x - b.box.x)
      for (const bar of bars) {
        const outside = ys.filter((y) => y < bar.box.y + 2 || y > bar.box.bottom - 2)
        if (outside.length) {
          throw new Error(
            `rails ${id}: ${bar.id} (y ${Math.round(bar.box.y)}–${Math.round(bar.box.bottom)}) does not span the lane${outside.length > 1 ? 's' : ''} at y ${outside.map(Math.round).join(', ')}; make it a tall bar over every lane`
          )
        }
      }
      const stops = [
        { x: start, id: spec.from ?? null },
        ...bars.flatMap((bar) => [
          { x: bar.box.x - gap, id: bar.id },
          { x: bar.box.right + gap, id: bar.id }
        ]),
        { x: finish, id: spec.to ?? null }
      ]
      const stretches = Array.from({ length: stops.length / 2 }, () => [])
      const lanes = ys.map((y, lane) =>
        stretches.map((stretch, k) => {
          const [from, to] = [stops[2 * k], stops[2 * k + 1]]
          const segment = stretches.length > 1 ? `${id}-${lane + 1}-${k + 1}` : `${id}-${lane + 1}`
          fig().arrow({
            role: spec.role,
            color: spec.color,
            strokeWidth: spec.strokeWidth,
            ...(spec.dashed?.[k] ? { dashed: true } : {}),
            ...(k === stretches.length - 1 && spec.heads ? { heads: spec.heads } : {}),
            ...spec.arrows?.[lane],
            id: segment,
            from: from.id ?? [r2(from.x), y],
            to: to.id ?? [r2(to.x), y],
            points: [
              [r2(from.x), y],
              [r2(to.x), y]
            ]
          })
          stretch.push(segment)
          return segment
        })
      )
      return { ys, lanes, stretches }
    }
  }
}
