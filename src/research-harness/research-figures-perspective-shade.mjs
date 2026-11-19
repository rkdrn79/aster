// Light and shade in a perspective scene: the scene's one light (a sun far away or a lamp at a
// point; by default the house light from the upper left, fixed to the camera), faces shaded in
// tone bands of their own hue (flat, cel, three-tone, smooth), darker where a solid nears the
// floor, and shadows on receiving faces: the cast shadow from the light and a soft contact
// shadow under whatever rests on it.
import { LIGHT, add, cross, dot, mul, sub, unit } from './research-figures-perspective-camera.mjs'
import { hull2d } from './research-figures-perspective-solids.mjs'
import { unionLoops } from './research-figures-perspective-faces.mjs'
import { fillAttrs, pathD } from './research-figures-perspective-svg.mjs'

/**
 * Light bands per shading: the light levels (0–1, rising) where a surface steps one tone
 * lighter, and the tone steps of each band from the darkest up.
 */
export const SHADING_BANDS = {
  flat: { at: [], steps: [0] },
  cel: { at: [0.42], steps: [2, 0] },
  'two-tone': { at: [0.42], steps: [2, 0] },
  'three-tone': { at: [0.36, 0.66], steps: [2, 1, 0] },
  smooth: { at: [0.28, 0.48, 0.68, 0.86], steps: [4, 3, 2, 1, 0] },
  // Why soft: a plane turned from the light (a tri-plane's side wall, an image plane seen edge-on)
  // two light tones darker than the lit ones reads its orientation without a heavy band.
  soft: { at: [0.3], steps: [2, 0] }
}
export const SHADINGS_3D = Object.keys(SHADING_BANDS)

const bandOf = (bands, value) => bands.at.filter((level) => value > level).length

/**
 * A face cut along the light levels where its band changes, so cel bands on a smooth surface
 * follow its true curves, not the steps of its triangles: [{ verts, band }] where verts are
 * { p, id, uv }. Cuts on an edge get one name, so the pieces of neighbours join again.
 */
export function bandPieces(verts, values, bands) {
  const lowest = bandOf(bands, Math.min(...values))
  const highest = bandOf(bands, Math.max(...values))
  if (lowest === highest) {
    return [{ verts, band: lowest }]
  }
  const pieces = []
  for (let band = lowest; band <= highest; band += 1) {
    let poly = verts.map((v, k) => ({ ...v, value: values[k] }))
    for (const [level, above] of [
      [bands.at[band - 1], true],
      [bands.at[band], false]
    ]) {
      if (level === undefined || poly.length < 3) {
        continue
      }
      const keep = (value) => (above ? value >= level : value <= level)
      const next = []
      poly.forEach((a, k) => {
        const b = poly[(k + 1) % poly.length]
        if (keep(a.value)) {
          next.push(a)
        }
        if (keep(a.value) !== keep(b.value)) {
          const t = (level - a.value) / (b.value - a.value)
          const [lo, hi] = String(a.id) < String(b.id) ? [a.id, b.id] : [b.id, a.id]
          next.push({
            p: a.p.map((v, axis) => v + (b.p[axis] - v) * t),
            uv:
              a.uv && b.uv
                ? [0, 1].map((axis) => a.uv[axis] + (b.uv[axis] - a.uv[axis]) * t)
                : null,
            id: `${lo}|${hi}@${level}`,
            value: level
          })
        }
      })
      poly = next
    }
    if (poly.length >= 3) {
      pieces.push({ verts: poly, band })
    }
  }
  return pieces
}

/**
 * The scene's light: `toward(p)` the unit direction from a point to the light; `shadows` whether
 * it casts them. A `light` unit (b.light) sets it; otherwise the house light, upper left.
 */
export function sceneLight(units, cam) {
  const spec = units.findLast((unit) => unit.type === 'light')
  if (!spec) {
    const { r, u, f } = cam.axes
    const dir = unit(add(add(mul(r, LIGHT[0]), mul(u, LIGHT[1])), mul(f, LIGHT[2])))
    return { toward: () => dir, shadows: true, house: true }
  }
  if (spec.kind === 'point') {
    return { toward: (p) => unit(sub(spec.at, p)), at: spec.at, shadows: spec.shadows !== false }
  }
  // Why `at` as the direction: a sun placed only by its glyph (`at`) shines from there toward the
  // scene's middle; without dir or at it is the house light.
  const given = spec.dir ?? spec.at
  if (!given) {
    return {
      ...sceneLight(
        units.filter((unit) => unit.type !== 'light'),
        cam
      ),
      shadows: spec.shadows !== false
    }
  }
  const dir = unit(given)
  return { toward: () => dir, shadows: spec.shadows !== false }
}

