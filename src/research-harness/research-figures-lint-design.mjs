// The design checks, for a page that declared its design (fig.focus, fig.colourBy): emphasis
// (the focus leads, nothing competes), colour by meaning (every hue declared, few hues, no
// outline in its fill's hue), say it once (research-figures-lint-repeat) and craft (box styles,
// text sizes, peers, photos, token chips, captions). Pages without a declaration keep the old
// checks; `figures critique` reports these numbers for every figure.
import { DESIGN_LIMITS } from './research-figures-design.mjs'
import { designSummary } from './research-figures-design-measure.mjs'
import { repeatFindings } from './research-figures-lint-repeat.mjs'

const list = (ids, count = 3) =>
  ids.slice(0, count).join(', ') + (ids.length > count ? `, … (${ids.length})` : '')

/** Emphasis: the focus is there, leads by size, keeps the accent to itself, and nothing competes. */
function emphasisChecks(summary, add, element) {
  const { focus, design } = summary
  if (!design?.focus?.length) {
    add(
      'warning',
      'focus-missing',
      null,
      "the design names no focus: fig.focus([...ids]) the paper's contribution, so it alone takes the accent"
    )
    return
  }
  if (!focus.items.length) {
    return
  }
  if (!focus.pathOnly && focus.ratio !== null && focus.ratio < DESIGN_LIMITS.focusArea) {
    add(
      'warning',
      'focus-weak',
      element(focus.items[0]),
      `the focus (${list(focus.items)}) is ${focus.ratio}× a typical part; published figures make it ${DESIGN_LIMITS.focusArea}–6× (size, a wider box across the streams, the centre): enlarge it or give its neighbours less room`
    )
  }
  if (focus.share > DESIGN_LIMITS.accentShare) {
    add(
      'warning',
      'focus-wide',
      element(focus.items[0]),
      `${Math.round(focus.share * 100)}% of the parts are the focus (over ${DESIGN_LIMITS.accentShare * 100}%): an accent on everything emphasises nothing; name the contribution only`
    )
  }
  for (const { id, why } of focus.competing.slice(0, 4)) {
    add(
      'warning',
      'competing-emphasis',
      element(id),
      why.includes(' than the focus')
        ? why
        : `competes with the focus: ${why}; draw it plain (white, the thin line, the body size)`
    )
  }
}

/** Colour by meaning: no undeclared hue, at most the measured number, no outline in its fill's hue. */
function colourChecks(summary, add, element) {
  const { hues, sameHueOutline } = summary.colours
  for (const hue of hues) {
    if (hue.meanings.includes('undeclared')) {
      add(
        'warning',
        'colour-meaning',
        element(hue.items[0]),
        `${hue.color} on ${list(hue.items)} has no declared meaning; colour only the focus (fig.focus) and one dimension (fig.colourBy), or name it as data (fig.design({ data }))`
      )
    }
  }
  const counted = hues.filter(
    (hue) => !hue.meanings.every((meaning) => meaning === 'data' || meaning === 'right/wrong')
  )
  if (counted.length > DESIGN_LIMITS.hues) {
    add(
      'warning',
      'design-hues',
      element(counted.at(-1).items[0]),
      `${counted.length} hues (${counted.map((hue) => hue.color).join(', ')}); published figures use ${DESIGN_LIMITS.hues} or fewer: the accent for the focus, at most one dimension`
    )
  }
  const mixed = hues.filter(
    (hue) => hue.meanings.includes('focus') && hue.meanings.includes('dimension')
  )
  if (mixed.length) {
    add(
      'warning',
      'hue-two-meanings',
      element(mixed[0].items[0]),
      `${mixed[0].color} marks both the focus and a dimension; one hue, one meaning`
    )
  }
  if (sameHueOutline.length) {
    add(
      'warning',
      'same-hue-outline',
      element(sameHueOutline[0]),
      `${list(sameHueOutline)}: a tint outlined in a darker shade of its own hue reads as generated; outline in the neutral line, or none`
    )
  }
}

/** Craft: few box styles and text sizes, equal peers, one strip of tokens, captions with pictures. */
function craftChecks(summary, add, element) {
  const craft = summary.craft
  if (craft.boxStyles.length > DESIGN_LIMITS.boxStyles + 1) {
    add(
      'warning',
      'box-styles',
      element(craft.boxStyles.at(-1).ids[0]),
      `${craft.boxStyles.length} box styles (${craft.boxStyles.map((entry) => entry.style).join('; ')}); keep ${DESIGN_LIMITS.boxStyles}: plain, focus and at most one more`
    )
  }
  if (craft.textSizes.length > DESIGN_LIMITS.textSizes + 1) {
    add(
      'warning',
      'text-sizes',
      null,
      `${craft.textSizes.length} text sizes (${craft.textSizes.map((entry) => `${entry.size / 2} pt ×${entry.count}`).join(', ')}); keep ${DESIGN_LIMITS.textSizes}: titles, labels, small notes`
    )
  }
  for (const id of craft.mixedInBox.slice(0, 2)) {
    add(
      'warning',
      'mixed-label-size',
      element(id),
      'mixes text sizes inside one box; one size per label'
    )
  }
  for (const peers of craft.unequalPeers.slice(0, 3)) {
    add(
      'warning',
      'peer-size',
      element(peers.ids[0]),
      `peers in a ${peers.axis} (${list(peers.ids)}) differ ${peers.ratio}× in ${peers.axis === 'row' ? 'height' : 'width'}; give peers one size`
    )
  }
  for (const photos of craft.mixedPhotos.slice(0, 2)) {
    add(
      'warning',
      'photo-sizes',
      element(photos.ids[0]),
      `pictures in a ${photos.axis} (${list(photos.ids)}) differ ${photos.ratio}× in area; one size for a row of pictures (fit: 'cover')`
    )
  }
  for (const id of craft.stackedTokens) {
    add(
      'warning',
      'stacked-tokens',
      element(id),
      'words stacked as token chips; write the text as text, or one clean horizontal strip when the tokens are the point'
    )
  }
  for (const id of craft.dashedBoxes.slice(0, 2)) {
    add(
      'warning',
      'dashed-box',
      element(id),
      'a dashed box reads as a placeholder; draw it solid and say "optional" in words if that is the meaning'
    )
  }
  for (const id of craft.orphanCaptions) {
    add(
      'warning',
      'orphan-caption',
      element(id),
      'is set like the captions beside pictures but has no picture; give it its picture or drop it'
    )
  }
  if (craft.gapSteps.length > DESIGN_LIMITS.gapSteps + 2) {
    add(
      'note',
      'spacing-scale',
      null,
      `${craft.gapSteps.length} different gaps between neighbours (${craft.gapSteps.join(', ')} units); a figure keeps two or three (8, 16, 24)`
    )
  }
}

/** Every design finding of a summary, declared or not (what `figures critique` lists). */
export function designFindings(summary, elements, add) {
  const byOwner = new Map()
  for (const item of summary.items) {
    byOwner.set(item.id, item.head)
  }
  const element = (id) => byOwner.get(id) ?? elements.find((entry) => entry.id === id) ?? { id }
  emphasisChecks(summary, add, element)
  colourChecks(summary, add, element)
  for (const repeat of repeatFindings(summary.items)) {
    add('warning', repeat.code, element(repeat.ids[0]), repeat.message, {
      also: element(repeat.ids[1])
    })
  }
  craftChecks(summary, add, element)
}

/** The design findings for a page that declared a design; nothing for other pages. */
export function designChecks(elements, add) {
  const summary = designSummary(elements)
  if (!summary.design) {
    return null
  }
  designFindings(summary, elements, add)
  return summary
}
