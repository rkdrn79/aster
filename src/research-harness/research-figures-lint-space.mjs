// Empty space as a reader sees it: a map of the page further than a sixth of an inch from any
// ink, the share of the page it covers, and where the stretches of about an inch lie, so the
// lint names them and the lint PNG boxes them in place.
import { elementBounds } from './research-figures-geometry.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { glyphBounds } from './research-figures-text.mjs'

/** Grid step of the blank-space map, in units. */
const STEP = 8
/** Breathing room around ink that does not count as blank: a sixth of an inch. */
const HALO = 24
/**
 * Blank share that draws a finding: judges ask for under about 15% of dead canvas; measured
 * beyond a sixth of an inch from ink, tidy figures of round G sat at 2–19%.
 */
export const BLANK_SHARE = 0.2
/** A page this blank is sparse enough that a page someone else sized may be raised. */
export const SPARSE_SHARE = 0.3
/**
 * An empty stretch: blank beyond the halo at least this wide and tall, so about an inch of page
 * lies between the ink around it. A gap between two branches is narrower and passes.
 */
const REGION = { width: 112, height: 96 }
// Why larger in a corner: a drawing's outline often leaves a page corner open; only a large
// opening there reads as a hole.
const CORNER_SCALE = 1.5
/** Blank rectangles shown for a sparse page with no single empty stretch. */
const SPARSE_REGION = { width: 48, height: 48 }

/**
 * Which 8-unit cells of the page lie within HALO of ink (shapes, images, text, line segments),
 * panels and the page frame aside; `gaps` (stretches allowed to stay empty) count as ink.
 */
export function blankMap(elements, page, gaps = [], { panelEdges = false } = {}) {
  const cols = Math.ceil(page.width / STEP)
  const rows = Math.ceil(page.height / STEP)
  const inked = new Uint8Array(cols * rows)
  const mark = (x0, y0, x1, y1) => {
    const top = Math.max(0, Math.floor((y0 - page.y - HALO) / STEP))
    const bottom = Math.min(rows, Math.ceil((y1 - page.y + HALO) / STEP))
    const left = Math.max(0, Math.floor((x0 - page.x - HALO) / STEP))
    const right = Math.min(cols, Math.ceil((x1 - page.x + HALO) / STEP))
    for (let row = top; row < bottom; row += 1) {
      inked.fill(1, row * cols + left, row * cols + Math.max(left, right))
    }
  }
  for (const element of elements) {
    // Why not invisible shapes: a group's container (fig.group) or an anchor draws nothing.
    const shape = ['rectangle', 'ellipse', 'diamond'].includes(element.type)
    if (
      shape &&
      !element.customData?.asterPanel &&
      [element.strokeColor, element.backgroundColor].every(
        (color) => !color || color === 'transparent'
      )
    ) {
      continue
    }
    // Why edges for stretches: a gutter between two panels is structure, not a hole.
    if (element.customData?.asterPanel && panelEdges) {
      const box = elementBounds(element)
      mark(box.x, box.y, box.right, box.y)
      mark(box.x, box.bottom, box.right, box.bottom)
      mark(box.x, box.y, box.x, box.bottom)
      mark(box.right, box.y, box.right, box.bottom)
      continue
    }
    if (element.type === 'frame' || element.customData?.asterPanel) {
      continue
    }
    // Why segments: an elbow arrow's bounding box is mostly empty page.
    if ((element.type === 'arrow' || element.type === 'line') && element.points?.length > 1) {
      const points = absolutePoints(element)
      for (const [index, point] of points.slice(1).entries()) {
        const start = points[index]
        mark(
          Math.min(start[0], point[0]),
          Math.min(start[1], point[1]),
          Math.max(start[0], point[0]),
          Math.max(start[1], point[1])
        )
      }
      continue
    }
    const box = element.type === 'text' ? glyphBounds(element) : elementBounds(element)
    mark(box.x, box.y, box.x + box.width, box.y + box.height)
  }
  for (const gap of gaps) {
    mark(gap.x + HALO, gap.y + HALO, gap.x + gap.width - HALO, gap.y + gap.height - HALO)
  }
  return { cols, rows, inked }
}

/** The share of the page further than HALO from any ink. */
export function blankShare(elements, page, gaps = []) {
  const { inked } = blankMap(elements, page, gaps)
  return inked.reduce((sum, value) => sum + (value ? 0 : 1), 0) / inked.length
}

/**
 * The largest blank rectangle (in cells) that `fits`, over every maximal one: for each row as
 * the bottom, the histogram of blank cells above it, widened as far as each bar allows.
 */
function largestBlank({ cols, rows, inked }, fits) {
  const heights = new Uint32Array(cols)
  let best = null
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      heights[col] = inked[row * cols + col] ? 0 : heights[col] + 1
    }
    const stack = []
    for (let col = 0; col <= cols; col += 1) {
      const height = col < cols ? heights[col] : 0
      let start = col
      while (stack.length && stack.at(-1).height >= height) {
        const bar = stack.pop()
        const rect = {
          col: bar.start,
          row: row - bar.height + 1,
          cols: col - bar.start,
          rows: bar.height
        }
        if (
          rect.rows > 0 &&
          fits(rect) &&
          (!best || rect.cols * rect.rows > best.cols * best.rows)
        ) {
          best = rect
        }
        start = bar.start
      }
      stack.push({ start, height })
    }
  }
  return best
}

