// Connections drawn the way papers draw them: a skip (residual) connection leaving the main path
// between two blocks and rejoining at a ⊕ around one side, one source forking to several
// targets or several sources merging into one through a single junction dot, two opposite
// arrows in parallel lanes (q and p_θ), and a zoom from a box to the panel that details it.
import { anchorBox } from './research-figures-annotate.mjs'
import { absolutePoints, headLength } from './research-figures-labels.mjs'
import { figureElement } from './research-figures-model.mjs'
import { oneOf } from './research-figures-options.mjs'
import { makeDot } from './research-figures-shapes.mjs'
import { inkColor } from './research-figures-style.mjs'
import { boxOf, routeObstacles } from './research-figures-route.mjs'

const GRID = 8
const toGrid = (value, round = Math.round) => round(value / GRID) * GRID

/** The run of a line's path that holds a point, and the axis it runs along. */
function runAt(path, point) {
  for (let index = 1; index < path.length; index += 1) {
    const [p, q] = [path[index - 1], path[index]]
    const axis = Math.abs(p[1] - q[1]) <= 0.5 ? 0 : 1
    const other = 1 - axis
    const low = Math.min(p[axis], q[axis]) - 1
    const high = Math.max(p[axis], q[axis]) + 1
    if (Math.abs(point[other] - p[other]) <= 1 && point[axis] >= low && point[axis] <= high) {
      return axis
    }
  }
  return 1
}

/**
 * Where a skip leaves a line: its middle, or on a short arrow whose head reaches the middle, half
 * way along the part clear of its heads (a fraction of its length).
 */
function clearMiddle(line) {
  const path = absolutePoints(line)
  const total = path
    .slice(1)
    .reduce(
      (sum, point, index) => sum + Math.hypot(point[0] - path[index][0], point[1] - path[index][1]),
      0
    )
  const start = headLength(line, true) ? headLength(line, true) + 4 : 0
  const end = headLength(line, false) ? headLength(line, false) + 4 : 0
  const clear = total - start - end
  // Why the middle when it can: it is where a skip usually leaves; only a short arrow's head
  // reaches it.
  const roomy = total / 2 >= start + 2 && total / 2 <= total - end - 2
  return roomy || clear < 8 || !total ? 'mid' : (start + clear / 2) / total
}

/**
 * The main axis from one box (`lo`, `hi`, `c`) to others: the one they all lie beyond it on;
 * when they do on both, across the way they spread (a row below is reached downward); else the
 * longer way to their middle.
 */
export function mainAxis(from, others) {
  const lo = from.lo ?? from.c
  const hi = from.hi ?? from.c
  const clear = [0, 1].map(
    (axis) =>
      others.every((box) => box.lo[axis] >= hi[axis]) ||
      others.every((box) => box.hi[axis] <= lo[axis])
  )
  if (clear[0] !== clear[1]) {
    return clear[0] ? 0 : 1
  }
  const range = (axis) =>
    Math.max(...others.map((box) => box.c[axis])) - Math.min(...others.map((box) => box.c[axis]))
  if (clear[0] && others.length > 1 && range(0) !== range(1)) {
    return range(0) > range(1) ? 1 : 0
  }
  const cx = others.reduce((sum, box) => sum + box.c[0], 0) / others.length
  const cy = others.reduce((sum, box) => sum + box.c[1], 0) / others.length
  return Math.abs(cx - from.c[0]) >= Math.abs(cy - from.c[1]) ? 0 : 1
}

/**
 * Where a junction goes between an edge and the nearest edge across the gap: half way, on the
 * grid when that keeps it 8 units clear of both, so neither the trunk nor a branch hooks back.
 */
export function splitSpot(edge, near) {
  const middle = (edge + near) / 2
  const snapped = toGrid(middle, edge <= near ? Math.floor : Math.ceil)
  const clear = (value) => Math.min(Math.abs(value - edge), Math.abs(near - value)) >= 8
  return clear(snapped) ? snapped : middle
}

