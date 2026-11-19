// The paper look, laid over any colour preset or world: a figure drawn the way published ML
// papers draw them. One LaTeX typeface for words and math; panels apart in whitespace with the
// title centred above and "(a)" centred below, never a grey rounded card; one thin stroke (about
// 0.75 pt) with small sharp heads; square or 2-unit corners; fills only where they mean something.
// Pure: the style overrides, the arrow weights and the finishing pass `save()` runs.
import { PAPER_SERIF, paperSerif } from './research-figures-paper-fonts.mjs'
import { measureText } from './research-figures-text.mjs'

/** The one stroke weight: 0.75 pt at 144 units per inch. */
export const PAPER_STROKE = 1.5
/** Arrowheads about 3.5 pt long: small and sharp. */
export const PAPER_HEAD = 7
/** Corners: square, or this little rounding. */
export const PAPER_RADIUS = 2
/** The looks a figure may take: 'paper' (the default) or the preset's own ('preset'). */
export const FIGURE_LOOKS = ['paper', 'preset']

/**
 * The look a page draws in: the paper look unless the page says 'preset', recreates a published
 * figure (which keeps that figure's own look) or is an illustrative teaser.
 */
export function pageLook(page) {
  if (page?.look === 'paper') {
    return 'paper'
  }
  return page?.look === 'preset' || page?.reference || page?.style === 'illustrative'
    ? null
    : 'paper'
}

// Why one colour for conditions: a paper keeps colour for what the claim is about (its own
// path, the gradient); a condition is ordinary data flow in ink.
const ROLE_CHANGES = {
  main: { color: 'ink' },
  cond: { color: 'line' }
}

/** The arrow roles in the paper look: every one at the one weight, heads at most 7 units. */
export function paperArrowRoles(roles) {
  return Object.fromEntries(
    Object.entries(roles).map(([name, look]) => [
      name,
      {
        ...look,
        ...ROLE_CHANGES[name],
        strokeWidth: PAPER_STROKE,
        headSize: Math.min(look.headSize ?? PAPER_HEAD, PAPER_HEAD)
      }
    ])
  )
}

/**
 * A style in the paper look: the face (`font` 'cm' | 'times', default Computer Modern), 8 pt
 * text, 9 pt titles, the one stroke weight and square-ish corners. Colours stay the preset's.
 */
export function paperLook(style, { font, roles }) {
  const face = paperSerif(font) ?? { key: 'cm', ...PAPER_SERIF.cm }
  return {
    ...style,
    look: 'paper',
    paperFont: face.key,
    fontFamily: face.id,
    textSize: 16,
    smallSize: 14,
    titleSize: 18,
    calloutSize: 16,
    radius: PAPER_RADIUS,
    panelRadius: PAPER_RADIUS,
    panelPad: 10,
    outlineWidth: PAPER_STROKE,
    arrowRoles: paperArrowRoles(roles)
  }
}

const SANS_FAMILIES = new Set([9, 6])
const STROKED = new Set(['arrow', 'line', 'rectangle', 'ellipse', 'diamond', 'freedraw'])
const seen = (color) => typeof color === 'string' && color !== 'transparent' && color !== 'none'

/** Typeset quotes, as LaTeX prints ``a'' and don't: “a” and don’t. */
export function paperQuotes(text) {
  return String(text)
    .replaceAll(/"([^"]*)"/g, '\u201c$1\u201d')
    .replaceAll(/(\w)'(\w)/g, '$1\u2019$2')
}

/** A text set in the paper face, measured again and kept at its anchor (left, centre, right). */
function refont(element, family) {
  const quoted = paperQuotes(element.text ?? '')
  if (quoted !== element.text) {
    element.text = quoted
    element.originalText = quoted
  }
  const size = measureText(element.text ?? '', element.fontSize ?? 16, family)
  const anchor =
    element.textAlign === 'center'
      ? element.x + element.width / 2
      : element.textAlign === 'right'
        ? element.x + element.width
        : element.x
  const lineHeight = element.lineHeight ?? 1.25
  element.fontFamily = family
  element.width = size.width
  element.height = (size.height / 1.25) * lineHeight
  element.x =
    element.textAlign === 'center'
      ? anchor - size.width / 2
      : element.textAlign === 'right'
        ? anchor - size.width
        : anchor
}

/**
 * What `save()` does to a paper-look scene, for parts drawn with their own weights: lines and
 * outlines at most the one weight, rectangles' corners at most 2 units, sans text in the face,
 * straight quotes typeset. Code cards keep their monospace; pictures, plots and typeset math are images and stay.
 */
export function paperFinish(elements, style) {
  if (style?.look !== 'paper') {
    return 0
  }
  let changed = 0
  for (const element of elements) {
    if (element.isDeleted || element.type === 'frame') {
      continue
    }
    if (
      STROKED.has(element.type) &&
      seen(element.strokeColor) &&
      element.strokeWidth > PAPER_STROKE
    ) {
      element.strokeWidth = PAPER_STROKE
      changed += 1
    }
    const corner = element.roundness
    if (
      element.type === 'rectangle' &&
      corner &&
      (corner.type !== 3 || !(corner.value <= PAPER_RADIUS))
    ) {
      element.roundness = { type: 3, value: PAPER_RADIUS }
      changed += 1
    }
    const plain = element.type === 'text' && element.fontFamily !== 3
    if (
      plain &&
      (SANS_FAMILIES.has(element.fontFamily) || paperQuotes(element.text) !== element.text)
    ) {
      refont(element, SANS_FAMILIES.has(element.fontFamily) ? style.fontFamily : element.fontFamily)
      changed += 1
    }
  }
  return changed
}
