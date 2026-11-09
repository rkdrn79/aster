// Where the loss goes and what it says: the sizes and gaps it keeps, the spot beside or between
// the sets it compares (clear of every other item, snapped onto a neighbour's line, on the page),
// and its label in each form. Pure geometry for research-figures-kit-loss.mjs.
import { makeBox } from './research-figures-draw.mjs'
import { oneOf } from './research-figures-options.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { elementBounds } from './research-figures-geometry.mjs'

/** Dashed links shorter than this print as solid lines. */
export const MIN_LINK = 40
/** The shortest solid link a loss leaves room for between two sets: a head and a little line. */
export const MIN_STUB = 20
/** How far a loss sits from its sets: a short stub with solid links, room to print with dashed. */
export const GAP = 32
export const DASHED_GAP = 48
/** name: "L1 loss"; symbol: ℒ_DPO; formula: the equation; compare: a link; none: marks only. */
export const LOSS_FORMS = ['name', 'symbol', 'formula', 'compare', 'none']
const MARGIN = 12
export const RINGABLE = new Set(['rectangle', 'ellipse', 'diamond'])

export function routeBetween(from, to) {
  const shareRow = Math.min(from.bottom, to.bottom) - Math.max(from.y, to.y) >= 8
  const shareColumn = Math.min(from.right, to.right) - Math.max(from.x, to.x) >= 8
  if (shareRow || shareColumn) {
    return 'straight'
  }
  const dx = Math.abs(from.x + from.width / 2 - (to.x + to.width / 2))
  const dy = Math.abs(from.y + from.height / 2 - (to.y + to.height / 2))
  return dx >= dy ? 'hv' : 'vh'
}

export function pathLength(arrow) {
  const points = absolutePoints(arrow)
  return points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
      0
    )
}

export const union = (boxes) => {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

/**
 * TeX for a loss formula: \\frac in display size, so its parts print at 7 pt or more; \\tfrac
 * stays the small inline fraction the person asked for.
 */
const displayFractions = (tex) => String(tex).replaceAll(/\\frac(?![a-z])/g, '\\dfrac')

export const overlap = (a, b, margin = 0) =>
  a.x < b.right + margin &&
  a.right > b.x - margin &&
  a.y < b.bottom + margin &&
  a.bottom > b.y - margin

/**
 * The page around a loss: `boxes` it must not land on (shapes, text, images, closed outlines,
 * and each arrow by its runs, marked `line`; a panel only when it holds none of `sets`, marked
 * `holder`), and `guides`, the edges and centres of every shape it might line up with
 * (invisible anchors too, which the lint compares as well). What this loss drew earlier and the
 * page are left out.
 */
export function layoutAround(elements, id, sets = []) {
  const guides = []
  const mine = (element) =>
    element.id === id ||
    element.id.startsWith(`${id}-`) ||
    element.customData?.asterKit === id ||
    element.containerId === id
  const holds = (box) =>
    sets.some(
      (set) =>
        set.x >= box.x - 1 &&
        set.y >= box.y - 1 &&
        set.right <= box.right + 1 &&
        set.bottom <= box.bottom + 1
    )
  const boxes = []
  for (const element of elements) {
    if (element.isDeleted || element.type === 'frame' || mine(element)) {
      continue
    }
    const box = elementBounds(element)
    const edges = { x: box.x, y: box.y, right: box.right, bottom: box.bottom }
    if (element.customData?.asterPanel) {
      // Why only a panel that holds no set: a loss may sit in its own group, not in another.
      if (!holds(edges)) {
        boxes.push({ ...edges, holder: true })
      }
      continue
    }
    const points = element.points ? absolutePoints(element) : []
    const closed =
      points.length > 2 &&
      (Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1 ||
        !['transparent', undefined, null].includes(element.backgroundColor))
    if ((element.type === 'arrow' || element.type === 'line') && !closed) {
      for (let index = 1; index < points.length; index += 1) {
        const [p, q] = [points[index - 1], points[index]]
        boxes.push({
          x: Math.min(p[0], q[0]) - 1,
          y: Math.min(p[1], q[1]) - 1,
          right: Math.max(p[0], q[0]) + 1,
          bottom: Math.max(p[1], q[1]) + 1,
          line: true
        })
      }
      continue
    }
    // Why only whole items: the lint lines up items, not the cells or bars inside a glyph.
    const whole =
      (element.customData?.asterKit ?? element.id) === element.id &&
      !element.customData?.asterBadge &&
      !element.customData?.asterIcon &&
      !element.customData?.asterTex
    if (whole && element.type !== 'text' && box.width >= 12 && box.height >= 12) {
      guides.push(edges)
    }
    const invisible =
      ['transparent', undefined, null].includes(element.strokeColor) &&
      ['transparent', undefined, null].includes(element.backgroundColor)
    if (invisible && !['text', 'image', 'line'].includes(element.type)) {
      continue
    }
    boxes.push(edges)
  }
  return { boxes, guides }
}

/** The gap between two boxes (`x`, `y`, `right`, `bottom`): 0 when they touch or overlap. */
export const boxGap = (a, b) =>
  Math.max(0, b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom)

/**
 * How far an automatic loss may sit from each set it compares: three gaps, or half way across
 * the widest gap between two of its sets (and one gap more) when they lie far apart.
 */
export function localLimit(sets, gap) {
  const apart = sets.flatMap((a, i) => sets.slice(i + 1).map((b) => boxGap(a, b)))
  return Math.max(3 * gap, Math.max(0, ...apart) / 2 + gap + 8)
}

/** How much of a box another covers. */
const covered = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y))

