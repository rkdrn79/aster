// Pictures for the glyphs: stock photos, noise and outlined frames, split from
// research-figures-glyphs.mjs to keep files short. Token strips, patches and frames build on these.
import { figureElement } from './research-figures-model.mjs'
import { inkColor, paintValue, styleColor } from './research-figures-style.mjs'
import { styleOf } from './research-figures-type.mjs'
import { photoKind } from './research-figures-photos.mjs'
import { photoView } from './research-figures-glyphs-crop.mjs'

export function hashOf(value) {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(value)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0
  }
  return hash.toString(36)
}

export const common = (spec, extra = []) => ({
  frameId: spec.frame ?? null,
  groupIds: [...(spec.groupIds ?? []), ...extra]
})

/** A picture thumbnail (`kind`: cat, landscape, arm, noise, gradient) as an image element. */
export function makePicture(spec, random = Math.random) {
  const w = spec.w ?? 64
  const h = spec.h ?? 64
  const photo = photoKind(spec.kind ?? 'landscape')
  if (photo) {
    return photoPicture(spec, photo, w, h, random)
  }
  const kind = spec.kind ?? 'landscape'
  const noisy = kind === 'noise' || (spec.noise ?? 0) > 0
  // Why 2 px a unit for noise: drawn at or below its pixels, noise never beats into a grid
  // (a 160 px tile stretched over a large image did); 512 px keeps big ones small.
  const density = noisy ? Math.min(2, 512 / Math.max(w, h)) : 1.5
  const pixels = (side) =>
    noisy
      ? Math.max(16, Math.round(side * density))
      : Math.min(160, Math.max(16, Math.round(side * 1.5)))
  const picture = {
    kind,
    seed: spec.seed ?? 1,
    t: spec.t ?? 0,
    noise: spec.noise ?? 0,
    ...(noisy
      ? {
          // Why half a unit: grain about a quarter point, like a 64 px noise image in a paper.
          grain: Math.round(0.5 * density * 100) / 100,
          intensity: Math.min(1, Math.max(0, spec.intensity ?? 1))
        }
      : {}),
    // Why a tint: noise drawn in the accent reads as the prediction's noise, gray as the input's.
    // Why the fill: a role's ink is near black for neutrals ('block'); its fill is the colour.
    tint: spec.tint
      ? (paintValue(styleOf(spec), spec.tint, 'fill') ?? styleColor(styleOf(spec), spec.tint).fill)
      : null,
    view: spec.view ?? null,
    // Why 1.5 px a unit for a smooth picture: sharp in the PDF, small in the scene.
    width: pixels(w),
    height: pixels(h)
  }
  const fileId = `aster-pic-${hashOf(picture)}`
  const element = figureElement(
    'image',
    {
      id: spec.id,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      width: w,
      height: h,
      fileId,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      strokeColor: 'transparent',
      boundElements: [],
      customData: { asterPhoto: true },
      ...common(spec)
    },
    random
  )
  return { elements: [element], pictures: [{ fileId, picture }] }
}

/**
 * A vendored photo: the kit embeds it and turns `asterView` (the part shown, 0–1, panned by `t`
 * for frames) into a crop of the element's shape. `noise` lays noise over it at that opacity, gray
 * or in `tint`.
 */
function photoPicture(spec, kind, w, h, random) {
  const view = photoView(spec)
  const element = figureElement(
    'image',
    {
      id: spec.id,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      width: w,
      height: h,
      fileId: `aster-photo-${kind}`,
      status: 'saved',
      scale: [1, 1],
      crop: null,
      strokeColor: 'transparent',
      boundElements: [],
      customData: {
        asterPhoto: true,
        asterPhotoKind: kind,
        asterView: view,
        // Why: a patches() cell is cut from what that grid shows; the kit needs the photo's size.
        ...(spec.patchOf ? { asterPatch: spec.patchOf } : {})
      },
      ...common(spec)
    },
    random
  )
  const noise = Math.min(1, Math.max(0, spec.noise ?? 0))
  if (!noise) {
    return { elements: [element], pictures: [] }
  }
  const grain = makePicture(
    {
      id: `${spec.id}-noise`,
      kind: 'noise',
      seed: spec.seed,
      intensity: spec.intensity,
      // Why: an accent noise over a photo is the prediction's noise, gray the input's.
      tint: spec.tint,
      style: spec.style,
      x: element.x,
      y: element.y,
      w,
      h,
      frame: spec.frame,
      groupIds: spec.groupIds
    },
    random
  )
  grain.elements[0].opacity = Math.round(noise * 100)
  return { elements: [element, ...grain.elements], pictures: grain.pictures }
}

/**
 * How a prediction tints a photo: the colour's solid at a third, a clear cast that keeps the
 * photo fully visible (a pale tint at half strength washed it out); a hex or a colour without
 * a solid at a little under half.
 */
export function castPaint(style, tint = 'accent') {
  const fill = styleColor(style, tint).fill
  if (tint.startsWith('#')) {
    return { color: fill, opacity: 40 }
  }
  let solid = null
  try {
    solid = styleColor(style, `${tint}-solid`).fill
  } catch {
    solid = null
  }
  return solid && solid !== fill ? { color: solid, opacity: 32 } : { color: fill, opacity: 45 }
}

export function outlineBox(spec, x, y, width, height, random, customData = undefined) {
  return figureElement(
    'rectangle',
    {
      id: spec.id,
      x,
      y,
      width,
      height,
      strokeColor: spec.outline ? inkColor(styleOf(spec), spec.outline) : 'transparent',
      backgroundColor: 'transparent',
      strokeWidth: 2,
      boundElements: [],
      ...(customData ? { customData } : {}),
      ...common(spec, [`${spec.id}-glyph`])
    },
    random
  )
}
