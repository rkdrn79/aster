// Renders a perspective scene to one role-tagged SVG: every unit projected through the scene's
// camera and painted back to front by a BSP tree (faces cut where planes cross, lines cut where
// they pierce a face, dots and billboards in their cell), lighter and thinner lines farther away,
// faces shaded in their own hue by the scene's light (cel bands on meshes, shadows on floors),
// mesh outlines found by hidden-line removal, photos mapped onto their faces, and paths of one
// paint merged. Units are figure units (144 per inch, 2 per printed pt).
import {
  add,
  boundingSphere,
  lerp3,
  makeCamera,
  mul,
  sub
} from './research-figures-perspective-camera.mjs'
import { backToFront, buildBsp, insertItem, pieceOf } from './research-figures-perspective-bsp.mjs'
import { faceSvg, mergeRuns, photoRecord, runSvg } from './research-figures-perspective-faces.mjs'
import { photoSvg, texturedFaceSvg } from './research-figures-perspective-photo.mjs'
import { meshOutlines } from './research-figures-perspective-hlr.mjs'
import { applyShading, attachShadows, sceneLight } from './research-figures-perspective-shade.mjs'
import { verticalTilt } from './research-figures-perspective-views.mjs'
import {
  dotSvg,
  eyeSvg,
  fillAttrs,
  lineSvg,
  mergePaths,
  pathD,
  r2,
  strokeAttrs,
  sunSvg
} from './research-figures-perspective-svg.mjs'

const MIN_PAD = 6

export function worldPoints(units) {
  return units.flatMap((u) =>
    u.type === 'dot'
      ? [u.at]
      : u.type === 'group'
        ? [...u.points, u.center]
        : u.type === 'face' || u.type === 'line'
          ? u.pts
          : []
  )
}

export function bboxOf(points) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const [x, y] of points) {
    box.x0 = Math.min(box.x0, x)
    box.y0 = Math.min(box.y0, y)
    box.x1 = Math.max(box.x1, x)
    box.y1 = Math.max(box.y1, y)
  }
  return box
}

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** A piece of one line's segment `k`, from share t0 to t1, with its ends in world and depth. */
export function segmentItem(line, k, t0, t1, cam) {
  const a = lerp3(line.pts[k], line.pts[k + 1], t0)
  const b = lerp3(line.pts[k], line.pts[k + 1], t1)
  const pa = cam.project(a)
  const pb = cam.project(b)
  return {
    line,
    k,
    t0,
    t1,
    a,
    b,
    serial: line.serial,
    pts2: pa && pb ? [pa, pb] : null,
    depth: pa && pb ? (pa[2] + pb[2]) / 2 : 0
  }
}

/** Faces, line segments and point items (dots, billboards) with their screen points and depths. */
function projectUnits(units, cam) {
  const faces = []
  const segments = []
  const points = []
  units.forEach((unit, serial) => {
    if (unit.type === 'face') {
      const pts2 = unit.pts.map(cam.project)
      if (pts2.some((p) => !p)) {
        return
      }
      const centroid = unit.pts.reduce(
        (sum, p) => sum.map((v, k) => v + p[k] / unit.pts.length),
        [0, 0, 0]
      )
      const front = cam.facing(unit.normal, centroid)
      if (unit.cull && !front) {
        return
      }
      faces.push({
        ...unit,
        source: unit,
        serial,
        pts2,
        centroid,
        front,
        depth: pts2.reduce((sum, p) => sum + p[2], 0) / pts2.length
      })
    } else if (unit.type === 'line') {
      const line = { ...unit, serial, count: unit.pts.length - 1 }
      for (let k = 0; k < unit.pts.length - 1; k += 1) {
        segments.push(segmentItem(line, k, 0, 1, cam))
      }
    } else if (unit.type === 'dot') {
      const p2 = cam.project(unit.at)
      if (p2) {
        points.push({ ...unit, serial, pts2: [p2], depth: p2[2] })
      }
    } else if (unit.type === 'group') {
      const center = cam.project(unit.center)
      if (!center) {
        return
      }
      const parts = unit.parts(cam).filter((part) => part.pts?.length || part.at)
      points.push({
        ...unit,
        serial,
        at: unit.center,
        parts,
        pts2: parts.flatMap((part) => part.pts ?? [part.at]),
        depth: center[2]
      })
    }
  })
  return { faces, segments, points }
}

