// `figures critique`: the design pass after the first render. A short report computed from the
// scene, not judged: the focus and whether it leads, each hue with its meaning, what is said
// twice, how unequal peers and gaps are, how many box styles and text sizes, and then the
// cuts to make before any polishing. Works on every figure; a figure without fig.focus is
// told to declare it first. Pure.
import { DESIGN_LIMITS } from './research-figures-design.mjs'
import { designSummary } from './research-figures-design-measure.mjs'
import { designFindings } from './research-figures-lint-design.mjs'

const CUT_ORDER = [
  'focus-missing',
  'repeat-text',
  'repeat-value',
  'repeat-picture',
  'legend-repeats',
  'caption-repeats-title',
  'orphan-caption',
  'stacked-tokens',
  'competing-emphasis',
  'focus-weak',
  'focus-wide',
  'colour-meaning',
  'design-hues',
  'hue-two-meanings',
  'same-hue-outline',
  'box-styles',
  'text-sizes',
  'dashed-box',
  'mixed-label-size',
  'peer-size',
  'photo-sizes',
  'spacing-scale'
]

const list = (ids, count = 4) =>
  ids.slice(0, count).join(', ') + (ids.length > count ? `, … (${ids.length})` : '')

/** The critique of one scene: the summary's numbers and the cuts, most important first. */
export function critiqueScene(scene) {
  const elements = (scene?.elements ?? []).filter((element) => element && !element.isDeleted)
  const summary = designSummary(elements)
  const findings = []
  designFindings(summary, elements, (level, code, element, message) => {
    findings.push({ level, code, id: element?.id ?? null, message })
  })
  const rank = (code) => {
    const index = CUT_ORDER.indexOf(code)
    return index === -1 ? CUT_ORDER.length : index
  }
  return {
    declared: Boolean(summary.design),
    brief: summary.design?.brief ?? null,
    colourBy: summary.design?.colourBy ?? null,
    focus: summary.focus,
    hues: summary.colours.hues,
    sameHueOutline: summary.colours.sameHueOutline,
    craft: summary.craft,
    findings,
    cuts: findings.toSorted((first, second) => rank(first.code) - rank(second.code))
  }
}

function focusLine(focus) {
  if (!focus.declared) {
    return "Focus: none declared. Name the paper's contribution first: fig.focus([...ids]) (it alone takes the accent)."
  }
  if (!focus.items.length) {
    return `Focus: ${focus.ids.join(', ')} names nothing drawn; use the ids of the kit calls.`
  }
  const size = focus.pathOnly
    ? 'a path (the accent and 1 pt carry it)'
    : `${focus.ratio}× a typical part (lead at ${DESIGN_LIMITS.focusArea}× or more)`
  const competing = focus.competing.length
    ? `; competing: ${focus.competing.map((entry) => `${entry.id} (${entry.why.split(':')[0]})`).join(', ')}`
    : '; nothing competes'
  return `Focus: ${list(focus.items)}: ${focus.dominant ? 'leads' : 'does NOT lead'}. ${size}; ${Math.round(focus.share * 100)}% of the parts${competing}.`
}

/** The report as text, short enough to read whole before editing. */
export function critiqueText(slug, critique) {
  const { craft, hues } = critique
  const repeats = critique.findings.filter((finding) =>
    [
      'repeat-text',
      'repeat-value',
      'repeat-picture',
      'legend-repeats',
      'caption-repeats-title'
    ].includes(finding.code)
  )
  const lines = [
    `${slug}: design report`,
    ...(critique.brief ? [`Claim: ${critique.brief}`] : []),
    focusLine(critique.focus),
    `Colours: ${hues.length} hue${hues.length === 1 ? '' : 's'} (published median 3; keep the accent for the focus and at most one dimension${critique.colourBy ? `, here ${critique.colourBy.dimension}: ${critique.colourBy.values.map((value) => value.name + (value.neutral ? ' (neutral)' : '')).join(' / ')}` : ''}).`,
    ...hues.map((hue) => `  ${hue.color}  ${hue.meanings.join(' + ')}  on ${list(hue.items)}`),
    ...(critique.sameHueOutline.length
      ? [`  outlined in their own fill's hue: ${list(critique.sameHueOutline)}`]
      : []),
    `Said twice: ${repeats.length ? '' : 'nothing.'}`,
    ...repeats.map((finding) => `  ${finding.message}`),
    `Sizes and spacing: ${craft.unequalPeers.length} row${craft.unequalPeers.length === 1 ? '' : 's'} or column${craft.unequalPeers.length === 1 ? '' : 's'} of unequal peers${craft.unequalPeers.length ? ` (worst ${Math.max(...craft.unequalPeers.map((entry) => entry.ratio))}×)` : ''}; ${craft.mixedPhotos.length} picture row${craft.mixedPhotos.length === 1 ? '' : 's'} of mixed sizes; ${craft.gapSteps.length} gap sizes (${craft.gapSteps.join(', ') || 'none'} units; keep 2–3).`,
    `Counts: ${craft.boxStyles.length} box style${craft.boxStyles.length === 1 ? '' : 's'} (${craft.boxStyles.map((entry) => `${entry.style} ×${entry.ids.length}`).join('; ') || 'none'}); ${craft.textSizes.length} text size${craft.textSizes.length === 1 ? '' : 's'} (${craft.textSizes.map((entry) => `${entry.size / 2} pt ×${entry.count}`).join(', ')}); keep ${DESIGN_LIMITS.boxStyles} and ${DESIGN_LIMITS.textSizes}.`
  ]
  const cuts = critique.cuts
  if (cuts.length) {
    lines.push('Cut before polishing (then run it, preview, and critique again):')
    cuts.slice(0, 12).forEach((finding, index) => {
      lines.push(`  ${index + 1}. ${finding.id ? `${finding.id}: ` : ''}${finding.message}`)
    })
    if (cuts.length > 12) {
      lines.push(`  … ${cuts.length - 12} more (figures check lists them)`)
    }
  } else {
    lines.push('Nothing to cut: polish (alignment, labels) and preview at print size.')
  }
  return lines.join('\n')
}