const toViewer = (cam, p) => (cam.parallel ? mul(cam.axes.f, -1) : sub(cam.settings.eye, p))

const receiversOf = (faces) =>
  faces
    .filter((face) => face.receive)
    .map((face) => ({ face, n: face.normal, d: dot(face.normal, face.pts[0]) }))

/**
 * Final tones: the face's tone, its light band (smooth meshes cut along the band edges), a
 * little less light where a solid nears the floor it stands on, a step lighter far away (one
 * depth for a whole mesh, so no band runs across it). Returns the faces to draw.
 */
export function applyShading(faces, { cam, light, strong, far, radius }) {
  const surfaceDepth = new Map()
  for (const face of faces) {
    if (face.surface) {
      const entry = surfaceDepth.get(face.surface) ?? { sum: 0, count: 0 }
      surfaceDepth.set(face.surface, { sum: entry.sum + face.depth, count: entry.count + 1 })
    }
  }
  const receivers = light.shadows ? receiversOf(faces) : []
  const reach = radius * 0.08
  // Why: a solid reads as resting on the floor when it darkens just above it (ambient occlusion).
  const occlusion = (p) =>
    receivers.reduce((most, receiver) => {
      const height = dot(receiver.n, p) - receiver.d
      return height >= 0 && height < reach ? Math.max(most, 0.32 * (1 - height / reach)) : most
    }, 0)
  const out = []
  for (const face of faces) {
    const entry = face.surface ? surfaceDepth.get(face.surface) : null
    const depth = entry ? entry.sum / entry.count : face.depth
    const fade = strong && !face.photo ? Math.round(far(depth) * 0.8) : 0
    const base = face.tone + (face.toneShift ?? 0) - fade
    if (!face.shade) {
      out.push({ ...face, finalTone: base })
      continue
    }
    const bands = SHADING_BANDS[face.shading ?? 'three-tone'] ?? SHADING_BANDS['three-tone']
    const flip = dot(face.normal, toViewer(cam, face.centroid)) >= 0 ? 1 : -1
    const dim = (p) => (face.cast && face.ao !== false ? occlusion(p) : 0)
    if (!face.vnormals) {
      const lit = Math.max(0, dot(mul(face.normal, flip), light.toward(face.centroid)))
      out.push({
        ...face,
        lit,
        finalTone: base + bands.steps[bandOf(bands, lit - dim(face.centroid))]
      })
      continue
    }
    const values = face.pts.map(
      (p, k) => Math.max(0, dot(mul(face.vnormals[k], flip), light.toward(p))) - dim(p)
    )
    const verts = face.pts.map((p, k) => ({
      p,
      id: face.vids?.[k] ?? `${face.serial}:${k}`,
      uv: face.uvs?.[k] ?? null
    }))
    const pieces = bandPieces(verts, values, bands)
    for (const piece of pieces) {
      const pts = piece.verts.map((v) => v.p)
      out.push({
        ...face,
        pts,
        vids: piece.verts.map((v) => v.id),
        uvs: face.uvs ? piece.verts.map((v) => v.uv) : null,
        vnormals: null,
        pts2: pieces.length === 1 ? face.pts2 : pts.map(cam.project),
        finalTone: base + bands.steps[piece.band]
      })
    }
  }
  return out
}

/** Where a point falls on a receiving plane from the light; null when it is below the plane. */
function castPoint(p, receiver, light, eps) {
  const height = dot(receiver.n, p) - receiver.d
  if (height < -eps) {
    return null
  }
  if (light.at) {
    const ray = sub(p, light.at)
    const denominator = dot(receiver.n, ray)
    if (denominator >= -1e-12) {
      return null
    }
    return add(light.at, mul(ray, (receiver.d - dot(receiver.n, light.at)) / denominator))
  }
  const toward = light.toward(p)
  const along = dot(receiver.n, toward)
  return along > 1e-9 ? sub(p, mul(toward, height / along)) : null
}

