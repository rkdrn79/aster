// The camera of a perspective scene: a true pinhole (eye, look-at, field of view) whose parallel
// lines meet at vanishing points, beside the parallel views a figure may want instead (ortho,
// iso, front, top and the cabinet oblique of stacked feature maps). One camera per scene; every
// primitive projects through it. World axes: x right, y away from the viewer, z up. Pure numbers.
// A pinhole is upright by default (two-point perspective, as designers draw): it looks level and
// shifts its lens to frame the scene, so world verticals stay exact screen verticals.

const DEG = Math.PI / 180

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
export const length = (a) => Math.hypot(a[0], a[1], a[2])
export const unit = (a) => {
  const n = length(a)
  return n > 1e-12 ? mul(a, 1 / n) : [0, 0, 0]
}
export const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t))

/** The views a scene can take; `perspective` is the default. */
export const CAMERA_KINDS = ['perspective', 'ortho', 'iso', 'oblique', 'front', 'top']
/** Default field of view (degrees, vertical): a lens a designer would pick, not a fisheye. */
export const DEFAULT_FOV = 38
/** The default orbit: the three-quarter view (35° round from the front, a little above). */
export const DEFAULT_ORBIT = { azimuth: -55, elevation: 18 }
/** Past this elevation (degrees) an upright lens would stretch the scene; the camera tilts. */
const UPRIGHT_LIMIT = 60
/** Light from the upper left, a little toward the viewer, in camera axes (right, up, forward). */
export const LIGHT = unit([-0.55, 0.62, -0.56])

/** The eye of an orbit: `azimuth` around z from +x, `elevation` above the floor, `distance` out. */
export function orbitEye({ at = [0, 0, 0], azimuth, elevation, distance }) {
  const [ca, sa] = [Math.cos(azimuth * DEG), Math.sin(azimuth * DEG)]
  const [ce, se] = [Math.cos(elevation * DEG), Math.sin(elevation * DEG)]
  return add(at, mul([ce * ca, ce * sa, se], distance))
}

function finiteVector(name, value) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => Number.isFinite(entry))
  ) {
    throw new Error(`camera ${name} must be [x, y, z] numbers, not ${JSON.stringify(value)}`)
  }
  return value
}

/** Right, up and forward of a camera looking along `forward` with `up` as the sky. */
function basis(forward, up = [0, 0, 1]) {
  const f = unit(forward)
  let r = cross(f, up)
  if (length(r) < 1e-6) {
    // Why: looking straight down, the sky gives no right; take +x as the right instead.
    r = cross(f, [0, 1, 0])
  }
  r = unit(r)
  return { r, u: unit(cross(r, f)), f }
}

/**
 * Normalises a camera spec (a kind name or `{ kind, eye, at, up, fov, azimuth, elevation,
 * distance, angle, depth }`) against the scene's bounding sphere `{ center, radius }`: a missing
 * look-at is the centre, a missing distance frames the sphere in the field of view.
 */
export function resolveCamera(spec = {}, sphere = { center: [0, 0, 0], radius: 1 }) {
  const given = typeof spec === 'string' ? { kind: spec } : { ...spec }
  const kind = given.kind ?? 'perspective'
  if (!CAMERA_KINDS.includes(kind)) {
    throw new Error(`camera kind "${kind}" is not one of ${CAMERA_KINDS.join(', ')}`)
  }
  const at = finiteVector('at', given.at ?? sphere.center)
  const fov = Number(given.fov ?? DEFAULT_FOV)
  if (!(fov > 5 && fov < 120)) {
    throw new Error(`camera fov is degrees between 5 and 120, not ${given.fov}`)
  }
  const fixed = {
    iso: { azimuth: -45, elevation: 35.264 },
    front: { azimuth: -90, elevation: 0 },
    top: { azimuth: -90, elevation: 89.9 }
  }[kind]
  const azimuth = Number(fixed?.azimuth ?? given.azimuth ?? DEFAULT_ORBIT.azimuth)
  const elevation = Number(fixed?.elevation ?? given.elevation ?? DEFAULT_ORBIT.elevation)
  const radius = Math.max(sphere.radius, 1e-6)
  // Why 1.18: the sphere fills the view with a margin, so the nearest corner is not distorted.
  const distance = Number(given.distance ?? (radius / Math.sin((fov * DEG) / 2)) * 1.18)
  const eye = given.eye
    ? finiteVector('eye', given.eye)
    : orbitEye({ at, azimuth, elevation, distance })
  if (length(sub(at, eye)) < 1e-9) {
    throw new Error('camera eye and at are the same point')
  }
  // Why: a camera given by its eye records the orbit it sits on, so shared cameras compare.
  const offset = sub(eye, at)
  const orbit = given.eye
    ? {
        azimuth: (Math.atan2(offset[1], offset[0]) * 180) / Math.PI,
        elevation: (Math.asin(offset[2] / length(offset)) * 180) / Math.PI
      }
    : { azimuth, elevation }
  return {
    kind,
    eye,
    at,
    up: finiteVector('up', given.up ?? [0, 0, 1]),
    fov,
    azimuth: fixed ? azimuth : orbit.azimuth,
    elevation: fixed ? elevation : orbit.elevation,
    angle: Number(given.angle ?? 30),
    depth: Number(given.depth ?? 0.5),
    near: Number(given.near ?? radius * 0.02),
    // Why upright by default: a pinhole tilted down made every vertical edge lean toward a third
    // vanishing point, and image planes and boxes read crooked (the 3D figures of round 15).
    upright: kind === 'perspective' && given.upright !== false
  }
}

