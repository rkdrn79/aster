// The perspective scene builder: primitives in 3D world space (planes and image planes with
// grids and photos, rays through pixels with samples, boxes, floors, paths, points and camera
// glyphs) kept as units the renderer projects through the scene's one camera. Solids (cones,
// Gaussians, voxels, tri-planes, patch grids) are in research-figures-perspective-solids.mjs.
import {
  add,
  cross,
  length,
  lerp3,
  mul,
  sub,
  unit
} from './research-figures-perspective-camera.mjs'
import { objectMethods } from './research-figures-perspective-objects.mjs'
import { planeMethods } from './research-figures-perspective-planes.mjs'
import { solidMethods } from './research-figures-perspective-solids.mjs'
import { meshMethods } from './research-figures-perspective-mesh.mjs'
import { catmullRom } from './research-figures-perspective-meshcore.mjs'

export { catmullRom }

/** Role names a scene paints with, by meaning and by world letter, to the illustration roles. */
const ROLE_ALIASES = {
  a: 'accent',
  ours: 'accent',
  accent: 'accent',
  b: 'second',
  output: 'second',
  second: 'second',
  c: 'third',
  model: 'third',
  third: 'third',
  d: 'fourth',
  input: 'fourth',
  data: 'fourth',
  fourth: 'fourth',
  frozen: 'neutral',
  neutral: 'neutral',
  gray: 'neutral',
  grey: 'neutral',
  good: 'good',
  bad: 'bad',
  ink: 'ink',
  white: 'white',
  none: 'none'
}

export function sceneRole(name, fallback = 'neutral') {
  if (name === undefined || name === null) {
    return fallback
  }
  const role = ROLE_ALIASES[name]
  if (role) {
    return role
  }
  // Why: a paper's own colour (a NeRF sample, a class) is a #hex; it shades on its own ramp.
  if (typeof name === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(name)) {
    return name.toLowerCase()
  }
  throw new Error(
    `perspective role "${name}" is not one of ${Object.keys(ROLE_ALIASES).join(', ')} or a #hex colour`
  )
}

/** Plane orientations by name: `u` runs along the picture's rows, `v` down its columns. */
const PLANE_AXES = {
  xy: { u: [1, 0, 0], v: [0, -1, 0] },
  xz: { u: [1, 0, 0], v: [0, 0, -1] },
  yz: { u: [0, 1, 0], v: [0, 0, -1] }
}

const asPair = (value, fallback) =>
  value === undefined ? fallback : Array.isArray(value) ? value : [value, value]

/**
 * The normal of a plane facing a point, stood upright: a plane that faces a point a little above
 * or below it (up to about 48°) turns only round the vertical, so its side edges stay vertical,
 * as an image plane or a photo stands in a designer's drawing. `upright: false` tilts it fully.
 */
export function uprightNormal(normal, upright) {
  const level = Math.hypot(normal[0], normal[1])
  if (upright === false || level < 1e-6 || (upright !== true && Math.abs(normal[2]) > 0.75)) {
    return normal
  }
  return [normal[0] / level, normal[1] / level, 0]
}

/** The `u`, `v` of a plane spec: named axes, explicit vectors, or facing a point (upright). */
export function planeFrame(spec, center) {
  if (spec.u && spec.v) {
    return { u: unit(spec.u), v: unit(spec.v) }
  }
  if (spec.facing) {
    const n = uprightNormal(unit(sub(spec.facing, center)), spec.upright)
    let u = cross(spec.up ?? [0, 0, 1], n)
    u = length(u) < 1e-6 ? [1, 0, 0] : unit(u)
    return { u, v: unit(cross(u, n)) }
  }
  const named = PLANE_AXES[spec.axes ?? 'xz']
  if (!named) {
    throw new Error(`plane axes "${spec.axes}" is not xy, xz or yz (or give u and v, or facing)`)
  }
  return named
}

/** A point on a rectangle (centre, u, v, size) at shares (s, t) from its top-left corner. */
export function rectPoint(rect, s, t) {
  const [w, h] = rect.size
  return add(add(rect.center, mul(rect.u, w * (s - 0.5))), mul(rect.v, h * (t - 0.5)))
}

const STROKE_DEFAULT = { role: 'ink', tone: 11, pt: 0.6 }

/** A stroke spec from an option: false for none, true for the default, or { role, tone, pt, dash }. */
export function strokeOf(option, fallback = STROKE_DEFAULT) {
  if (option === false || option === null) {
    return null
  }
  const given = option === true || option === undefined ? {} : option
  const role = sceneRole(given.role ?? fallback.role, 'ink')
  return {
    role,
    tone: given.tone ?? (role === 'ink' ? 11 : (fallback.tone ?? 7)),
    pt: given.pt ?? given.weight ?? fallback.pt ?? 0.6,
    dash: dashOf(given.dash ?? fallback.dash)
  }
}

