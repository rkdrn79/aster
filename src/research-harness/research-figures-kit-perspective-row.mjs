// fig.perspectives as a row of stages: scenes given without boxes share the row's box (`x, y, w,
// h`), each as wide as its drawing at one common scale, the spare width spread between them; and
// `arrows` join one stage to the next (a cone → 𝒩 → its Gaussians, a field → render → image)
// natively, at the height both scenes share, so a two-stage story reads as two stages.
import { warnKit } from './research-figures-cards.mjs'
import {
  boundingSphere,
  DEFAULT_ORBIT,
  makeCamera
} from './research-figures-perspective-camera.mjs'
import { worldPoints } from './research-figures-perspective-render.mjs'

const r2 = (value) => Math.round(value * 100) / 100

/** The gap after scene `index`: wide enough for an arrow and its label when one joins them. */
function gapAfter(spec, scenes, index) {
  const [here, next] = [scenes[index]?.id, scenes[index + 1]?.id]
  const joined = (spec.arrows ?? []).some(
    (arrow) =>
      (arrow.from === here && arrow.to === next) || (arrow.from === next && arrow.to === here)
  )
  return joined ? (spec.arrowGap ?? 48) : (spec.gap ?? 12)
}

/** The gaps between the scenes of a row, summed. */
export function rowGaps(spec, scenes) {
  return scenes.slice(0, -1).reduce((sum, _, index) => sum + gapAfter(spec, scenes, index), 0)
}

/**
 * Boxes for scenes in a row: `contents` [{ width, height, pad }] are the drawn extents (screen
 * units at scale 1) and margins (figure units). Returns { boxes: [{ x, y, w, h }], scale }.
 */
export function rowBoxes(spec, scenes, contents) {
  if (!(spec.w > 0) || !(spec.h > 0)) {
    throw new Error(
      'perspectives({ x, y, w, h, scenes }) lays scenes without boxes out in a row: give the row its w and h (or give every scene x, y, w, h)'
    )
  }
  const [x0, y0] = [spec.x ?? 0, spec.y ?? 0]
  const gaps = scenes.slice(0, -1).map((_, index) => gapAfter(spec, scenes, index))
  const pads = contents.reduce((sum, content) => sum + 2 * content.pad, 0)
  const widths = contents.reduce((sum, content) => sum + content.width, 0)
  const scale = Math.min(
    ...contents.map((content) => (spec.h - 2 * content.pad) / content.height),
    (spec.w - pads - gaps.reduce((sum, gap) => sum + gap, 0)) / widths
  )
  if (!(scale > 0)) {
    throw new Error(
      `perspectives: the row ${spec.w} × ${spec.h} is too small for ${scenes.length} scenes`
    )
  }
  const drawn = contents.map((content) => content.width * scale + 2 * content.pad)
  const spare =
    spec.w - drawn.reduce((sum, w) => sum + w, 0) - gaps.reduce((sum, gap) => sum + gap, 0)
  // Why the spare width goes between the scenes: the first starts at the row's left and the
  // last ends at its right, so the stages span the row (a scene alone is centred) instead of
  // each sitting inside a margin of its own.
  const between = scenes.length > 1 ? Math.max(0, spare) / (scenes.length - 1) : 0
  let x = x0 + (scenes.length > 1 ? 0 : Math.max(0, spare) / 2)
  const boxes = drawn.map((w, index) => {
    const box = { x: r2(x), y: y0, w: r2(w), h: spec.h }
    x += w + between + (gaps[index] ?? 0)
    return box
  })
  return { boxes, scale }
}

/**
 * Arrows between placed scenes: { from, to, label, role, y, id }. The arrow runs level from the
 * right of one scene to the left of the next, at the middle of the height they share (or `y`).
 */
export function stageArrows(fig, placed, arrows = []) {
  const byId = new Map(placed.map((scene) => [scene.id, scene]))
  return arrows.map((arrow, index) => {
    const [a, b] = [byId.get(arrow.from), byId.get(arrow.to)]
    if (!a || !b) {
      throw new Error(
        `perspectives arrow ${index}: from and to name scenes of this call (${[...byId.keys()].join(', ')})`
      )
    }
    const [left, right] = a.x <= b.x ? [a, b] : [b, a]
    const top = Math.max(left.y, right.y)
    const bottom = Math.min(left.bottom, right.bottom)
    const y = arrow.y ?? r2(bottom > top ? (top + bottom) / 2 : (left.y + left.bottom) / 2)
    const [x1, x2] = a.x <= b.x ? [a.right + 2, b.x - 2] : [a.x - 2, b.right + 2]
    if (Math.abs(x2 - x1) < 28) {
      warnKit([
        `perspectives arrow ${arrow.from} → ${arrow.to} has only ${r2(Math.abs(x2 - x1))} units between the scenes: give the row more width or arrowGap (48 by default)`
      ])
    }
    const id = arrow.id ?? `${arrow.from}-${arrow.to}`
    fig.arrow({
      id,
      from: [r2(x1), y],
      to: [r2(x2), y],
      ...(arrow.label ? { label: arrow.label, labelSide: arrow.labelSide ?? 'above' } : {}),
      ...(arrow.role ? { role: arrow.role } : {})
    })
    return id
  })
}

