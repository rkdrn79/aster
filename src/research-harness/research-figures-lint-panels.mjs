// Lint for what sits on, in and across panels and boxes: content sticking out of a panel or a
// sized box, lines along a panel's border, rows touching it, labels over badges, dashed links
// crossing the arrow field or running long, overlapping loss frames, dashed boxes too small to
// read as dashed, and photos too small to show anything at print size.
import { elementBounds, isInside, overlaps } from './research-figures-geometry.mjs'
import { absolutePoints } from './research-figures-labels.mjs'
import { glyphBounds } from './research-figures-text.mjs'
import { isLossRole } from './research-figures-style.mjs'

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
const round = (value) => Math.round(value * 10) / 10
/** The widest text a paper prints: a double column, 6.75 in. */
const PRINT_WIDTH_IN = 6.75
/** A dashed run longer than this share of the page width reads as a second wiring layer. */
const LONG_DASH = 0.25
/** Closer than this to a panel's edge, a line or a box reads as touching it. */
const TOUCH = 4

/**
 * How much the page shrinks in print: a page wider than a double column is scaled to 6.75 in, so
 * its text prints smaller than its fontSize says.
 */
export function printScale(page) {
  return page && page.widthIn > PRINT_WIDTH_IN + 0.01 ? PRINT_WIDTH_IN / page.widthIn : 1
}

const ownerOf = (element) => element?.customData?.asterKit ?? element?.id
const invisible = (element) => !visible(element.strokeColor) && !visible(element.backgroundColor)
const inkOf = (element) => (element.type === 'text' ? glyphBounds(element) : elementBounds(element))
const area = (box) => Math.max(0, box.width) * Math.max(0, box.height)

function intersection(first, second) {
  const x = Math.max(first.x, second.x)
  const y = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return { x, y, width: right - x, height: bottom - y }
}

/** The panels and the boxes something else sits in on purpose (explicitly sized containers). */
function containers(elements) {
  return elements.filter(
    (element) =>
      SHAPES.has(element.type) &&
      element.width >= 40 &&
      element.height >= 24 &&
      (element.customData?.asterPanel ||
        (visible(element.backgroundColor) && !element.customData?.asterBadge))
  )
}

/**
 * Items that are laid out (not arrows, labels, badges, rings, a glyph's inner parts or an
 * invisible anchor no glyph draws into).
 */
function laidOut(elements) {
  const glyphs = new Set(elements.filter((element) => ownerOf(element) !== element.id).map(ownerOf))
  return elements.filter(
    (element) =>
      (SHAPES.has(element.type) || element.type === 'image') &&
      ownerOf(element) === element.id &&
      !(invisible(element) && !glyphs.has(element.id)) &&
      !element.customData?.asterPanel &&
      !element.customData?.asterIcon &&
      !element.customData?.asterBadge &&
      !element.customData?.asterTex &&
      !isLossRole(element.customData?.asterRole) &&
      element.width >= 8 &&
      element.height >= 8
  )
}

/** Content that starts inside a panel or a filled box but sticks out of it. */
function overflowChecks(elements, add) {
  const holders = containers(elements)
  for (const item of laidOut(elements)) {
    const box = elementBounds(item)
    const holder = holders
      .filter((other) => other !== item && ownerOf(other) !== ownerOf(item))
      .map((other) => ({ other, bounds: elementBounds(other) }))
      .filter(({ bounds }) => area(bounds) > area(box) * 1.5)
      .find(({ bounds }) => {
        const shared = area(intersection(box, bounds))
        return shared >= area(box) * 0.5 && !isInside(box, bounds, 1)
      })
    if (holder) {
      const { bounds } = holder
      const out = Math.max(
        bounds.x - box.x,
        bounds.y - box.y,
        box.right - bounds.right,
        box.bottom - bounds.bottom
      )
      add(
        'warning',
        'overflow',
        item,
        `sticks ${round(out)} units out of ${holder.other.id}; ${holder.other.customData?.asterPanel ? 'let the panel take its size from what it holds (around)' : 'size the box to its content (measure) or shrink what is inside'}`
      )
    }
  }
}

