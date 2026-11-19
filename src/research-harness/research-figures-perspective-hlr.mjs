// Line work for meshes: silhouettes (where a surface turns from the viewer), creases (where it
// folds sharper than an angle), open boundaries and drawn feature curves (a cone's rims), each
// cut into the parts the viewer sees and the parts a face hides (hidden-line removal by casting
// the eye ray at every face). Visible parts print solid; hidden parts dashed, faint or not at all.
// On a filled mesh the lines print just after its last face; on a wireframe they join the
// scene's lines and are cut and ordered like any other.
import { dot, lerp3, sub } from './research-figures-perspective-camera.mjs'
import { lineSvg } from './research-figures-perspective-svg.mjs'

const GRID = 40
const SAMPLE_STEPS = 6

/** Faces hashed into screen cells by their box, to find what might cover a point. */
function screenGrid(faces) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const face of faces) {
    for (const [x, y] of face.pts2) {
      box.x0 = Math.min(box.x0, x)
      box.y0 = Math.min(box.y0, y)
      box.x1 = Math.max(box.x1, x)
      box.y1 = Math.max(box.y1, y)
    }
  }
  const sx = GRID / Math.max(box.x1 - box.x0, 1e-12)
  const sy = GRID / Math.max(box.y1 - box.y0, 1e-12)
  const cell = (x, y) => [
    Math.max(0, Math.min(GRID - 1, Math.floor((x - box.x0) * sx))),
    Math.max(0, Math.min(GRID - 1, Math.floor((y - box.y0) * sy)))
  ]
  const cells = new Map()
  faces.forEach((face) => {
    const xs = face.pts2.map((p) => p[0])
    const ys = face.pts2.map((p) => p[1])
    const [i0, j0] = cell(Math.min(...xs), Math.min(...ys))
    const [i1, j1] = cell(Math.max(...xs), Math.max(...ys))
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const key = i * GRID + j
        if (!cells.has(key)) {
          cells.set(key, [])
        }
        cells.get(key).push(face)
      }
    }
  })
  return (x, y) => {
    if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) {
      return []
    }
    const [i, j] = cell(x, y)
    return cells.get(i * GRID + j) ?? []
  }
}

/** Whether a screen point lies inside a convex screen polygon (strictly, by a hair). */
function inside2d(pts, x, y, margin) {
  let sign = 0
  for (let index = 0; index < pts.length; index += 1) {
    const [a, b] = [pts[index], pts[(index + 1) % pts.length]]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const side = (ex * (y - a[1]) - ey * (x - a[0])) / (Math.hypot(ex, ey) || 1)
    if (Math.abs(side) < margin) {
      return false
    }
    const s = Math.sign(side)
    if (sign === 0) {
      sign = s
    } else if (s !== sign) {
      return false
    }
  }
  return true
}

/** A test of whether a world point is hidden from the viewer by any of the given faces. */
export function occlusionTest(faces, cam, radius) {
  const lookup = screenGrid(faces)
  const margin = radius * 1e-7
  return (p, skip) => {
    const s = cam.project(p)
    if (!s) {
      return true
    }
    for (const face of lookup(s[0], s[1])) {
      if (skip?.(face) || !inside2d(face.pts2, s[0], s[1], margin)) {
        continue
      }
      const n = face.normal
      const d = dot(n, face.pts[0])
      if (cam.parallel) {
        const denominator = dot(n, cam.axes.f)
        if (Math.abs(denominator) > 1e-12 && (dot(n, p) - d) / denominator > radius * 1e-5) {
          return true
        }
        continue
      }
      const eye = cam.settings.eye
      const ray = sub(p, eye)
      const denominator = dot(n, ray)
      if (Math.abs(denominator) < 1e-12) {
        continue
      }
      const t = (d - dot(n, eye)) / denominator
      if (t > 1e-6 && t < 1 - 1e-5) {
        return true
      }
    }
    return false
  }
}

