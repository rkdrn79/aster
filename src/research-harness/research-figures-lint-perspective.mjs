// Lint for perspective scenes (fig.perspective): a perspective that reads flat (too few depth
// cues), photos on planes too small to see at print, panels drawn through different cameras, and
// rays that run parallel where a pinhole camera makes them meet.
import { FIGURE_UNITS_PER_INCH } from './research-figures-model.mjs'

/** Depth cues a perspective scene needs at least, out of convergence, occlusion, shading, … */
export const MIN_DEPTH_CUES = 2
/** A photo on a plane must print at least this big (inches, its larger side) to be seen. */
export const MIN_PHOTO_IN = 0.6
/** Scenes smaller than this (inches) are glyphs (a legend's camera), not panels to match. */
const PANEL_IN = 0.5
/** Cameras differing by more than this (degrees) are different cameras. */
const CAMERA_TOLERANCE = 2
/** Native lines within this angle (degrees) of each other count as parallel. */
const PARALLEL_DEGREES = 2.5
/** A plane's side edge may print this far (degrees) off the vertical before it reads crooked. */
export const MAX_TILT = 2
/** A scene should cover at least this share of its box (its larger side). */
export const MIN_FILL = 0.5

const round = (value) => Math.round(value * 100) / 100

const scenesOf = (elements) =>
  elements.filter(
    (element) =>
      element.type === 'image' && !element.isDeleted && element.customData?.asterPerspective
  )

/** Whether two recorded cameras differ: kind, lens or orbit. */
export function camerasDiffer(a, b) {
  if (!a || !b || a.kind !== b.kind) {
    return true
  }
  const near = (x, y) => x === y || Math.abs((x ?? 0) - (y ?? 0)) <= CAMERA_TOLERANCE
  return !(
    near(a.fov, b.fov) &&
    near(a.azimuth, b.azimuth) &&
    near(a.elevation, b.elevation) &&
    // Why: an upright lens and a tilted one draw the same orbit differently (verticals lean).
    (a.upright ?? true) === (b.upright ?? true) &&
    (a.kind !== 'oblique' || (near(a.angle, b.angle) && Math.abs(a.depth - b.depth) < 0.05))
  )
}

/** Straight native strokes (lines, arrows) with their angle, for the parallel-rays check. */
function straightStrokes(elements) {
  const out = []
  for (const element of elements) {
    if (
      (element.type !== 'line' && element.type !== 'arrow') ||
      element.isDeleted ||
      element.points?.length !== 2
    ) {
      continue
    }
    const [[x0, y0], [x1, y1]] = element.points
    const length = Math.hypot(x1 - x0, y1 - y0)
    if (length < FIGURE_UNITS_PER_INCH * 0.25) {
      continue
    }
    const raw = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
    const angle = ((raw % 180) + 180) % 180
    const radians = (angle * Math.PI) / 180
    out.push({
      element,
      angle,
      box: {
        x: element.x + Math.min(x0, x1),
        y: element.y + Math.min(y0, y1),
        right: element.x + Math.max(x0, x1),
        bottom: element.y + Math.max(y0, y1)
      },
      // Why: two parallel lines are distinct when their distances from the origin differ.
      offset: (element.x + x0) * Math.sin(radians) - (element.y + y0) * Math.cos(radians)
    })
  }
  return out
}

const overlaps = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom

/**
 * Crooked 3D: a plane's or a box's vertical edge printing more than MAX_TILT off the vertical,
 * through a tilted lens (tilted-verticals) or because the plane itself leans or rolls
 * (rolled-plane). The kit measures both when it draws the scene (record.verticals).
 */
function straightChecks(element, record, add) {
  const { camera, plane } = record.verticals ?? {}
  if (camera && camera.degrees > MAX_TILT) {
    add(
      'warning',
      'perspective-tilted-verticals',
      element,
      `prints the vertical edges of ${camera.owner} ${camera.degrees}° off the vertical: the camera looks down through a tilted lens, so the scene reads crooked; keep the default upright camera (drop upright: false) or pick view: 'three-quarter' | 'side' | 'front' | 'top-oblique'`
    )
  }
  if (plane && plane.degrees > MAX_TILT) {
    add(
      'warning',
      'perspective-rolled-plane',
      element,
      `draws ${plane.owner} leaning or rolled ${plane.degrees}° off upright; image planes, photos and feature maps stand upright: face it toward a point at its own height (facing stands it up by default), drop upright: false or up, or use axes 'xz' | 'yz'`
    )
  }
}

/**
 * A scene covering less than MIN_FILL of its box on both sides prints small among wide margins
 * (small-scene). Scenes sharing a scale (like, fig.perspectives) count as one: the best filled
 * of them decides, since the others are small on purpose.
 */
