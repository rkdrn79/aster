// What the figure looks like at its printed size (150 dpi, the print-size preview): data glyphs
// (token chips, patches, crops) too small to read, gray text fainter than #666, and content
// drawn too faint to see in its box. Blank space is research-figures-lint-space.mjs.
import { elementBounds, isInside } from './research-figures-geometry.mjs'
import { colorClass, contrast, luminance } from './research-figures-palette.mjs'

/** Pixels per inch of the print-size preview. */
const PRINT_DPI = 150
/** The smallest data glyph (a token chip's height, a patch, a crop) judges can read: 24 px. */
const CHIP_PX = 24
/** Gray text lighter than this reads as a ghost at print; judges asked for #666 or darker. */
const FAINT_TEXT = '#666666'
/** Content under this contrast with its box (a placeholder line, a gray thought) is invisible. */
const CONTENT_CONTRAST = 3
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const visible = (color) => Boolean(color) && color !== 'transparent'
const printPx = (units, scale) => (units * scale * PRINT_DPI) / 144
const minUnits = (scale) => Math.ceil((CHIP_PX * 144) / PRINT_DPI / scale)

/**
 * Token chips (a strip's cells, <strip>-<n>) shorter than CHIP_PX at the print-size preview's
 * 150 dpi read as specks: one finding per strip. `scale` is how much the page shrinks in print.
 */
export function chipChecks(elements, add, scale = 1) {
  const strips = new Map()
  for (const element of elements) {
    const strip = element.customData?.asterKit
    if (
      !strip ||
      strip === element.id ||
      !['rectangle', 'image'].includes(element.type) ||
      !new RegExp(`^${strip.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(element.id) ||
      !(element.groupIds ?? []).includes(`${strip}-glyph`)
    ) {
      continue
    }
    strips.set(strip, [...(strips.get(strip) ?? []), element])
  }
  for (const [strip, chips] of strips) {
    const shortest = Math.min(...chips.map((chip) => chip.height))
    const pixels = (shortest * scale * PRINT_DPI) / 144
    if (pixels < CHIP_PX) {
      add(
        'warning',
        'small-chip',
        chips.find((chip) => chip.height === shortest),
        `${strip}'s tokens are ${Math.round(shortest)} units tall, ${Math.round(pixels)} px at print size (${PRINT_DPI} dpi), under ${CHIP_PX}; make the strip taller (h ${minUnits(scale)} or more) or show fewer tokens`
      )
    }
  }
}

/**
 * Patches and photo crops under CHIP_PX at print read as specks: one finding per glyph (a
 * patch grid's cells, a photo or a crop). Token chips are chipChecks'; icons are not data.
 */
export function glyphSizeChecks(elements, add, scale = 1) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const small = new Map()
  for (const element of elements) {
    const owner = element.customData?.asterKit ?? element.id
    const holder = byId.get(owner)
    const inGlyph = (element.groupIds ?? []).includes(`${owner}-glyph`)
    // Why without a cell size: patches() cut a picture; feature and mask grids are values.
    const grid = holder?.customData?.asterGrid
    const patch = /-r\d+c\d+$/.test(element.id) && grid && !('cell' in grid) && inGlyph
    // Why not a strip's chips: chipChecks measures those by their height.
    const chip = inGlyph && element.id.startsWith(`${owner}-`) && /-\d+$/.test(element.id)
    const crop = element.type === 'image' && element.customData?.asterPhoto && !chip
    const side = Math.min(element.width, element.height)
    if ((patch || crop) && printPx(side, scale) < CHIP_PX - 0.01) {
      const known = small.get(owner)
      if (!known || side < known.side) {
        small.set(owner, { element, side })
      }
    }
  }
  for (const [owner, { element, side }] of small) {
    add(
      'warning',
      'small-glyph',
      element,
      `${owner}'s ${/-r\d+c\d+$/.test(element.id) ? 'patches are' : 'picture is'} ${Math.round(side)} units across, ${Math.round(printPx(side, scale))} px at print size, under ${CHIP_PX}; make ${/-r\d+c\d+$/.test(element.id) ? 'each patch' : 'it'} ${minUnits(scale)} units or more, or show fewer`
    )
  }
}

/** The smallest filled shape under a point: what a free text or a line sits on. */
function backdropOf(shapes, box) {
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  return shapes
    .filter((shape) => {
      const bounds = elementBounds(shape)
      return x > bounds.x && x < bounds.right && y > bounds.y && y < bounds.bottom
    })
    .toSorted((first, second) => first.width * first.height - second.width * second.height)[0]
}

/**
 * Gray text lighter than #666 on a light ground (judges read it as a ghost at print), and
 * lines drawn inside a box under 3:1 against its fill (a placeholder no one can see).
 */
export function faintChecks(elements, add) {
  const shapes = elements.filter(
    (element) => SHAPES.has(element.type) && visible(element.backgroundColor)
  )
  const byId = new Map(elements.map((element) => [element.id, element]))
  const fillOf = (shape) =>
    shape && visible(shape.backgroundColor) ? shape.backgroundColor : '#ffffff'
  const faint = elements.filter((text) => {
    if (text.type !== 'text' || !visible(text.strokeColor)) {
      return false
    }
    const gray = colorClass(text.strokeColor)
    const ground = fillOf(byId.get(text.containerId) ?? backdropOf(shapes, elementBounds(text)))
    return (
      gray?.kind !== 'hue' &&
      luminance(text.strokeColor) > luminance(FAINT_TEXT) + 0.002 &&
      luminance(ground) > 0.6
    )
  })
  if (faint.length) {
    add(
      'warning',
      'faint-text',
      faint[0],
      `${faint
        .slice(0, 4)
        .map((text) => `${text.id} (${text.strokeColor})`)
        .join(
          ', '
        )}${faint.length > 4 ? ', …' : ''}: gray text lighter than ${FAINT_TEXT} fades at print; use the ink, or color: 'line'`
    )
  }
  const holders = shapes.filter((shape) => shape.width >= 24 && shape.height >= 16)
  const words = elements.filter(
    (element) => element.type === 'text' || element.customData?.asterTex
  )
  const ghosts = elements.filter((line) => {
    // Why not a glyph's own lines: a patch grid's separators are drawn faint on purpose.
    const owner = line.customData?.asterKit
    const glyphPart = owner && owner !== line.id && (line.groupIds ?? []).includes(`${owner}-glyph`)
    if (line.type !== 'line' || !visible(line.strokeColor) || glyphPart) {
      return false
    }
    const box = elementBounds(line)
    const holder = holders
      .filter((shape) => shape.id !== line.id && isInside(box, elementBounds(shape), 1))
      .toSorted((first, second) => first.width * first.height - second.width * second.height)[0]
    // Why only a box without words: beside real text a faint line is a rule, not the content.
    const worded =
      holder && words.some((text) => isInside(elementBounds(text), elementBounds(holder), 1))
    return (
      holder && !worded && contrast(line.strokeColor, holder.backgroundColor) < CONTENT_CONTRAST
    )
  })
  if (ghosts.length) {
    add(
      'warning',
      'faint-content',
      ghosts[0],
      `${ghosts
        .slice(0, 4)
        .map((line) => line.id)
        .join(
          ', '
        )}${ghosts.length > 4 ? ', …' : ''} ${ghosts.length > 1 ? 'are' : 'is'} under ${CONTENT_CONTRAST}:1 against the box ${ghosts.length > 1 ? 'they sit' : 'it sits'} in, so the box reads blank; draw the content darker (ink or line), or show real content (words, cells, a thumbnail)`
    )
  }
}
