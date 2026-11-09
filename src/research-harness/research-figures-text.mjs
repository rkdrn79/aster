// Text the way Excalidraw lays it out in the paper font: widths from Liberation Sans' own advances.
import { LIBERATION_ADVANCES, LIBERATION_UNITS_PER_EM } from './research-figures-font-metrics.mjs'
import { NUNITO_ADVANCES, NUNITO_UNITS_PER_EM } from './research-figures-font-nunito.mjs'

export const TEXT_LINE_HEIGHT = 1.25
/** First baseline below a text element's top, in font sizes: half the 1.25 line box's leading
 *  plus Liberation Sans' ascent (1854 of 2048). */
export const TEXT_BASELINE = 0.0664 + 0.9053
/** Excalidraw's padding between a box's edge and the label bound inside it, on each side. */
export const BOUND_TEXT_PADDING = 5

/** Excalidraw's font families the kit draws with: Liberation Sans (9) and Nunito (6). */
export const PAPER_FONT = 9
export const ROUNDED_FONT = 6

const tableOf = (runs) => {
  const table = new Map()
  for (const [first, widths] of runs) {
    widths.forEach((width, index) => table.set(first + index, width))
  }
  return table
}
const advances = tableOf(LIBERATION_ADVANCES)
const FONTS = {
  [PAPER_FONT]: { advances, unitsPerEm: LIBERATION_UNITS_PER_EM },
  [ROUNDED_FONT]: { advances: tableOf(NUNITO_ADVANCES), unitsPerEm: NUNITO_UNITS_PER_EM }
}

function lineWidth(line, fontSize, family = PAPER_FONT) {
  const font = FONTS[family] ?? FONTS[PAPER_FONT]
  let units = 0
  for (const char of line) {
    units += font.advances.get(char.codePointAt(0)) ?? font.unitsPerEm * 0.55
  }
  return (units * fontSize) / font.unitsPerEm
}

/** The size Excalidraw gives text (fontFamily 9, or 6): the widest line, 1.25 × size per line. */
export function measureText(text, fontSize = 16, family = PAPER_FONT) {
  const lines = String(text).split('\n')
  return {
    width: Math.max(0, ...lines.map((line) => lineWidth(line, fontSize, family))),
    height: lines.length * fontSize * TEXT_LINE_HEIGHT,
    lines: lines.length
  }
}

/** Characters the paper font has no glyph for; they print in a fallback font or as boxes. */
export function missingGlyphs(text, family = PAPER_FONT) {
  const missing = new Set()
  const table = (FONTS[family] ?? FONTS[PAPER_FONT]).advances
  for (const char of String(text)) {
    const code = char.codePointAt(0)
    if (char !== '\n' && char !== '\t' && !table.has(code)) {
      missing.add(char)
    }
  }
  return [...missing]
}

/** Room for a label inside a shape, as Excalidraw computes it. */
export function boundTextRoom(container) {
  const pad = BOUND_TEXT_PADDING * 2
  if (container.type === 'ellipse') {
    return {
      width: Math.round((container.width / 2) * Math.SQRT2) - pad,
      height: Math.round((container.height / 2) * Math.SQRT2) - pad
    }
  }
  if (container.type === 'diamond') {
    return {
      width: Math.round(container.width / 2) - pad,
      height: Math.round(container.height / 2) - pad
    }
  }
  return { width: container.width - pad, height: container.height - pad }
}

/** Liberation Sans ink: tall letters and brackets reach 0.73 em up, descenders 0.21 em down. */
const INK_ASCENT = 0.73
const INK_DESCENT = 0.21

/** How tall a label's ink is: what has to fit between a box's edges. */
export function inkHeight(text, fontSize = 16, lineHeight = TEXT_LINE_HEIGHT) {
  const lines = String(text).split('\n').length
  return ((lines - 1) * lineHeight + INK_ASCENT + INK_DESCENT) * fontSize
}

/** The ink of a text element, without its line box's leading, for overlap checks. */
export function glyphBounds(element) {
  const size = element.fontSize ?? 16
  const lineHeight = element.lineHeight ?? TEXT_LINE_HEIGHT
  const baseline = element.y + (TEXT_BASELINE + (lineHeight - TEXT_LINE_HEIGHT) / 2) * size
  const top = baseline - INK_ASCENT * size
  const bottom = top + inkHeight(element.text ?? '', size, lineHeight)
  return {
    x: element.x,
    y: top,
    width: element.width,
    height: bottom - top,
    right: element.x + element.width,
    bottom
  }
}
