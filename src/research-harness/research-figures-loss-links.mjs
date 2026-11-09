// How a loss's links run: scattered rings joined by a bus into one trunk, links kept from
// meeting the node at one point, and a note placed on a side no link enters, on the page and
// clear of other items. Split from research-figures-kit-loss.mjs to keep files short.
import { makeArrow, makeLines } from './research-figures-draw.mjs'
import { oneOf } from './research-figures-options.mjs'
import { absolutePoints, inkBox, pathRuns } from './research-figures-labels.mjs'
import { orthogonalize } from './research-figures-route.mjs'
import { elementBounds } from './research-figures-geometry.mjs'
import { labelLines } from './research-figures-type.mjs'
import { boxGap, layoutAround, overlap, union } from './research-figures-loss-place.mjs'

/** Which side of the node a link's tip enters. */
export function groupKey(tip, node) {
  if (tip[1] <= node.y + 0.5) {
    return 'top'
  }
  if (tip[1] >= node.y + node.height - 0.5) {
    return 'bottom'
  }
  return tip[0] <= node.x + node.width / 2 ? 'left' : 'right'
}

/** Whether two polylines cross or run along each other, away from their own ends. */
export function pathsCross(a, b) {
  const ends = [a[0], a.at(-1), b[0], b.at(-1)]
  const nearEnd = (point) =>
    ends.some((end) => Math.hypot(end[0] - point[0], end[1] - point[1]) < 3)
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  for (let i = 1; i < a.length; i += 1) {
    for (let j = 1; j < b.length; j += 1) {
      const [p, q, r, t] = [a[i - 1], a[i], b[j - 1], b[j]]
      const d1 = cross(r, t, p)
      const d2 = cross(r, t, q)
      const d3 = cross(p, q, r)
      const d4 = cross(p, q, t)
      if (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
      ) {
        const u = d1 / (d1 - d2)
        const hit = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]
        if (!nearEnd(hit)) {
          return true
        }
      }
      // Why along: a link laid over an arrow reads as that arrow.
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
      if (Math.abs(d1) / length < 1 && Math.abs(d2) / length < 1) {
        const ux = (q[0] - p[0]) / length
        const uy = (q[1] - p[1]) / length
        const along = (point) => (point[0] - p[0]) * ux + (point[1] - p[1]) * uy
        const shared =
          Math.min(length, Math.max(along(r), along(t))) - Math.max(0, Math.min(along(r), along(t)))
        if (shared > 2) {
          return true
        }
      }
    }
  }
  return false
}

/** Items drawn for a loss, owned by it. */
function own(items, id) {
  for (const item of items) {
    item.customData = { ...item.customData, asterKit: id }
  }
  return items
}

/** An arrow redrawn through absolute points, keeping its bindings and look. */
function withPath(arrow, absolute) {
  const [x0, y0] = absolute[0]
  const points = absolute.map(([px, py]) => [px - x0, py - y0])
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return Object.assign(arrow, {
    x: x0,
    y: y0,
    points,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  })
}