/** A line along a panel's border, or a box touching it, reads as part of the border. */
function borderChecks(elements, add) {
  const panels = elements.filter((element) => element.customData?.asterPanel)
  if (!panels.length) {
    return
  }
  const lines = elements.filter(
    (element) => (element.type === 'arrow' || element.type === 'line') && element.points?.length > 1
  )
  for (const line of lines) {
    const points = absolutePoints(line)
    const hugged = panels.find((panel) => {
      const box = elementBounds(panel)
      return points.slice(1).some((point, index) => {
        const start = points[index]
        const horizontal = Math.abs(point[1] - start[1]) < 0.5
        const vertical = Math.abs(point[0] - start[0]) < 0.5
        if (horizontal) {
          const span =
            Math.min(Math.max(start[0], point[0]), box.right) -
            Math.max(Math.min(start[0], point[0]), box.x)
          return span >= 24 && [box.y, box.bottom].some((edge) => Math.abs(start[1] - edge) < TOUCH)
        }
        if (vertical) {
          const span =
            Math.min(Math.max(start[1], point[1]), box.bottom) -
            Math.max(Math.min(start[1], point[1]), box.y)
          return span >= 24 && [box.x, box.right].some((edge) => Math.abs(start[0] - edge) < TOUCH)
        }
        return false
      })
    })
    if (hugged) {
      add(
        'warning',
        'hug-border',
        line,
        `runs along the border of ${hugged.id}; keep it ${TOUCH * 2} units or more inside or outside the panel`
      )
    }
  }
  for (const item of laidOut(elements)) {
    const box = elementBounds(item)
    const touched = panels.find((panel) => {
      if (ownerOf(panel) === ownerOf(item)) {
        return false
      }
      const edges = elementBounds(panel)
      const inside = isInside(box, edges, 1)
      const gaps = inside
        ? [box.x - edges.x, box.y - edges.y, edges.right - box.right, edges.bottom - box.bottom]
        : [
            edges.x - box.right,
            box.x - edges.right,
            edges.y - box.bottom,
            box.y - edges.bottom
          ].filter((gap, index) => {
            // Why: outside, only the side the item faces counts, and only when they overlap along it.
            const alongX = box.x < edges.right && box.right > edges.x
            const alongY = box.y < edges.bottom && box.bottom > edges.y
            return index < 2 ? alongY : alongX
          })
      return gaps.some((gap) => gap >= -0.5 && gap < TOUCH)
    })
    if (touched) {
      add(
        'warning',
        'panel-tight',
        item,
        `touches the border of ${touched.id}; leave the panel's padding (pad) clear on every side`
      )
    }
  }
}

/** A label drawn over a badge or an icon hides both. */
function badgeLabelChecks(elements, add) {
  const badges = elements.filter(
    (element) => element.customData?.asterIcon || element.customData?.asterBadge
  )
  const labels = elements.filter(
    (element) => (element.type === 'text' && !element.containerId) || element.customData?.asterTex
  )
  for (const badge of badges) {
    const box = elementBounds(badge)
    const label = labels.find(
      (text) => ownerOf(text) !== ownerOf(badge) && overlaps(inkOf(text), box, 0)
    )
    if (label) {
      add(
        'warning',
        'label-on-badge',
        label,
        `sits on the badge or icon ${badge.id}; move one of them`
      )
    }
  }
}

/** Where two segments cross in their interiors (not at or near their ends). */
export function segmentsCross(a, b, c, d) {
  const denominator = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
  if (Math.abs(denominator) < 1e-9) {
    return false
  }
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / denominator
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / denominator
  const first = Math.hypot(b[0] - a[0], b[1] - a[1])
  const second = Math.hypot(d[0] - c[0], d[1] - c[1])
  // Why a margin: a link that starts on an arrow's junction meets it there, it does not cross it.
  return t * first > 3 && (1 - t) * first > 3 && u * second > 3 && (1 - u) * second > 3
}

const runLength = (points) =>
  points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
      0
    )

/**
 * A dashed link over solid arrows reads as a second wiring layer: it must not cross one, and a
 * long dashed run means the loss sits far from what it compares.
 */
function dashedChecks(elements, page, add) {
  const lines = elements.filter(
    (element) => (element.type === 'arrow' || element.type === 'line') && element.points?.length > 1
  )
  const dashed = lines.filter((line) => line.strokeStyle === 'dashed')
  const solid = lines.filter(
    (line) =>
      line.type === 'arrow' &&
      line.strokeStyle !== 'dashed' &&
      line.strokeStyle !== 'dotted' &&
      visible(line.strokeColor)
  )
  const crossings = new Map()
  for (const link of dashed) {
    const points = absolutePoints(link)
    const crossed = solid.filter((arrow) => {
      if (ownerOf(arrow) === ownerOf(link)) {
        return false
      }
      const other = absolutePoints(arrow)
      return points
        .slice(1)
        .some((point, index) =>
          other.slice(1).some((end, at) => segmentsCross(points[index], point, other[at], end))
        )
    })
    // Why by owner: a loss's links and joins are one connection, so one finding names them all.
    const entry = crossings.get(ownerOf(link)) ?? { link, crossed: new Set(), long: 0 }
    for (const arrow of crossed) {
      entry.crossed.add(arrow.id)
    }
    const length = runLength(points)
    if (page && length > page.width * LONG_DASH && link.type === 'arrow') {
      entry.long = Math.max(entry.long, length)
    }
    crossings.set(ownerOf(link), entry)
  }
  for (const [owner, { link, crossed, long }] of crossings) {
    const name = owner === link.id ? link.id : `${owner}'s dashed links`
    if (crossed.size) {
      const ids = [...crossed]
      add(
        'warning',
        'dashed-crossing',
        link,
        `${name} cross${owner === link.id ? 'es' : ''} ${ids.length} solid arrow${ids.length > 1 ? 's' : ''} (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''}); a dashed line never crosses a solid one: route it outside the arrow field, or move what it joins next to each other`
      )
    }
    if (long) {
      add(
        'warning',
        'long-dash',
        link,
        `${name} run${owner === link.id ? 's' : ''} ${Math.round(long)} units dashed, over a quarter of the page width, a second wiring layer; put what it joins next to each other, or draw it solid`
      )
    }
  }
}

