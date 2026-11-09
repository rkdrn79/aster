// Paper styles measured from published ML figures (the colour study's presets): neutral blocks
// without outlines, accents with a meaning, the loss in ink, ink lines about 1 pt wide.
// Pure, like the model.
import {
  ACCENT_ALIASES,
  ACCENT_SWATCHES,
  DEFAULT_PRESET,
  LOSS_HUE,
  LOSS_RED,
  LOSS_TONES,
  PALETTE_PRESETS,
  PANEL_SWATCHES,
  PRESET_ALIASES,
  colorClass,
  contrast,
  deriveAccent,
  hexToOklch,
  hueDistance,
  lossStyle,
  oklchToHex,
  panelColors,
  presetColors
} from './research-figures-palette.mjs'

export { LOSS_TONES, lossStyle }

/** About 1 pt at print (144 units per inch). */
export const FIGURE_LINE_WIDTH = 2
/** Arrowhead length in units: about 5 pt, shorter than Excalidraw's own 15. */
export const FIGURE_HEAD_SIZE = 10
export const DEFAULT_FIGURE_STYLE = DEFAULT_PRESET

/** The preset's own accent swatch, so naming it keeps the measured colours. */
const PRESET_ACCENT = {
  graphite: 'blue',
  slate: 'amber',
  outline: 'clay',
  'blue-amber': 'blue',
  'sage-butter': 'green',
  tonal: 'blue',
  'print-mono': null,
  illustrative: 'teal',
  categorical: null
}

/**
 * The presets (palettes.json of the colour study): `block` fills ordinary modules, `strong` the
 * heavy ones, `panel` the background behind a group; `boxStroke` is the outline boxes get.
 */
export const FIGURE_STYLES = Object.fromEntries(
  Object.entries(PALETTE_PRESETS).map(([id, preset]) => [
    id,
    {
      label: preset.label,
      block: preset.neutrals.block,
      strong: preset.neutrals.strong,
      panel: preset.neutrals.panel,
      boxStroke: preset.outline ?? 'transparent',
      ink: preset.neutrals.text,
      line: preset.neutrals.line,
      muted: preset.neutrals.muted,
      radius: preset.radius,
      accent: PRESET_ACCENT[id]
    }
  ])
)

/**
 * The accent swatches, derived by the colour study's rule (any `#hex` works too): `fill` is the
 * tint, `strong` a heavier fill, `stroke` the shade for text and outlines, `solid` for markers.
 */
export const FIGURE_ACCENTS = Object.fromEntries(
  Object.entries(ACCENT_SWATCHES).map(([name, swatch]) => {
    const derived = deriveAccent(swatch.hue, { chroma: swatch.chroma })
    return [
      name,
      { fill: derived.tint, stroke: derived.shade, strong: derived.strong, solid: derived.solid }
    ]
  })
)

/**
 * Right and wrong (a correct answer and a failed one, ✓ and ✗): a green and a red tint with an
 * ink, the same in every preset. They mean something fixed rather than a module type, so the
 * generated-palette rules leave them out (`isSemanticColor`).
 */
export const SEMANTIC_COLORS = Object.fromEntries(
  [
    ['good', 145],
    ['bad', LOSS_HUE]
  ].map(([name, hue]) => {
    const derived = deriveAccent(hue)
    return [
      name,
      { fill: derived.tint, strong: derived.strong, ink: derived.shade, solid: derived.solid }
    ]
  })
)
const SEMANTIC_HEX = new Set(
  Object.values(SEMANTIC_COLORS).flatMap((color) => Object.values(color))
)

/** Whether a colour is one of the right and wrong roles (`good`, `bad` and their parts). */
export function isSemanticColor(hex) {
  return typeof hex === 'string' && SEMANTIC_HEX.has(hex.toLowerCase())
}

/**
 * The default loss, in ink as most papers write it: ink text, a thin gray frame when it has one,
 * ink links. Colour is opt-in: `lossStyle('accent' | 'red')`, `loss({ tone })`.
 */
export const LOSS_COLOR = lossStyle('ink')
/** #666 on white: muted words stay at least this dark (judges read lighter gray as a ghost). */
const MUTED_TEXT_CONTRAST = 5.74

/**
 * A loss's colours in `style`: ink (the default), the accent's shade, or red. Red stays ink when
 * the figure's accent sits too near red to tell the two apart (`style.loss.clash`).
 */
export function lossColors(style, tone = 'ink') {
  const neutrals = { text: style.ink, line: style.line, muted: style.muted }
  const kept = tone === 'red' && style.loss.clash ? 'ink' : tone
  return lossStyle(kept, { neutrals, accent: style.accents[0].ink })
}

