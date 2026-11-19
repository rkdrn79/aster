// Faces of a perspective scene as SVG: a face (or the piece of it a BSP cut left) with its
// fill, photo, cells, grid lines, shadows and outline, decorations clipped to the piece; and
// runs of mesh faces in one paint merged into one outline (shared edges dissolved), so a
// cel-shaded surface prints as a few clean regions with no seams.
import { add, dot, mul, sub } from './research-figures-perspective-camera.mjs'
import { outerEdge } from './research-figures-perspective-bsp.mjs'
import { fillAttrs, pathD, r2, strokeAttrs } from './research-figures-perspective-svg.mjs'
import { roughD } from './research-figures-perspective-sketch.mjs'

const keeps = (cut, p) => cut.sign * (dot(cut.plane.n, p) - cut.plane.d) >= -1e-9

/** A convex polygon (world points) clipped to the half-spaces a piece was cut by. */
export function clipPolygon(pts, cuts) {
  let out = pts
  for (const cut of cuts) {
    const next = []
    for (let index = 0; index < out.length && out.length > 2; index += 1) {
      const a = out[index]
      const b = out[(index + 1) % out.length]
      const [ka, kb] = [keeps(cut, a), keeps(cut, b)]
      if (ka) {
        next.push(a)
      }
      if (ka !== kb) {
        const da = dot(cut.plane.n, a) - cut.plane.d
        const db = dot(cut.plane.n, b) - cut.plane.d
        next.push(add(a, mul(sub(b, a), da / (da - db))))
      }
    }
    out = next
  }
  return out.length > 2 ? out : null
}

/** A segment clipped to a piece's half-spaces, or null when nothing is left. */
export function clipSegment(a, b, cuts) {
  let [t0, t1] = [0, 1]
  for (const cut of cuts) {
    const da = cut.sign * (dot(cut.plane.n, a) - cut.plane.d)
    const db = cut.sign * (dot(cut.plane.n, b) - cut.plane.d)
    if (da < 0 && db < 0) {
      return null
    }
    if (da < 0 || db < 0) {
      const t = da / (da - db)
      if (da < 0) {
        t0 = Math.max(t0, t)
      } else {
        t1 = Math.min(t1, t)
      }
    }
  }
  return t1 - t0 > 1e-9 ? [add(a, mul(sub(b, a), t0)), add(a, mul(sub(b, a), t1))] : null
}

/** The face's own outline along a piece: runs of its outer edges, as world polylines. */
function outerRuns(piece) {
  const count = piece.verts.length
  const flags = piece.verts.map((_, index) => outerEdge(piece, index))
  if (flags.every(Boolean)) {
    return [{ pts: piece.verts.map((v) => v.p), closed: true }]
  }
  const start = flags.findIndex((flag) => !flag)
  const runs = []
  let run = null
  for (let step = 1; step <= count; step += 1) {
    const index = (start + step) % count
    if (flags[index]) {
      run ??= [piece.verts[index].p]
      run.push(piece.verts[(index + 1) % count].p)
    } else if (run) {
      runs.push({ pts: run, closed: false })
      run = null
    }
  }
  if (run) {
    runs.push({ pts: run, closed: false })
  }
  return runs
}

/**
 * The SVG of one face piece: its fill at its final tone, the photo (clipped to the piece when
 * cut), the filled cells and grid lines clipped to it, shadows on it, and its outer edges.
 */
