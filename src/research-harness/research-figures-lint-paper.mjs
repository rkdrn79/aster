// The academic-look check for figures in the paper look: what makes a figure read as a slide or
// an app screen instead of a published figure. It counts card frames, type faces, clip-art,
// colours, filled area, rounded corners and heavy lines, and names what to change.
import { hexToOklch } from './research-figures-color-space.mjs'
import { PAPER_RADIUS, PAPER_STROKE, pageLook } from './research-figures-paper.mjs'
import { PAPER_SERIF, PAPER_SERIF_IDS } from './research-figures-paper-fonts.mjs'
import { MONO_FONT } from './research-figures-text.mjs'
import { paperOverlapChecks } from './research-figures-lint-paper-overlap.mjs'
import { isFocusStroke } from './research-figures-design.mjs'

/** Published figures use two or three colours with a meaning, beside ink and grays. */
export const PAPER_MAX_HUES = 3
/** Share of the page filled with colour or gray above which a figure reads as painted. */
export const PAPER_MAX_FILL = 0.2
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const LINES = new Set(['arrow', 'line', 'freedraw'])
const FACE_NAMES = {
  9: 'Liberation Sans',
  6: 'Nunito',
  [PAPER_SERIF.cm.id]: PAPER_SERIF.cm.name,
  [PAPER_SERIF.times.id]: PAPER_SERIF.times.name
}

/** The face a placed plot's words are in: its manifest's paper look, else the preset's sans. */
function plotFace(record) {
  const look = record?.style?.look
  return look === 'paper'
    ? record.style.serif === 'times'
      ? PAPER_SERIF.times.id
      : PAPER_SERIF.cm.id
    : 'plot sans'
}

const visible = (color) =>
  typeof color === 'string' && color !== 'transparent' && color !== 'none' && color !== ''
const white = (color) => /^#f{3}(?:f{3})?$/i.test(color ?? '')
// Why not swatches, legends' keys, pictures or a drawn glyph's value colours (a memory tier, a
// source layer): a pixel's colour is data, not decoration.
const decorative = (element) =>
  !element.customData?.asterSwatch &&
  !element.customData?.asterMeaning &&
  element.type !== 'image' &&
  element.opacity !== 0
const sample = (items) =>
  items
    .slice(0, 3)
    .map((element) => element.customData?.asterKit ?? element.id)
    .join(', ') + (items.length > 3 ? ', …' : '')
const rounded = (element) =>
  element.type === 'rectangle' &&
  element.roundness &&
  !(element.roundness.type === 3 && element.roundness.value <= PAPER_RADIUS)

/** Hue clusters of the colours drawn: hues within 25° are one colour, grays are none. */
function hueClusters(elements) {
  const found = []
  for (const element of elements.filter(decorative)) {
    const colors = [element.strokeColor, SHAPES.has(element.type) ? element.backgroundColor : null]
    for (const color of colors) {
      if (!visible(color) || !/^#[0-9a-f]{6}$/i.test(color)) {
        continue
      }
      const { C, h } = hexToOklch(color)
      if (C >= 0.04) {
        found.push({ h, color, element })
      }
    }
  }
  const clusters = []
  for (const item of found.toSorted((a, b) => a.h - b.h)) {
    const last = clusters.at(-1)
    if (last && item.h - last.h <= 25) {
      last.items.push(item)
      last.h = item.h
    } else {
      clusters.push({ h: item.h, color: item.color, items: [item] })
    }
  }
  // Why: hue wraps, so a red near 355° and one near 5° are one colour.
  if (clusters.length > 1 && clusters[0].items[0].h + 360 - clusters.at(-1).h <= 25) {
    clusters[0].items.push(...clusters.pop().items)
  }
  return clusters
}