/** Inked cells in rows [row0, row1) and columns [col0, col1), from a summed-area table. */
function inkCounter({ cols, rows, inked }) {
  const sums = new Uint32Array((cols + 1) * (rows + 1))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      sums[(row + 1) * (cols + 1) + col + 1] =
        inked[row * cols + col] +
        sums[row * (cols + 1) + col + 1] +
        sums[(row + 1) * (cols + 1) + col] -
        sums[row * (cols + 1) + col]
    }
  }
  return (row0, row1, col0, col1) =>
    row1 <= row0 || col1 <= col0
      ? 0
      : sums[row1 * (cols + 1) + col1] -
        sums[row0 * (cols + 1) + col1] -
        sums[row1 * (cols + 1) + col0] +
        sums[row0 * (cols + 1) + col0]
}

/**
 * Blank stretches at least `min` units (beyond the halo) in scene units, largest first, each
 * grown by the halo to the empty page it stands for; larger ones only in a page corner.
 */
export function emptyStretches(map, page, { min = REGION, count = 3, corner = true } = {}) {
  const work = { ...map, inked: map.inked.slice() }
  const need = { cols: Math.ceil(min.width / STEP), rows: Math.ceil(min.height / STEP) }
  const inkIn = inkCounter(map)
  const fits = (rect) => {
    // Why open sides: a stretch with no ink between it and two crossing page edges is a corner.
    const across = [rect.row, rect.row + rect.rows]
    const down = [rect.col, rect.col + rect.cols]
    const open = {
      left: !inkIn(...across, 0, rect.col),
      right: !inkIn(...across, rect.col + rect.cols, map.cols),
      top: !inkIn(0, rect.row, ...down),
      bottom: !inkIn(rect.row + rect.rows, map.rows, ...down)
    }
    // Why small: a strip along a whole edge is a page left unfilled, not a corner left open.
    const nook = rect.cols < map.cols / 2 && rect.rows < map.rows / 2
    const cornered = corner && nook && (open.left || open.right) && (open.top || open.bottom)
    const scale = cornered ? CORNER_SCALE : 1
    return rect.cols >= need.cols * scale && rect.rows >= need.rows * scale
  }
  const found = []
  while (found.length < count) {
    const rect = largestBlank(work, fits)
    if (!rect) {
      break
    }
    for (let row = rect.row; row < rect.row + rect.rows; row += 1) {
      work.inked.fill(1, row * map.cols + rect.col, row * map.cols + rect.col + rect.cols)
    }
    const x = Math.max(page.x, page.x + rect.col * STEP - HALO)
    const y = Math.max(page.y, page.y + rect.row * STEP - HALO)
    const right = Math.min(page.x + page.width, page.x + (rect.col + rect.cols) * STEP + HALO)
    const bottom = Math.min(page.y + page.height, page.y + (rect.row + rect.rows) * STEP + HALO)
    found.push({ x, y, width: right - x, height: bottom - y })
  }
  return found
}

const span = (region) =>
  `x ${Math.round(region.x)}–${Math.round(region.x + region.width)}, y ${Math.round(region.y)}–${Math.round(region.y + region.height)}`

/**
 * Empty stretches of about an inch, and a page mostly blank: each finding carries the
 * `regions` it is about, so `figures check` names them and the lint PNG boxes them in place.
 */
export function spaceChecks(elements, page, add, { sized = false, gaps = [] } = {}) {
  const drawn = elements.some(
    (element) => element.type !== 'frame' && !element.customData?.asterPanel
  )
  if (!page || !drawn) {
    return
  }
  const map = blankMap(elements, page, gaps)
  const share = map.inked.reduce((sum, value) => sum + (value ? 0 : 1), 0) / map.inked.length
  const empty = emptyStretches(blankMap(elements, page, gaps, { panelEdges: true }), page)
  const blank = `about ${Math.round(share * 100)}% of the page is blank`
  const keep = sized ? ', or shrink the page' : ' (the page was set for you: keep its size)'
  if (!empty.length && share >= BLANK_SHARE) {
    const regions = emptyStretches(map, page, { min: SPARSE_REGION, corner: false })
    add(
      'warning',
      'empty-space',
      null,
      `${blank} (more than a sixth of an inch from any ink${regions.length ? `; most around ${span(regions[0])}` : ''}); fill it: enlarge the data glyphs, give the hero more room, or spread the rows${keep}`,
      { regions }
    )
  }
  if (empty.length) {
    add(
      'warning',
      'empty-region',
      null,
      `${empty.length} empty stretch${empty.length > 1 ? 'es' : ''} of about an inch or more (${empty.map(span).join('; ')})${share >= BLANK_SHARE ? `, and ${blank}` : ''}; move content there or enlarge the data glyphs${keep}; fig.allow('empty-region', { x, y, w, h }) marks a gap left on purpose`,
      { regions: empty }
    )
  }
}