/** Back-to-front order of every item, layer by layer, by a BSP tree of each layer's faces. */
function orderItems({ faces, segments, points }, cam, eps) {
  const layerOf = (item) => (item.line ? item.line.layer : item.layer) ?? 0
  const layers = [...new Set([...faces, ...segments, ...points].map(layerOf))]
  const eyeSide = (normal, p0) => cam.eyeSide(normal, p0)
  const cut = (item, t) => {
    const middle = item.t0 + (item.t1 - item.t0) * t
    return [
      segmentItem(item.line, item.k, item.t0, middle, cam),
      segmentItem(item.line, item.k, middle, item.t1, cam)
    ]
  }
  const order = []
  for (const layer of layers.toSorted((a, b) => a - b)) {
    const pieces = faces.filter((face) => layerOf(face) === layer).map((f) => pieceOf(f, f.serial))
    const tree = buildBsp(pieces, eps)
    const loose = []
    for (const item of [...segments, ...points].filter((entry) => layerOf(entry) === layer)) {
      if (item.line && !item.pts2) {
        continue
      }
      if (insertItem(tree, item, eps, eyeSide, cut)) {
        loose.push(item)
      }
    }
    order.push(...backToFront(tree, eyeSide, loose))
  }
  return order.filter((item) => !item.line || item.pts2)
}

/** Pairs of items that overlap on screen where one hides the other: the occlusion cue. */
function countOcclusions(entries) {
  let count = 0
  for (let i = 0; i < entries.length && count < 64; i += 1) {
    for (let j = i + 1; j < entries.length && count < 64; j += 1) {
      const [a, b] = [entries[i], entries[j]]
      if (a.owner === b.owner || !(a.solid || b.solid)) {
        continue
      }
      if (overlap(a.box, b.box)) {
        count += 1
      }
    }
  }
  return count
}

const position = (piece) => piece.k + piece.t0
const follows = (a, b) =>
  Math.abs(a.k + a.t1 - (b.k + b.t0)) < 1e-9 || (b.k === a.k + 1 && a.t1 > 1 - 1e-9 && b.t0 < 1e-9)

/** Where each piece of each line starts along it (figure units), for unbroken dashes. */
function offsetsOf(order, toFigure) {
  const byLine = new Map()
  for (const item of order) {
    if (item.line) {
      if (!byLine.has(item.line)) {
        byLine.set(item.line, [])
      }
      byLine.get(item.line).push(item)
    }
  }
  const offsets = new Map()
  for (const pieces of byLine.values()) {
    let run = 0
    for (const piece of pieces.toSorted((a, b) => position(a) - position(b))) {
      offsets.set(piece, run)
      const [a, b] = piece.pts2.map(toFigure)
      run += Math.hypot(b[0] - a[0], b[1] - a[1])
    }
  }
  return offsets
}

function lineRunSvg(pieces, offsets, toFigure, style) {
  const line = pieces[0].line
  const fig = [pieces[0].pts2[0], ...pieces.map((piece) => piece.pts2[1])].map(toFigure)
  const depth = pieces.reduce((sum, piece) => sum + piece.depth, 0) / pieces.length
  return lineSvg(
    {
      ...line,
      depth,
      offset: offsets.get(pieces[0]) ?? 0,
      first: pieces[0].k === 0 && pieces[0].t0 < 1e-9,
      last: pieces.at(-1).k === line.count - 1 && pieces.at(-1).t1 > 1 - 1e-9
    },
    fig,
    style
  )
}

function pointSvg(item, toFigure, { weightAt, lighterAt, lookPt }) {
  if (item.type === 'dot') {
    return dotSvg(item, toFigure(item.pts2[0]), weightAt, lookPt)
  }
  const out = []
  for (const part of item.parts) {
    if (part.kind === 'fill') {
      out.push(
        `<path d="${pathD(part.pts.map(toFigure), true)}" ${fillAttrs(part.role, part.tone, part.opacity ?? 1, { seam: part.seam, kind: part.paint })}/>`
      )
    } else if (part.kind === 'eye') {
      out.push(eyeSvg(toFigure(part.at), toFigure(part.toward), part.pt, lookPt))
    } else if (part.kind === 'sun') {
      out.push(sunSvg(toFigure(part.at), part, lookPt))
    } else if (part.kind === 'stroke') {
      out.push(
        `<path d="${pathD(part.pts.map(toFigure), part.closed)}" ${strokeAttrs(part.role, part.tone - lighterAt(item.depth), part.pt * weightAt(item.depth), lookPt, part.dash)}/>`
      )
    }
  }
  return out.join('')
}