/** The academic-look findings for a paper-look page (nothing for other pages). */
export function paperLookChecks(elements, page, add) {
  if (!page || pageLook(page) !== 'paper') {
    return
  }
  const live = elements.filter((element) => !element.isDeleted && element.type !== 'frame')
  paperOverlapChecks(live, add)
  // Why a declared region passes: the design layer tints the focus's or a dimension's region.
  const region = (element) =>
    Boolean(element.customData?.asterPanel) &&
    ['focus', 'dim', 'quiet'].includes(element.customData?.asterDesign)
  const cards = live.filter(
    (element) =>
      element.customData?.asterPanel &&
      !region(element) &&
      ((visible(element.backgroundColor) && !white(element.backgroundColor)) ||
        (visible(element.strokeColor) && rounded(element)))
  )
  if (cards.length) {
    add(
      'warning',
      'paper-card',
      cards[0],
      `${cards.length} panel${cards.length > 1 ? 's are' : ' is'} drawn as a card (${sample(cards)}): a filled or rounded frame reads as a slide; set panels apart with whitespace (no color, no outline), title above, "(a)" below`
    )
  }
  const texts = live.filter(
    (element) =>
      element.type === 'text' &&
      !(element.fontFamily === MONO_FONT && element.customData?.asterCode)
  )
  const faces = new Map()
  for (const text of texts) {
    faces.set(text.fontFamily, [...(faces.get(text.fontFamily) ?? []), text])
  }
  // Why plots too: a plot's words are drawn into its picture, in the face its script chose.
  for (const plot of live.filter((element) => element.customData?.asterPlot)) {
    const face = plotFace(plot.customData.asterPlot)
    faces.set(face, [...(faces.get(face) ?? []), plot])
  }
  const off = [...faces.entries()].filter(([family]) => !PAPER_SERIF_IDS.has(family))
  const serifs = [...faces.keys()].filter((family) => PAPER_SERIF_IDS.has(family))
  if (off.length || serifs.length > 1) {
    const wrong = off.flatMap(([, items]) => items)
    const plots = wrong.filter((element) => element.customData?.asterPlot)
    const words = wrong.filter((element) => !element.customData?.asterPlot)
    const fixes = [
      words.length ? `set ${sample(words)} in the page's face (drop font:)` : null,
      plots.length ? `remake ${sample(plots)} with ap.use(…, look="paper")` : null
    ].filter(Boolean)
    add(
      'warning',
      'paper-font',
      wrong[0] ?? texts[0],
      `${faces.size} type faces (${[...faces.keys()].map((family) => FACE_NAMES[family] ?? family).join(', ')}): a paper sets its words and math in one LaTeX face; ${fixes.join('; ') || 'keep one of Computer Modern and Times'}`
    )
  }
  const clipArt = live.filter(
    (element) =>
      element.customData?.asterIcon ||
      element.customData?.asterBadge ||
      (element.customData?.asterGlyph === 'nn' && !element.customData?.asterPaper)
  )
  if (clipArt.length) {
    add(
      'warning',
      'paper-clipart',
      clipArt[0],
      `${clipArt.length} clip-art glyph${clipArt.length > 1 ? 's' : ''} (${sample(clipArt)}): draw a network as bars (fig.nn in the paper look), say frozen or trainable in words, leave icons out unless the person asked (then fig.allow('paper-clipart'))`
    )
  }
  const clusters = hueClusters(live)
  if (clusters.length > PAPER_MAX_HUES) {
    const named = clusters
      .toSorted((a, b) => b.items.length - a.items.length)
      .map((cluster) => `${cluster.color} (${sample(cluster.items.map((item) => item.element))})`)
    add(
      'warning',
      'paper-colors',
      clusters.at(-1).items[0].element,
      `${clusters.length} colours: ${named.join('; ')}; papers use ${PAPER_MAX_HUES} or fewer, each with a meaning: keep one for the method's own part or path and draw the rest in ink and gray`
    )
  }
  const area = page.width * page.height
  const filled = live
    .filter(
      (element) =>
        SHAPES.has(element.type) &&
        decorative(element) &&
        !region(element) &&
        visible(element.backgroundColor) &&
        !white(element.backgroundColor)
    )
    .map((element) => ({ element, area: element.width * element.height }))
    .toSorted((a, b) => b.area - a.area)
  const share = area ? filled.reduce((sum, item) => sum + item.area, 0) / area : 0
  if (share > PAPER_MAX_FILL) {
    add(
      'warning',
      'paper-fill',
      filled[0].element,
      `${Math.round(share * 100)}% of the page is filled (largest: ${sample(filled.map((item) => item.element))}); fill only what the colour means and leave the rest white`
    )
  }
  const corners = live.filter(rounded)
  if (corners.length) {
    add(
      'warning',
      'paper-rounded',
      corners[0],
      `${corners.length} rounded rectangle${corners.length > 1 ? 's' : ''} (${sample(corners)}): square corners, or { rounded: ${PAPER_RADIUS} }`
    )
  }
  const heavy = live.filter(
    (element) =>
      (LINES.has(element.type) || SHAPES.has(element.type)) &&
      visible(element.strokeColor) &&
      element.strokeWidth > PAPER_STROKE &&
      !isFocusStroke(element)
  )
  if (heavy.length) {
    add(
      'warning',
      'paper-stroke',
      heavy[0],
      `${heavy.length} line${heavy.length > 1 ? 's' : ''} heavier than 0.75 pt (${sample(heavy)}): one thin weight, strokeWidth ${PAPER_STROKE}`
    )
  }
  add(
    'note',
    'academic-look',
    null,
    `paper look: ${cards.length} cards, ${faces.size} text face${faces.size === 1 ? '' : 's'} plus TeX math, ${clipArt.length} clip-art, ${clusters.length} colours, ${Math.round(share * 100)}% filled, ${corners.length} rounded, ${heavy.length} heavy lines`
  )
}