/**
 * What a link from a set to the node costs: its length, 60 a bend, and what it runs through
 * (1000 a block, 120 an arrow it crosses or runs along, 60 a panel) and how far it falls short of
 * a `stub` (it would be all head), the cheaper of the two
 * elbows when the two share no row or column. The set's own parts are not in its way.
 */
export function linkCost(from, to, boxes, stub = MIN_STUB) {
  const centre = (box) => [(box.x + box.right) / 2, (box.y + box.bottom) / 2]
  const [fc, tc] = [centre(from), centre(to)]
  const edgeX = (box, toward) => (toward >= (box.x + box.right) / 2 ? box.right : box.x)
  const edgeY = (box, toward) => (toward >= (box.y + box.bottom) / 2 ? box.bottom : box.y)
  const rows = [Math.max(from.y, to.y), Math.min(from.bottom, to.bottom)]
  const columns = [Math.max(from.x, to.x), Math.min(from.right, to.right)]
  let paths
  if (rows[1] - rows[0] >= 8) {
    const y = (rows[0] + rows[1]) / 2
    paths = [
      [
        [edgeX(from, tc[0]), y],
        [edgeX(to, fc[0]), y]
      ]
    ]
  } else if (columns[1] - columns[0] >= 8) {
    const x = (columns[0] + columns[1]) / 2
    paths = [
      [
        [x, edgeY(from, tc[1])],
        [x, edgeY(to, fc[1])]
      ]
    ]
  } else {
    paths = [
      [
        [edgeX(from, tc[0]), fc[1]],
        [tc[0], fc[1]],
        [tc[0], edgeY(to, fc[1])]
      ],
      [
        [fc[0], edgeY(from, tc[1])],
        [fc[0], tc[1]],
        [edgeX(to, fc[0]), tc[1]]
      ]
    ]
  }
  const own = (box) =>
    box.x >= from.x - 1 &&
    box.y >= from.y - 1 &&
    box.right <= from.right + 1 &&
    box.bottom <= from.bottom + 1
  const blockers = boxes.filter((box) => !own(box) && !overlap(box, to))
  const cost = (path) => {
    let total = (path.length - 2) * 60
    let length = 0
    for (let index = 1; index < path.length; index += 1) {
      const [p, q] = [path[index - 1], path[index]]
      length += Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
      const run = {
        x: Math.min(p[0], q[0]) - 0.5,
        y: Math.min(p[1], q[1]) - 0.5,
        right: Math.max(p[0], q[0]) + 0.5,
        bottom: Math.max(p[1], q[1]) + 0.5
      }
      for (const box of blockers) {
        const inner = box.line
          ? box
          : { x: box.x + 1, y: box.y + 1, right: box.right - 1, bottom: box.bottom - 1 }
        if (overlap(run, inner)) {
          total += box.holder ? 60 : box.line ? 120 : 1000
        }
      }
    }
    // Why: a link shorter than a stub is all head (a dashed one prints solid).
    return total + length + Math.max(0, stub - length) * 10
  }
  return Math.min(...paths.map(cost))
}