export function linkMethods(core, kit) {
  const arrow = (spec) => kit().arrow(spec)
  /** Where a junction spec lands, the same way the arrow will put its dot. */
  const pointOf = (from) => core.junction(from, null).point
  const at = (axis, along, across) => (axis === 0 ? [along, across] : [across, along])
  // Why the trunk's colour: a black dot on a coloured link reads as a third thing.
  const dot = (id, point, line) =>
    kit().dot({ id, cx: point[0], cy: point[1], r: 3, color: line.strokeColor })
  /** A branch end (an id, or `{ id, role, label, … }`) and the arrow options it brings. */
  const branchOf = (spec, entry, index) => {
    const { id, ...own } = typeof entry === 'string' ? { id: entry } : entry
    return {
      id,
      options: {
        ...(spec.roles?.[index] ? { role: spec.roles[index] } : {}),
        ...(spec.labels?.[index] !== undefined ? { label: spec.labels[index] } : {}),
        ...(spec.labelSides?.[index] ? { labelSide: spec.labelSides[index] } : {}),
        ...own
      }
    }
  }
  /** Arrow options of a fork or merge without its own list-valued ones. */
  const shared = (spec) => ({
    ...spec,
    roles: undefined,
    labels: undefined,
    labelSides: undefined,
    split: undefined
  })
  /**
   * A branch's label beside its last run (the one into its target), away from the trunk, unless
   * the branch names its own side or run.
   */
  const outward = (options, axis, split, box) => {
    const labelled = options.label !== undefined || options.labelText !== undefined
    if (!labelled || options.labelSide || options.labelSegment !== undefined) {
      return options
    }
    const before = box.c[1 - axis] < split[1 - axis] - 1
    const side = axis === 1 ? (before ? 'left' : 'right') : before ? 'above' : 'below'
    // Why a large index: the kit clamps it to the last run, however many bends the branch takes.
    return { ...options, labelSide: side, labelSegment: 9 }
  }
  /** The split of a fork or merge: where it sits along the main axis, and that axis if forced. */
  const splitOf = (spec, from, others) => {
    const given = spec.split
    if (given && typeof given === 'object') {
      const keys = ['x', 'y'].filter((key) => given[key] !== undefined)
      if (keys.length !== 1) {
        throw new Error(`split is a number or one of { x } or { y }: ${JSON.stringify(given)}`)
      }
      return { axis: keys[0] === 'x' ? 0 : 1, value: given[keys[0]] }
    }
    return { axis: mainAxis(from, others), value: given }
  }
  return {
    /**
     * A skip (residual) connection: leaves the main path at `from` (an arrow id, its middle,
     * or `{ on, at | x | y }`), runs around everything in between on `side` (left or right of
     * a vertical path, above or below a horizontal one) and enters `to` (a ⊕) from that side.
     */
    skip(spec) {
      const from =
        typeof spec.from === 'string'
          ? { on: spec.from, at: clearMiddle(core.need(spec.from)) }
          : spec.from
      const start = pointOf(from)
      const axis = runAt(absolutePoints(core.need(from.on)), start)
      const other = 1 - axis
      const target = boxOf(core.lookup(spec.to))
      const side = spec.side ?? (axis === 1 ? 'left' : 'above')
      const low = side === 'left' || side === 'above'
      const span = [Math.min(start[axis], target.c[axis]), Math.max(start[axis], target.c[axis])]
      // Why everything in between: the lane must clear every block the connection skips.
      const between = routeObstacles(core.elements, [{ box: target }, { point: start }], spec.id)
        .filter((box) => box.hi[axis] > span[0] && box.lo[axis] < span[1])
        .filter(
          (box) =>
            box.lo[other] <= Math.max(start[other], target.c[other]) + 1 &&
            box.hi[other] >= Math.min(start[other], target.c[other]) - 1
        )
      const edges = [target, ...between].map((box) => (low ? box.lo[other] : box.hi[other]))
      const gap = spec.gap ?? 24
      const lane = low
        ? toGrid(Math.min(...edges, start[other]) - gap, Math.floor)
        : toGrid(Math.max(...edges, start[other]) + gap, Math.ceil)
      const enter = low
        ? target.lo[other] - (spec.endGap ?? 4)
        : target.hi[other] + (spec.endGap ?? 4)
      const points = [
        start,
        at(axis, start[axis], lane),
        at(axis, target.c[axis], lane),
        at(axis, target.c[axis], enter)
      ]
      return arrow({
        role: 'side',
        ...spec,
        from,
        to: spec.to,
        points
      })
    },
    /**
     * One source to several targets: a trunk (with `label`) to one junction dot, then a branch to
     * each. A branch takes its own role, label and side (`roles`, `labels`, `labelSides`, or
     * `to: [{ id, role, label, labelSide }]`); a label sits beside its last run, away from the
     * trunk. The main axis is the one the targets all lie beyond the source on (`split: { y }`
     * forces it); the dot sits half way across the gap (`split` moves it along that axis).
     */
    fork(spec) {
      const ends = spec.to.map((entry, index) => branchOf(spec, entry, index))
      const targets = ends.map((end) => boxOf(core.lookup(end.id)))
      const source = typeof spec.from === 'string' ? boxOf(core.lookup(spec.from)) : null
      const origin = source ? source.c : pointOf(spec.from)
      const chosen = splitOf(spec, source ?? { c: origin }, targets)
      const { axis } = chosen
      const other = 1 - axis
      const centre = targets.reduce((sum, box) => sum + box.c[axis], 0) / targets.length
      const forward = centre >= origin[axis]
      const near = forward
        ? Math.min(...targets.map((box) => box.lo[axis]))
        : Math.max(...targets.map((box) => box.hi[axis]))
      const edge = source ? (forward ? source.hi[axis] : source.lo[axis]) : origin[axis]
      const split = at(axis, chosen.value ?? splitSpot(edge, near), origin[other])
      const trunk = arrow({
        ...shared(spec),
        id: `${spec.id}-trunk`,
        to: split,
        heads: 'none'
      })
      const joint = dot(`${spec.id}-dot`, split, trunk)
      const branches = ends.map((end, index) =>
        arrow({
          ...shared(spec),
          label: undefined,
          labelText: undefined,
          ...outward(end.options, axis, split, targets[index]),
          id: `${spec.id}-${index + 1}`,
          from: split,
          to: end.id,
          fromAxis: axis
        })
      )
      return { trunk, dot: joint, branches }
    },
    /**
     * Several sources into one target: a branch from each to one junction dot, then a trunk. A
     * branch takes its own role and label (`roles`, `labels`, or `from: [{ id, role }]`).
     */
    merge(spec) {
      const starts = spec.from.map((entry, index) => branchOf(spec, entry, index))
      const sources = starts.map((start) => boxOf(core.lookup(start.id)))
      const target = boxOf(core.lookup(spec.to))
      const chosen = splitOf(spec, target, sources)
      const { axis } = chosen
      const other = 1 - axis
      const centre = sources.reduce((sum, box) => sum + box.c[axis], 0) / sources.length
      const forward = target.c[axis] >= centre
      const far = forward
        ? Math.max(...sources.map((box) => box.hi[axis]))
        : Math.min(...sources.map((box) => box.lo[axis]))
      const edge = forward ? target.lo[axis] : target.hi[axis]
      const join = at(axis, chosen.value ?? splitSpot(edge, far), target.c[other])
      const branches = starts.map((start, index) =>
        arrow({
          ...shared(spec),
          label: undefined,
          labelText: undefined,
          ...start.options,
          id: `${spec.id}-${index + 1}`,
          from: start.id,
          to: join,
          toAxis: axis,
          heads: 'none'
        })
      )
      const trunk = arrow({
        ...shared(spec),
        id: `${spec.id}-trunk`,
        from: join,
        to: spec.to
      })
      const joint = dot(`${spec.id}-dot`, join, trunk)
      return { trunk, dot: joint, branches }
    },
    /**
     * Two opposite arrows between the same two items in parallel lanes `gap` apart (a diffusion
     * step: q one way, p_θ back): `<id>-1` from `between[0]` to `between[1]` above (or left of)
     * `<id>-2`, which runs back. `labels` sit on each lane's outer side (`labelSides` moves
     * them); `roles`, `colors` and `arrows: [{ color, dashed, … }, …]` style each lane. A small
     * end (a ⋯) only has to sit within the other's row.
     */
    lanes(spec) {
      const [first, second] = spec.between ?? []
      if (!first || !second) {
        throw new Error('lanes({ id, between: [a, b] }) needs two ids')
      }
      const a = core.bounds(first)
      const b = core.bounds(second)
      const gap = spec.gap ?? 12
      const end = spec.endGap ?? 4
      // Why a small end may be short: a ⋯ or a dot is less tall than the two lanes, and both
      // lanes still point at it as long as it sits within the other end's row.
      const shares = (low, high, sizes) => {
        const shared = high - low
        const small = Math.min(...sizes)
        return shared >= gap + 8 || (shared > 0 && small < gap + 8 && shared >= small - 1)
      }
      const sharedY = [Math.max(a.y, b.y), Math.min(a.bottom, b.bottom)]
      const sharedX = [Math.max(a.x, b.x), Math.min(a.right, b.right)]
      const row = shares(...sharedY, [a.height, b.height]) && (a.right <= b.x || b.right <= a.x)
      const column = shares(...sharedX, [a.width, b.width]) && (a.bottom <= b.y || b.bottom <= a.y)
      if (!row && !column) {
        throw new Error(
          `lanes: ${first} and ${second} share no row or column ${gap + 8} units wide; line them up first (a small end such as fig.ellipsis must sit within the other's row)`
        )
      }
      const middle = row ? (sharedY[0] + sharedY[1]) / 2 : (sharedX[0] + sharedX[1]) / 2
      const lane = (offset, from, to) => {
        const [p, q] = [core.bounds(from), core.bounds(to)]
        const [lo, hi] = row ? ['x', 'right'] : ['y', 'bottom']
        const along = p[hi] <= q[lo] ? [p[hi] + end, q[lo] - end] : [p[lo] - end, q[hi] + end]
        const level = middle + offset
        return along.map((value) => (row ? [value, level] : [level, value]))
      }
      // Why outer sides: each lane's label sits away from the other lane.
      const sides = row ? ['above', 'below'] : ['left', 'right']
      const own = (index) => {
        const options = {
          ...(spec.roles?.[index] ? { role: spec.roles[index] } : {}),
          ...(spec.colors?.[index] ? { color: spec.colors[index] } : {}),
          ...(spec.labels?.[index] !== undefined ? { label: spec.labels[index] } : {}),
          ...spec.arrows?.[index]
        }
        const labelled = options.label !== undefined || options.labelText !== undefined
        return labelled
          ? { ...options, labelSide: options.labelSide ?? spec.labelSides?.[index] ?? sides[index] }
          : options
      }
      return [
        [first, second, -gap / 2],
        [second, first, gap / 2]
      ].map(([from, to, offset], index) =>
        arrow({
          ...spec,
          between: undefined,
          labels: undefined,
          labelSides: undefined,
          roles: undefined,
          colors: undefined,
          arrows: undefined,
          ...own(index),
          id: `${spec.id}-${index + 1}`,
          from,
          to,
          points: lane(offset, from, to)
        })
      )
    },
    /**
     * An ellipsis (⋯, or ⋮ with `axis: 'y'`) that arrows and lanes bind to: three dots in an
     * invisible box `size` long and 24 deep, with the id, so it has real bounds.
     */
    ellipsis(spec) {
      const axis = oneOf('axis', spec.axis, ['x', 'y']) ?? 'x'
      const size = spec.size ?? 24
      const depth = spec.depth ?? 24
      const r = spec.r ?? 1.25
      const [w, h] = axis === 'x' ? [size, depth] : [depth, size]
      const centre = [spec.cx ?? (spec.x ?? 0) + w / 2, spec.cy ?? (spec.y ?? 0) + h / 2]
      const box = anchorBox(
        spec.id,
        { x: centre[0] - w / 2, y: centre[1] - h / 2, width: w, height: h },
        'ellipsis'
      )
      box.frameId = spec.frame ?? null
      const step = size / 3
      const dots = [-1, 0, 1].flatMap((k) =>
        makeDot(
          core.styled({
            id: `${spec.id}-dot${k + 2}`,
            cx: centre[0] + (axis === 'x' ? k * step : 0),
            cy: centre[1] + (axis === 'y' ? k * step : 0),
            r,
            color: spec.color ?? 'ink',
            frame: spec.frame
          })
        )
      )
      return core.add([box, ...dots], spec.id)
    },
    /**
     * A zoom from a box to the panel that shows it in detail: two thin lines from the box's
     * corners facing the panel to the panel's matching corners (`dashed`, `color` muted).
     */
    zoom(spec) {
      const box = core.bounds(spec.from)
      const panel = core.bounds(spec.to)
      const color = inkColor(core.styled({}).style, spec.color ?? 'muted')
      const corners = (bounds) => ({
        tl: [bounds.x, bounds.y],
        tr: [bounds.right, bounds.y],
        bl: [bounds.x, bounds.bottom],
        br: [bounds.right, bounds.bottom]
      })
      const [from, to] = [corners(box), corners(panel)]
      // Why these corners: the two lines frame the detail, the way a magnifier's cone does.
      const pairs =
        panel.x >= box.right
          ? [
              ['tr', 'tl'],
              ['br', 'bl']
            ]
          : panel.right <= box.x
            ? [
                ['tl', 'tr'],
                ['bl', 'br']
              ]
            : panel.y >= box.bottom
              ? [
                  ['bl', 'tl'],
                  ['br', 'tr']
                ]
              : panel.bottom <= box.y
                ? [
                    ['tl', 'bl'],
                    ['tr', 'br']
                  ]
                : null
      if (!pairs) {
        throw new Error(`zoom: ${spec.to} overlaps ${spec.from}; put the detail panel beside it`)
      }
      const lines = pairs.map(([start, finish], index) => {
        const [p, q] = [from[start], to[finish]]
        return figureElement('line', {
          id: `${spec.id}-${index + 1}`,
          x: p[0],
          y: p[1],
          width: Math.abs(q[0] - p[0]),
          height: Math.abs(q[1] - p[1]),
          points: [
            [0, 0],
            [q[0] - p[0], q[1] - p[1]]
          ],
          strokeColor: color,
          strokeWidth: spec.strokeWidth ?? 1,
          strokeStyle: spec.dashed === false ? 'solid' : 'dashed',
          frameId: spec.frame ?? null,
          customData: { asterZoom: true }
        })
      })
      // Why behind: the cone passes under the panel's edge and the box it leaves.
      core.claim(spec.id, lines)
      core.insert(lines, core.under([spec.from, spec.to]))
      return lines
    }
  }
}