/** A mesh edge cut into visible and hidden parts: [{ from, to, hidden }] as shares 0–1. */
export function edgeVisibility(a, b, hiddenAt, steps) {
  const at = (t) => hiddenAt(lerp3(a, b, t))
  const shares = Array.from({ length: steps + 1 }, (_, k) =>
    Math.min(0.995, Math.max(0.005, k / steps))
  )
  const states = shares.map(at)
  const parts = []
  let start = 0
  for (let k = 1; k < shares.length; k += 1) {
    if (states[k] !== states[k - 1]) {
      let [lo, hi] = [shares[k - 1], shares[k]]
      for (let step = 0; step < SAMPLE_STEPS; step += 1) {
        const middle = (lo + hi) / 2
        if (at(middle) === states[k - 1]) {
          lo = middle
        } else {
          hi = middle
        }
      }
      const cut = (lo + hi) / 2
      parts.push({ from: start, to: cut, hidden: states[k - 1] })
      start = cut
    }
  }
  parts.push({ from: start, to: 1, hidden: states.at(-1) })
  return parts
}

/** Which mesh edges print for this camera: silhouettes, boundaries, creases, features. */
function edgesToDraw(outline, facing) {
  const { mesh, style } = outline
  const out = []
  for (const edge of mesh.edges) {
    const [f0, f1] = edge.faces
    // Why: a cap's rim is drawn as a feature curve (or not at all), never as an outline.
    if (style.quietCaps && edge.faces.some((face) => mesh.faces[face].length > 4)) {
      continue
    }
    let kind = null
    if (style.wire) {
      kind = 'wire'
    } else if (f1 === undefined) {
      kind = style.boundary === false ? null : 'boundary'
    } else if (facing[f0] !== facing[f1]) {
      kind = style.silhouette === false ? null : 'silhouette'
    } else if (
      style.crease !== false &&
      dot(mesh.normals[f0], mesh.normals[f1]) < style.creaseCos
    ) {
      kind = facing[f0] || outline.seeThrough ? 'crease' : null
    }
    if (kind) {
      out.push({ a: edge.a, b: edge.b, kind })
    }
  }
  for (const feature of mesh.features ?? []) {
    const ids = feature.closed ? [...feature.ids, feature.ids[0]] : feature.ids
    for (let index = 0; index < ids.length - 1; index += 1) {
      out.push({ a: ids[index], b: ids[index + 1], kind: 'feature', style: feature.style })
    }
  }
  return out
}

/** Chains edge parts that meet end to end in one style into polylines (world points). */
function chain(parts) {
  const key = (p) => p.map((v) => Math.round(v * 1e6)).join(',')
  const groups = new Map()
  for (const part of parts) {
    const group = `${part.kind}|${part.hidden}|${part.styleKey ?? ''}`
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group).push(part)
  }
  const lines = []
  for (const list of groups.values()) {
    const ends = new Map()
    for (const part of list) {
      for (const k of [key(part.p), key(part.q)]) {
        if (!ends.has(k)) {
          ends.set(k, [])
        }
        ends.get(k).push(part)
      }
    }
    const used = new Set()
    // Why both ways: neighbouring edges of a silhouette run either way round their faces.
    const extend = (pts) => {
      for (;;) {
        const tail = pts.at(-1)
        const next = ends.get(key(tail))?.find((entry) => !used.has(entry))
        if (!next) {
          return pts
        }
        used.add(next)
        pts.push(key(next.p) === key(tail) ? next.q : next.p)
      }
    }
    for (const part of list) {
      if (used.has(part)) {
        continue
      }
      used.add(part)
      const forward = extend([part.p, part.q])
      const backward = extend([forward[0]]).slice(1).toReversed()
      lines.push({ ...part, pts: [...backward, ...forward] })
    }
  }
  return lines
}

/** The stroke a line of a kind takes: silhouettes and boundaries bold, creases lighter. */
function strokeFor(style, part) {
  const base = part.style ?? style
  const pt = part.kind === 'crease' || part.kind === 'wire' ? style.creasePt : (base.pt ?? style.pt)
  const tone = base.tone ?? style.tone
  if (!part.hidden) {
    return { role: base.role ?? style.role, tone, pt, dash: base.dash ?? null }
  }
  return {
    role: base.role ?? style.role,
    tone: Math.max(1, tone - 3),
    pt: pt * 0.8,
    dash: style.hidden === 'faint' ? null : [2, 1.6]
  }
}