/**
 * Arrow weights by role, as papers draw them: ordinary data flow at 1 pt, the paper's
 * contribution path (chosen, never automatic) dark and 1.25 pt, side inputs gray and 0.75 pt,
 * auxiliary links (EMA, stop-grad) dashed.
 */
export const ARROW_ROLES = {
  data: { color: 'line', strokeWidth: 2, headSize: 10 },
  main: { color: 'ink', strokeWidth: 2.5, headSize: 10 },
  side: { color: 'muted', strokeWidth: 1.5, headSize: 8 },
  aux: { color: 'muted', strokeWidth: 1.5, headSize: 8, dashed: true },
  loss: { color: 'loss-link', strokeWidth: 1.5, headSize: 8 }
}

// Why: scenes and scripts from before the styles still name Okabe-Ito hues.
const LEGACY = {
  gray: 'block',
  orange: 'amber',
  vermillion: 'clay',
  sky: 'blue'
}

const accentKey = (name) => ACCENT_ALIASES[name] ?? name

/**
 * A preset by name (old `neutral` is graphite) with its accent: a swatch name (`figures kit
 * colors`), an old name or any `#hex`, derived by the colour study's rule.
 */
export function figureStyle(name = DEFAULT_FIGURE_STYLE, accent, { panels } = {}) {
  const key = PRESET_ALIASES[name] ?? name
  const id = Object.hasOwn(FIGURE_STYLES, key) ? key : DEFAULT_FIGURE_STYLE
  const preset = FIGURE_STYLES[id]
  const own = accent === undefined || accent === null || accentKey(accent) === preset.accent
  const colors = presetColors(id, own ? null : accentKey(accent))
  const accents = colors.accents.map((item) => ({
    name: item.name,
    role: item.role,
    hue: item.hue,
    fill: item.tint,
    strong: item.strong,
    ink: item.shade,
    solid: item.solid,
    highlight: item.highlight ?? null
  }))
  return {
    name: id,
    ...preset,
    block: colors.block,
    strong: colors.strong,
    panel: colors.panel,
    // Why its own gray: strong is near white in some presets (#ececec in illustrative), so a
    // gray that must show on white (a rule, a dimmed cell, a hidden token) needs a darker one.
    mid: midGray(colors.strong, colors.muted),
    accentName: own ? preset.accent : colors.accentName,
    accentColor: { fill: accents[0].fill, stroke: accents[0].ink },
    accents,
    loss: colors.loss,
    mutedText: mutedText(preset.muted),
    outlineWidth: colors.outlineWidth,
    rules: colors.rules,
    // Why two sizes: 8 pt labels and 7 pt tokens, scripts and notes, as in printed papers.
    textSize: 16,
    smallSize: 14,
    ...(PALETTE_PRESETS[id].illustrative
      ? {
          // Why Nunito: Excalidraw bundles it; its rounded forms read as an illustration.
          fontFamily: 6,
          titleSize: 22,
          calloutSize: 20,
          panelRadius: 22,
          panelPad: 18,
          panels: panelColors(panels ?? ['rose', 'teal'])
        }
      : {
          fontFamily: 9,
          titleSize: 14,
          calloutSize: 16,
          panelRadius: null,
          panelPad: 10,
          panels: []
        })
  }
}

const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)

/** An accent of the style by role name (accent, primary, secondary, tertiary, kind-1…). */
function accentRole(style, role) {
  const numbered = /^accent([23])$/.exec(role)
  if (numbered) {
    return style.accents[Number(numbered[1]) - 1] ?? null
  }
  if (role === 'accent' || role === 'primary') {
    return style.accents[0]
  }
  return style.accents.find((item) => item.name === role) ?? null
}