function fillChecks(scenes, add) {
  const fillOf = (record) =>
    record.fill ? Math.max(record.fill.w ?? 0, record.fill.h ?? 0) : Infinity
  const groupOf = (record) => record.like ?? record.id
  const best = new Map()
  for (const element of scenes) {
    const record = element.customData.asterPerspective
    best.set(groupOf(record), Math.max(best.get(groupOf(record)) ?? 0, fillOf(record)))
  }
  for (const element of scenes) {
    const record = element.customData.asterPerspective
    const group = best.get(record.id) ?? best.get(groupOf(record))
    if (fillOf(record) < MIN_FILL && group < MIN_FILL) {
      add(
        'warning',
        'perspective-small-scene',
        element,
        `covers only ${Math.round(fillOf(record) * 100)}% of its ${record.box?.w ?? '?'} × ${record.box?.h ?? '?'} box: the 3D scene prints small among wide margins; size the box to the scene (about 70–85% filled), give fewer parts, or turn the view so its long side lies across`
      )
    }
  }
}

/**
 * Adds the perspective findings for `elements` (the scene's live elements); `scale` is the
 * page's print scale (printed size over drawn size).
 */
export function perspectiveChecks(elements, add, scale = 1) {
  const scenes = scenesOf(elements)
  if (!scenes.length) {
    return
  }
  const inches = (units) => (units * scale) / FIGURE_UNITS_PER_INCH
  for (const element of scenes) {
    const record = element.customData.asterPerspective
    const cues = record.cues ?? []
    if (record.camera?.kind === 'perspective' && cues.length < MIN_DEPTH_CUES) {
      add(
        'warning',
        'perspective-flat',
        element,
        `is a perspective scene with ${cues.length ? `one depth cue (${cues[0]})` : 'no depth cue'}; it reads flat: add a floor (b.floor) under a solid so it casts a shadow (b.light), a box around the scene (b.box({ wire: 'dotted' })), a solid that shades, or let planes overlap, or draw it oblique or flat`
      )
    }
    // Why the ratio: the person may have resized the scene in Aster since the kit drew it.
    const resized = record.width ? element.width / record.width : 1
    for (const photo of record.photos ?? []) {
      const side = inches(Math.max(photo.width, photo.height) * resized)
      if (side < MIN_PHOTO_IN) {
        add(
          'warning',
          'perspective-small-photo',
          element,
          `shows the photo on ${photo.id} ${round(side)} in across at print, under ${MIN_PHOTO_IN} in: it cannot be read; bring the camera closer, enlarge the plane, or show the photo flat beside the scene`
        )
      }
    }
    straightChecks(element, record, add)
    for (const [first, second] of record.parallelRays ?? []) {
      add(
        'warning',
        'perspective-parallel-rays',
        element,
        `draws rays ${first} and ${second} parallel from different origins in a perspective scene; camera rays leave one centre of projection: give them the same from (the camera) and a through pixel each`
      )
    }
  }
  const panels = scenes.filter(
    (element) => inches(Math.max(element.width, element.height)) >= PANEL_IN
  )
  // Why by the box: a scene drawn tiny in a panel-sized box is what the fill check is for.
  fillChecks(
    scenes.filter((element) => {
      const box = element.customData.asterPerspective.box ?? {}
      return inches(Math.max(box.w ?? 0, box.h ?? 0)) >= PANEL_IN
    }),
    add
  )
  const [anchor, ...rest] = panels
  for (const element of rest) {
    const record = element.customData.asterPerspective
    if (camerasDiffer(anchor.customData.asterPerspective.camera, record.camera)) {
      add(
        'warning',
        'perspective-cameras',
        element,
        `is seen through another camera than ${anchor.id} (${record.camera?.kind}, azimuth ${record.camera?.azimuth}, elevation ${record.camera?.elevation}); panels of one figure share one camera: pass like: '${anchor.id}' (camera and scale) or camera: '${anchor.id}'`
      )
    }
  }
  const lines = straightStrokes(elements)
  for (const element of scenes.filter(
    (scene) => scene.customData.asterPerspective.camera?.kind === 'perspective'
  )) {
    const box = {
      x: element.x,
      y: element.y,
      right: element.x + element.width,
      bottom: element.y + element.height
    }
    const over = lines.filter((line) => overlaps(line.box, box))
    for (let i = 0; i < over.length; i += 1) {
      const twin = over
        .slice(i + 1)
        .find(
          (other) =>
            Math.abs(other.angle - over[i].angle) < PARALLEL_DEGREES &&
            Math.abs(other.offset - over[i].offset) > 6
        )
      if (twin) {
        add(
          'warning',
          'perspective-parallel-rays',
          over[i].element,
          `and ${twin.element.id} run parallel across the perspective scene ${element.id}; rays through a pinhole meet at the camera: draw them in the scene with b.ray({ from, through })`
        )
        break
      }
    }
  }
}
