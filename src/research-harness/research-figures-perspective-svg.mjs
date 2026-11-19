// SVG pieces of a perspective scene: role-tagged fills and strokes the illustration painter
// repaints with the figure's palette, paths at a tenth of a unit, dots, arrowheads, the eye
// glyph, and a last pass that merges paths drawn one after another in the same paint (so a
// shaded mesh is a handful of paths, not thousands).

import { roughD } from './research-figures-perspective-sketch.mjs'

export const r1 = (value) => Math.round(value * 10) / 10
export const r2 = (value) => Math.round(value * 100) / 100
const clampTone = (tone) => Math.max(0, Math.min(11, Math.round(tone)))

/** Fill attributes the illustration painter fills in from the figure's palette. */
export function fillAttrs(role, tone, opacity = 1, { seam = false, kind = '' } = {}) {
  const visible = role === 'ink' ? 'ink' : role
  return `data-r="${visible}" data-t="${clampTone(tone)}" data-s="0"${kind ? ` data-k="${kind}"` : ''} fill="#000000"${opacity < 1 ? ` fill-opacity="${r2(opacity)}"` : ''}${seam ? ' data-seam="1"' : ''} stroke="none" stroke-width="0"`
}

/** Stroke attributes: role and tone, weight relative to the house look's stroke pt. */
export function strokeAttrs(role, tone, given, lookPt, dash, offset = 0) {
  // Why steps of 0.05 pt: lines a hair apart in weight merge into one path; no one sees the step.
  const pt = Math.max(0.05, Math.round(given * 20) / 20)
  const lineRole = role === 'ink' ? 'neutral' : role
  const dashText = dash
    ? ` stroke-dasharray="${dash.map((value) => r2(value * 2)).join(' ')}"${offset ? ` stroke-dashoffset="${r1(-offset)}"` : ''}`
    : ''
  return `fill="none" data-sr="${lineRole}" data-st="${clampTone(tone)}" data-w="${r2(pt / lookPt)}" stroke="#000000" stroke-width="${r2(pt * 2)}" stroke-linecap="round" stroke-linejoin="round"${dashText}`
}

export const pathD = (pts, closed) =>
  pts.length ? `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}${closed ? 'Z' : ''}` : ''

/** The centre of projection as people draw it: an angle opening toward the scene, with an arc. */
export function eyeSvg([x, y], [tx, ty], pt, lookPt) {
  const angle = Math.atan2(ty - y, tx - x)
  const arm = 16
  const spread = 0.5
  const end = (sign, r) => [
    x + Math.cos(angle + sign * spread) * r,
    y + Math.sin(angle + sign * spread) * r
  ]
  const arc = Array.from({ length: 9 }, (_, k) => {
    const a = angle - spread + (2 * spread * k) / 8
    return [x + Math.cos(a) * arm * 0.55, y + Math.sin(a) * arm * 0.55]
  })
  const stroke = strokeAttrs('ink', 11, pt, lookPt, null)
  return `<path d="${pathD([end(-1, arm), [x, y], end(1, arm)], false)}" ${stroke}/><path d="${pathD(arc, false)}" ${stroke}/>`
}

/**
 * A sun or lamp glyph at a screen point: a disc in its role with `rays` triangular rays around
 * it (a sun, as DreamFusion draws its light), `r` the disc radius in printed pt.
 */
export function sunSvg([x, y], part, lookPt) {
  const r = part.r * 2
  const rays = []
  const count = part.rays ?? 8
  for (let k = 0; k < count; k += 1) {
    const angle = (Math.PI * 2 * k) / count - Math.PI / 2
    const at = (radius, spread) => [
      x + Math.cos(angle + spread) * radius,
      y + Math.sin(angle + spread) * radius
    ]
    rays.push(pathD([at(r * 1.3, -0.2), at(r * 1.85, 0), at(r * 1.3, 0.2)], true))
  }
  const ring = part.ring
    ? ` ${strokeAttrs(part.role, part.tone + 3, 0.5, lookPt, null).replace('fill="none" ', '')}`
    : ''
  const disc = fillAttrs(part.role, part.tone).replace(
    ' stroke="none" stroke-width="0"',
    ring || ' stroke="none" stroke-width="0"'
  )
  return `<path d="${rays.join('')}" ${fillAttrs(part.role, part.tone)}/><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" ${disc}/>`
}

