// Lint for routes and rows: slanted connectors, routes with many bends or along another shape's
// edge, stub, chained or hidden arrows, boxes that almost line up, and uneven spacing.
import { absolutePoints } from './research-figures-labels.mjs'
import { AXIS, SNAP, boxOf, routeObstacles, segmentMeets } from './research-figures-route.mjs'

const SIBLINGS = new Set(['rectangle', 'ellipse', 'diamond', 'image'])
/** Gaps further apart than this are a choice (a label sits there), not a slip. */
const SPACING = 4
/** Offsets up to this many units (1 pt) are not a near miss: they do not show at print. */
const NEAR_MISS = 2
/** A box that only says "and so on": ⋯, …, ⋮. */
const ELLIPSIS = /^\s*(?:⋯|…|⋮|\.{3}|·{3})\s*$/
const round = (value) => Math.round(value * 10) / 10

/** A path without repeated or straight-through points: what is left are its corners. */
function corners(points) {
  const kept = []
  for (const point of points) {
    const last = kept.at(-1)
    if (last && Math.abs(point[0] - last[0]) <= AXIS && Math.abs(point[1] - last[1]) <= AXIS) {
      continue
    }
    const before = kept.at(-2)
    if (
      before &&
      ((Math.abs(before[0] - last[0]) <= AXIS && Math.abs(last[0] - point[0]) <= AXIS) ||
        (Math.abs(before[1] - last[1]) <= AXIS && Math.abs(last[1] - point[1]) <= AXIS))
    ) {
      kept[kept.length - 1] = point
      continue
    }
    kept.push(point)
  }
  return kept
}

function routeChecks(elements, add) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  for (const arrow of elements.filter((element) => element.type === 'arrow')) {
    const points = absolutePoints(arrow)
    if (points.length < 2 || arrow.customData?.asterDiagonal || arrow.customData?.asterCurve) {
      continue
    }
    const slanted = points
      .slice(1)
      .some(
        (point, index) =>
          Math.abs(point[0] - points[index][0]) > AXIS &&
          Math.abs(point[1] - points[index][1]) > AXIS
      )
    if (slanted) {
      add(
        'error',
        'diagonal-segment',
        arrow,
        'has a slanted segment; connectors run only horizontally and vertically: redraw it with fig.arrow (it routes elbows itself) or give allowDiagonal: true if the slant means something'
      )
      continue
    }
    const path = corners(points)
    if (path.length - 2 > 2) {
      add(
        'warning',
        'many-bends',
        arrow,
        `bends ${path.length - 2} times; move the shapes so one bend (at most two) reaches, or drop its via`
      )
    }
    if (path.length < 3) {
      continue
    }
    const ends = ['startBinding', 'endBinding'].map((side, index) => {
      const target = byId.get(arrow[side]?.elementId)
      return target ? { box: boxOf(target) } : { point: index ? points.at(-1) : points[0] }
    })
    const shapes = elements.filter((element) => SIBLINGS.has(element.type))
    const hugged = routeObstacles(shapes, ends, arrow.id).find((box) =>
      path.slice(1).some((point, index) => segmentMeets([path[index], point], box) === 'hug')
    )
    if (hugged) {
      add(
        'warning',
        'elbow-hug',
        arrow,
        `runs along the edge of ${hugged.id}; keep a bend at least ${SNAP} units clear of shapes it does not join`
      )
    }
  }
}

const invisible = (element) =>
  [element.strokeColor, element.backgroundColor].every((color) => !color || color === 'transparent')

/**
 * Boxes laid out by hand or by the kit (not the cells inside a glyph, badges or icons), each
 * with its parent: the smallest box (a card, a panel) around it. Invisible anchors (a box with
 * no fill or outline that no glyph draws into) and items the kit placed itself are left out;
 * a glyph drawn inside an invisible outline (stacked frames) also lines up by its visible parts.
 */