/** Photos drawn through the camera (on planes, tiled, on any face), and their records. */
function photoPainter({ cam, toFigure, ids, defs }) {
  const images = new Map()
  const photos = []
  const seen = new Set()
  const toFig = (p) => {
    const q = cam.project(p)
    return q ? toFigure(q) : null
  }
  const record = (face, count) => {
    if (seen.has(face.source)) {
      return
    }
    seen.add(face.source)
    // Why a group: a photo cut into tiles (Swin windows, tri-plane quarters) is one picture.
    const group = face.photoGroup ?? face.owner
    const fig = face.pts2.map(toFigure)
    const known = photos.find((entry) => entry.id === group)
    const pb = bboxOf(known ? [...fig, [known.x0, known.y0], [known.x1, known.y1]] : fig)
    Object.assign(known ?? photos[photos.push({ id: group, pieces: 0 }) - 1], {
      ...photoRecord(pb),
      pieces: (known?.pieces ?? 0) + count
    })
  }
  const draw = (face) => {
    const [tl, tr, , bl] = face.photo.corners
    const [nx, ny] = face.photo.repeat ?? [1, 1]
    let body = ''
    let count = 0
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        const at = (s, t) =>
          toFigure(
            cam.project(
              add(add(tl, mul(sub(tr, tl), (i + s) / nx)), mul(sub(bl, tl), (j + t) / ny))
            )
          )
        const drawn = photoSvg(face.photo, at, { ids, images })
        defs.push(drawn.defs)
        body += drawn.body
        count += drawn.pieces
      }
    }
    record(face, count)
    return body
  }
  const texture = (face, piece) => {
    const drawn = texturedFaceSvg(
      face.texture,
      piece.verts.map((v) => v.p),
      piece.verts.map((v) => v.uv),
      toFig,
      { ids, images }
    )
    defs.push(drawn.defs)
    record(face, drawn.pieces)
    return drawn.body
  }
  return { draw, texture, photos }
}

/**
 * Renders scene units through a camera into a role-tagged SVG fitted to `box` ({ w, h },
 * either may be missing) or at a fixed `scale` (figure units per screen unit, to match another
 * scene). `lookPt` is the house look's stroke pt (stroke weights are kept relative to it).
 */