/**
 * The outlines of every mesh in the scene for this camera. `segments(make)` gives the line
 * pieces of wireframes for the BSP; `overlays(toFigure, style)` the SVG of each filled mesh's
 * lines by surface, printed after the mesh's last face.
 */
export function meshOutlines(units, faces, cam, radius) {
  const outlines = units.filter((unit) => unit.type === 'outline')
  if (!outlines.length) {
    return { segments: () => [], overlays: () => new Map() }
  }
  const opaque = faces.filter(
    (face) => face.role !== 'none' && (face.opacity ?? 1) >= 0.9 && !face.see
  )
  // Why by layer: a floor (layer -1) is painted under everything, so it hides no outline.
  const tests = new Map()
  const sceneTest = (layer) => {
    if (!tests.has(layer)) {
      tests.set(
        layer,
        occlusionTest(
          opaque.filter((face) => (face.layer ?? 0) >= layer),
          cam,
          radius
        )
      )
    }
    return tests.get(layer)
  }
  const lines = []
  const overlayLines = new Map()
  let serial = 1e6
  for (const outline of outlines) {
    const { mesh, style } = outline
    const own = mesh.faces.map((ids, index) => {
      const pts = ids.map((id) => mesh.verts[id])
      const pts2 = pts.map(cam.project)
      return { ids, pts, pts2, normal: mesh.normals[index], owner: outline.owner }
    })
    const facing = own.map((face) =>
      cam.facing(
        face.normal,
        face.pts.reduce((sum, p) => sum.map((v, k) => v + p[k] / face.pts.length), [0, 0, 0])
      )
    )
    const visibleOwn = own.filter((face) => face.pts2.every(Boolean))
    const ownHidden = occlusionTest(visibleOwn, cam, radius)
    const sceneHidden = sceneTest(outline.layer ?? 0)
    const parts = []
    for (const edge of edgesToDraw(outline, facing)) {
      const [a, b] = [mesh.verts[edge.a], mesh.verts[edge.b]]
      const skip = (face) =>
        face.owner === outline.owner
          ? face.ids?.includes(edge.a) || face.ids?.includes(edge.b)
          : false
      const hiddenAt = (p) =>
        (style.self !== false && ownHidden(p, skip)) ||
        sceneHidden(p, (face) => face.owner === outline.owner)
      const pa = cam.project(a)
      const pb = cam.project(b)
      if (!pa || !pb) {
        continue
      }
      const span = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / Math.max(radius, 1e-9)
      const steps = Math.max(2, Math.min(24, Math.ceil(span * 40)))
      for (const piece of edgeVisibility(a, b, hiddenAt, steps)) {
        if (piece.hidden && style.hidden === 'none') {
          continue
        }
        parts.push({
          kind: edge.kind,
          hidden: piece.hidden,
          style: edge.style,
          styleKey: edge.style ? JSON.stringify(edge.style) : '',
          p: lerp3(a, b, piece.from),
          q: lerp3(a, b, piece.to)
        })
      }
    }
    for (const line of chain(parts)) {
      const stroke = strokeFor(style, line)
      const pts = line.pts
      const unit = {
        type: 'line',
        owner: outline.owner,
        pts,
        ...stroke,
        head: null,
        sketch: style.sketch,
        layer: outline.layer ?? 0,
        serial: (serial += 1),
        count: pts.length - 1
      }
      if (outline.filled) {
        if (!overlayLines.has(outline.surface)) {
          overlayLines.set(outline.surface, [])
        }
        overlayLines.get(outline.surface).push(unit)
      } else {
        lines.push(unit)
      }
    }
  }
  return {
    segments: (make) => lines.flatMap((line) => line.pts.slice(0, -1).map((_, k) => make(line, k))),
    overlays(toFigure, look) {
      const out = new Map()
      for (const [surface, list] of overlayLines) {
        out.set(
          surface,
          list
            .map((line) => {
              const pts2 = line.pts.map(cam.project)
              if (pts2.some((p) => !p)) {
                return ''
              }
              const depth = pts2.reduce((sum, p) => sum + p[2], 0) / pts2.length
              return lineSvg({ ...line, depth }, pts2.map(toFigure), look)
            })
            .join('')
        )
      }
      return out
    }
  }
}