function siblings(elements) {
  // Why shapes only: an outline that holds drawn parts (a token strip, stacked frames) is a
  // glyph; an invisible box that only carries text (an unframed loss) is not a box at all.
  const owners = new Map()
  const drawn = new Map()
  for (const element of elements) {
    const owner = element.customData?.asterKit
    if (owner && owner !== element.id && SIBLINGS.has(element.type)) {
      owners.set(owner, [...(owners.get(owner) ?? []), element])
    }
    if (owner) {
      drawn.set(owner, [...(drawn.get(owner) ?? []), element])
    }
  }
  const byId = new Map(elements.map((element) => [element.id, element]))
  const shapes = elements.filter(
    (element) =>
      SIBLINGS.has(element.type) &&
      (element.customData?.asterKit ?? element.id) === element.id &&
      !element.customData?.asterBadge &&
      !element.customData?.asterIcon &&
      !element.customData?.asterTex &&
      !element.customData?.asterPlaced &&
      // Why not the loss node: the kit places it beside what it compares, not in their row.
      !['compared', 'loss'].includes(element.customData?.asterRole) &&
      !(invisible(element) && !owners.has(element.id)) &&
      element.width >= 12 &&
      element.height >= 12
  )
  const boxes = shapes.map((element) => {
    const box = {
      element,
      ...boxOf(element),
      panel: Boolean(element.customData?.asterPanel),
      ellipsis: (element.boundElements ?? []).some((bound) =>
        ELLIPSIS.test(byId.get(bound.id)?.text ?? '')
      )
    }
    const outline = boxOf(element)
    // Why the whole item too: fig.bounds(id) (a bubble with its tail, a box with its badge) is
    // what the agent may have measured and lined up; lined up that way, it is no slip.
    const whole = (drawn.get(element.id) ?? []).map(boxOf)
    const all = whole.length
      ? {
          lo: [
            Math.min(outline.lo[0], ...whole.map((part) => part.lo[0])),
            Math.min(outline.lo[1], ...whole.map((part) => part.lo[1]))
          ],
          hi: [
            Math.max(outline.hi[0], ...whole.map((part) => part.hi[0])),
            Math.max(outline.hi[1], ...whole.map((part) => part.hi[1]))
          ]
        }
      : null
    // Why faces: the front frame of a stack, not the stack's outline, is what a neighbour meets.
    box.faces = [
      // Why the body: an nn binds round its name too, but lines up by the network itself.
      element.customData?.asterBody
        ? boxOf({ ...element, ...element.customData.asterBody })
        : outline,
      ...(invisible(element) ? (owners.get(element.id) ?? []) : [])
        .filter((part) => SIBLINGS.has(part.type) && !invisible(part))
        .map(boxOf)
        .filter(
          (part) =>
            part.hi[0] - part.lo[0] >= (outline.hi[0] - outline.lo[0]) * 0.5 &&
            part.hi[1] - part.lo[1] >= (outline.hi[1] - outline.lo[1]) * 0.5
        )
    ]
    box.whole = all
      ? { ...all, c: [(all.lo[0] + all.hi[0]) / 2, (all.lo[1] + all.hi[1]) / 2] }
      : null
    return box
  })
  const area = (box) => Math.max(0, box.hi[0] - box.lo[0]) * Math.max(0, box.hi[1] - box.lo[1])
  // Why mostly: content that sticks a few units out of its card still belongs to that card.
  const holds = (outer, inner) => {
    if (outer === inner || area(outer) <= area(inner)) {
      return false
    }
    const shared =
      Math.max(0, Math.min(outer.hi[0], inner.hi[0]) - Math.max(outer.lo[0], inner.lo[0])) *
      Math.max(0, Math.min(outer.hi[1], inner.hi[1]) - Math.max(outer.lo[1], inner.lo[1]))
    return (
      shared >= area(inner) * 0.7 &&
      inner.c[0] > outer.lo[0] &&
      inner.c[0] < outer.hi[0] &&
      inner.c[1] > outer.lo[1] &&
      inner.c[1] < outer.hi[1]
    )
  }
  for (const box of boxes) {
    box.parent =
      boxes
        .filter((other) => holds(other, box))
        .toSorted((first, second) => area(first) - area(second))[0]?.id ?? null
  }
  return boxes
}

