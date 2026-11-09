// Generated pages of `figures kit`: the colour presets with their hex values, and what each
// stock photo shows. Built from the data the kit draws with, so they never drift from it.
import { ACCENT_SWATCHES, PALETTE_PRESETS, PANEL_SWATCHES } from './research-figures-palette.mjs'
import { FIGURE_ACCENTS, figureStyle } from './research-figures-style.mjs'

const ROLE_NOTES = [
  ['block', 'ordinary modules (the default box fill)'],
  ['strong', 'heavy modules (attention, a big backbone)'],
  [
    'mid',
    'a gray that shows on white: rules, dimmed or hidden cells (strong is near white in some presets)'
  ],
  ['panel', 'the background of a group (fig.panel)'],
  ['white', 'a white box: an ink outline in outlined styles, a light gray edge otherwise'],
  ['accent', 'the contribution: the paper’s own module and the tokens it makes'],
  ['accent-strong', 'a heavier fill of the accent (a highlighted cell, a bar)'],
  ['accent-ink', 'the accent’s shade, for text, an outline or a contribution arrow on white'],
  ['accent-solid', 'a saturated marker (a dot, a selected bar)'],
  ['secondary, tertiary, kind-1…3', 'the preset’s other accents, each with its fixed role'],
  ['highlight', 'tonal style: the one module that matters, solid with white text'],
  ['loss', 'the loss node: ink text on white, a thin gray frame when boxed'],
  ['loss-link', 'a loss’s links: ink, like any arrow'],
  ['red', 'opt-in red (a red loss, the RL step of a teaser), never by default'],
  [
    'good, bad (-strong, -ink, -solid)',
    'right and wrong (a correct and a failed answer, ✓ and ✗): green and red tints with an ink, in every preset; never counted against the palette'
  ],
  ['ink, line, muted', 'text, arrows and lines, quiet notes']
]

/** `figures kit colors`: presets, their colours by role, accent swatches and the rules. */
export function colorsText() {
  const lines = [
    "Colour presets: fig.style('<preset>', { accent }) (old 'neutral' is graphite). Pick by what the colours mean:",
    'one accent for the contribution (graphite, slate, outline, tonal), ours vs. given (blue-amber), module types',
    '(sage-butter), kinds or modalities (categorical), or no hue at all (print-mono). The loss is ink.',
    ''
  ]
  for (const [id, preset] of Object.entries(PALETTE_PRESETS)) {
    const style = figureStyle(id)
    lines.push(`${id} — ${preset.label}`)
    lines.push(
      `  block ${style.block}  strong ${style.strong}  mid ${style.mid}  panel ${style.panel}  ink ${style.ink}  line ${style.line}  muted ${style.muted}  outline ${style.boxStroke}`
    )
    for (const item of style.accents) {
      const name = item.name === 'accent' ? 'accent' : item.name
      lines.push(
        `  ${name.padEnd(10)} fill ${item.fill}  strong ${item.strong}  ink ${item.ink}  solid ${item.solid}  — ${item.role}`
      )
    }
    for (const rule of preset.rules) {
      lines.push(`  · ${rule}`)
    }
    lines.push('')
  }
  lines.push(
    `Illustrative panels: fig.style('illustrative', { panels: [...] }) from ${Object.keys(PANEL_SWATCHES).join(', ')} (or #hex);`,
    "  colour names panel-1, panel-2 for the fills and panel-1-ink for a phrase in that panel's colour.",
    ''
  )
  lines.push('Accent swatches (any #hex works too; it is derived the same way):')
  for (const [name, swatch] of Object.entries(ACCENT_SWATCHES)) {
    const accent = FIGURE_ACCENTS[name]
    lines.push(
      `  ${name.padEnd(7)} hue ${String(swatch.hue).padEnd(4)} fill ${accent.fill}  strong ${accent.strong}  ink ${accent.stroke}  solid ${accent.solid}`
    )
  }
  lines.push(
    "  The loss is ink unless asked (loss({ tone: 'accent' | 'red' })); a red loss stays ink beside an accent",
    '  within 35° of red (pink, orange, clay). Violet is offered, never a default. A nearly gray pick gives tinted',
    '  grays and no hue.',
    '',
    'Colour names for `color` (boxes, glyphs, tint):'
  )
  for (const [name, note] of ROLE_NOTES) {
    lines.push(`  ${name.padEnd(30)} ${note}`)
  }
  lines.push(
    '  #hex                           a literal colour (prefer the roles)',
    '',
    'fig.palette() returns the current style’s hex values for glyphs you colour yourself.'
  )
  return lines.join('\n')
}
