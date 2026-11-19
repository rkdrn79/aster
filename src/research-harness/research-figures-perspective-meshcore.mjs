// The mesh at the heart of curved and organic objects in a perspective scene: vertices and flat
// faces (non-planar quads split in two), face and smooth vertex normals, the edge adjacency the
// outlines need, and the units the renderer paints: faces shaded in tone bands of one role, and
// an outline unit (silhouettes, creases, boundaries, feature curves, a wireframe) whose lines
// the renderer cuts into the parts the viewer sees.
import { add, cross, dot, length, mul, sub, unit } from './research-figures-perspective-camera.mjs'

/** Unit normal of a polygon by Newell's method (robust for any convex or near-planar loop). */
export function polygonNormal(pts) {
  const n = [0, 0, 0]
  for (let index = 0; index < pts.length; index += 1) {
    const [a, b] = [pts[index], pts[(index + 1) % pts.length]]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return unit(n)
}

/** Two unit vectors perpendicular to `axis` and to each other. */
export function perpendiculars(axis) {
  const a = unit(axis)
  const helper = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const e1 = unit(cross(a, helper))
  return [e1, unit(cross(a, e1))]
}

/** Faces with every polygon flat: a quad or polygon off its plane is fanned into triangles. */
function flatFaces(verts, faces, tolerance) {
  const out = []
  for (const ids of faces) {
    if (ids.length === 3) {
      out.push(ids)
      continue
    }
    const pts = ids.map((id) => verts[id])
    const n = polygonNormal(pts)
    const d = dot(n, pts[0])
    if (pts.every((p) => Math.abs(dot(n, p) - d) <= tolerance)) {
      out.push(ids)
    } else {
      for (let k = 1; k < ids.length - 1; k += 1) {
        out.push([ids[0], ids[k], ids[k + 1]])
      }
    }
  }
  return out.filter((ids) => {
    const pts = ids.map((id) => verts[id])
    return length(polygonNormal(pts)) > 0.5 && new Set(ids).size === ids.length
  })
}

/**
 * A mesh from vertices and faces (index loops, counter-clockwise seen from outside): flat faces,
 * face normals, smooth vertex normals and edges with the faces on each side.
 */
export function buildMesh(verts, faces, given = null) {
  const size = Math.max(
    1e-9,
    ...[0, 1, 2].map(
      (axis) => Math.max(...verts.map((p) => p[axis])) - Math.min(...verts.map((p) => p[axis]))
    )
  )
  const flat = flatFaces(verts, faces, size * 1e-6)
  const normals = flat.map((ids) => polygonNormal(ids.map((id) => verts[id])))
  const vnormals = verts.map(() => [0, 0, 0])
  flat.forEach((ids, index) => {
    const pts = ids.map((id) => verts[id])
    const area = length(cross(sub(pts[1], pts[0]), sub(pts.at(-1), pts[0]))) || 1e-12
    for (const id of ids) {
      vnormals[id] = add(vnormals[id], mul(normals[index], area))
    }
  })
  const edgeMap = new Map()
  flat.forEach((ids, index) => {
    ids.forEach((a, k) => {
      const b = ids[(k + 1) % ids.length]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      const edge = edgeMap.get(key)
      if (edge) {
        edge.faces.push(index)
      } else {
        edgeMap.set(key, { a, b, faces: [index] })
      }
    })
  })
  const edges = [...edgeMap.values()]
  return {
    verts,
    faces: flat,
    normals,
    vnormals: given ?? vnormals.map((n) => unit(n)),
    edges,
    closed: edges.every((edge) => edge.faces.length === 2),
    size
  }
}

/** Welds triangles given as world points into shared vertices (by position). */
export function weld(triangles) {
  const verts = []
  const index = new Map()
  const faces = triangles.map((tri) =>
    tri.map((p) => {
      const key = p.map((v) => Math.round(v * 1e7)).join(',')
      if (!index.has(key)) {
        index.set(key, verts.push(p) - 1)
      }
      return index.get(key)
    })
  )
  return { verts, faces }
}

/**
 * Merges vertices at one position (a surface's wrapped seam, a pole) and drops the repeats this
 * leaves in a face (a quad at a pole becomes a triangle). Faces turn outward when it closes.
 */
export function weldMesh(verts, faces, uvs = null) {
  const out = []
  const outUvs = uvs ? [] : null
  const index = new Map()
  const remap = verts.map((p, k) => {
    const key = p.map((v) => Math.round(v * 1e7)).join(',')
    if (!index.has(key)) {
      index.set(key, out.push(p) - 1)
      outUvs?.push(uvs[k])
    }
    return index.get(key)
  })
  const welded = faces
    .map((ids) =>
      ids.map((id) => remap[id]).filter((id, k, all) => id !== all[(k + 1) % all.length])
    )
    .filter((ids) => ids.length >= 3)
  return { verts: out, faces: welded, uvs: outUvs, remap }
}

/** The signed volume a closed mesh encloses: negative when its faces turn inward. */
export function signedVolume(verts, faces) {
  let volume = 0
  for (const ids of faces) {
    for (let k = 1; k < ids.length - 1; k += 1) {
      volume += dot(verts[ids[0]], cross(verts[ids[k]], verts[ids[k + 1]])) / 6
    }
  }
  return volume
}

/** Faces turned outward (when the mesh encloses a volume). */
export function outward(verts, faces) {
  return signedVolume(verts, faces) < 0 ? faces.map((ids) => ids.toReversed()) : faces
}

const OUTLINE_DEFAULT = { pt: 0.75, creasePt: 0.5, tone: 9, crease: 40, hidden: 'none' }

/** The outline style of a mesh from its `outline` and `wire` options (or false for none). */
function outlineStyle(spec, role, defaults) {
  const given = spec.outline ?? defaults.outline ?? true
  if (given === false && !spec.wire) {
    return null
  }
  const options = { ...OUTLINE_DEFAULT, ...(given === true || given === false ? {} : given) }
  const wire = spec.wire ? (typeof spec.wire === 'object' ? spec.wire : {}) : null
  const crease = options.crease === false ? false : Number(options.crease)
  return {
    role: options.role ?? (role === 'white' || role === 'none' ? 'ink' : role),
    tone: options.tone,
    pt: options.pt,
    creasePt: wire?.pt ?? options.creasePt,
    crease,
    creaseCos: crease === false ? -2 : Math.cos((crease * Math.PI) / 180),
    silhouette: options.silhouette ?? true,
    boundary: options.boundary ?? true,
    hidden: wire?.hidden ?? (spec.wire === 'dashed' ? 'dash' : options.hidden),
    wire: Boolean(spec.wire),
    sketch: spec.sketch ?? defaults.sketch ?? null,
    self: options.self ?? true,
    quietCaps: options.quietCaps ?? false,
    dash: options.dash ?? null
  }
}

/**
 * Pushes a mesh into a scene: its faces (one role, shaded in bands, smooth normals unless
 * `smooth: false`, culled when closed and opaque) and its outline unit. `extra.faceTone(index)`
 * shifts a face's tone (a highlighted band), `extra.features` adds feature curves.
 */
export function addMesh(scene, spec, geometry, extra = {}) {
  const id = spec.id ?? scene.nextId(extra.kind ?? 'mesh')
  const mesh = buildMesh(geometry.verts, geometry.faces, geometry.vnormals ?? null)
  if (!mesh.faces.length) {
    throw new Error(`mesh ${id} has no faces with area`)
  }
  const defaults = scene.lookDefaults ?? {}
  const role = scene.role(spec.role, extra.role ?? 'neutral')
  const opacity = spec.opacity ?? 1
  const smooth = spec.smooth ?? extra.smooth ?? true
  const fill = spec.fill !== false
  const cull = spec.cull ?? (mesh.closed && opacity >= 1)
  const photo = spec.photo && geometry.uvs ? scene.loadPhoto(spec.photo, null) : null
  if (fill) {
    mesh.faces.forEach((ids, index) => {
      scene.units.push({
        type: 'face',
        owner: id,
        surface: id,
        pts: ids.map((v) => mesh.verts[v]),
        vids: ids.map((v) => `${id}#${v}`),
        normal: mesh.normals[index],
        vnormals: smooth ? ids.map((v) => mesh.vnormals[v]) : null,
        uvs: photo ? ids.map((v) => geometry.uvs[v]) : null,
        texture: photo,
        role: photo ? 'white' : role,
        tone: spec.tone ?? extra.tone ?? 2,
        toneShift: extra.faceTone?.(index) ?? 0,
        opacity,
        shade: spec.shade ?? true,
        // Why two-tone: a lit side and a shaded side read as a solid at print; three bands on a
        // small sphere or cup looked busy. b.look({ shading }) or the mesh's own option changes it.
        shading: spec.shading ?? defaults.shading ?? 'two-tone',
        cull,
        solid: id,
        cast: spec.cast ?? opacity >= 0.5,
        edge: null,
        decals: [],
        fills: [],
        layer: spec.layer ?? 0
      })
    })
  }
  const style = outlineStyle(spec, role, defaults)
  if (style) {
    scene.units.push({
      type: 'outline',
      owner: id,
      surface: id,
      filled: fill,
      seeThrough: opacity < 1,
      layer: spec.layer ?? 0,
      mesh: { ...mesh, features: [...(geometry.features ?? []), ...(extra.features ?? [])] },
      style
    })
  }
  scene.records.solids += 1
  const center = mul(
    mesh.verts.reduce((sum, p) => add(sum, p), [0, 0, 0]),
    1 / mesh.verts.length
  )
  scene.anchor(id, center)
  const low = mesh.verts.reduce((best, p) => (p[2] < best[2] ? p : best), mesh.verts[0])
  const high = mesh.verts.reduce((best, p) => (p[2] > best[2] ? p : best), mesh.verts[0])
  scene.anchor(`${id}.top`, high)
  scene.anchor(`${id}.bottom`, low)
  return { id, center, faces: mesh.faces.length, closed: mesh.closed, verts: mesh.verts }
}

/** A Catmull-Rom curve through points, `steps` samples per span. */
export function catmullRom(points, steps = 12) {
  const out = [points[0]]
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[Math.min(points.length - 1, index + 2)]
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        [0, 1, 2].map(
          (axis) =>
            0.5 *
            (2 * p1[axis] +
              (-p0[axis] + p2[axis]) * t +
              (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
              (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)
        )
      )
    }
  }
  return out
}
