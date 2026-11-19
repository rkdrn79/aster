// Curved and organic objects for perspective scenes, all meshes underneath: a mesh from faces or
// triangles, a surface from a function, a height field or a grid of points, tubes and sweeps
// along a path, lathed solids, ellipsoids, metaball blobs, the scene's light (with a sun glyph)
// and its look (shading, outlines, a hand-drawn line). Each mesh shades in tone bands of its
// role and draws its silhouette and creases.
import { add, cross, dot, length, mul, sub, unit } from './research-figures-perspective-camera.mjs'
import {
  addMesh,
  catmullRom,
  outward,
  perpendiculars,
  weld,
  weldMesh
} from './research-figures-perspective-meshcore.mjs'
import { metaballMesh } from './research-figures-perspective-blob.mjs'

const TAU = Math.PI * 2
const range = (value, fallback) => (Array.isArray(value) ? value : fallback)
const count = (value, fallback) =>
  Array.isArray(value) ? value : [value ?? fallback, value ?? fallback]

/** A grid of points (rows of columns) as quads, with the shares of each point as its uv. */
function gridGeometry(rows, { closeU = false, closeV = false } = {}) {
  const nu = rows.length
  const nv = rows[0].length
  const verts = rows.flat()
  const uvs = rows.flatMap((row, i) => row.map((_, j) => [i / (nu - 1), j / (nv - 1)]))
  const faces = []
  const at = (i, j) => (i % nu) * nv + (j % nv)
  for (let i = 0; i < (closeU ? nu : nu - 1); i += 1) {
    for (let j = 0; j < (closeV ? nv : nv - 1); j += 1) {
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)])
    }
  }
  const welded = weldMesh(verts, faces, uvs)
  return { ...welded, faces: outward(welded.verts, welded.faces) }
}

/** Rings of points along a path, each a profile in the plane across the path (parallel transport). */
function sweepRings(path, profile, radiusAt) {
  const tangents = path.map((_, i) =>
    unit(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]))
  )
  let normal = perpendiculars(tangents[0])[0]
  return path.map((p, i) => {
    const t = tangents[i]
    normal = unit(sub(normal, mul(t, dot(normal, t))))
    if (length(normal) < 1e-9) {
      normal = perpendiculars(t)[0]
    }
    const binormal = cross(t, normal)
    const r = radiusAt(i / (path.length - 1))
    return profile.map(([x, y]) => add(p, add(mul(normal, x * r), mul(binormal, y * r))))
  })
}

/** A swept solid: rings joined by quads, closed loops capped at both ends. */
function sweepGeometry(rings, caps) {
  const n = rings[0].length
  const verts = rings.flat()
  const faces = []
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const k1 = (k + 1) % n
      faces.push([i * n + k, i * n + k1, (i + 1) * n + k1, (i + 1) * n + k])
    }
  }
  if (caps) {
    faces.push(Array.from({ length: n }, (_, k) => n - 1 - k))
    faces.push(Array.from({ length: n }, (_, k) => (rings.length - 1) * n + k))
  }
  const welded = weldMesh(verts, faces)
  return { ...welded, faces: outward(welded.verts, welded.faces) }
}

const circle = (sides) =>
  Array.from({ length: sides }, (_, k) => [
    Math.cos((TAU * k) / sides),
    Math.sin((TAU * k) / sides)
  ])