/**
 * Neighbours side by side along `axis` (0: a row) in the same card or panel: sharing at least
 * half the smaller one's span, with no other box between them.
 */
function neighbours(boxes, axis) {
  const other = 1 - axis
  const inRow = (a, b) => {
    const shared = Math.min(a.hi[other], b.hi[other]) - Math.max(a.lo[other], b.lo[other])
    const smaller = Math.min(a.hi[other] - a.lo[other], b.hi[other] - b.lo[other])
    return shared >= smaller / 2
  }
  const pairs = []
  // Why not panels: a panel holds a row; it is not a member of the row beside it.
  const members = boxes.filter((box) => !box.panel)
  for (const [index, a] of members.entries()) {
    for (const b of members.slice(index + 1)) {
      if (a.parent !== b.parent) {
        continue
      }
      const [left, right] = a.lo[axis] <= b.lo[axis] ? [a, b] : [b, a]
      const gap = right.lo[axis] - left.hi[axis]
      const between = members.some(
        (box) =>
          box !== a &&
          box !== b &&
          box.parent === a.parent &&
          box.lo[axis] >= left.hi[axis] &&
          box.hi[axis] <= right.lo[axis] &&
          inRow(box, a) &&
          inRow(box, b)
      )
      if (inRow(a, b) && gap > 0 && gap <= 240 && !between) {
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

/** Pairs an arrow joins, in either direction. */
function joinedPairs(elements) {
  const pairs = new Set()
  for (const arrow of elements.filter((element) => element.type === 'arrow')) {
    const [a, b] = [arrow.startBinding?.elementId, arrow.endBinding?.elementId]
    if (a && b) {
      pairs.add(`${a}|${b}`).add(`${b}|${a}`)
    }
  }
  return pairs
}

function faceOffsets(a, b, axis) {
  const other = 1 - axis
  return [
    ['centres', a.c[other] - b.c[other]],
    [axis === 0 ? 'tops' : 'left edges', a.lo[other] - b.lo[other]],
    [axis === 0 ? 'bottoms' : 'right edges', a.hi[other] - b.hi[other]]
  ].map(([name, value]) => [name, Math.abs(value)])
}

/** A bar across the line (a wide model bar over a column of boxes): its centre means nothing. */
const crossBar = (box, axis) => {
  const element = box.element
  const [along, across] =
    axis === 1 ? [element?.width, element?.height] : [element?.height, element?.width]
  return Boolean(element?.customData?.asterBar) || along >= across * 5
}

/**
 * The closest of the ways two items can line up, over each one's faces (outline, front frame);
 * a bar lines up with a box by an edge, never by its centre.
 */
function offsetsOf(a, b, axis) {
  const bar = crossBar(a, axis) || crossBar(b, axis)
  return (a.faces ?? [a])
    .flatMap((face) => (b.faces ?? [b]).flatMap((other) => faceOffsets(face, other, axis)))
    .filter(([name]) => !(bar && name === 'centres'))
    .toSorted((first, second) => first[1] - second[1])
}

function alignChecks(boxes, elements, add) {
  const joined = joinedPairs(elements)
  for (const axis of [0, 1]) {
    const pairs = neighbours(boxes, axis)
    const linked = (box) => pairs.filter(([a, b]) => a === box || b === box).flat()
    for (const [a, b] of pairs) {
      const [name, offset] = offsetsOf(a, b, axis)[0]
      const exact = [a.whole ?? a, a].some((face) =>
        [b.whole ?? b, b].some((other) =>
          faceOffsets(face, other, axis).some(([, value]) => value <= AXIS)
        )
      )
      // Why under SNAP: a whole grid step (8) apart is a choice; less than that is a slip. Why
      // over NEAR_MISS: a unit or two does not show at print, and chasing it forces odd sizes.
      if (exact || offset <= NEAR_MISS || offset >= SNAP) {
        continue
      }
      // Why: two boxes merely near each other are not a row; an arrow or a third box next to
      // one of them, in the same row, makes one.
      const run = new Set(
        [...linked(a), ...linked(b)].filter(
          (box) => box.parent === a.parent && offsetsOf(a, box, axis)[0][1] < SNAP
        )
      )
      if (!joined.has(`${a.id}|${b.id}`) && run.size < 3) {
        continue
      }
      add(
        'error',
        'near-miss-align',
        b.element,
        `${b.id} and ${a.id} are ${round(offset)} units apart (${name}) in their ${axis === 0 ? 'row' : 'column'}; line them up exactly (fig.align, fig.row, fig.column)`
      )
    }
  }
}

/** Nodes (⊕), dots and ⋯ items sit between blocks; their gaps are not a row's spacing. */
const spaced = (box) =>
  !box.ellipsis &&
  !(box.element.type === 'ellipse' && Math.max(box.element.width, box.element.height) <= 40)

function spacingChecks(boxes, add, allowedOf) {
  // Why the neighbours too: a deliberate gap sits beside the item marked intentional.
  const deliberate = (box) => allowedOf(box.element).has('uneven-spacing')
  for (const axis of [0, 1]) {
    const other = 1 - axis
    const lines = new Map()
    for (const box of boxes.filter((item) => spaced(item) && !item.panel)) {
      const key = `${box.parent}|${Math.round(box.c[other])}`
      lines.set(key, [...(lines.get(key) ?? []), box])
    }
    // Why: an item lined up with one in another panel (rows across two panels) sits where that
    // row is, whatever its own neighbours' heights.
    const acrossPanels = (box) =>
      boxes.some(
        (other) =>
          other.parent !== box.parent &&
          !other.panel &&
          [
            [other.lo[axis], box.lo[axis]],
            [other.c[axis], box.c[axis]],
            [other.hi[axis], box.hi[axis]]
          ].some(([first, second]) => Math.abs(first - second) <= AXIS)
      )
    for (const line of lines.values()) {
      const sorted = line.toSorted((first, second) => first.lo[axis] - second.lo[axis])
      for (let index = 1; index + 1 < sorted.length; index += 1) {
        const before = sorted[index].lo[axis] - sorted[index - 1].hi[axis]
        const after = sorted[index + 1].lo[axis] - sorted[index].hi[axis]
        const [small, large] = [Math.min(before, after), Math.max(before, after)]
        const pitch = [
          sorted[index].c[axis] - sorted[index - 1].c[axis],
          sorted[index + 1].c[axis] - sorted[index].c[axis]
        ]
        // Why the whole items too: fig.distribute spaces what fig.bounds measures (a bubble with
        // its tail, a box with its badge), so even by that model is even.
        const whole = [index - 1, index, index + 1].map((at) => sorted[at].whole ?? sorted[at])
        const wholeGaps = [
          whole[1].lo[axis] - whole[0].hi[axis],
          whole[2].lo[axis] - whole[1].hi[axis]
        ]
        // Why the pitch: boxes of different sizes on an even centre-to-centre step are even.
        if (
          sorted.slice(index - 1, index + 2).some(deliberate) ||
          Math.abs(pitch[0] - pitch[1]) <= SPACING ||
          Math.abs(wholeGaps[0] - wholeGaps[1]) <= SPACING ||
          acrossPanels(sorted[index])
        ) {
          continue
        }
        if (small > 0 && large <= small * 1.5 && large - small > SPACING) {
          add(
            'warning',
            'uneven-spacing',
            sorted[index].element,
            `has gaps of ${round(before)} and ${round(after)} on either side in its ${axis === 0 ? 'row' : 'column'}; space them evenly (fig.distribute)`
          )
        }
      }
    }
  }
}

const runLength = (points) =>
  points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
      0
    )

/** How much of an axis-aligned path runs inside a box's interior. */
function lengthInside(points, box) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const [p, q] = [points[index - 1], points[index]]
    const axis = Math.abs(p[1] - q[1]) <= AXIS ? 0 : Math.abs(p[0] - q[0]) <= AXIS ? 1 : null
    if (axis === null) {
      continue
    }
    const other = 1 - axis
    if (p[other] <= box.lo[other] + 2 || p[other] >= box.hi[other] - 2) {
      continue
    }
    const from = Math.max(Math.min(p[axis], q[axis]), box.lo[axis])
    const to = Math.min(Math.max(p[axis], q[axis]), box.hi[axis])
    total += Math.max(0, to - from)
  }
  return total
}

/** Stub arrows, arrows chained head to tail, arrows a later filled shape covers, \frac labels. */
function arrowChecks(elements, add) {
  const arrows = elements.filter((element) => element.type === 'arrow')
  const index = new Map(elements.map((element, position) => [element.id, position]))
  const ends = arrows.map((arrow) => ({ arrow, points: absolutePoints(arrow) }))
  for (const { arrow, points } of ends) {
    const length = runLength(points)
    if (points.length > 1 && length < 12) {
      add(
        'warning',
        'stub-arrow',
        arrow,
        `is ${Math.round(length)} units long, little more than its head; lengthen it (move the shapes apart) or drop it`
      )
    }
    if (arrow.endArrowhead) {
      const tip = points.at(-1)
      // Why both: a head at another arrow's start, or two heads meeting tip to tip.
      const next = ends.find(
        (other) =>
          other.arrow !== arrow &&
          (Math.hypot(other.points[0][0] - tip[0], other.points[0][1] - tip[1]) < 6 ||
            (other.arrow.endArrowhead &&
              Math.hypot(other.points.at(-1)[0] - tip[0], other.points.at(-1)[1] - tip[1]) < 6))
      )
      if (next) {
        add(
          'warning',
          'arrow-chain',
          arrow,
          `ends where ${next.arrow.id} starts or ends, a head in the middle of a line; draw one arrow (via) or end both at a shape or a junction`
        )
      }
    }
    const joined = new Set([arrow.startBinding?.elementId, arrow.endBinding?.elementId])
    const cover = elements.find(
      (shape) =>
        SIBLINGS.has(shape.type) &&
        shape.width >= 12 &&
        shape.height >= 12 &&
        index.get(shape.id) > index.get(arrow.id) &&
        !joined.has(shape.id) &&
        shape.backgroundColor &&
        shape.backgroundColor !== 'transparent' &&
        (shape.opacity ?? 100) > 50 &&
        lengthInside(points, boxOf(shape)) >= Math.min(24, length * 0.3)
    )
    if (cover) {
      add(
        'warning',
        'hidden-arrow',
        arrow,
        `runs under ${cover.id}, which is drawn on top of it; route it around, or put ${cover.id} behind (fig.order)`
      )
    }
  }
  for (const math of elements.filter((element) => element.customData?.asterMath)) {
    if (/\\t?frac(?![a-z])/.test(String(math.customData.asterMath))) {
      add(
        'warning',
        'small-script',
        math,
        `"${math.customData.asterMath}": \\frac sets its parts at about 70%, under 6.5 pt in print; write \\dfrac or a slash`
      )
    }
  }
}

export function routeLintChecks(elements, add, allowedOf = () => new Set()) {
  routeChecks(elements, add)
  arrowChecks(elements, add)
  const boxes = siblings(elements)
  alignChecks(boxes, elements, add)
  spacingChecks(boxes, add, allowedOf)
}
