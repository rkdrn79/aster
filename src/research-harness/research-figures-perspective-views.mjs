// Named views for perspective scenes, and tidying of free camera angles. A designer draws 3D at
// a few standard angles: level (no roll), a little above, three-quarter round, verticals kept
// vertical. Agents pick one of these views; free azimuths and elevations are snapped to tidy
// values (5° steps, elevation 0–40°), and odd requests (a roll, a steep or upward look, a camera
// that may lean) come back as notes the kit prints.

/** The named views: what each is for and the camera it makes. */
export const VIEW_PRESETS = {
  'three-quarter': {
    camera: { azimuth: -55, elevation: 18, fov: 34 },
    does: 'the default: 35° round from the front, a little above; a box shows its front, side and top, verticals stay vertical'
  },
  side: {
    camera: { azimuth: -40, elevation: 15, fov: 34 },
    does: 'the depth axis (+y) runs left to right across the panel: rays and cones receding into the scene, long and clear on a short, wide page (Mip-NeRF), an upright image plane seen at an angle'
  },
  front: {
    camera: { azimuth: -90, elevation: 12, fov: 32 },
    does: 'straight from the front, a little above (one-point perspective): front faces are true rectangles, depth recedes to the middle (a camera rig round an object)'
  },
  'top-oblique': {
    camera: { kind: 'oblique', angle: 40, depth: 0.55 },
    does: 'a cabinet oblique from above: front faces true shape, depth edges parallel at one angle, every copy of a part looks the same (stacked feature maps, tri-planes, a row of volume boxes)'
  }
}

export const VIEW_NAMES = Object.keys(VIEW_PRESETS)
/** Free angles snap to this step (degrees). */
export const ANGLE_STEP = 5
/** Tidy elevations (degrees): level to a moderate look down. */
export const ELEVATION_RANGE = [0, 40]

const snap = (value, step = ANGLE_STEP) => Math.round(value / step) * step
const DEG = 180 / Math.PI

/** The camera spec of a view name, or null when it is not one. */
export function viewCamera(name) {
  const preset = VIEW_PRESETS[name]
  return preset ? { ...preset.camera, view: name } : null
}

/** An eye given as a point, read back as its orbit round `at` (degrees, distance). */
function orbitOf(eye, at) {
  const d = [eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]]
  const distance = Math.hypot(...d)
  return {
    azimuth: Math.atan2(d[1], d[0]) * DEG,
    elevation: Math.asin(d[2] / distance) * DEG,
    distance
  }
}

/**
 * A camera an agent asked for, made tidy: a view name becomes its preset, `{ view, …overrides }`
 * the preset with the overrides, free azimuth and elevation snap to 5° steps and the elevation
 * stays within 0–40°, `up` (a roll) is dropped, an `eye` is read as an orbit and tidied the same
 * way (unless `free: true`, which keeps every angle as given). Returns { camera, notes }.
 */