function knownColor(style, name) {
  const role = LEGACY[name] ?? name
  if (role === undefined || role === 'block') {
    return { fill: style.block, stroke: style.boxStroke }
  }
  if (role === 'strong' || role === 'panel' || role === 'mid') {
    return { fill: style[role], stroke: role === 'panel' ? 'transparent' : style.boxStroke }
  }
  if (role === 'white') {
    // Why not ink: a white box needs an edge on a white page, a light one when boxes have none.
    return {
      fill: '#ffffff',
      stroke: style.boxStroke === 'transparent' ? style.strong : style.boxStroke
    }
  }
  const [base, part] = /^(.*?)(?:-(strong|ink|solid))?$/.exec(role).slice(1)
  const named = accentRole(style, base)
  if (named) {
    if (part === 'ink' || part === 'solid') {
      const color = part === 'ink' ? named.ink : named.solid
      return { fill: color, stroke: color, ink: color }
    }
    return {
      fill: part === 'strong' ? named.strong : named.fill,
      stroke: style.boxStroke,
      ink: named.ink
    }
  }
  // Why '-strong' too: a glyph in a panel colour (nn nodes, bars) asks for its mid tone, and a
  // swatch the page doesn't list ('rose' on a sky page) is still a tint, not an error.
  const panel = /^panel-(\d)(-ink)?(?:-strong|-ink)?$/.exec(role)
  const tinted = panel
    ? style.panels[Number(panel[1]) - 1]
    : (style.panels.find((item) => item.name === base) ??
      (PANEL_SWATCHES[base] ? panelColors([base])[0] : null))
  if (tinted) {
    const ink = panel ? Boolean(panel[2]) || role.endsWith('-ink') : part === 'ink'
    if (ink) {
      return { fill: tinted.ink, stroke: tinted.ink, ink: tinted.ink }
    }
    const strong = role.endsWith('-strong')
    return { fill: strong ? tinted.strong : tinted.fill, stroke: 'transparent', ink: tinted.ink }
  }
  if (role === 'highlight') {
    const fill = style.accents[0].highlight ?? style.accents[0].ink
    return { fill, stroke: style.boxStroke, ink: '#ffffff' }
  }
  if (role === 'loss') {
    return { fill: style.loss.fill, stroke: style.loss.stroke, ink: style.loss.text, role: 'loss' }
  }
  const semantic = SEMANTIC_COLORS[base]
  if (semantic) {
    if (part === 'ink' || part === 'solid') {
      return { fill: semantic[part], stroke: semantic[part], ink: semantic[part] }
    }
    return {
      fill: part === 'strong' ? semantic.strong : semantic.fill,
      stroke: style.boxStroke,
      ink: semantic.ink
    }
  }
  if (role === 'loss-link') {
    return { fill: style.loss.link, stroke: style.loss.link, ink: style.loss.link }
  }
  if (role === 'red') {
    // Why a name of its own: red is opt-in (a red loss, the RL step in a teaser), never a role.
    return { fill: LOSS_RED, stroke: LOSS_RED, ink: LOSS_RED }
  }
  if (role === 'none' || role === 'transparent') {
    return { fill: 'transparent', stroke: 'transparent' }
  }
  if (role === 'ink' || role === 'line' || role === 'muted') {
    return { fill: style[role], stroke: style[role], ink: style[role] }
  }
  const swatch = FIGURE_ACCENTS[accentKey(base)]
  if (swatch) {
    const fill = part === 'strong' ? swatch.strong : part === 'ink' ? swatch.stroke : swatch.fill
    return { fill, stroke: style.boxStroke, ink: swatch.stroke }
  }
  return null
}

const COLOR_NAMES = [
  'block',
  'strong',
  'mid',
  'panel',
  'white',
  'accent',
  'accent-strong',
  'accent-ink',
  'accent-solid',
  'secondary',
  'tertiary',
  'highlight',
  'loss',
  'loss-link',
  'red',
  'good',
  'bad',
  'ink',
  'line',
  'muted',
  'none',
  ...Object.keys(FIGURE_ACCENTS)
]

/**
 * What a box of colour `name` looks like in `style`: its fill, its outline, the ink for lines
 * and text of that colour, and `role: 'loss'` for the loss colour. `#hex` fills with that colour.
 */
export function styleColor(style, name) {
  if (isHex(name)) {
    return { fill: name, stroke: style.boxStroke, ink: name }
  }
  const color = knownColor(style, name)
  if (!color) {
    const panels = (style.panels ?? []).flatMap((item, index) => [
      `panel-${index + 1} (${item.name})`,
      `panel-${index + 1}-ink`
    ])
    throw new Error(
      `Unknown color "${name}" in the ${style.name} style. Colors: ${[...COLOR_NAMES, ...panels, ...Object.keys(PANEL_SWATCHES)].join(', ')}, or #hex (figures kit colors)`
    )
  }
  return { ink: style.ink, ...color }
}

// Why: a neutral fill named for a line or text means that gray ('white' cell rules, a 'strong'
// stroke), not the dark ink that labels a box of that fill.
const NEUTRAL_FILLS = new Set(['white', 'block', 'strong', 'panel', 'mid', 'gray'])

/** The colour a line or text of colour `name` takes: a neutral fill keeps its own gray. */
function lineColor(style, name) {
  const color = styleColor(style, name)
  return NEUTRAL_FILLS.has(name) ? color.fill : color.ink
}

/**
 * Muted text, darkened to #666 or darker in its own hue: the muted gray reads as a ghost at
 * print for words, though it suits side lines.
 */
function mutedText(muted) {
  const color = hexToOklch(muted)
  if (!color) {
    return muted
  }
  let { L } = color
  let hex = muted
  while (contrast(hex, '#ffffff') < MUTED_TEXT_CONTRAST && L > 0.2) {
    L -= 0.01
    hex = oklchToHex({ ...color, L })
  }
  return hex
}