/**
 * The axes of an upright (shift-lens) camera: it looks level along the eye's heading, its up is
 * the world's, and `shift` moves the image so the look-at point stays in the middle.
 */
function uprightAxes(c, focal) {
  const ahead = sub(c.at, c.eye)
  const f = unit([ahead[0], ahead[1], 0])
  const r = unit(cross(f, [0, 0, 1]))
  const u = [0, 0, 1]
  const depth = dot(ahead, f)
  return { r, u, f, shift: depth > 1e-9 ? (focal * dot(ahead, u)) / depth : 0 }
}

/**
 * A camera that projects world points: `project(p)` gives [sx, sy, depth] (screen x right, y
 * down, depth away from the viewer; null behind a pinhole), `facing(normal, p)` whether a
 * surface turns toward the viewer, `eyeSide(normal, p0)` the side of a plane the viewer is on,
 * `vanishing(direction)` where parallel lines along it meet (null in a parallel view), and
 * `shade(normal)` how much of the upper-left light a surface catches (0–1).
 */
export function makeCamera(spec, sphere) {
  const c = resolveCamera(spec, sphere)
  const parallel = c.kind !== 'perspective'
  let axes
  if (c.kind === 'oblique') {
    const k = c.depth
    const [ca, sa] = [Math.cos(c.angle * DEG), Math.sin(c.angle * DEG)]
    // Why this direction: every point along it lands on the same spot in a cabinet view.
    axes = { r: [1, 0, 0], u: [0, 0, 1], f: unit([-k * ca, 1, -k * sa]), k, ca, sa }
  }
  const focal = 1 / Math.tan((c.fov * DEG) / 2)
  // Why the limit: looking nearly straight down, a level lens would need an endless shift.
  const level = c.upright && Math.abs(c.elevation) <= UPRIGHT_LIMIT && !parallel
  if (level) {
    axes = uprightAxes(c, focal)
  } else if (c.kind !== 'oblique') {
    axes = basis(sub(c.at, c.eye), c.up)
  }
  const shift = level ? axes.shift : 0
  const project = (p) => {
    if (c.kind === 'oblique') {
      const d = sub(p, c.at)
      return [d[0] + axes.k * axes.ca * d[1], -(d[2] + axes.k * axes.sa * d[1]), dot(d, axes.f)]
    }
    const d = sub(p, parallel ? c.at : c.eye)
    const x = dot(d, axes.r)
    const y = dot(d, axes.u)
    const z = dot(d, axes.f)
    if (parallel) {
      return [x, -y, z]
    }
    if (z < c.near) {
      return null
    }
    return [(focal * x) / z, (-focal * y) / z + shift, z]
  }
  const toViewer = (p) => (parallel ? mul(axes.f, -1) : sub(c.eye, p))
  const toCamera = (v) => [dot(v, axes.r), dot(v, axes.u), dot(v, axes.f)]
  return {
    kind: c.kind,
    parallel,
    upright: level || c.kind !== 'perspective',
    settings: c,
    axes,
    focal,
    project,
    /** Projects a point that must be in front of the camera; throws for one behind it. */
    projectOrThrow(p) {
      const point = project(p)
      if (!point) {
        throw new Error(`point ${JSON.stringify(p)} is behind the camera; move the camera back`)
      }
      return point
    },
    facing: (normal, p) => dot(normal, toViewer(p)) > 0,
    eyeSide: (normal, p0) => Math.sign(dot(normal, toViewer(p0))) || 1,
    vanishing(direction) {
      if (parallel) {
        return null
      }
      const [x, y, z] = toCamera(unit(direction))
      // Why null for verticals too: an upright lens keeps them parallel, as a designer draws.
      return Math.abs(z) < 1e-9 ? null : [(focal * x) / z, (-focal * y) / z + shift]
    },
    /** Lambert light (0–1) on a surface, its normal flipped toward the viewer. */
    shade(normal, p) {
      const n = dot(normal, toViewer(p)) >= 0 ? normal : mul(normal, -1)
      return Math.max(0, dot(toCamera(unit(n)), LIGHT))
    },
    /** What the lint and a shared camera compare: kind, lens and orbit, rounded. */
    record() {
      const round = (value) => Math.round(value * 10) / 10
      return {
        kind: c.kind,
        fov: parallel ? null : round(c.fov),
        azimuth: round(c.azimuth),
        elevation: round(c.elevation),
        eye: c.eye.map(round),
        at: c.at.map(round),
        upright: level || parallel,
        ...(c.kind === 'oblique' ? { angle: c.angle, depth: c.depth } : {})
      }
    },
    /** The spec that rebuilds this camera exactly (for a scene that shares it). */
    spec: () => ({
      kind: c.kind,
      eye: c.eye,
      at: c.at,
      up: c.up,
      fov: c.fov,
      angle: c.angle,
      depth: c.depth,
      near: c.near,
      upright: c.upright
    })
  }
}

/** The smallest sphere-ish bound of points: their box centre and the farthest point from it. */
export function boundingSphere(points) {
  if (!points.length) {
    return { center: [0, 0, 0], radius: 1 }
  }
  const lo = [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis])))
  const hi = [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis])))
  const center = mul(add(lo, hi), 0.5)
  const radius = Math.max(...points.map((p) => length(sub(p, center))), 1e-6)
  return { center, radius }
}