/** The convex outline (world points on the plane) of points dropped onto a receiving plane. */
function footprint(points, receiver, grow) {
  const e1 = unit(sub(receiver.face.pts[1], receiver.face.pts[0]))
  const e2 = cross(receiver.n, e1)
  const flat = []
  for (const p of points) {
    const q = sub(p, mul(receiver.n, dot(receiver.n, p) - receiver.d))
    for (let k = 0; k < (grow > 0 ? 12 : 1); k += 1) {
      const angle = (Math.PI * 2 * k) / 12
      const offset =
        grow > 0 ? add(mul(e1, Math.cos(angle) * grow), mul(e2, Math.sin(angle) * grow)) : [0, 0, 0]
      const r = add(q, offset)
      flat.push([dot(r, e1), dot(r, e2), r])
    }
  }
  const hull = hull2d(flat.map(([x, y], index) => [x, y, index]))
  return hull.map(([, , index]) => flat[index][2])
}

const keyOf = (p) => p.map((v) => Math.round(v * 1e5)).join(',')

/**
 * Shadows on every receiving face (b.floor, or a plane with `receive: true`): the cast shadow
 * of every casting solid from the scene's light (one union, so overlaps do not darken), and a
 * soft contact shadow in three steps under each solid that rests on the face. They print with
 * the face, clipped to it, under everything standing on it.
 */
export function attachShadows(units, faces, { light, eps, radius }) {
  const receivers = light.shadows ? receiversOf(faces) : []
  if (!receivers.length) {
    return
  }
  const casters = units.filter((unit) => unit.type === 'face' && unit.cast)
  const groups = units.filter((unit) => unit.type === 'group' && unit.shadowPoints)
  for (const receiver of receivers) {
    const owner = receiver.face.owner
    const polys = []
    const byOwner = new Map()
    for (const face of casters) {
      if (face.owner === owner) {
        continue
      }
      const toLight = light.toward(face.pts[0])
      if (face.cull && dot(face.normal, toLight) <= 0) {
        continue
      }
      const dropped = face.pts.map((p) => castPoint(p, receiver, light, eps))
      if (dropped.some((p) => !p)) {
        continue
      }
      polys.push({ ids: face.pts.map(keyOf), pts3: dropped })
      if (!byOwner.has(face.owner)) {
        byOwner.set(face.owner, [])
      }
      byOwner.get(face.owner).push(...face.pts)
    }
    for (const group of groups) {
      const dropped = group.shadowPoints.map((p) => castPoint(p, receiver, light, eps))
      if (dropped.every(Boolean)) {
        const hull = footprint(dropped, receiver, 0)
        polys.push({ ids: hull.map((_, index) => `${group.owner}:${index}`), pts3: hull })
        byOwner.set(group.owner, group.shadowPoints)
      }
    }
    const contacts = []
    for (const points of byOwner.values()) {
      const heights = points.map((p) => dot(receiver.n, p) - receiver.d)
      const tall = Math.max(...heights)
      const reach = Math.max(radius * 0.02, tall * 0.06)
      const near = points.filter((_, index) => heights[index] >= -eps && heights[index] < reach)
      if (near.length && Math.min(...heights) < reach) {
        const size = Math.max(radius * 0.03, tall * 0.5)
        contacts.push([0.55, 0.3, 0.12].map((share) => footprint(near, receiver, size * share)))
      }
    }
    receiver.face.shadowSvg = shadowPainter(polys, contacts, receiver.face)
  }
}

/** The SVG of a receiver's shadows, for its face painter: cast union then contact steps. */
function shadowPainter(polys, contacts, face) {
  const opacity = face.shadowOpacity ?? 0.16
  return (toFig, ids, defs, own) => {
    const out = []
    const flat = polys
      .map((poly) => ({ ids: poly.ids, pts: poly.pts3.map(toFig) }))
      .filter((poly) => poly.pts.every(Boolean))
    if (flat.length) {
      const loops = unionLoops(flat) ?? flat.map((poly) => poly.pts)
      out.push(
        `<path d="${loops.map((pts) => pathD(pts, true)).join('')}" ${fillAttrs('ink', 11, opacity, { kind: 'shadow' })}/>`
      )
    }
    for (const rings of contacts) {
      for (const ring of rings) {
        const pts = ring.map(toFig)
        if (pts.every(Boolean)) {
          out.push(
            `<path d="${pathD(pts, true)}" ${fillAttrs('ink', 11, opacity * 0.5, { kind: 'shadow' })}/>`
          )
        }
      }
    }
    if (!out.length) {
      return ''
    }
    if (!own) {
      return out.join('')
    }
    const clip = ids('clip')
    defs.push(`<clipPath id="${clip}"><path d="${pathD(own, true)}"/></clipPath>`)
    return `<g clip-path="url(#${clip})">${out.join('')}</g>`
  }
}