/** Loss nodes and the frames around compared tensors must not overlap each other. */
function lossOverlapChecks(elements, add) {
  const frames = elements.filter(
    (element) =>
      SHAPES.has(element.type) &&
      ['loss', 'compared'].includes(element.customData?.asterRole) &&
      (visible(element.strokeColor) || visible(element.backgroundColor))
  )
  const warned = new Set()
  for (const [index, frame] of frames.entries()) {
    const box = elementBounds(frame)
    const other = frames.slice(index + 1).find((next) => {
      const bounds = elementBounds(next)
      return overlaps(box, bounds, 0) && !isInside(box, bounds, 0) && !isInside(bounds, box, 0)
    })
    if (other && !warned.has(frame.id)) {
      warned.add(frame.id)
      add(
        'warning',
        'loss-overlap',
        frame,
        `overlaps ${other.id}; frames around compared tensors and loss nodes must stay apart (a smaller pad, or ring the set once)`
      )
    }
  }
}

/** A small dashed box prints as broken corner brackets, not as a dashed outline. */
function dashedBoxChecks(elements, add) {
  const small = elements.filter(
    (element) =>
      SHAPES.has(element.type) &&
      element.strokeStyle === 'dashed' &&
      visible(element.strokeColor) &&
      Math.min(element.width, element.height) < 32 &&
      !(element.boundElements ?? []).some((bound) => bound.type === 'text')
  )
  if (small.length) {
    add(
      'warning',
      'small-dash-box',
      small[0],
      `${small.length} dashed box${small.length > 1 ? 'es' : ''} under 32 units (${small
        .slice(0, 3)
        .map((element) => element.id)
        .join(
          ', '
        )}) print as broken brackets; draw blank slots dotted, solid in a light gray, or with a light fill`
    )
  }
}

/**
 * A lone photo (an input feeding a model) far under a tenth of the page width shows nothing at
 * print size. Why a sixteenth: under that it is a speck. Thumbnails in a gallery (a row or
 * column of similar photos) or inside a stage card or an example card are examples, small on
 * purpose, and pass.
 */
function thumbnailChecks(elements, page, add) {
  if (!page) {
    return
  }
  const smallest = page.width / 16
  const photos = elements.filter(
    (element) =>
      element.type === 'image' && element.customData?.asterPhoto && ownerOf(element) === element.id
  )
  const cards = elements
    .filter((element) => element.customData?.asterStage || element.customData?.asterCard)
    .map(elementBounds)
  const similar = (first, second) =>
    Math.abs(first.width - second.width) <= Math.max(first.width, second.width) * 0.25 &&
    Math.abs(first.height - second.height) <= Math.max(first.height, second.height) * 0.25
  const gallery = (photo) =>
    photos.some((other) => {
      if (other === photo || !similar(photo, other)) {
        return false
      }
      const reach = Math.max(photo.width, photo.height) * 2
      const sameRow =
        Math.abs(other.y + other.height / 2 - (photo.y + photo.height / 2)) < photo.height / 2
      const sameColumn =
        Math.abs(other.x + other.width / 2 - (photo.x + photo.width / 2)) < photo.width / 2
      const near =
        Math.abs(other.x - photo.x) <= reach + photo.width &&
        Math.abs(other.y - photo.y) <= reach + photo.height
      return (sameRow || sameColumn) && near
    })
  const small = photos.filter(
    (photo) =>
      Math.max(photo.width, photo.height) < smallest &&
      !/-r\d+c\d+$/.test(photo.id) &&
      !cards.some((card) => isInside(elementBounds(photo), card, 1)) &&
      !gallery(photo)
  )
  if (small.length) {
    add(
      'warning',
      'small-thumbnail',
      small[0],
      `${small
        .slice(0, 3)
        .map((photo) => `${photo.id} (${Math.round(photo.width)} × ${Math.round(photo.height)})`)
        .join(
          ', '
        )}${small.length > 3 ? ', …' : ''} print${small.length > 1 ? '' : 's'} small, under a sixteenth of the page width (${Math.round(smallest)} units); make an input photo about a tenth of the page width (${Math.round(page.width / 10)} units)`
    )
  }
}

/** Panel, box and link checks over the elements in scope. */
export function panelChecks(elements, page, add, { recreating = false } = {}) {
  overflowChecks(elements, add)
  borderChecks(elements, add)
  badgeLabelChecks(elements, add)
  lossOverlapChecks(elements, add)
  if (!recreating) {
    dashedChecks(elements, page, add)
    dashedBoxChecks(elements, add)
    thumbnailChecks(elements, page, add)
  }
}