export function tidyCamera(given, owner = 'perspective') {
  const notes = []
  if (given === undefined || given === null) {
    return { camera: given, notes }
  }
  if (typeof given === 'string') {
    return { camera: viewCamera(given) ?? given, notes }
  }
  if (typeof given !== 'object') {
    return { camera: given, notes }
  }
  const preset = given.view ? viewCamera(given.view) : null
  if (given.view && !preset) {
    throw new Error(
      `${owner}: view "${given.view}" is not one of ${VIEW_NAMES.join(', ')} (or give azimuth and elevation)`
    )
  }
  const { view: _view, free, ...rest } = given
  const camera = { ...preset, ...rest }
  if ((camera.kind ?? 'perspective') !== 'perspective' || free) {
    if (free && camera.upright === false) {
      notes.push(
        `${owner}: upright: false tilts the lens, so vertical edges lean toward a third vanishing point; keep it upright unless the scene is seen from far above`
      )
    }
    return { camera, notes }
  }
  if (camera.up && (camera.up[0] !== 0 || camera.up[1] !== 0)) {
    notes.push(
      `${owner}: the camera does not roll; up ${JSON.stringify(camera.up)} was dropped (world up is z)`
    )
    delete camera.up
  }
  if (camera.eye) {
    const orbit = orbitOf(camera.eye, camera.at ?? [0, 0, 0])
    if (camera.at) {
      Object.assign(camera, orbit)
      delete camera.eye
    } else {
      // Why kept: without `at` the eye looks at the scene's middle, which only the renderer knows.
      return { camera, notes }
    }
  }
  // Why only the asked angles: a named view's own angles are already the tidy ones.
  if (rest.azimuth !== undefined || rest.eye) {
    camera.azimuth = snap(Number(camera.azimuth))
  }
  if (rest.elevation !== undefined || rest.eye) {
    const asked = Number(camera.elevation)
    const [lo, hi] = ELEVATION_RANGE
    const tidy = Math.min(hi, Math.max(lo, snap(asked)))
    if (asked < lo - 0.5 || asked > hi + 0.5) {
      notes.push(
        `${owner}: elevation ${Math.round(asked)}° is ${asked < lo ? 'a look up from below' : 'steep'}; used ${tidy}° (tidy views sit 10–25° above: view 'three-quarter', 'side', 'front', or 'top-oblique' for things lying flat)`
      )
    }
    camera.elevation = tidy
  }
  if (camera.upright === false) {
    notes.push(
      `${owner}: upright: false tilts the lens, so vertical edges lean toward a third vanishing point; keep it upright unless the scene is seen from far above`
    )
  }
  return { camera, notes }
}

/** Within this angle of vertical (degrees) a plane's edge counts as one of its side edges. */
const SIDE_EDGE = 60

/**
 * How upright the scene's planes and boxes print: for every side edge of a plane, a patch or an
 * axis-aligned box (units tagged `rect`), its angle off the screen vertical and its lean off
 * the world vertical. `camera` is the worst edge that stands vertical in the world but prints
 * leaning (a tilted lens), `plane` the worst edge that leans in the world (a plane rolled or
 * tipped back); each { degrees, owner } or null when every edge prints within 0.5°.
 */
export function verticalTilt(units, cam) {
  const worst = { camera: null, plane: null }
  const edges = []
  for (const unit of units) {
    if (!unit.rect || !(unit.type === 'face' || unit.type === 'line')) {
      continue
    }
    const pts = unit.pts
    const count = unit.type === 'face' ? pts.length : pts.length - 1
    for (let k = 0; k < count; k += 1) {
      edges.push({ owner: unit.owner, a: pts[k], b: pts[(k + 1) % pts.length] })
    }
  }
  const projected = []
  for (const edge of edges) {
    const d = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1], edge.b[2] - edge.a[2]]
    const length = Math.hypot(...d)
    const lean = length > 1e-9 ? Math.acos(Math.min(1, Math.abs(d[2]) / length)) * DEG : 90
    if (lean > SIDE_EDGE) {
      continue
    }
    const [pa, pb] = [cam.project(edge.a), cam.project(edge.b)]
    if (pa && pb) {
      projected.push({ ...edge, lean, dx: pb[0] - pa[0], dy: pb[1] - pa[1] })
    }
  }
  const extent = Math.max(1e-9, ...projected.map((edge) => Math.hypot(edge.dx, edge.dy)))
  for (const edge of projected) {
    // Why a floor: an edge that points at the viewer (a top view) has no direction to judge.
    if (Math.hypot(edge.dx, edge.dy) < extent * 0.02) {
      continue
    }
    const tilt = Math.atan2(Math.abs(edge.dx), Math.abs(edge.dy)) * DEG
    const cause = edge.lean < 0.5 ? 'camera' : 'plane'
    const degrees = cause === 'camera' ? tilt : Math.max(tilt, edge.lean)
    if (degrees > 0.5 && (!worst[cause] || degrees > worst[cause].degrees)) {
      worst[cause] = { degrees: Math.round(degrees * 10) / 10, owner: edge.owner }
    }
  }
  return worst
}
