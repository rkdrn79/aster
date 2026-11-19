// The drawing list an illustration builds (filled paths and stroked lines, each with a colour
// role and tone) and its role-tagged SVG: the format `paintIllustrationSvg` repaints. Also the
// 2D outlines the builder samples: rounded rectangles, circles, arcs and the lit part of a disc.
import {
  ILLUSTRATION_STYLES,
  illustrationPalette,
  paintIllustrationSvg
} from './research-figures-illustration-paint.mjs'

const r2 = (value) => Math.round(value * 100) / 100

/** Points of a rectangle with rounded corners, clockwise from the top-left (y down). */
export function roundRectPoints(x, y, w, h, radius = 0, steps = 6) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r < 0.01) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ]
  }
  const corners = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180]
  ]
  return corners.flatMap(([cx, cy, start]) =>
    Array.from({ length: steps + 1 }, (_, index) => {
      const angle = ((start + (90 * index) / steps) * Math.PI) / 180
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
    })
  )
}

/** Points of a circle (or an arc from `from` to `to` degrees), counter-clockwise in math terms. */
export function circlePoints(cx, cy, r, { segments = 48, from = 0, to = 360 } = {}) {
  const closed = Math.abs(to - from) >= 360
  const count = closed ? segments : Math.max(2, Math.ceil((segments * Math.abs(to - from)) / 360))
  return Array.from({ length: closed ? count : count + 1 }, (_, index) => {
    const angle = ((from + ((to - from) * index) / count) * Math.PI) / 180
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  })
}

/** A closed path through points. */
export function pathOf(points, closed = true) {
  if (!points.length) {
    return ''
  }
  const [first, ...rest] = points
  return `M${r2(first[0])} ${r2(first[1])}${rest.map(([x, y]) => `L${r2(x)} ${r2(y)}`).join('')}${closed ? 'Z' : ''}`
}

/**
 * The part of a disc (cx, cy, r) a light from direction (lx, ly) reaches: the disc cut by an
 * offset disc, as a closed outline. `reach` 0–1 is how far the lit part spreads.
 */
export function litDiscPoints(cx, cy, r, [lx, ly], reach = 0.72, segments = 64) {
  const length = Math.hypot(lx, ly) || 1
  const offset = r * (1 - reach) * 1.6
  const ox = cx + (lx / length) * offset
  const oy = cy + (ly / length) * offset
  const inner = r * (0.55 + 0.45 * reach)
  return circlePoints(cx, cy, r, { segments }).map(([px, py]) => {
    const dx = px - ox
    const dy = py - oy
    const d = Math.hypot(dx, dy)
    return d > inner ? [ox + (dx / d) * inner, oy + (dy / d) * inner] : [px, py]
  })
}

/**
 * A drawing list with its bounds: `fill` adds a filled outline painted `role.tone` (`shade`
 * steps darker), `stroke` a line. Outlines (`outline: true`) follow the house style.
 */