export function renderPerspective(units, options = {}) {
  const sphere = boundingSphere(worldPoints(units))
  const cam = makeCamera(options.camera ?? {}, sphere)
  const eps = sphere.radius * 1e-6
  const projected = projectUnits(units, cam)
  const outlines = meshOutlines(units, projected.faces, cam, sphere.radius)
  projected.segments.push(...outlines.segments((line, k) => segmentItem(line, k, 0, 1, cam)))
  const all2 = [projected.faces, projected.segments, projected.points].flatMap((list) =>
    list.flatMap((item) => item.pts2 ?? [])
  )
  if (!all2.length) {
    throw new Error('this perspective scene draws nothing in front of the camera')
  }
  const all = bboxOf(all2)
  // Why: an invisible dot (a template's fixed bound) sizes the scene but is not drawn.
  const seen = (item) => !(item.type === 'dot' && item.role === 'none')
  const width = Math.max(all.x1 - all.x0, 1e-9)
  const height = Math.max(all.y1 - all.y0, 1e-9)
  // Why: dots, heads and glyphs keep their printed size, so the margin must hold the largest.
  const PAD = Math.max(
    MIN_PAD,
    ...projected.points
      .filter(seen)
      .map((item) =>
        item.type === 'dot'
          ? item.r * 2.4 + 1
          : Math.max(0, ...item.parts.map((part) => (part.kind === 'eye' ? 9 : (part.pad ?? 0))))
      ),
    ...projected.segments.map((segment) => (segment.line.head ? segment.line.head.pt * 2 + 1 : 0))
  )
  const box = options.box ?? {}
  const scale =
    options.scale ??
    Math.min(
      box.w ? (box.w - 2 * PAD) / width : Infinity,
      box.h ? (box.h - 2 * PAD) / height : Infinity,
      box.w || box.h ? Infinity : 300 / Math.max(width, height)
    )
  const toFigure = ([x, y]) => [PAD + (x - all.x0) * scale, PAD + (y - all.y0) * scale]
  const size = { width: width * scale + 2 * PAD, height: height * scale + 2 * PAD }
  const visible = bboxOf(
    [projected.faces, projected.segments, projected.points]
      .flatMap((list) => list.filter(seen).flatMap((item) => item.pts2 ?? []))
      .map(toFigure)
  )
  const depths = [projected.faces, projected.segments, projected.points].flatMap((list) =>
    list.map((item) => item.depth)
  )
  const [dmin, dmax] = [Math.min(...depths), Math.max(...depths)]
  const span = dmax - dmin || 1
  const strong = !cam.parallel
  const far = (depth) => Math.max(0, Math.min(1, (depth - dmin) / span))
  const weightAt = (depth) => (strong ? 1.12 - 0.42 * far(depth) : 1.04 - 0.18 * far(depth))
  const lighterAt = (depth) => Math.round(far(depth) * (strong ? 2.4 : 1.1))
  const style = { weightAt, lighterAt, lookPt: options.lookPt ?? 0.6 }
  const light = sceneLight(units, cam)
  projected.faces = applyShading(projected.faces, {
    cam,
    light,
    strong,
    far,
    radius: sphere.radius
  })
  attachShadows(units, projected.faces, { cam, light, eps, radius: sphere.radius })
  const order = orderItems(projected, cam, eps)
  let serial = 0
  const prefix = options.idPrefix ?? 'p'
  const ids = (kind) => `${prefix}-${kind}${(serial += 1)}`
  const defs = []
  const painter = photoPainter({ cam, toFigure, ids, defs })
  const ctx = { cam, toFigure, ids, defs, photo: painter.draw, texture: painter.texture, ...style }
  const entries = order.map((item) => {
    if (item.face) {
      const screen = item.verts.map((v) => toFigure(cam.project(v.p)))
      const solid = Boolean(item.face.solid || item.face.surface || item.face.role !== 'none')
      return {
        piece: item,
        screen,
        box: bboxOf(screen),
        depth: item.face.depth,
        owner: item.face.owner,
        solid
      }
    }
    const b = bboxOf((item.pts2 ?? []).map(toFigure))
    const grow = item.type === 'dot' ? item.r * 2.4 : item.line ? item.line.pt * 2 : 2
    return {
      item,
      owner: item.line?.owner ?? item.owner,
      solid: Boolean(item.parts),
      box: { x0: b.x0 - grow, y0: b.y0 - grow, x1: b.x1 + grow, y1: b.y1 + grow }
    }
  })
  const merged = mergeRuns(entries, 0.05)
  const overlays = outlines.overlays(toFigure, style)
  const surfaceOf = (entry) =>
    entry.run ? entry.pieces[0].face.surface : entry.piece?.face.surface
  const lastOfSurface = new Map()
  merged.forEach((entry, index) => {
    if (surfaceOf(entry)) {
      lastOfSurface.set(surfaceOf(entry), index)
    }
  })
  const offsets = offsetsOf(order, toFigure)
  const body = []
  for (let index = 0; index < merged.length; index += 1) {
    const entry = merged[index]
    if (entry.run) {
      body.push(runSvg(entry, toFigure, cam.project))
    } else if (entry.piece) {
      body.push(faceSvg(entry.piece, ctx))
    } else if (entry.lineRun) {
      // Pieces of one line print as one stroke where they join, dashes unbroken.
      const pieces = entry.pieces
      let chainOf = []
      for (const piece of pieces.toSorted((a, b) => position(a) - position(b))) {
        if (chainOf.length && !follows(chainOf.at(-1), piece)) {
          body.push(lineRunSvg(chainOf, offsets, toFigure, style))
          chainOf = []
        }
        chainOf.push(piece)
      }
      body.push(lineRunSvg(chainOf, offsets, toFigure, style))
    } else {
      body.push(pointSvg(entry.item, toFigure, style))
    }
    const surface = surfaceOf(entry)
    if (surface && lastOfSurface.get(surface) === index && overlays.has(surface)) {
      body.push(overlays.get(surface))
    }
  }
  const defsText = defs.join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(size.width)} ${r2(size.height)}" width="${r2(size.width)}" height="${r2(size.height)}" data-aster-illustration="1" data-look="${options.look ?? 'line'}" data-ppt="2" data-perspective="${cam.kind}">${defsText ? `<defs>${defsText}</defs>` : ''}<g stroke-linecap="round" stroke-linejoin="round">${mergePaths(body)}</g></svg>`
  return {
    svg,
    camera: cam,
    scale,
    size,
    // Why: a row of scenes (fig.perspectives without boxes) sizes each by its drawn extent.
    content: { width, height, pad: PAD, y0: all.y0, y1: all.y1 },
    // What is drawn (figure units inside the image) and how upright its verticals print.
    drawn: { x0: r2(visible.x0), y0: r2(visible.y0), x1: r2(visible.x1), y1: r2(visible.y1) },
    verticals: verticalTilt(units, cam),
    toFigure: (world) => {
      const p = cam.project(world)
      return p ? toFigure(p).map(r2) : null
    },
    photos: painter.photos,
    occlusions: countOcclusions(entries),
    depthRatio: strong && dmin > 0 ? dmax / dmin : 1
  }
}