export function meshMethods(scene) {
  const methods = {
    /**
     * A mesh: `vertices` [[x, y, z]] and `faces` [[i, j, k, …]] (counter-clockwise from
     * outside), or `triangles` [[p, p, p]]; `uvs` per vertex with `photo` maps a picture on it.
     */
    mesh(spec = {}) {
      const geometry = spec.triangles
        ? weld(spec.triangles)
        : { verts: spec.vertices ?? [], faces: spec.faces ?? [], uvs: spec.uvs ?? null }
      if (!geometry.verts.length || !geometry.faces.length) {
        throw new Error('mesh needs vertices and faces, or triangles')
      }
      return addMesh(scene, spec, geometry)
    },
    /**
     * A surface: `f: (u, v) => [x, y, z]` over `u`, `v` ranges, `z: (x, y) => height` over `x`,
     * `y` ranges (a loss landscape, a terrain), or `points` (rows of [x, y, z]); `n` samples.
     */
    surface(spec = {}) {
      let rows = spec.points
      if (!rows) {
        const [nu, nv] = count(spec.n, 24)
        const [u0, u1] = range(spec.u ?? spec.x, [0, 1])
        const [v0, v1] = range(spec.v ?? spec.y, [0, 1])
        const f = spec.f ?? ((x, y) => [x, y, spec.z(x, y)])
        if (!spec.f && typeof spec.z !== 'function') {
          throw new Error('surface needs f: (u, v) => [x, y, z], z: (x, y) => height, or points')
        }
        rows = Array.from({ length: nu + 1 }, (_, i) =>
          Array.from({ length: nv + 1 }, (_, j) =>
            f(u0 + ((u1 - u0) * i) / nu, v0 + ((v1 - v0) * j) / nv)
          )
        )
      }
      return addMesh(
        scene,
        { ...spec, id: spec.id ?? scene.nextId('surface') },
        gridGeometry(rows, spec),
        {
          kind: 'surface'
        }
      )
    },
    /** A tube along `points` (smoothed unless `smooth: false`): radius `r` or `r: (t) => …`. */
    tube(spec = {}) {
      return methods.sweep({ ...spec, profile: circle(spec.sides ?? 14), kind: 'tube' })
    },
    /** A sweep: a 2D `profile` (a closed loop of [x, y]) carried along `points`, scaled by `r`. */
    sweep(spec = {}) {
      const points = spec.points ?? []
      if (points.length < 2) {
        throw new Error('a tube or sweep needs two or more points')
      }
      const path = spec.smooth === false ? points : catmullRom(points, spec.steps ?? 8)
      const radiusAt = typeof spec.r === 'function' ? spec.r : () => spec.r ?? 0.1
      const rings = sweepRings(path, spec.profile ?? circle(12), radiusAt)
      return addMesh(
        scene,
        { ...spec, id: spec.id ?? scene.nextId(spec.kind ?? 'sweep') },
        sweepGeometry(rings, spec.caps !== false)
      )
    },
    /** A lathed solid: `profile` [[radius, height]] turned around `axis` through `at`. */
    lathe(spec = {}) {
      const axis = unit(spec.axis ?? [0, 0, 1])
      const [e1, e2] = perpendiculars(axis)
      const at = spec.at ?? [0, 0, 0]
      const sides = spec.sides ?? 32
      const rows = Array.from({ length: sides + 1 }, (_, i) => {
        const angle = (TAU * i) / sides
        const radial = add(mul(e1, Math.cos(angle)), mul(e2, Math.sin(angle)))
        return (spec.profile ?? []).map(([r, h]) => add(add(at, mul(radial, r)), mul(axis, h)))
      })
      return addMesh(scene, { ...spec, id: spec.id ?? scene.nextId('lathe') }, gridGeometry(rows))
    },
    /** An ellipsoid (a sphere with `r`): `radii` [along axis, across, across], turned to `axis`. */
    ellipsoid(spec = {}) {
      const axis = unit(spec.axis ?? [1, 0, 0])
      const [e1, e2] = perpendiculars(axis)
      const radii = Array.isArray(spec.radii)
        ? spec.radii
        : [spec.r ?? 0.5, spec.r ?? 0.5, spec.r ?? 0.5]
      const at = spec.at ?? [0, 0, 0]
      const [rings, segments] = [spec.rings ?? 14, spec.segments ?? 28]
      const rows = Array.from({ length: segments + 1 }, (_, i) =>
        Array.from({ length: rings + 1 }, (_, j) => {
          const [theta, phi] = [(TAU * i) / segments, (Math.PI * j) / rings]
          return add(
            at,
            add(
              mul(axis, Math.cos(phi) * radii[0]),
              add(
                mul(e1, Math.sin(phi) * Math.cos(theta) * radii[1]),
                mul(e2, Math.sin(phi) * Math.sin(theta) * radii[2])
              )
            )
          )
        })
      )
      return addMesh(
        scene,
        { ...spec, id: spec.id ?? scene.nextId('ellipsoid') },
        gridGeometry(rows)
      )
    },
    /**
     * An organic blob: metaballs `balls` [{ at, r }] melted into one smooth surface (a cell, a
     * creature, a latent cloud); `n` cells across (detail), `blend` how far balls melt (× r).
     */
    blob(spec = {}) {
      if (!spec.balls?.length) {
        throw new Error('blob needs balls: [{ at: [x, y, z], r }]')
      }
      return addMesh(
        scene,
        { ...spec, id: spec.id ?? scene.nextId('blob') },
        metaballMesh(spec.balls, {
          n: spec.n ?? 22,
          level: spec.level ?? 1,
          blend: spec.blend ?? 1.8
        })
      )
    },
    /**
     * The scene's light: a sun far away (`dir` toward it, or `at` where its glyph sits) or a
     * lamp (`kind: 'point'` at `at`); `glyph: 'sun' | 'none'`, `shadows: false` for none.
     */
    light(spec = {}) {
      const id = spec.id ?? 'light'
      scene.units.push({
        type: 'light',
        owner: id,
        kind: spec.kind ?? 'sun',
        dir: spec.dir ?? null,
        at: spec.at ?? null,
        shadows: spec.shadows !== false
      })
      if (spec.at && spec.glyph !== 'none' && spec.glyph !== false) {
        const role = scene.role(spec.role, 'second')
        scene.units.push({
          type: 'group',
          owner: id,
          center: spec.at,
          points: [spec.at],
          parts: (cam) => {
            const at = cam.project(spec.at)
            const r = spec.r ?? 4.5
            return at
              ? [
                  {
                    kind: 'sun',
                    at,
                    r,
                    rays: spec.rays ?? 8,
                    role,
                    tone: spec.tone ?? 5,
                    pad: r * 4
                  }
                ]
              : []
          }
        })
        scene.anchor(id, spec.at)
      }
      return { id }
    },
    /**
     * The look of meshes drawn after it: `shading` 'three-tone' | 'cel' | 'two-tone' | 'smooth' |
     * 'flat', `outline` { pt, tone, role, crease } | false, `sketch` { roughness, seed } | true.
     */
    look(spec = {}) {
      scene.lookDefaults = { ...scene.lookDefaults, ...spec }
      return scene.lookDefaults
    }
  }
  return methods
}