export function faceSvg(piece, ctx) {
  const { cam, toFigure, lighterAt, weightAt, lookPt, ids } = ctx
  const face = piece.face
  const cut = piece.cuts.length > 0
  const project = (p) => cam.project(p)
  const toFig = (p) => {
    const q = project(p)
    return q ? toFigure(q) : null
  }
  const fig = piece.verts.map((v) => toFig(v.p))
  if (fig.some((p) => !p)) {
    return ''
  }
  const body = []
  if (face.role !== 'none') {
    body.push(
      `<path d="${pathD(fig, true)}" ${fillAttrs(face.role, face.finalTone, face.opacity)}/>`
    )
  }
  let clipId = null
  const clipped = (inner) => {
    if (!cut || !inner) {
      return inner
    }
    if (!clipId) {
      clipId = ids('clip')
      ctx.defs.push(`<clipPath id="${clipId}"><path d="${pathD(fig, true)}"/></clipPath>`)
    }
    return `<g clip-path="url(#${clipId})">${inner}</g>`
  }
  if (face.photo) {
    body.push(clipped(ctx.photo(face, piece)))
  }
  if (face.texture && piece.verts.every((v) => v.uv)) {
    body.push(ctx.texture(face, piece))
  }
  const paint = face.photo ?? face.texture
  if (paint?.wash) {
    body.push(`<path d="${pathD(fig, true)}" ${fillAttrs('white', 0, paint.wash)}/>`)
  }
  if (paint?.tint) {
    const tint = typeof paint.tint === 'object' ? paint.tint : { role: paint.tint }
    body.push(
      `<path d="${pathD(fig, true)}" ${fillAttrs(tint.role ?? 'accent', tint.tone ?? 4, tint.opacity ?? 0.3)}/>`
    )
  }
  for (const cell of face.fills ?? []) {
    const pts = clipPolygon(cell.pts, piece.cuts)
    const pts2 = pts?.map(toFig)
    if (pts2 && pts2.every(Boolean)) {
      body.push(
        `<path d="${pathD(pts2, true)}" ${fillAttrs(cell.role, cell.tone, cell.opacity, { kind: cell.kind })}/>`
      )
    }
  }
  for (const decal of face.decals ?? []) {
    const pieces = []
    for (let index = 0; index < decal.pts.length - 1; index += 1) {
      const seg = clipSegment(decal.pts[index], decal.pts[index + 1], piece.cuts)
      if (seg) {
        pieces.push(seg)
      }
    }
    for (const [a, b] of pieces) {
      const pa = project(a)
      const pb = project(b)
      if (!pa || !pb) {
        continue
      }
      const depth = (pa[2] + pb[2]) / 2
      const tone = decal.tone - (decal.role === 'white' ? 0 : lighterAt(depth))
      body.push(
        `<path d="${pathD([pa, pb].map(toFigure), false)}" ${strokeAttrs(decal.role, tone, decal.pt * weightAt(depth), lookPt, decal.dash)}/>`
      )
    }
  }
  if (face.shadowSvg) {
    body.push(clipped(face.shadowSvg(toFig, ids, ctx.defs, cut ? null : fig)))
  }
  if (face.edge) {
    const stroke = strokeAttrs(
      face.edge.role,
      face.edge.tone - lighterAt(face.depth),
      face.edge.pt * weightAt(face.depth),
      lookPt,
      face.edge.dash
    )
    for (const run of cut ? outerRuns(piece) : [{ pts: face.pts, closed: true }]) {
      const pts2 = run.pts.map(toFig)
      if (pts2.every(Boolean)) {
        const d = face.sketch
          ? roughD(run.closed ? [...pts2, pts2[0]] : pts2, face.sketch, face.serial)
          : pathD(pts2, run.closed)
        body.push(`<path d="${d}" ${stroke}/>`)
      }
    }
  }
  return body.join('')
}

const area2 = (pts) => {
  let sum = 0
  for (let index = 0; index < pts.length; index += 1) {
    const [a, b] = [pts[index], pts[(index + 1) % pts.length]]
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum
}

/**
 * The outline of a run of touching polygons ({ ids, pts } with screen points): every polygon
 * turned one way, edges two polygons share dropped, the rest chained into loops. A non-zero
 * fill of the loops is the union; null when the edges do not close (the caller draws each).
 */
export function unionLoops(polys) {
  const edges = new Map()
  for (const poly of polys) {
    const flip = area2(poly.pts) < 0
    const ids = flip ? poly.ids.toReversed() : poly.ids
    const pts = flip ? poly.pts.toReversed() : poly.pts
    for (let index = 0; index < ids.length; index += 1) {
      const next = (index + 1) % ids.length
      const [a, b] = [ids[index], ids[next]]
      if (a === b) {
        continue
      }
      const back = `${b}>${a}`
      if (edges.has(back)) {
        edges.delete(back)
      } else {
        edges.set(`${a}>${b}`, { a, b, pa: pts[index] })
      }
    }
  }
  const from = new Map()
  for (const edge of edges.values()) {
    if (!from.has(edge.a)) {
      from.set(edge.a, [])
    }
    from.get(edge.a).push(edge)
  }
  const used = new Set()
  const loops = []
  for (const edge of edges.values()) {
    if (used.has(edge)) {
      continue
    }
    const loop = []
    let current = edge
    for (;;) {
      used.add(current)
      loop.push(current.pa)
      if (current.b === edge.a) {
        break
      }
      const next = from.get(current.b)?.find((entry) => !used.has(entry))
      if (!next) {
        return null
      }
      current = next
    }
    loops.push(loop)
  }
  return loops
}

/** The SVG of a run of mesh faces in one paint: one path, its parts merged where they touch. */
export function runSvg(run, toFigure, project) {
  const polys = []
  for (const piece of run.pieces) {
    const pts = piece.verts.map((v) => project(v.p))
    if (pts.some((p) => !p)) {
      continue
    }
    polys.push({ ids: piece.verts.map((v) => v.id), pts: pts.map(toFigure) })
  }
  if (!polys.length) {
    return ''
  }
  const loops = polys.length > 1 ? unionLoops(polys) : null
  const d = (loops ?? polys.map((poly) => poly.pts)).map((pts) => pathD(pts, true)).join('')
  const face = run.pieces[0].face
  return `<path d="${d}" ${fillAttrs(face.role, face.finalTone, face.opacity, { seam: face.opacity >= 1 })}/>`
}

const screenBox = (pts) => {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const [x, y] of pts) {
    box.x0 = Math.min(box.x0, x)
    box.y0 = Math.min(box.y0, y)
    box.x1 = Math.max(box.x1, x)
    box.y1 = Math.max(box.y1, y)
  }
  return box
}