/**
 * Where the loss node may go without x or cx, best first: a short stub from the sets, between
 * prediction and target when they are stacked or side by side with room for two stubs, else
 * right, left, below or above them all or one of them (`side` first), sliding along and stepping
 * out a few grid units: spots on the page that land on nothing, by how short their links are and
 * how little they cross, each centre snapped onto a centre line a few units off so rows stay
 * exact. With no free spot, only the one on the page that covers least (`free: false`).
 */
export function placements(spec, sets, size, page, gap, { boxes: obstacles, guides }, stub = 20) {
  const all = union(sets)
  const [w, h] = size
  const around = (box) => {
    const middle = { cx: (box.x + box.right) / 2, cy: (box.y + box.bottom) / 2 }
    return {
      right: { x: box.right + gap, y: middle.cy - h / 2, out: [1, 0] },
      left: { x: box.x - gap - w, y: middle.cy - h / 2, out: [-1, 0] },
      below: { x: middle.cx - w / 2, y: box.bottom + gap, out: [0, 1] },
      above: { x: middle.cx - w / 2, y: box.y - gap - h, out: [0, -1] }
    }
  }
  const spots = []
  const [first, second] = sets.length >= 2 ? [union([sets[0]]), union(sets.slice(1))] : []
  const middle = { cx: (all.x + all.right) / 2, cy: (all.y + all.bottom) / 2 }
  // Why two stubs of room: each link needs a run that holds its head (40 when dashed).
  if (
    first &&
    (first.bottom + 2 * stub + h <= second.y || second.bottom + 2 * stub + h <= first.y)
  ) {
    const top = first.bottom <= second.y ? first : second
    const low = top === first ? second : first
    spots.push({
      side: 'between',
      x: middle.cx - w / 2,
      y: (top.bottom + low.y) / 2 - h / 2,
      out: [0, 0]
    })
  } else if (
    first &&
    (first.right + 2 * stub + w <= second.x || second.right + 2 * stub + w <= first.x)
  ) {
    // Why side by side too: prediction and target in one row meet at a loss between them.
    const left = first.right <= second.x ? first : second
    const right = left === first ? second : first
    spots.push({
      side: 'between',
      x: (left.right + right.x) / 2 - w / 2,
      y: middle.cy - h / 2,
      out: [0, 0]
    })
  }
  for (const box of [all, ...(sets.length > 1 ? sets : [])]) {
    for (const [side, spot] of Object.entries(around(box))) {
      spots.push({ side, ...spot })
    }
  }
  const box = (spot) => ({ x: spot.x, y: spot.y, right: spot.x + w, bottom: spot.y + h })
  const inside = (spot) =>
    !page ||
    (spot.x >= page.x + MARGIN &&
      spot.y >= page.y + MARGIN &&
      spot.x + w <= page.x + page.width - MARGIN &&
      spot.y + h <= page.y + page.height - MARGIN)
  const free = (spot) => !obstacles.some((other) => overlap(box(spot), other, 4))
  const sides = ['between', 'right', 'left', 'below', 'above']
  const wanted = spec.side ? oneOf('side', spec.side, sides) : null
  // Why room: a node squeezed a few units under a block reads as part of it.
  const crowded = (spot) =>
    obstacles.filter(
      (other) =>
        !other.holder &&
        !sets.some((set) => overlap(set, other)) &&
        overlap(box(spot), other, other.line ? 6 : 12)
    ).length
  const limit = localLimit(sets, gap)
  // Why a small order: equal links go between, then right, left, below, above, as before.
  const cost = (spot) =>
    sets.reduce((sum, set) => sum + Math.max(0, boxGap(box(spot), set) - limit) * 50, 0) +
    sets.reduce((sum, set) => sum + linkCost(set, box(spot), obstacles, stub), 0) +
    crowded(spot) * 300 +
    sides.indexOf(spot.side) * 4 +
    (wanted && spot.side !== wanted ? 2000 : 0)
  // Why: a script may fix the row (cy or y) and let the kit pick the spot along it.
  const row = spec.cy !== undefined ? spec.cy - h / 2 : spec.y
  const candidates = []
  const steps = [0, 8, 16, 24, 32, 48]
  const slides = [0, 8, -8, 16, -16, 24, -24, 32, -32, 48, -48]
  for (const spot of spots) {
    const [ox, oy] = spot.out
    for (const step of ox || oy ? steps : [0]) {
      for (const slide of slides) {
        // Why across the way out: right of the sets the node slides up or down.
        const candidate = {
          side: spot.side,
          x: spot.x + ox * step + (ox ? 0 : slide),
          y: row ?? spot.y + oy * step + (ox ? slide : 0)
        }
        if (inside(candidate)) {
          candidates.push(candidate)
        }
      }
    }
  }
  const open = candidates.filter(free)
  if (open.length) {
    const seen = new Set()
    return open
      .map((candidate) => ({ candidate, cost: cost(candidate) }))
      .toSorted((a, b) => a.cost - b.cost)
      .filter(({ candidate }) => {
        const key = `${candidate.x},${candidate.y}`
        return !seen.has(key) && seen.add(key)
      })
      .slice(0, 48)
      .map(({ candidate }) => ({
        ...snapSpot(candidate, size, guides, inside, free),
        side: candidate.side,
        free: true
      }))
  }
  if (candidates.length) {
    // Why least covered: with no room anywhere, the node should hide as little as it can.
    const hidden = (spot) =>
      obstacles.reduce((sum, other) => sum + covered(box(spot), other) * (other.line ? 1 : 10), 0)
    const best = candidates
      .map((candidate) => ({ candidate, cost: hidden(candidate) * 4 + cost(candidate) }))
      .reduce((a, b) => (b.cost < a.cost ? b : a))
    return [{ x: best.candidate.x, y: best.candidate.y, side: best.candidate.side, free: false }]
  }
  // Why clamp: off the page the node does not print at all.
  const asked = spots.find((spot) => spot.side === (wanted ?? 'right')) ?? spots[0]
  return [{ ...clampToPage({ x: asked.x, y: asked.y }, [w, h], page), free: false }]
}

