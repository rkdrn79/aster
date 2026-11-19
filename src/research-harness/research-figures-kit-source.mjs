// Project pictures in a drawing (image({ src }), patches({ src })): shown through a `view` (0–1)
// or a pixel `crop`, fitted to the slot: 'cover' trims to its shape, 'contain' shrinks the slot to
// the picture's shape. A sprite cell or a pixel-art item is an icon, not a photo to enlarge.
import { cropRegion, patchCellView, patchOf } from './research-figures-glyphs-crop.mjs'
import { oneOf } from './research-figures-options.mjs'

const FULL = { x: 0, y: 0, w: 1, h: 1 }
export const SOURCE_FITS = ['cover', 'contain']
/** A crop this small in source pixels is an icon (a sprite cell, a pixel-art item). */
const ICON_PIXELS = 64
/** Cover trims more than this share of the view: say so, contain would keep it. */
const TRIM_WARNING = 0.34

const within = (value) => Number.isFinite(value) && value >= -1e-6 && value <= 1 + 1e-6

/** The part of a source picture shown, as 0–1 of it: `crop` in its pixels, else `view`. */
export function sourceView(spec, size) {
  if (spec.crop) {
    const { x = 0, y = 0 } = spec.crop
    const width = spec.crop.width ?? spec.crop.w
    const height = spec.crop.height ?? spec.crop.h
    const fits =
      [x, y, width, height].every(Number.isFinite) &&
      width > 0 &&
      height > 0 &&
      x >= 0 &&
      y >= 0 &&
      x + width <= size.width + 0.5 &&
      y + height <= size.height + 0.5
    if (!fits) {
      throw new Error(
        `image ${spec.id}: crop ${JSON.stringify(spec.crop)} is { x, y, width, height } in pixels inside the ${size.width} × ${size.height} picture`
      )
    }
    return { x: x / size.width, y: y / size.height, w: width / size.width, h: height / size.height }
  }
  const view = spec.view ?? FULL
  const ok =
    [view.x, view.y, view.w, view.h].every(within) &&
    view.w > 0 &&
    view.h > 0 &&
    view.x + view.w <= 1 + 1e-6 &&
    view.y + view.h <= 1 + 1e-6
  if (!ok) {
    throw new Error(
      `image ${spec.id}: view ${JSON.stringify(view)} is { x, y, w, h } as 0–1 of the picture (crop: { x, y, width, height } takes pixels)`
    )
  }
  return view
}

/**
 * Where a source picture goes and what it shows. 'cover' (the default) fills w × h and trims the
 * view around its centre to that shape; 'contain' shows the whole view in the largest slot of its
 * shape inside w × h, centred. Given only w or h, the other follows the view's shape.
 */
export function placeSource(spec, size) {
  const fit = oneOf('fit', spec.fit, SOURCE_FITS) ?? 'cover'
  const view = sourceView(spec, size)
  const aspect = (view.w * size.width) / (view.h * size.height)
  let x = spec.x ?? 0
  let y = spec.y ?? 0
  let w = spec.w ?? (spec.h !== undefined ? spec.h * aspect : 64)
  let h = spec.h ?? w / aspect
  if (fit === 'contain' && spec.w !== undefined && spec.h !== undefined) {
    if (w / h > aspect) {
      const narrower = h * aspect
      x += (w - narrower) / 2
      w = narrower
    } else {
      const shorter = w / aspect
      y += (h - shorter) / 2
      h = shorter
    }
  }
  const crop = cropRegion(view, size, w / h)
  const shown = (crop.width * crop.height) / (view.w * size.width * view.h * size.height)
  const icon =
    spec.icon === true ||
    (spec.icon !== false && crop.width <= ICON_PIXELS && crop.height <= ICON_PIXELS)
  return { x, y, w, h, view, crop, trimmed: 1 - shown, icon, fit }
}

/** The kit warning when cover cuts off much of the picture the person gave. */
export function trimWarning(spec, place) {
  if (spec.fit !== undefined || place.trimmed <= TRIM_WARNING) {
    return []
  }
  return [
    `image ${spec.id}: cover trims ${Math.round(place.trimmed * 100)}% of ${spec.src} to fit ${Math.round(place.w)} × ${Math.round(place.h)}; give fit: 'contain' to show all of it, or view / crop to choose the part`
  ]
}

/** Turns a placed image element into a crop of a source picture. */
export function showSource(element, source, place, src) {
  element.fileId = source.fileId
  element.crop = {
    ...place.crop,
    naturalWidth: source.size.width,
    naturalHeight: source.size.height
  }
  const { asterPhotoKind: _kind, asterPatch: _patch, ...rest } = element.customData ?? {}
  element.customData = {
    ...rest,
    asterPhoto: true,
    asterSource: src,
    asterView: place.view,
    ...(place.icon ? { asterIconPicture: true } : {})
  }
  return element
}

/** image({ patch, of }) when the patches were cut from a source picture: that cell's view. */
export function sourcePatchSpec(input, size) {
  const of = { ...input.of, view: sourceView(input.of, size), crop: undefined }
  const view = patchCellView(patchOf(of, input.patch), size)
  return { ...input, src: input.of.src, view, crop: undefined, fit: 'cover' }
}
