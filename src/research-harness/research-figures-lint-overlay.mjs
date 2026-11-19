// Labels over pictures: an arrow's label or a free text or formula printed on a photo, a noise
// image or an embedded plot does not read at print (round 14: "ε ~ N(0, I)" over the rendering).
// Text over a shape's edge is text-over-shape's; this one covers what that check skips, the
// pictures. A picture's own caption (drawn with it) and perspective scenes (their box is larger
// than what they draw, and their labels sit on anchors on purpose) are left alone, and so is a
// label on the clear (keyed) part of generated art.
import { elementBounds, overlaps } from './research-figures-geometry.mjs'
import { glyphBounds } from './research-figures-text.mjs'

const ownerOf = (element) => element.customData?.asterKit ?? element.id

/** Pictures a label must stay off: photos, generated images and embedded plots. */
const isPicture = (element) =>
  element.type === 'image' &&
  Boolean(element.customData?.asterPhoto || element.customData?.asterPlot) &&
  !element.customData?.asterIconPicture

/** Labels: free text and typeset math, their own or an arrow's (not a box's inner label). */
const isLabel = (element) =>
  (element.type === 'text' && !element.containerId) ||
  (element.type === 'image' && Boolean(element.customData?.asterTex))

/**
 * Generated art (fig.art) is keyed: a label over its clear part reads like one on the page.
 * True when the label's box meets cells of the art's mask where it is drawn.
 */
function onDrawnArt(box, picture) {
  const art = picture.customData?.asterArt
  if (!art?.mask) {
    return true
  }
  const size = art.maskSize
  const frame = elementBounds(picture)
  const cell = (v, start, span) => Math.floor(((v - start) / span) * size)
  const clamp = (v) => Math.min(size - 1, Math.max(0, v))
  const [c0, c1] = [box.x, box.x + box.width].map((v) => clamp(cell(v, frame.x, frame.width)))
  const [r0, r1] = [box.y, box.y + box.height].map((v) => clamp(cell(v, frame.y, frame.height)))
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      if (art.mask[r * size + c] === '1') {
        return true
      }
    }
  }
  return false
}

const area = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

export function labelImageChecks(elements, add) {
  const pictures = elements.filter(isPicture)
  if (!pictures.length) {
    return
  }
  const byId = new Map(elements.map((element) => [element.id, element]))
  const seen = new Set()
  for (const label of elements.filter(isLabel)) {
    const owner = ownerOf(label)
    if (seen.has(owner)) {
      continue
    }
    const box = label.type === 'text' ? glyphBounds(label) : elementBounds(label)
    const hit = pictures.find(
      (picture) =>
        ownerOf(picture) !== owner &&
        picture.id !== owner &&
        overlaps(box, elementBounds(picture), 1) &&
        area(box, elementBounds(picture)) >= 6 &&
        onDrawnArt(box, picture)
    )
    if (!hit) {
      continue
    }
    seen.add(owner)
    const arrow = byId.get(owner)?.type === 'arrow' ? owner : null
    add(
      'warning',
      'label-over-image',
      label,
      `${arrow ? `${arrow}'s label` : `the label ${owner}`} lies over the picture ${hit.id}, where it does not read at print; ${arrow ? `labelPosition 'above' | 'below' | 'tail', a shorter label, or the label as its own text beside the arrow` : 'move it beside the picture (a gap of 4 or more)'}`
    )
  }
}