/** Dash patterns in printed pt: 'dashed', 'dotted', [on, off] or none. */
export function dashOf(dash) {
  if (!dash) {
    return null
  }
  if (Array.isArray(dash)) {
    return dash
  }
  return dash === 'dotted' ? [0.01, 1.6] : [2.4, 1.8]
}

/**
 * A new scene: call its primitives with world points, then hand `units`, `anchors` and
 * `records` to the renderer. `photos.load(spec)` turns a photo option into `{ href, width,
 * height }` (the kit reads project files and stock photos).
 */
export function perspectiveScene({ photos = null } = {}) {
  const units = []
  const anchors = {}
  const cameras = {}
  const planes = {}
  const records = { rays: [], photos: [], solids: 0, floors: 0, planes: 0 }
  let serial = 0
  const nextId = (kind) => `${kind}-${(serial += 1)}`
  const anchor = (name, point) => {
    anchors[name] = point
    return point
  }
  const loadPhoto = (option, aspect) => {
    if (!option) {
      return null
    }
    if (!photos) {
      throw new Error('this scene cannot load photos (no photo loader)')
    }
    const spec = typeof option === 'string' ? { src: option } : option
    const loaded = photos.load(spec)
    const repeat = spec.repeat ? asPair(spec.repeat, [1, 1]) : null
    const ratio = repeat && aspect ? (aspect * repeat[1]) / repeat[0] : aspect
    const [x0, y0, x1, y1] = spec.crop ?? [0, 0, 1, 1]
    let crop = [x0 * loaded.width, y0 * loaded.height, x1 * loaded.width, y1 * loaded.height]
    if ((spec.fit ?? 'cover') === 'cover' && ratio) {
      // Why cover: a photo keeps its proportions on the plane; the overflow is cut evenly.
      const cw = crop[2] - crop[0]
      const ch = crop[3] - crop[1]
      if (cw / ch > ratio) {
        const keep = ch * ratio
        crop = [crop[0] + (cw - keep) / 2, crop[1], crop[0] + (cw + keep) / 2, crop[3]]
      } else {
        const keep = cw / ratio
        crop = [crop[0], crop[1] + (ch - keep) / 2, crop[2], crop[1] + (ch + keep) / 2]
      }
    }
    return { ...loaded, crop, opacity: spec.opacity ?? 1, wash: spec.wash, tint: spec.tint, repeat }
  }
  /** A flat quad face with its grid, cells, windows and photo; returns the rectangle. */
  const rectFace = (spec, rect, owner, extra = {}) => {
    const [w, h] = rect.size
    const [nu, nv] = asPair(spec.grid?.n ?? spec.grid, [0, 0])
    const corners = [
      rectPoint(rect, 0, 0),
      rectPoint(rect, 1, 0),
      rectPoint(rect, 1, 1),
      rectPoint(rect, 0, 1)
    ]
    const decals = []
    const gridStroke = strokeOf(typeof spec.grid === 'object' ? spec.grid : {}, {
      role: 'ink',
      tone: 9,
      pt: 0.4
    })
    const lines = (count, along, stroke) => {
      for (let index = 1; index < count; index += 1) {
        const share = index / count
        decals.push({
          pts:
            along === 'u'
              ? [rectPoint(rect, share, 0), rectPoint(rect, share, 1)]
              : [rectPoint(rect, 0, share), rectPoint(rect, 1, share)],
          ...stroke
        })
      }
    }
    if (nu > 1 || nv > 1) {
      lines(nu, 'u', gridStroke)
      lines(nv, 'v', gridStroke)
    }
    if (spec.windows) {
      const [wu, wv] = asPair(spec.windows.n ?? spec.windows, [1, 1])
      const stroke = strokeOf(typeof spec.windows === 'object' ? spec.windows : {}, {
        role: 'accent',
        tone: 7,
        pt: 0.9
      })
      lines(wu, 'u', stroke)
      lines(wv, 'v', stroke)
    }
    const fills = (spec.cells ?? []).map((cell) => {
      const [i, j] = cell.at ?? cell
      const cu = Math.max(nu, 1)
      const cv = Math.max(nv, 1)
      return {
        pts: [
          rectPoint(rect, i / cu, j / cv),
          rectPoint(rect, (i + 1) / cu, j / cv),
          rectPoint(rect, (i + 1) / cu, (j + 1) / cv),
          rectPoint(rect, i / cu, (j + 1) / cv)
        ],
        role: sceneRole(cell.role, 'accent'),
        tone: cell.tone ?? 3,
        opacity: cell.opacity ?? 1
      }
    })
    const photo = extra.photo ?? loadPhoto(spec.photo, w / h)
    if (photo) {
      records.photos.push({ id: owner, corners })
    }
    const role = sceneRole(spec.role ?? spec.fill, photo ? 'white' : 'neutral')
    units.push({
      type: 'face',
      owner,
      pts: corners,
      normal: unit(cross(rect.v, rect.u)),
      role,
      tone: spec.tone ?? 1,
      opacity: spec.opacity ?? 1,
      // Why shaded by default: planes facing different ways (a tri-plane, stacked maps seen at
      // an angle) read as 3D only when the one turned from the light is darker. A photo
      // keeps its own colours and a floor its even tone; `shade: false` turns it off.
      shade: spec.shade ?? (!photo && spec.layer !== -1 && api.lookDefaults?.planes !== false),
      shading: spec.shading ?? 'soft',
      edge: strokeOf(spec.edge, { role: 'ink', tone: 11, pt: 0.6 }),
      decals,
      fills,
      photo: photo ? { ...photo, corners } : null,
      layer: spec.layer ?? 0,
      cast: spec.cast ?? false,
      receive: spec.receive ?? false,
      sketch: spec.sketch ?? api.lookDefaults?.sketch ?? null,
      shadowOpacity: spec.shadowOpacity,
      photoGroup: extra.group ?? owner,
      // Why tagged: the lint measures how upright a plane's side edges print (tilted-verticals).
      rect: true,
      ...extra.unit
    })
    return corners
  }

  const api = {
    units,
    anchors,
    records,
    cameras,
    planes,
    role: sceneRole,
    anchor,
    nextId,
    rectFace,
    loadPhoto,
    /**
     * A plane: `at` its centre, `axes` 'xy' | 'xz' | 'yz' (or `u`, `v`, or `facing` a point),
     * `size` [w, h]; `grid` n | [nu, nv] | { n, role, pt, dash }; `windows` a coarser grid in
     * colour; `cells` [{ at: [i, j], role }] filled; `photo` a picture mapped onto it; `edge`.
     */
    plane(spec = {}) {
      const id = spec.id ?? nextId('plane')
      const center = spec.at ?? [0, 0, 0]
      const size = asPair(spec.size, [1, 1])
      const rect = { center, size, ...planeFrame(spec, center) }
      const corners = rectFace(spec, rect, id)
      planes[id] = { ...rect, grid: asPair(spec.grid?.n ?? spec.grid, [1, 1]) }
      records.planes += 1
      anchor(id, center)
      ;['tl', 'tr', 'br', 'bl'].forEach((name, index) => anchor(`${id}.${name}`, corners[index]))
      return { id, ...rect, corners, point: (s, t) => rectPoint(rect, s, t) }
    },
    /** A cell's centre on a plane drawn with a grid, or a point at shares `[s, t]`. */
    onPlane(planeId, { cell, at } = {}) {
      const rect = planes[planeId]
      if (!rect) {
        throw new Error(`no plane "${planeId}" in this scene (draw it first)`)
      }
      if (cell) {
        const [nu, nv] = rect.grid
        return rectPoint(rect, (cell[0] + 0.5) / nu, (cell[1] + 0.5) / nv)
      }
      const [s, t] = at ?? [0.5, 0.5]
      return rectPoint(rect, s, t)
    },
    /**
     * A ray from `from` (a point or a camera id) through `through` (a point or { plane, cell |
     * at }) to `to` (or `length` from the origin, or `extend` past `through`), with `samples`
     * (n, or shares of its length) as dots, an arrowhead (`head`) and a colour by role.
     */
    ray(spec = {}) {
      const id = spec.id ?? nextId('ray')
      const origin =
        typeof spec.from === 'string'
          ? (cameras[spec.from]?.center ??
            (() => {
              throw new Error(`no camera "${spec.from}" in this scene`)
            })())
          : (spec.from ?? [0, -4, 1])
      const through =
        spec.through && !Array.isArray(spec.through)
          ? api.onPlane(spec.through.plane, spec.through)
          : (spec.through ?? null)
      const direction = unit(
        spec.dir ?? (through ? sub(through, origin) : spec.to ? sub(spec.to, origin) : [0, 1, 0])
      )
      const end = spec.to
        ? spec.to
        : spec.length
          ? add(origin, mul(direction, spec.length))
          : add(through ?? origin, mul(direction, spec.extend ?? 3))
      const role = sceneRole(spec.role, 'accent')
      const stroke = { role, tone: spec.tone ?? (role === 'ink' ? 11 : 7), pt: spec.pt ?? 0.9 }
      const start = through && spec.before === 'none' ? through : origin
      if (through && spec.before === 'faint' && start === origin) {
        units.push({
          type: 'line',
          owner: id,
          pts: [origin, through],
          ...stroke,
          tone: Math.max(1, stroke.tone - 4),
          pt: stroke.pt * 0.7
        })
      }
      units.push({
        type: 'line',
        owner: id,
        pts: through && spec.before === 'faint' ? [through, end] : [start, end],
        ...stroke,
        dash: dashOf(spec.dash),
        sketch: spec.sketch ?? api.lookDefaults?.sketch ?? null,
        head: {
          end: spec.head !== 'none' && spec.head !== 'start' && spec.head !== false,
          start: spec.head === 'start' || spec.head === 'both',
          style: spec.headStyle ?? 'filled',
          pt: spec.headSize ?? 5
        }
      })
      records.rays.push({ id, origin, direction })
      anchor(`${id}.start`, start)
      anchor(`${id}.end`, end)
      anchor(id, lerp3(start, end, 0.5))
      if (through) {
        anchor(`${id}.through`, through)
      }
      const span = [through ?? start, end]
      const count = Array.isArray(spec.samples) ? 0 : (spec.samples ?? 0)
      const shares = Array.isArray(spec.samples)
        ? spec.samples
        : Array.from({ length: count }, (_, index) =>
            count === 1 ? 0.5 : 0.12 + (0.76 * index) / (count - 1)
          )
      const sample = spec.sample ?? {}
      shares.forEach((share, index) => {
        const at = lerp3(span[0], span[1], share)
        const style = Array.isArray(sample) ? (sample[index] ?? {}) : sample
        api.point({
          id: `${id}.s${index + 1}`,
          at,
          r: style.r ?? 1.7,
          role: style.role ?? 'ink',
          tone: style.tone,
          open: style.open ?? false
        })
      })
      return { id, origin, direction, start, end, through }
    },
    /** A dot at a world point: `r` in printed pt, `open` a ring, colour by role. */
    point(spec = {}) {
      const id = spec.id ?? nextId('point')
      const role = sceneRole(spec.role, 'ink')
      units.push({
        type: 'dot',
        owner: id,
        at: spec.at ?? [0, 0, 0],
        r: spec.r ?? 1.8,
        role,
        tone: spec.tone ?? (role === 'ink' ? 11 : 7),
        open: Boolean(spec.open),
        ring: spec.ring ? strokeOf(spec.ring, { role: 'ink', tone: 11, pt: 0.5 }) : null
      })
      anchor(id, spec.at ?? [0, 0, 0])
      return { id, at: spec.at }
    },
    /**
     * A floor at height `z`: a plane under the scene with a grid every `step` (or `grid` n),
     * its lines fading with distance; always drawn first.
     */
    floor(spec = {}) {
      const id = spec.id ?? 'floor'
      const size = asPair(spec.size, [6, 6])
      const [cx, cy] = spec.at ?? [0, 0]
      const grid = spec.grid ?? Math.max(2, Math.round(size[0] / (spec.step ?? 0.5)))
      records.floors += 1
      return api.plane({
        id,
        at: [cx, cy, spec.z ?? 0],
        axes: 'xy',
        size,
        role: spec.role ?? 'neutral',
        tone: spec.tone ?? 0,
        grid: { n: grid, role: spec.lineRole ?? 'neutral', tone: spec.lineTone ?? 4, pt: 0.4 },
        edge: spec.edge ?? false,
        layer: -1,
        receive: spec.shadows !== false,
        shadowOpacity: spec.shadowOpacity
      })
    },
    /** A curved path through 3D `points` (smoothed unless `smooth: false`), with an arrowhead. */
    path(spec = {}) {
      const id = spec.id ?? nextId('path')
      const points = spec.points ?? []
      if (points.length < 2) {
        throw new Error(`path ${id} needs two or more points`)
      }
      const pts = spec.smooth === false ? points : catmullRom(points, spec.steps ?? 12)
      const role = sceneRole(spec.role, 'ink')
      units.push({
        type: 'line',
        owner: id,
        pts,
        role,
        tone: spec.tone ?? (role === 'ink' ? 11 : 7),
        pt: spec.pt ?? 0.8,
        dash: dashOf(spec.dash),
        sketch: spec.sketch ?? api.lookDefaults?.sketch ?? null,
        head: spec.head
          ? {
              end: spec.head !== 'start',
              start: spec.head === 'start' || spec.head === 'both',
              style: spec.headStyle ?? 'filled',
              pt: spec.headSize ?? 5
            }
          : null
      })
      anchor(id, pts[Math.floor(pts.length / 2)])
      anchor(`${id}.start`, pts[0])
      anchor(`${id}.end`, pts.at(-1))
      return { id, points: pts }
    },
    /** A straight line between world points (a projection line, an axis). */
    line(spec = {}) {
      const id = spec.id ?? nextId('line')
      return api.path({ ...spec, id, smooth: false })
    }
  }
  Object.assign(api, objectMethods(api), solidMethods(api), planeMethods(api), meshMethods(api))
  return api
}