/**
 * A spot snapped onto its neighbours' lines: a node a few units off a neighbour's edge or centre
 * reads as a misalignment (and the lint calls it one); each axis moves onto the nearest such
 * line within 6 units, where the spot stays on the page and free.
 */
function snapSpot(spot, [w, h], guides, inside, free) {
  let current = { x: spot.x, y: spot.y }
  for (const [axis, low, high, extent] of [
    ['x', 'x', 'right', w],
    ['y', 'y', 'bottom', h]
  ]) {
    // Why neighbours only: x edges line up with what shares the column, y with the row.
    const across = axis === 'x' ? ['x', 'right', w] : ['y', 'bottom', h]
    const lines = guides.flatMap((other) =>
      other[across[1]] > current[across[0]] - 6 &&
      other[across[0]] < current[across[0]] + across[2] + 6
        ? [other[low], (other[low] + other[high]) / 2, other[high]]
        : []
    )
    const ends = (at) => [at, at + extent / 2, at + extent]
    const misses = (at) =>
      ends(at).reduce(
        (sum, end) =>
          sum +
          lines.filter((line) => Math.abs(line - end) > 0.25 && Math.abs(line - end) <= 6).length,
        0
      )
    const shifts = [
      0,
      ...new Set(
        lines
          .flatMap((line) => ends(current[axis]).map((end) => line - end))
          .filter((shift) => Math.abs(shift) > 0.25 && Math.abs(shift) <= 6)
      )
    ].toSorted((a, b) => Math.abs(a) - Math.abs(b))
    let best = { at: current[axis], misses: misses(current[axis]) }
    for (const shift of shifts) {
      const moved = { ...current, [axis]: current[axis] + shift }
      const count = misses(moved[axis])
      if (count < best.misses && inside(moved) && free(moved)) {
        best = { at: moved[axis], misses: count }
      }
      if (best.misses === 0) {
        break
      }
    }
    current = { ...current, [axis]: best.at }
  }
  return current
}