/** The ink for words: like inkColor, except muted words take the style's darker mutedText. */
export function textInk(style, name, fallback = 'ink') {
  return name === 'muted' ? (style.mutedText ?? style.muted) : inkColor(style, name, fallback)
}

/** The ink for text or a line: `fallback` (ink or line) unless a colour is named. */
export function inkColor(style, name, fallback = 'ink') {
  if (name === undefined || name === null) {
    return style[fallback]
  }
  return lineColor(style, name)
}

/**
 * A fill or stroke given as a colour name or as a literal (#hex, transparent); a stroke (`ink`)
 * of a neutral fill name is that gray.
 */
export function paintValue(style, value, part) {
  if (value === undefined || value === null || value === 'transparent' || isHex(value)) {
    return value
  }
  return part === 'ink' ? lineColor(style, value) : styleColor(style, value)[part]
}

/** Halfway between two #rrggbb colours: a mid gray between strong and muted. */
function midGray(a, b) {
  const channels = (hex) =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const [x, y] = [channels(a), channels(b)]
  return `#${x
    .map((value, index) =>
      Math.round((value + y[index]) / 2)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/** The OKLCH hue of a colour in degrees, or null for neutrals and tinted grays (C < 0.024). */
export function colorHue(hex) {
  const color = colorClass(hex)
  return color?.kind === 'hue' ? color.h : null
}

/** A saturated red near the loss red's hue: the red loss's family. */
export function isLossRed(hex) {
  const color = hexToOklch(hex)
  return Boolean(color) && color.C >= 0.12 && hueDistance(color.h, LOSS_HUE) < 20
}

/**
 * A loss node, a loss's link (the kit's and the canvas's Loss line role, `loss-link`), or a
 * tensor a loss compares.
 */
export function isLossRole(role) {
  return role === 'loss' || role === 'loss-link' || role === 'compared'
}

/**
 * Whether the figure draws a red loss (`tone: 'red'`): only then is red reserved for the loss.
 * A loss's own text counts through the node that owns it.
 */
export function hasRedLoss(elements) {
  const lossIds = new Set(
    elements
      .filter((element) => isLossRole(element.customData?.asterRole))
      .map((element) => element.id)
  )
  return elements.some(
    (element) =>
      (isLossRole(element.customData?.asterRole) ||
        lossIds.has(element.customData?.asterKit) ||
        lossIds.has(element.containerId)) &&
      [element.strokeColor, element.backgroundColor].some(
        (color) => typeof color === 'string' && isLossRed(color)
      )
  )
}

/** The neutral colours of a style, which never count as hues. */
export function styleNeutrals(style) {
  return new Set(
    [
      style.block,
      style.strong,
      style.mid,
      style.panel,
      style.ink,
      style.line,
      style.muted,
      style.boxStroke
    ]
      .filter(isHex)
      .map((value) => value.toLowerCase())
  )
}

/** The colours the editor's Colors menu offers for a style: roles first, then the accents. */
export function figureSwatches(style) {
  const roles = [
    ['block', 'Block'],
    ['strong', 'Heavy block'],
    ['panel', 'Panel'],
    ['white', 'White box'],
    ['accent', `Accent (${style.accentName ?? style.accents[0].name})`],
    ['accent-strong', 'Accent, heavy'],
    ...style.accents.slice(1).map((item) => [item.name, `${item.name} (${item.role})`]),
    ['loss', 'Loss'],
    ['line', 'Line']
  ]
  return roles.map(([name, label]) => ({ name, label, ...styleColor(style, name) }))
}

/** A style's colours as hex, for scripts that colour their own glyphs: `fig.palette()`. */
export function stylePalette(style) {
  return {
    style: style.name,
    accent: style.accentName,
    block: style.block,
    strong: style.strong,
    mid: style.mid,
    panel: style.panel,
    white: '#ffffff',
    ink: style.ink,
    line: style.line,
    muted: style.muted,
    outline: style.boxStroke,
    accents: style.accents.map(({ name, role, fill, strong, ink, solid }) => ({
      name,
      role,
      fill,
      strong,
      ink,
      solid
    })),
    // Why the names: `color: 'panel-1'` (or 'panel-1-ink', 'panel-1-strong') draws in them.
    panels: (style.panels ?? []).map(({ name, fill, strong, ink }, index) => ({
      name: `panel-${index + 1}`,
      swatch: name,
      fill,
      strong,
      ink
    })),
    loss: { ...style.loss },
    good: { ...SEMANTIC_COLORS.good },
    bad: { ...SEMANTIC_COLORS.bad }
  }
}