/**
 * How much of its box a scene's drawing covers: { w, h } shares of the box's width and height
 * (null without a box). The lint asks the larger of the two to reach one half.
 */
export function sceneFill(drawn, boxW, boxH) {
  if (!drawn || !(boxW > 0 || boxH > 0)) {
    return null
  }
  const share = (span, side) => (side > 0 ? Math.round((span / side) * 100) / 100 : null)
  return { w: share(drawn.x1 - drawn.x0, boxW), h: share(drawn.y1 - drawn.y0, boxH) }
}

/** A scene's drawn extent through a camera (screen units), from its world points alone. */
function extent(units, cam) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const point of worldPoints(units)) {
    const p = cam.project(point)
    if (p) {
      box.x0 = Math.min(box.x0, p[0])
      box.x1 = Math.max(box.x1, p[0])
      box.y0 = Math.min(box.y0, p[1])
      box.y1 = Math.max(box.y1, p[1])
    }
  }
  return { width: Math.max(box.x1 - box.x0, 1e-9), height: Math.max(box.y1 - box.y0, 1e-9) }
}

/**
 * A template's default camera turned a little round the scene (`turns`, azimuth steps in 5°) when that fills the
 * boxes clearly better: a long cone or a tri-plane in a wide, short panel printed at half the
 * size the panel allows, fitted by its height alone. Only for an orbit camera the agent did not
 * give; `boxes` [{ w, h }] per scene, or `row` { w, h, gaps } for a row of scenes.
 */
export function turnToFit(unitsList, given, { boxes, row }, turns = [5, -5]) {
  if (
    !given ||
    typeof given !== 'object' ||
    given.eye ||
    (given.kind ?? 'perspective') !== 'perspective'
  ) {
    return given
  }
  const points = unitsList.flatMap((units) => worldPoints(units))
  const sphere = boundingSphere(points)
  const PAD = 8
  // Why the area drawn, not the scale: a scene foreshortened toward the viewer scales up but
  // fills less of a wide box; what a reader sees is how much of the box the drawing covers.
  const scaleOf = (spec) => {
    const cam = makeCamera(spec, sphere)
    const sizes = unitsList.map((units) => extent(units, cam))
    const scale = row
      ? Math.min(
          ...sizes.map((size) => (row.h - 2 * PAD) / size.height),
          (row.w - row.gaps - sizes.length * 2 * PAD) /
            sizes.reduce((sum, size) => sum + size.width, 0)
        )
      : Math.min(
          ...sizes.map((size, index) =>
            Math.min(
              boxes[index].w ? (boxes[index].w - 2 * PAD) / size.width : Infinity,
              boxes[index].h ? (boxes[index].h - 2 * PAD) / size.height : Infinity
            )
          )
        )
    return sizes.reduce((sum, size) => sum + size.width * size.height, 0) * scale * scale
  }
  const azimuth = given.azimuth ?? DEFAULT_ORBIT.azimuth
  const elevation = given.elevation ?? DEFAULT_ORBIT.elevation
  const base = scaleOf(given)
  let best = { spec: given, scale: base }
  // Why azimuth only: a lower or higher eye tipped the cone up toward the viewer and
  // foreshortened it; turning round the scene keeps its tilt and lays its long axis across.
  // Why the template's own turns (one 5° step either way by default): a wider turn toward the
  // side laid Mip-NeRF's upright image plane nearly edge-on; toward the front it is safe.
  for (const da of turns) {
    const spec = { ...given, azimuth: azimuth + da, elevation }
    const scale = scaleOf(spec)
    if (scale > best.scale) {
      best = { spec, scale }
    }
  }
  // Why 15%: a turn changes how the figure looks; it is worth it only when the scene grows.
  return best.scale > base * 1.15 ? best.spec : given
}