/** A dot: filled in its role, or open (white with a ring); a ring outlines it. */
export function dotSvg(item, [x, y], weightAt, lookPt) {
  const r = item.r * 2 * Math.max(0.8, Math.min(1.18, weightAt(item.depth)))
  // Why: a large open ring (a numbered vertex) needs a bolder line to read as a ring at print.
  const ring = item.open
    ? { role: item.role, tone: item.tone, pt: Math.max(0.6, item.r * 0.24) }
    : item.ring
  const fill = fillAttrs(item.open ? 'white' : item.role, item.open ? 0 : item.tone)
  const paint = ring
    ? fill.replace(
        ' stroke="none" stroke-width="0"',
        ` ${strokeAttrs(ring.role, ring.tone, ring.pt, lookPt, null).replace('fill="none" ', '')}`
      )
    : fill
  return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" ${paint}/>`
}

/**
 * A run of one line (figure points): its stroke at its depth's weight and tone, with the
 * arrowheads its first and last pieces end in.
 */
export function lineSvg(run, fig, { weightAt, lighterAt, lookPt }) {
  const pt = run.pt * weightAt(run.depth)
  const tone = run.tone - lighterAt(run.depth)
  const pts = fig.map((p) => [...p])
  const heads = []
  const head = run.head
  const tip = (from, to) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
    const ux = (to[0] - from[0]) / length
    const uy = (to[1] - from[1]) / length
    const size = head.pt * 2 * Math.max(0.8, weightAt(run.depth))
    const half = size * (head.style === 'open' ? 0.55 : 0.4)
    const base = [to[0] - ux * size, to[1] - uy * size]
    const left = [base[0] - uy * half, base[1] + ux * half]
    const right = [base[0] + uy * half, base[1] - ux * half]
    heads.push(
      head.style === 'open'
        ? `<path d="${pathD([left, to, right], false)}" ${strokeAttrs(run.role, tone, pt * 1.1, lookPt, null)}/>`
        : `<path d="${pathD([left, to, right], true)}" ${fillAttrs(run.role === 'ink' ? 'neutral' : run.role, run.role === 'ink' ? 11 : tone)}/>`
    )
    return head.style === 'open' ? to : [to[0] - ux * size * 0.7, to[1] - uy * size * 0.7]
  }
  if (head?.end && run.last && pts.length > 1) {
    pts[pts.length - 1] = tip(pts.at(-2), pts.at(-1))
  }
  if (head?.start && run.first && pts.length > 1) {
    pts[0] = tip(pts[1], pts[0])
  }
  const d = run.sketch ? roughD(pts, run.sketch, run.serial ?? 0) : pathD(pts, false)
  return `<path d="${d}" ${strokeAttrs(run.role, tone, pt, lookPt, run.dash, run.offset ?? 0)}/>${heads.join('')}`
}

const PATH = /^<path d="([^"]*)" ([^>]*)\/>$/

function boxOfD(d) {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    box.x0 = Math.min(box.x0, numbers[index])
    box.x1 = Math.max(box.x1, numbers[index])
    box.y0 = Math.min(box.y0, numbers[index + 1])
    box.y1 = Math.max(box.y1, numbers[index + 1])
  }
  return box
}

const touches = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/**
 * Merges paths drawn one after another with the same paint into one path of many parts: the
 * picture is the same (an opaque paint covers once; a see-through fill merges only where its
 * parts do not overlap, so nothing turns darker) and the file is much smaller.
 */
export function mergePaths(parts) {
  const out = []
  let open = null
  for (const part of parts.flatMap((entry) => entry.split(/(?=<path d=)/))) {
    const match = PATH.exec(part)
    if (!match) {
      open = null
      out.push(part)
      continue
    }
    const [, d, attrs] = match
    const seeThrough = /fill-opacity="/.test(attrs)
    if (open && open.attrs === attrs) {
      const box = seeThrough ? boxOfD(d) : null
      if (!seeThrough || !open.boxes.some((other) => touches(other, box))) {
        open.d += d
        if (box) {
          open.boxes.push(box)
        }
        out[open.index] = `<path d="${open.d}" ${attrs}/>`
        continue
      }
    }
    open = { attrs, d, index: out.length, boxes: seeThrough ? [boxOfD(d)] : [] }
    out.push(part)
  }
  return out.join('')
}
