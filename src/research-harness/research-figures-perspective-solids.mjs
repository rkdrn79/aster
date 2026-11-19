// Solids and structured planes for perspective scenes: cones and conical frustums (Mip-NeRF),
// 3D Gaussians and spheres, voxel grids (Instant-NGP, DreamFusion volumes), tri-planes (EG3D),
// patch grids with window overlays (Swin) and stacks of feature-map planes. Curved solids are
// groups whose outline the renderer works out from the camera (silhouettes, lit faces).
import { LIGHT, add, dot, mul, sub, unit } from './research-figures-perspective-camera.mjs'
import {
  addMesh,
  outward,
  perpendiculars,
  weldMesh
} from './research-figures-perspective-meshcore.mjs'

import { planarUvs } from './research-figures-perspective-photo.mjs'

export { perpendiculars }

const TAU = Math.PI * 2

/** The convex hull of 2D points (monotone chain), counter-clockwise in screen terms. */
export function hull2d(points) {
  const sorted = [...points].toSorted((p, q) => p[0] - q[0] || p[1] - q[1])
  if (sorted.length < 3) {
    return sorted
  }
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper = []
  for (const p of sorted.toReversed()) {
    while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Surface samples of an ellipsoid: centre, unit axes and radii. */
function ellipsoidSamples(center, axes, radii, rings = 10, segments = 20) {
  const out = []
  for (let i = 0; i <= rings; i += 1) {
    const phi = (Math.PI * i) / rings
    for (let j = 0; j < segments; j += 1) {
      const theta = (TAU * j) / segments
      const local = [
        Math.sin(phi) * Math.cos(theta) * radii[0],
        Math.sin(phi) * Math.sin(theta) * radii[1],
        Math.cos(phi) * radii[2]
      ]
      out.push(
        add(
          add(add(center, mul(axes[0], local[0])), mul(axes[1], local[1])),
          mul(axes[2], local[2])
        )
      )
    }
  }
  return out
}

/**
 * The exact outline of an ellipsoid (centre, unit axes, radii, scaled by k) seen by a camera:
 * in the frame where it is a unit sphere, the points whose tangent passes through the eye.
 */
export function ellipsoidOutline(body, k, cam, count = 48) {
  const { center, axes, radii } = body
  const toUnit = (v) => axes.map((a, i) => dot(v, a) / (radii[i] * k))
  const fromUnit = (u) =>
    add(
      center,
      axes.reduce((sum, a, i) => add(sum, mul(a, u[i] * radii[i] * k)), [0, 0, 0])
    )
  let c
  let rho
  let n
  if (cam.parallel) {
    n = unit(toUnit(cam.axes.f))
    c = [0, 0, 0]
    rho = 1
  } else {
    const e = toUnit(sub(cam.settings.eye, center))
    const d2 = dot(e, e)
    if (d2 <= 1.0001) {
      return []
    }
    n = unit(e)
    c = mul(e, 1 / d2)
    rho = Math.sqrt(1 - 1 / d2)
  }
  const helper = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const p = unit([
    n[1] * helper[2] - n[2] * helper[1],
    n[2] * helper[0] - n[0] * helper[2],
    n[0] * helper[1] - n[1] * helper[0]
  ])
  const q = [n[1] * p[2] - n[2] * p[1], n[2] * p[0] - n[0] * p[2], n[0] * p[1] - n[1] * p[0]]
  return Array.from({ length: count }, (_, j) => {
    const angle = (2 * Math.PI * j) / count
    return fromUnit(add(c, add(mul(p, rho * Math.cos(angle)), mul(q, rho * Math.sin(angle)))))
  })
}

const projectAll = (cam, points) => points.map((p) => cam.project(p)).filter(Boolean)

export function solidMethods(scene) {
  const { units, anchor, nextId, records } = scene
  const role = (name, fallback) => scene.role(name, fallback)
  const ellipsoid = (spec, id) => {
    const axis = unit(spec.axis ?? [1, 0, 0])
    const [e1, e2] = perpendiculars(axis)
    const radii = Array.isArray(spec.radii)
      ? spec.radii
      : [spec.r ?? 0.3, spec.r ?? 0.3, spec.r ?? 0.3]
    const center = spec.at ?? [0, 0, 0]
    return { id, center, axes: [axis, e1, e2], radii }
  }
  const methods = {
    /**
     * A cone from `apex` (or a camera id in `from`) along `dir` (or through a point), half-angle
     * `angle` (degrees) or `radius` at `length`; drawn from `start` to `length`, cut at `slices`
     * with `highlight: [t0, t1]` a frustum in a stronger tone. `fill: false` draws only its
     * outline (`edge.dash` dashes it); hidden rims are dashed. A mesh underneath, so whatever
     * sits inside it (Gaussians, samples) paints between its far and near walls.
     */
    cone(spec = {}) {
      const id = spec.id ?? nextId('cone')
      const apex =
        typeof spec.from === 'string'
          ? scene.cameras[spec.from]?.center
          : (spec.apex ?? spec.from ?? [0, 0, 0])
      if (!apex) {
        throw new Error(`no camera "${spec.from}" for cone ${id}`)
      }
      const axis = unit(spec.dir ?? (spec.through ? sub(spec.through, apex) : [0, 1, 0]))
      const end = spec.length ?? 4
      const start = spec.start ?? 0
      const slope = spec.radius ? spec.radius / end : Math.tan(((spec.angle ?? 12) * Math.PI) / 180)
      const [e1, e2] = perpendiculars(axis)
      const at = (t, theta) =>
        add(
          add(apex, mul(axis, t)),
          mul(add(mul(e1, Math.cos(theta)), mul(e2, Math.sin(theta))), t * slope)
        )
      const cuts = [...new Set([start, ...(spec.slices ?? []), end])]
        .filter((t) => t >= start && t <= end)
        .toSorted((x, y) => x - y)
      const K = 64
      // Why: a cone drawn from (almost) its apex closes there, so it has no rim at the tip.
      const tip = start <= end * 1e-3
      const verts = cuts.flatMap((t, c) =>
        Array.from({ length: K }, (_, k) => (tip && c === 0 ? apex : at(t, (TAU * k) / K)))
      )
      const faces = []
      const bands = []
      for (let c = 0; c < cuts.length - 1; c += 1) {
        for (let k = 0; k < K; k += 1) {
          faces.push([
            c * K + k,
            c * K + ((k + 1) % K),
            (c + 1) * K + ((k + 1) % K),
            (c + 1) * K + k
          ])
          bands.push(c)
        }
      }
      faces.push(Array.from({ length: K }, (_, k) => (cuts.length - 1) * K + k))
      bands.push('cap')
      if (!tip) {
        faces.push(Array.from({ length: K }, (_, k) => K - 1 - k))
        bands.push('cap')
      }
      const welded = weldMesh(verts, faces)
      const tones = welded.faces.map((_, index) => bands[index])
      const highlight = spec.highlight ?? null
      const strong = (band) =>
        highlight &&
        band !== 'cap' &&
        cuts[band] >= highlight[0] - 1e-9 &&
        cuts[band + 1] <= highlight[1] + 1e-9
      const base = role(spec.role, 'accent')
      const edge = spec.edge === false ? null : { role: base, tone: 8, pt: 0.75, ...spec.edge }
      const rims =
        spec.rims === false || !edge
          ? []
          : cuts
              .map((t, c) => ({
                t,
                ids: Array.from({ length: K }, (_, k) => welded.remap[c * K + k])
              }))
              .filter(({ t }) => !tip || t > start)
              .map(({ t, ids }) => ({
                ids,
                closed: true,
                // Why: the cuts that bound the highlighted frustum print bolder, so it reads.
                style:
                  highlight &&
                  (Math.abs(t - highlight[0]) < 1e-9 || Math.abs(t - highlight[1]) < 1e-9)
                    ? { ...edge, pt: edge.pt * 1.4, tone: Math.min(11, edge.tone + 1) }
                    : undefined
              }))
      addMesh(
        scene,
        {
          id,
          role: base,
          tone: spec.tone ?? 2,
          opacity: spec.opacity ?? 1,
          fill: spec.fill,
          shading: spec.shading ?? 'smooth',
          cast: spec.cast,
          outline: edge
            ? {
                role: edge.role,
                tone: edge.tone,
                pt: edge.pt,
                dash: edge.dash ?? null,
                crease: false,
                quietCaps: true,
                hidden: spec.hidden === 'none' ? 'none' : 'dash'
              }
            : false
        },
        { verts: welded.verts, faces: outward(welded.verts, welded.faces) },
        {
          kind: 'cone',
          features: rims,
          faceTone: (index) =>
            tones[index] === 'cap' ? -1 : strong(tones[index]) ? (spec.highlightTone ?? 3) : 0
        }
      )
      // Why: labels go under a cut (t0, t1) and over it; the lowest and highest rim points.
      const down = unit(sub([0, 0, -1], mul(axis, -axis[2])))
      const rimPoint = (t, sign) => add(add(apex, mul(axis, t)), mul(down, sign * t * slope))
      anchor(id, add(apex, mul(axis, (start + end) / 2)))
      anchor(`${id}.apex`, apex)
      anchor(`${id}.end`, add(apex, mul(axis, end)))
      cuts.forEach((t, index) => {
        anchor(`${id}.t${index}`, rimPoint(t, 1))
        anchor(`${id}.top${index}`, rimPoint(t, -1))
      })
      return {
        id,
        apex,
        axis,
        rimPoint,
        radiusAt: (t) => t * slope,
        pointAt: (t, theta = 0) => at(t, theta),
        center: (t) => add(apex, mul(axis, t))
      }
    },
    /**
     * A 3D Gaussian: an ellipsoid at `at` with `radii` [along axis, across, across] (or `r`),
     * turned so its first radius runs along `axis`; `levels` nested shells, pale to strong, each
     * its exact outline from the camera (a splat, sorted by its centre among the rest).
     */
    gaussian(spec = {}) {
      const id = spec.id ?? nextId('gaussian')
      const body = ellipsoid(spec, id)
      const base = role(spec.role, 'accent')
      const levels = spec.levels ?? 3
      const samples = ellipsoidSamples(body.center, body.axes, body.radii)
      units.push({
        type: 'group',
        owner: id,
        center: body.center,
        points: samples.filter((_, index) => index % 7 === 0),
        shadowPoints: spec.cast ? samples : null,
        parts(cam) {
          const out = []
          // Why: the dense core sits away from the light, so a splat reads as a lit volume.
          const { r, u, f } = cam.axes
          const toLight = unit(add(add(mul(r, LIGHT[0]), mul(u, LIGHT[1])), mul(f, LIGHT[2])))
          const drift = spec.shade === false ? 0 : 0.2 * Math.max(...body.radii)
          for (let level = 0; level < levels; level += 1) {
            const k = 1 - level / levels
            const shell = { ...body, center: add(body.center, mul(toLight, -drift * (1 - k))) }
            out.push({
              kind: 'fill',
              pts: projectAll(cam, ellipsoidOutline(shell, k, cam)),
              role: base,
              tone: (spec.tone ?? 2) + level * (spec.step ?? 2),
              opacity: spec.opacity ?? 0.55
            })
          }
          if (spec.edge) {
            out.push({
              kind: 'stroke',
              closed: true,
              pts: projectAll(cam, ellipsoidOutline(body, 1, cam)),
              role: base,
              tone: 8,
              pt: 0.5,
              dash: spec.edge.dash ? [2, 1.6] : null
            })
          }
          return out
        }
      })
      anchor(id, body.center)
      return body
    },
    /** A flat disc: centre `at`, facing `normal`, radius `r` (a pixel footprint, a lens). */
    disc(spec = {}) {
      const id = spec.id ?? nextId('disc')
      const center = spec.at ?? [0, 0, 0]
      const normal = unit(spec.normal ?? [0, 0, 1])
      const [e1, e2] = perpendiculars(normal)
      const r = spec.r ?? 0.2
      const ry = spec.ry ?? r
      const pts = Array.from({ length: 48 }, (_, k) =>
        add(
          add(center, mul(e1, r * Math.cos((TAU * k) / 48))),
          mul(e2, ry * Math.sin((TAU * k) / 48))
        )
      )
      const base = role(spec.role, 'accent')
      const texture = spec.photo ? scene.loadPhoto(spec.photo, r / ry || 1) : null
      units.push({
        type: 'face',
        owner: id,
        pts,
        normal,
        texture,
        uvs: texture ? planarUvs(pts, normal) : null,
        role: base,
        tone: spec.tone ?? 2,
        opacity: spec.opacity ?? 1,
        shade: false,
        edge: spec.edge === false ? null : { role: base, tone: 7, pt: 0.9, ...spec.edge },
        decals: [],
        fills: [],
        layer: 0,
        split: false
      })
      anchor(id, center)
      return { id, center, normal, r }
    },
    /** A shaded sphere at `at`, radius `r`, lit from the upper left. */
    sphere(spec = {}) {
      const id = spec.id ?? nextId('sphere')
      const center = spec.at ?? [0, 0, 0]
      const r = spec.r ?? 0.3
      const base = role(spec.role, 'neutral')
      const tone = spec.tone ?? 3
      const samples = ellipsoidSamples(
        center,
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ],
        [r, r, r],
        8,
        16
      )
      units.push({
        type: 'group',
        owner: id,
        center,
        points: samples.filter((_, index) => index % 5 === 0),
        shadowPoints: spec.cast === false ? null : samples,
        parts(cam) {
          const body = {
            center,
            axes: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1]
            ],
            radii: [r, r, r]
          }
          const outline = projectAll(cam, ellipsoidOutline(body, 1, cam))
          const cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length
          const cy = outline.reduce((sum, p) => sum + p[1], 0) / outline.length
          const radius = Math.max(...outline.map((p) => Math.hypot(p[0] - cx, p[1] - cy)))
          const disc = (k, shift) =>
            outline.map(([x, y]) => [
              cx + (x - cx) * k - radius * shift * 0.7,
              cy + (y - cy) * k - radius * shift * 0.75
            ])
          return [
            { kind: 'fill', pts: outline, role: base, tone: tone + 2 },
            { kind: 'fill', pts: disc(0.84, 0.12), role: base, tone: tone + 1 },
            { kind: 'fill', pts: disc(0.46, 0.32), role: base, tone },
            ...(spec.edge === false
              ? []
              : [{ kind: 'stroke', closed: true, pts: outline, role: base, tone: 9, pt: 0.45 }])
          ]
        }
      })
      records.solids += 1
      anchor(id, center)
      return { id, center, r }
    },
    /**
     * Voxels: cubes of edge `cell` from `origin` at integer cells (`cells` [[i, j, k]], or a
     * function (i, j, k) → true | role over `n` [nx, ny, nz]); only outside faces are drawn.
     * `lattice` draws the whole n-grid as lines ('outer' its outside faces only).
     */
    voxels(spec = {}) {
      const id = spec.id ?? nextId('voxels')
      const origin = spec.origin ?? [0, 0, 0]
      const cell = spec.cell ?? 0.25
      const n = spec.n ?? [4, 4, 4]
      const filled = new Map()
      if (typeof spec.cells === 'function') {
        for (let i = 0; i < n[0]; i += 1) {
          for (let j = 0; j < n[1]; j += 1) {
            for (let k = 0; k < n[2]; k += 1) {
              const value = spec.cells(i, j, k)
              if (value) {
                filled.set(`${i},${j},${k}`, typeof value === 'string' ? value : spec.role)
              }
            }
          }
        }
      } else {
        for (const entry of spec.cells ?? []) {
          const [i, j, k, cellRole] = entry
          filled.set(`${i},${j},${k}`, cellRole ?? spec.role)
        }
      }
      const corner = (i, j, k) => add(origin, [i * cell, j * cell, k * cell])
      const sides = [
        {
          d: [-1, 0, 0],
          q: [
            [0, 0, 0],
            [0, 1, 0],
            [0, 1, 1],
            [0, 0, 1]
          ]
        },
        {
          d: [1, 0, 0],
          q: [
            [1, 0, 0],
            [1, 0, 1],
            [1, 1, 1],
            [1, 1, 0]
          ]
        },
        {
          d: [0, -1, 0],
          q: [
            [0, 0, 0],
            [0, 0, 1],
            [1, 0, 1],
            [1, 0, 0]
          ]
        },
        {
          d: [0, 1, 0],
          q: [
            [0, 1, 0],
            [1, 1, 0],
            [1, 1, 1],
            [0, 1, 1]
          ]
        },
        {
          d: [0, 0, -1],
          q: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
            [0, 1, 0]
          ]
        },
        {
          d: [0, 0, 1],
          q: [
            [0, 0, 1],
            [0, 1, 1],
            [1, 1, 1],
            [1, 0, 1]
          ]
        }
      ]
      for (const [key, cellRole] of filled) {
        const [i, j, k] = key.split(',').map(Number)
        for (const side of sides) {
          if (filled.has(`${i + side.d[0]},${j + side.d[1]},${k + side.d[2]}`)) {
            continue
          }
          units.push({
            type: 'face',
            owner: id,
            pts: side.q.map(([a, b, c]) => corner(i + a, j + b, k + c)),
            normal: side.d,
            role: role(cellRole, 'accent'),
            tone: spec.tone ?? 2,
            opacity: spec.opacity ?? 1,
            shade: true,
            cull: (spec.opacity ?? 1) >= 1,
            cast: true,
            solid: `${id}:${key}`,
            edge: { role: 'ink', tone: 10, pt: 0.4, ...spec.edge },
            decals: [],
            fills: [],
            layer: 0,
            split: false
          })
        }
      }
      if (spec.lattice) {
        const stroke = {
          role: role(spec.lattice.role, 'ink'),
          tone: spec.lattice.tone ?? 8,
          pt: spec.lattice.pt ?? 0.4,
          dash: spec.lattice.dash ? [2, 1.6] : null
        }
        const outer = spec.lattice === 'outer' || spec.lattice.outer
        const push = (a, b) =>
          units.push({ type: 'line', owner: `${id}.lattice`, pts: [a, b], ...stroke })
        for (let i = 0; i <= n[0]; i += 1) {
          for (let j = 0; j <= n[1]; j += 1) {
            if (!outer || i === 0 || i === n[0] || j === 0 || j === n[1]) {
              push(corner(i, j, 0), corner(i, j, n[2]))
            }
          }
          for (let k = 0; k <= n[2]; k += 1) {
            if (!outer || i === 0 || i === n[0] || k === 0 || k === n[2]) {
              push(corner(i, 0, k), corner(i, n[1], k))
            }
          }
        }
        for (let j = 0; j <= n[1]; j += 1) {
          for (let k = 0; k <= n[2]; k += 1) {
            if (!outer || j === 0 || j === n[1] || k === 0 || k === n[2]) {
              push(corner(0, j, k), corner(n[0], j, k))
            }
          }
        }
      }
      records.solids += filled.size ? 1 : 0
      anchor(id, add(origin, mul(n, cell / 2)))
      return { id, corner, cell, n }
    }
  }
  return methods
}