/** Whether two convex screen polygons overlap by more than a hair (separating axis test). */
export function convexOverlap(a, b, tolerance) {
  for (const poly of [a, b]) {
    for (let index = 0; index < poly.length; index += 1) {
      const [p, q] = [poly[index], poly[(index + 1) % poly.length]]
      const axis = [q[1] - p[1], p[0] - q[0]]
      const norm = Math.hypot(axis[0], axis[1]) || 1
      const range = (pts) => {
        let [lo, hi] = [Infinity, -Infinity]
        for (const r of pts) {
          const value = (r[0] * axis[0] + r[1] * axis[1]) / norm
          lo = Math.min(lo, value)
          hi = Math.max(hi, value)
        }
        return [lo, hi]
      }
      const [a0, a1] = range(a)
      const [b0, b1] = range(b)
      if (a1 <= b0 + tolerance || b1 <= a0 + tolerance) {
        return false
      }
    }
  }
  return true
}

const LOOKBACK = 48

const boxesMeet = (a, b) => a && b && a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/**
 * A piece of a line joins an earlier piece of the same line when nothing painted between them
 * touches it on screen, so a line cut by many planes still prints as one stroke.
 */
function joinLine(out, entry) {
  const line = entry.item.line
  for (let back = out.length - 1; back >= Math.max(0, out.length - LOOKBACK); back -= 1) {
    const other = out[back]
    if (other.lineRun && other.line === line) {
      other.pieces.push(entry.item)
      other.boxes.push(entry.box)
      return
    }
    const boxes = other.lineRun
      ? other.boxes
      : other.run
        ? other.screens.map(screenBox)
        : [other.box ?? (other.screen ? screenBox(other.screen) : null)]
    if (boxes.some((box) => boxesMeet(box, entry.box))) {
      break
    }
  }
  out.push({ lineRun: true, line, pieces: [entry.item], boxes: [entry.box], owner: entry.owner })
}

/**
 * Groups the paint order's plain mesh faces into runs of one paint: a face joins an earlier
 * run of its surface and tone when nothing painted between them overlaps it on screen, so the
 * picture is unchanged. Returns entries: a run { run: true, pieces } or the item as it was.
 */
export function mergeRuns(order, tolerance) {
  const out = []
  for (const entry of order) {
    if (entry.item?.line) {
      joinLine(out, entry)
      continue
    }
    const face = entry.piece?.face
    if (
      !face?.surface ||
      face.photo ||
      face.texture ||
      face.edge ||
      face.fills?.length ||
      face.decals?.length
    ) {
      out.push(entry)
      continue
    }
    const key = `${face.surface}|${face.role}|${face.finalTone}|${face.opacity}|${face.front}`
    const poly = entry.screen
    const box = screenBox(poly)
    let joined = false
    for (let back = out.length - 1; back >= Math.max(0, out.length - LOOKBACK); back -= 1) {
      const other = out[back]
      if (other.run && other.key === key) {
        other.pieces.push(entry.piece)
        other.screens.push(poly)
        joined = true
        break
      }
      const shapes = other.run ? other.screens : [other.screen ?? null]
      const blocks = shapes.some((shape) => {
        const otherBox = shape ? screenBox(shape) : other.box
        if (
          !otherBox ||
          otherBox.x1 < box.x0 ||
          box.x1 < otherBox.x0 ||
          otherBox.y1 < box.y0 ||
          box.y1 < otherBox.y0
        ) {
          return false
        }
        return shape ? convexOverlap(shape, poly, tolerance) : true
      })
      if (blocks) {
        break
      }
    }
    if (!joined) {
      out.push({ run: true, key, pieces: [entry.piece], screens: [poly], depth: entry.depth })
    }
  }
  return out
}

/** Rounds a photo's on-screen box for the records the lint reads. */
export const photoRecord = (box) => ({
  ...box,
  width: r2(box.x1 - box.x0),
  height: r2(box.y1 - box.y0)
})
