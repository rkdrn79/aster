// A fork onto a shared rail, split from research-figures-kit-links.mjs: targets lined up in one
// row (or column) hang off a rail beside them, one drop each, so no branch runs through another
// target; and where a fork's dot sits so its trunk and branches keep room for a shaft and a head.

const GRID = 8
const toGrid = (value, round = Math.round) => round(value / GRID) * GRID

/** Half way across a gap, on the grid when that keeps 8 units clear of both ends. */
function halfway(edge, near) {
  const middle = (edge + near) / 2
  const snapped = toGrid(middle, edge <= near ? Math.floor : Math.ceil)
  const clear = (value) => Math.min(Math.abs(value - edge), Math.abs(near - value)) >= 8
  return clear(snapped) ? snapped : middle
}

/**
 * Where a fork's dot goes across the gap from its source's edge to the nearest target: half
 * way, but leaving a 16-unit trunk and an 18-unit last run (a head and a shaft) when the gap
 * allows, 8 and 14 when it is between 30 and 42; `tight` when even that does not fit.
 */
export function forkSpot(edge, near) {
  const gap = Math.abs(near - edge)
  const dir = Math.sign(near - edge) || 1
  const half = Math.abs(halfway(edge, near) - edge)
  const [low, high] = gap >= 42 ? [20, gap - 22] : [12, gap - 18]
  const off = high >= low ? Math.min(Math.max(half, low), high) : gap / 2
  return { value: edge + dir * off, tight: high < low }
}

/** Whether straight branches to targets lined up along `axis` would run through each other. */
export function lined(targets, axis) {
  return targets.some((a, i) =>
    targets.some(
      (b, j) =>
        i !== j &&
        a.lo[1 - axis] < b.hi[1 - axis] - 1 &&
        b.lo[1 - axis] < a.hi[1 - axis] - 1 &&
        (a.hi[axis] <= b.lo[axis] || b.hi[axis] <= a.lo[axis])
    )
  )
}

/** The rail fork, given the kit's arrow, junction dot and a fork's shared arrow options. */
export function railForkOf({ arrow, dot, shared }) {
  /**
   * A fork onto a shared rail beside a row (or column) of targets: the trunk runs from the
   * source to the rail, the rail along the row, and each target drops off it at its centre.
   */
  return (spec, ends, targets, source, origin, side) => {
    const cross = side === 'above' || side === 'below' ? 0 : 1
    const depth = 1 - cross
    const before = side === 'above' || side === 'left'
    const gap = spec.railGap ?? 20
    const level = before
      ? toGrid(Math.min(...targets.map((box) => box.lo[depth])) - gap, Math.floor)
      : toGrid(Math.max(...targets.map((box) => box.hi[depth])) + gap, Math.ceil)
    const pt = (along, across) => (cross === 0 ? [along, across] : [across, along])
    let start = origin
    let entry = pt(origin[cross], level)
    if (source) {
      if (source.hi[depth] <= level || source.lo[depth] >= level) {
        const out = source.hi[depth] <= level ? source.hi[depth] + 4 : source.lo[depth] - 4
        start = pt(source.c[cross], out)
        entry = pt(source.c[cross], level)
      } else {
        // Why along the rail: the rail's level runs through the source, so the trunk is the rail.
        const ahead = targets.every((box) => box.c[cross] >= source.c[cross])
        start = pt(ahead ? source.hi[cross] + 4 : source.lo[cross] - 4, level)
        entry = start
      }
    }
    const groups = [
      targets
        .map((box, index) => [box, index])
        .filter(([box]) => box.c[cross] < entry[cross] - 0.5),
      targets
        .map((box, index) => [box, index])
        .filter(([box]) => box.c[cross] >= entry[cross] - 0.5)
    ].filter((group) => group.length)
    const straight = Math.hypot(start[0] - entry[0], start[1] - entry[1]) < 0.5
    const reach = (group) =>
      group.reduce(
        (far, [box]) =>
          Math.abs(box.c[cross] - entry[cross]) > Math.abs(far - entry[cross]) ? box.c[cross] : far,
        entry[cross]
      )
    const headless = { ...shared(spec), heads: 'none', label: undefined, labelText: undefined }
    const rails = []
    let trunk
    if (groups.length === 1) {
      const points = [start, ...(straight ? [] : [entry]), pt(reach(groups[0]), level)]
      trunk = arrow({
        ...headless,
        label: spec.label,
        id: `${spec.id}-trunk`,
        from: spec.from,
        to: points.at(-1),
        points
      })
      rails.push([`${spec.id}-trunk`, groups[0]])
    } else {
      trunk = arrow({
        ...headless,
        label: spec.label,
        id: `${spec.id}-trunk`,
        from: spec.from,
        to: entry,
        points: [start, entry]
      })
      groups.forEach((group, index) => {
        const id = `${spec.id}-rail${index + 1}`
        arrow({
          ...headless,
          id,
          from: entry,
          to: pt(reach(group), level),
          points: [entry, pt(reach(group), level)]
        })
        rails.push([id, group])
      })
    }
    const joint = groups.length > 1 ? dot(`${spec.id}-dot`, entry, trunk) : null
    const branches = []
    for (const [rail, group] of rails) {
      const far = reach(group)
      for (const [box, index] of group) {
        const along = box.c[cross]
        const end = pt(along, before ? box.lo[depth] - 4 : box.hi[depth] + 4)
        const options = ends[index].options
        const labelled = options.label !== undefined || options.labelText !== undefined
        branches[index] = arrow({
          ...shared(spec),
          label: undefined,
          labelText: undefined,
          ...(labelled ? { labelSide: cross === 0 ? 'right' : 'below', labelSegment: 9 } : {}),
          ...options,
          id: `${spec.id}-${index + 1}`,
          from: cross === 0 ? { on: rail, x: along } : { on: rail, y: along },
          to: ends[index].id,
          points: [pt(along, level), end],
          // Why no dot at the rail's end: the rail turns into that branch, it does not split.
          ...(Math.abs(along - far) < 0.5 ? { junction: false } : {})
        })
      }
    }
    return { trunk, dot: joint, branches, rails: rails.map(([id]) => id) }
  }
}