export function drawingList() {
  const items = []
  const box = { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity }
  const grow = (points, pad = 0) => {
    for (const [x, y] of points) {
      box.x = Math.min(box.x, x - pad)
      box.y = Math.min(box.y, y - pad)
      box.right = Math.max(box.right, x + pad)
      box.bottom = Math.max(box.bottom, y + pad)
    }
  }
  return {
    items,
    bounds: () => ({ ...box, width: box.right - box.x, height: box.bottom - box.y }),
    fill(
      points,
      {
        role = 'neutral',
        tone = 2,
        shade = 0,
        outline = true,
        seam = true,
        shadow = false,
        decal = false
      } = {}
    ) {
      if (points.length < 3) {
        return
      }
      grow(points)
      items.push({
        kind: 'fill',
        d: pathOf(points),
        role,
        tone,
        shade,
        outline,
        seam,
        shadow,
        decal
      })
    },
    /** A raw path (`d`) for shapes with arcs; `points` bound it. */
    fillPath(d, points, { role = 'neutral', tone = 2, shade = 0, outline = true } = {}) {
      grow(points)
      items.push({ kind: 'fill', d, role, tone, shade, outline, seam: false })
    },
    stroke(points, { role = 'ink', tone = 6, weight = 1, closed = false, cap, dash = false } = {}) {
      if (points.length < 2) {
        return
      }
      grow(points, weight)
      items.push({ kind: 'stroke', d: pathOf(points, closed), role, tone, weight, cap, dash })
    },
    /** An outline-only line (a silhouette, a sharp edge): drawn by the house style's rule. */
    edge(points, { role = 'neutral', tone = 2, weight = 1, closed = false } = {}) {
      if (points.length < 2) {
        return
      }
      grow(points)
      items.push({ kind: 'edge', d: pathOf(points, closed), role, tone, weight })
    },
    /** Everything drawn by another list, on top. */
    append(other) {
      items.push(...other.items)
      const b = other.bounds()
      if (Number.isFinite(b.x)) {
        grow([
          [b.x, b.y],
          [b.right, b.bottom]
        ])
      }
    }
  }
}

/**
 * The role-tagged SVG of a drawing list, painted in `style` (a figure style) with the house
 * `look`. `width` is the placed width in scene units (144 per inch): strokes are sized so they
 * print at the look's width there. `roles` and `skin` repaint roles (`illustrationPalette`).
 */
export function illustrationSvg(list, { look = 'flat', style, roles, skin, width, pad = 2 } = {}) {
  const bounds = list.bounds()
  if (!Number.isFinite(bounds.x)) {
    throw new Error('An illustration needs at least one shape')
  }
  const lookName = Object.hasOwn(ILLUSTRATION_STYLES, look) ? look : 'flat'
  const vx = bounds.x - pad
  const vy = bounds.y - pad
  const vw = bounds.width + pad * 2
  const vh = bounds.height + pad * 2
  // Why per print pt: 2 scene units are 1 pt, so a viewBox unit prints at width / vw units.
  const perPt = width ? (2 * vw) / width : 1
  const strokePt = ILLUSTRATION_STYLES[lookName].strokePt
  const body = list.items
    .map((item) => {
      if (item.kind === 'edge') {
        return `<path d="${item.d}" fill="none" data-e="${item.role}" data-t="${item.tone}" data-w="${item.weight}" stroke="none" stroke-width="0"/>`
      }
      if (item.kind === 'stroke') {
        const width = r2(strokePt * perPt * item.weight)
        const cap = item.cap ? ` stroke-linecap="${item.cap}"` : ''
        // Why in pt: dashes 2.5 pt on, 2 pt off read as dashed at print, whatever the scale.
        const dash = item.dash
          ? ` stroke-dasharray="${r2(2.5 * perPt * item.weight)} ${r2(2 * perPt * item.weight)}"`
          : ''
        return `<path d="${item.d}" fill="none" data-sr="${item.role}" data-st="${item.tone}" stroke="#000000" stroke-width="${width}" data-w="${item.weight}"${cap}${dash}/>`
      }
      const outline = item.outline ? ` data-o="1" data-w="1"` : ''
      const seam = item.seam ? ` data-seam="1"` : ''
      const shadow = item.shadow ? ` data-k="shadow"` : item.decal ? ` data-k="decal"` : ''
      return `<path d="${item.d}" data-r="${item.role}" data-t="${item.tone}" data-s="${item.shade}" fill="#000000"${outline}${seam}${shadow} stroke="none" stroke-width="0"/>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(vx)} ${r2(vy)} ${r2(vw)} ${r2(vh)}" width="${r2(vw)}" height="${r2(vh)}" data-aster-illustration="1" data-look="${lookName}" data-ppt="${r2(perPt)}"><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  return paintIllustrationSvg(svg, illustrationPalette(style, { roles, skin }))
}