export function clampToPage(spot, [w, h], page) {
  if (!page) {
    return spot
  }
  return {
    x: Math.min(Math.max(spot.x, page.x + MARGIN), page.x + page.width - MARGIN - w),
    y: Math.min(Math.max(spot.y, page.y + MARGIN), page.y + page.height - MARGIN - h)
  }
}

/**
 * The form a loss takes when none is named: `name` with a name, `formula` with a formula (or an
 * old `label` holding a whole equation: a fraction, a sum, an expectation, '='), else `symbol`.
 */
export function lossForm(spec) {
  const form = oneOf('form', spec.form, LOSS_FORMS)
  if (form) {
    return form
  }
  if (spec.name !== undefined) {
    return 'name'
  }
  const equation = (tex) =>
    typeof tex === 'string' &&
    (/\\t?d?frac|\\sum|\\mathbb\{E\}|\\log|=/.test(tex) || tex.length > 28)
  if (
    spec.formula !== undefined ||
    (Array.isArray(spec.label) &&
      spec.label.every((line) => typeof line === 'string') &&
      spec.label.length > 1) ||
    equation(spec.label)
  ) {
    return 'formula'
  }
  return 'symbol'
}

/** The loss node's size for `styled` (a spec in the figure's style): its label, plus a frame's room. */
export function lossNodeSize(styled, spec, form = lossForm(spec)) {
  const label = lossLabel(form, spec)
  const fit = makeBox({ ...styled, label, w: 1, h: 1, size: spec.size })[0]
  const framed = spec.boxed === true
  return {
    label,
    width: spec.w ?? fit.width + (framed ? 12 : 4),
    height: spec.h ?? fit.height + (framed ? 8 : 2)
  }
}

/** The label's runs: a name is plain text, a symbol TeX, a formula TeX lines; arrays mix runs. */
export function lossLabel(form, spec) {
  const value =
    form === 'name'
      ? (spec.name ?? spec.label)
      : form === 'formula'
        ? (spec.formula ?? spec.label)
        : (spec.symbol ?? spec.label ?? spec.name)
  if (value === undefined || value === null || value === '') {
    return form === 'compare' ? [] : [{ tex: '\\mathcal{L}' }]
  }
  if (form === 'formula') {
    // Why lines: a long objective breaks over lines given as an array.
    return [value]
      .flat()
      .flatMap((line, index) => [
        ...(index ? ['\n'] : []),
        ...(typeof line === 'string' ? [{ tex: displayFractions(line) }] : [line])
      ])
  }
  if (Array.isArray(value)) {
    return value
  }
  if (form === 'name') {
    // Why a string: a plain name is bound text, editable on the canvas like any label.
    return String(value)
  }
  return form === 'compare' && spec.name !== undefined ? [String(value)] : [{ tex: String(value) }]
}