/** The joined buses, the link spreading and the note of a loss, on the kit's `core`. */
export function lossLinks(core, { colorsOf, link }) {
  const { styled } = core
  /**
   * Whether a side of a strip of boxes has no room for a bus: arrows end there (input arrows
   * from below), or text sits in the band the bus and its stubs would take (a label over each).
   */
  function crowdedSide(id, boxes, all, side) {
    const band =
      side === 'below'
        ? { x: all.x, y: all.bottom, right: all.right, bottom: all.bottom + 14 }
        : side === 'above'
          ? { x: all.x, y: all.y - 14, right: all.right, bottom: all.y }
          : side === 'left'
            ? { x: all.x - 14, y: all.y, right: all.x, bottom: all.bottom }
            : { x: all.right, y: all.y, right: all.right + 14, bottom: all.bottom }
    const near = ([px, py]) =>
      boxes.some((box) =>
        side === 'below'
          ? px > box.x && px < box.right && py >= box.bottom - 1 && py <= box.bottom + 10
          : side === 'above'
            ? px > box.x && px < box.right && py <= box.y + 1 && py >= box.y - 10
            : side === 'left'
              ? py > box.y && py < box.bottom && px <= box.x + 1 && px >= box.x - 10
              : py > box.y && py < box.bottom && px >= box.right - 1 && px <= box.right + 10
      )
    return core.elements.some((element) => {
      if (element.isDeleted || element.customData?.asterKit === id) {
        return false
      }
      if (element.type === 'arrow') {
        const points = absolutePoints(element)
        return near(points[0]) || near(points.at(-1))
      }
      if (element.type !== 'text' && !element.customData?.asterTex) {
        return false
      }
      const box = elementBounds(element)
      return overlap({ x: box.x, y: box.y, right: box.right, bottom: box.bottom }, band, -1)
    })
  }
  /** Whether a strip of items has a side free for a bus (across the way they spread). */
  function busRoom(id, ids) {
    const boxes = ids.map((item) => core.bounds(item))
    const all = union(boxes)
    const sides = all.width >= all.height ? ['below', 'above'] : ['right', 'left']
    return sides.some((side) => !crowdedSide(id, boxes, all, side))
  }
  /**
   * The side scattered rings join on: `join` when given (a side, or `{ predictions, targets }`),
   * else the side facing the node unless arrows already meet the rings there (input arrows from
   * below), then the opposite side.
   */
  function joinSide(spec, boxes, all, node, which) {
    const sides = ['below', 'above', 'left', 'right']
    const asked =
      spec.join && typeof spec.join === 'object'
        ? spec.join[which]
        : which === 'targets'
          ? spec.join
          : undefined
    if (asked !== undefined) {
      return oneOf('join', asked, sides)
    }
    // Why across the strip: a bus along a row of rings runs above or below it, never through it.
    const row = all.width >= all.height
    const facing = row
      ? node.y + node.height / 2 >= all.y + all.height / 2
        ? 'below'
        : 'above'
      : node.x + node.width / 2 >= all.x + all.width / 2
        ? 'right'
        : 'left'
    const crowded = (side) => crowdedSide(spec.id, boxes, all, side)
    const opposite = { below: 'above', above: 'below', left: 'right', right: 'left' }
    return [facing, opposite[facing]].find((side) => !crowded(side)) ?? facing
  }
  /**
   * Rings scattered over a strip joined on one side (`join`: below, above, left, right; by
   * default the side clear of other arrows) by a bus 12 units out, then one trunk into the node.
   * The trunk leaves the bus at the point nearest the node's centre (its x for a bus below or
   * above, clamped to the rings' span), so it runs straight when the node is in line with them.
   * `which` (predictions, targets) names the strip: its stubs are `<id>-join<n>` for targets and
   * `<id>-pjoin<n>` for predictions.
   */
  function joined(spec, rings, node, offset, which = 'targets') {
    const colors = colorsOf(spec.tone)
    const dashed = spec.links === 'dashed'
    const boxes = rings.map((id) => core.bounds(id))
    const all = union(boxes)
    const side = joinSide(spec, boxes, all, node, which)
    const stub = which === 'targets' ? 'join' : 'pjoin'
    const vertical = side === 'below' || side === 'above'
    const bus =
      side === 'below'
        ? all.bottom + 12
        : side === 'above'
          ? all.y - 12
          : side === 'left'
            ? all.x - 12
            : all.right + 12
    const centre = [node.x + node.width / 2, node.y + node.height / 2]
    // Why toward the node: the trunk then leaves the bus straight at the node when it can.
    const point = vertical
      ? [Math.min(Math.max(centre[0], all.x), all.right), bus]
      : [bus, Math.min(Math.max(centre[1], all.y), all.bottom)]
    const branches = boxes.map((box, index) => {
      const start = vertical
        ? [box.x + box.width / 2, side === 'below' ? box.bottom : box.y]
        : [side === 'right' ? box.right : box.x, box.y + box.height / 2]
      const path = orthogonalize(
        vertical
          ? [start, [start[0], bus], [point[0], bus]]
          : [start, [bus, start[1]], [bus, point[1]]]
      )
      // Why solid: the bus stubs are short; dashed they would print as broken lines.
      const arrow = makeArrow(
        styled({
          id: `${spec.id}-${stub}${index + 1}`,
          from: rings[index],
          to: point,
          points: path,
          role: 'loss',
          color: colors.link,
          strokeWidth: dashed ? 1.5 : 2,
          heads: 'none'
        }),
        core.lookup
      )
      arrow.customData = { ...arrow.customData, asterKit: spec.id }
      return arrow
    })
    const trunk = makeArrow(
      styled({
        id: `${spec.id}-in${offset + 1}`,
        from: point,
        to: spec.id,
        role: 'loss',
        color: colors.link,
        dashed,
        strokeWidth: dashed ? 1.5 : 2,
        headSize: dashed ? 8 : 10,
        fromAxis: vertical ? 1 : 0
      }),
      core.lookup,
      { elements: core.elements }
    )
    trunk.customData = { ...trunk.customData, asterKit: spec.id }
    return [...branches, trunk]
  }
  /**
   * Links that would meet the node at one point (and read as one trunk, as if the two sets were
   * joined): first the other elbow, then their ends spread along the side they enter.
   */
  function separate(spec, links, sources, node) {
    const tipOf = (arrow) => absolutePoints(arrow).at(-1)
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 6
    const result = [...links]
    // Why along too: two links laid over one another read as one trunk, as if the sets joined.
    const meets = (arrow, others) =>
      others.some(
        (other) =>
          near(tipOf(other), tipOf(arrow)) ||
          pathsCross(absolutePoints(other), absolutePoints(arrow))
      )
    for (let index = 1; index < result.length; index += 1) {
      const given = spec.routes?.[index] ?? spec.route
      if (!meets(result[index], result.slice(0, index)) || given || Array.isArray(sources[index])) {
        continue
      }
      for (const route of ['vh', 'hv']) {
        const retry = link({ ...spec, route, routes: undefined }, sources[index], index, node)
        if (!meets(retry, result.slice(0, index))) {
          result[index] = retry
          break
        }
      }
    }
    // Why spread: two links entering one side at one point merge into one trunk.
    const groups = new Map()
    for (const arrow of result) {
      const tip = tipOf(arrow)
      const key = groupKey(tip, node)
      groups.set(key, [...(groups.get(key) ?? []), arrow])
    }
    for (const [key, group] of groups) {
      const clashing =
        group.length > 1 &&
        group.some((arrow, i) =>
          group.slice(0, i).some((other) => near(tipOf(other), tipOf(arrow)))
        )
      if (!clashing) {
        continue
      }
      const across = key === 'top' || key === 'bottom' ? 0 : 1
      const from = across === 0 ? node.x : node.y
      const span = across === 0 ? node.width : node.height
      const ordered = group.toSorted(
        (a, b) => absolutePoints(a)[0][across] - absolutePoints(b)[0][across]
      )
      for (const [i, arrow] of ordered.entries()) {
        const target = from + (span * (i + 1)) / (ordered.length + 1)
        const absolute = absolutePoints(arrow)
        const value = absolute.at(-1)[across]
        // Why the trailing run: the points that share the tip's coordinate form its last leg.
        let start = absolute.length - 1
        while (start > 0 && Math.abs(absolute[start - 1][across] - value) < 0.5) {
          start -= 1
        }
        if (start === 0) {
          continue
        }
        for (let k = start; k < absolute.length; k += 1) {
          absolute[k] = across === 0 ? [target, absolute[k][1]] : [absolute[k][0], target]
        }
        withPath(arrow, absolute)
      }
    }
    return result
  }
  /**
   * A small note beside the loss ("frozen in stage 1") on a side no link enters: below, else
   * above, right or left.
   */
  function noteFor(spec, node, links) {
    const style = styled({}).style
    const size = spec.noteSize ?? style.smallSize
    const lines = labelLines(spec.note, size, undefined, style)
    const draw = (where) =>
      makeLines(styled({ id: `${spec.id}-note`, size, color: 'muted', ...where }), lines)
    const taken = new Set(links.map((arrow) => groupKey(absolutePoints(arrow).at(-1), node)))
    const cx = node.x + node.width / 2
    const cy = node.y + node.height / 2
    const ink = inkBox(draw({ x: 0, y: 0 }).elements)
    const spots = {
      bottom: { cx, y: node.y + node.height + 4 },
      top: { cx, y: node.y - 4 - ink.height },
      right: { x: node.x + node.width + 6, cy },
      left: { x: node.x - 6, align: 'right', cy }
    }
    const names = { below: 'bottom', above: 'top', right: 'right', left: 'left' }
    if (spec.noteSide) {
      return own(
        draw(spots[names[oneOf('noteSide', spec.noteSide, Object.keys(names))]]).elements,
        spec.id
      )
    }
    // Why the page and the drawing: a note off the page does not print, and one on another
    // item hides it; a side no link enters comes first.
    const page = core.page()
    const { boxes } = layoutAround(core.elements, spec.id)
    const fits = (items) => {
      const box = inkBox(items)
      const edges = { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height }
      const onPage =
        !page ||
        (edges.x >= page.x + 12 &&
          edges.y >= page.y + 12 &&
          edges.right <= page.x + page.width - 12 &&
          edges.bottom <= page.y + page.height - 12)
      return {
        onPage,
        free: onPage && !boxes.some((other) => !other.holder && overlap(edges, other, 2))
      }
    }
    const order = ['bottom', 'top', 'right', 'left'].toSorted(
      (a, b) => Number(taken.has(a)) - Number(taken.has(b))
    )
    const drawn = order.map((name) => draw(spots[name]).elements)
    const checked = drawn.map(fits)
    const chosen =
      drawn[checked.findIndex((check) => check.free)] ??
      drawn[checked.findIndex((check) => check.onPage)] ??
      drawn[0]
    return own(chosen, spec.id)
  }

  /**
   * What is wrong with an automatic loss's wiring, or null: a set further than `limit` from the
   * node, a link with more than two bends, or a link across (or along) a solid arrow.
   */
  function wiringProblem(id, node, links, sets, limit) {
    const box = { x: node.x, y: node.y, right: node.x + node.width, bottom: node.y + node.height }
    const far = sets.find((set) => boxGap(box, set) > limit)
    if (far) {
      return `it sits ${Math.round(boxGap(box, far))} units from a set it compares`
    }
    const solid = core.elements.filter(
      (element) =>
        element.type === 'arrow' &&
        !element.isDeleted &&
        element.strokeStyle === 'solid' &&
        element.customData?.asterKit !== id &&
        !element.id.startsWith(`${id}-`)
    )
    for (const arrow of links) {
      const path = absolutePoints(arrow)
      const bends = pathRuns(path).length - 1
      if (bends > 2) {
        return `${arrow.id} takes ${bends} bends`
      }
      const hit = solid.find((other) => pathsCross(path, absolutePoints(other)))
      if (hit) {
        return `${arrow.id} crosses the arrow ${hit.id}`
      }
    }
    return null
  }
  return { joined, separate, noteFor, wiringProblem, busRoom }
}
