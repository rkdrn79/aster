// The diagram style as data for Python: aster_plot.py embeds this JSON, so a plot and a diagram
// of the same preset and accent share their colours, font sizes and page widths. Pure.
import { DOUBLE_COLUMN_MAX_HEIGHT_IN, FIGURE_SIZES } from './research-figures-model.mjs'
import { PAGE_VENUES, PAGE_WIDTHS } from './research-figures-pages.mjs'
import {
  ACCENT_ALIASES,
  ACCENT_SWATCHES,
  PALETTE_PRESETS,
  PRESET_ALIASES,
  TINT_C,
  TINT_L
} from './research-figures-palette.mjs'
import { worldMaps, worldSeries } from './research-figures-palette-worlds.mjs'
import {
  DEFAULT_FIGURE_STYLE,
  FIGURE_ACCENTS,
  FIGURE_STYLES,
  SEMANTIC_COLORS,
  figureStyle,
  stylePalette
} from './research-figures-style.mjs'

/** Bumped when the JSON's shape changes; aster_plot.py reports it in each manifest. */
export const PLOT_STYLE_VERSION = 2
/** The PNG preview's dpi: the canvas renders its preview at the same (FIGURE_PREVIEW_DPI). */
export const PLOT_PREVIEW_DPI = 216
/** Text sizes in pt, as on the canvas: 8 pt labels, 7 pt ticks and notes, nothing under 6. */
export const PLOT_FONTS = { label: 8, small: 7, min: 6 }
// Why: the plot default height when only a width is named; the canvas has no 1.5-column default.
const ONE_HALF_HEIGHT_IN = 2.2

const ACCENT_PARTS = ({ fill, strong, ink, solid }) => ({ fill, strong, ink, solid })
const WORLD_PARTS = ({ name, role, fill, strong, ink, solid, stroke, light, dark }) => ({
  name,
  role,
  fill,
  strong,
  ink,
  solid,
  stroke,
  light,
  dark
})

/**
 * A world's plot colours: the series (ours, the given, the machinery, outputs), its colour maps,
 * and its accents redrawn for each swatch (a pick moves a near hue aside, so every accent may
 * change).
 */
function worldData(id) {
  const preset = PALETTE_PRESETS[id]
  return {
    mood: preset.world.mood,
    fits: preset.world.fits,
    series: worldSeries(preset.accents),
    maps: worldMaps(preset),
    withAccents: Object.fromEntries(
      Object.keys(ACCENT_SWATCHES).map((name) => [
        name,
        figureStyle(id, name).accents.map(WORLD_PARTS)
      ])
    )
  }
}
/** One preset as aster_plot's Style reads it: neutrals, accents, and each swatch as its accent. */
function presetData(id) {
  const style = figureStyle(id)
  const palette = stylePalette(style)
  const withAccent = Object.fromEntries(
    Object.keys(ACCENT_SWATCHES).map((name) => [
      name,
      ACCENT_PARTS(figureStyle(id, name).accents[0])
    ])
  )
  return {
    label: FIGURE_STYLES[id].label,
    mono: Boolean(PALETTE_PRESETS[id].mono),
    accentName: style.accentName ?? null,
    ink: palette.ink,
    line: palette.line,
    muted: palette.muted,
    mutedText: style.mutedText,
    block: palette.block,
    strong: palette.strong,
    mid: palette.mid,
    panel: palette.panel,
    accents: style.world
      ? style.accents.map(WORLD_PARTS)
      : palette.accents.map(({ name, role, fill, strong, ink, solid }) => ({
          name,
          role,
          fill,
          strong,
          ink,
          solid
        })),
    roles: style.roles,
    withAccent,
    world: style.world ? worldData(id) : null
  }
}

/** The JSON `figures plot style --json` prints and aster_plot.py embeds. */
export function plotStyleData() {
  const venues = Object.fromEntries(
    PAGE_VENUES.map(({ id, label, single, double }) => [id, { label, single, double }])
  )
  const sizes = Object.fromEntries(
    PAGE_WIDTHS.map(({ id, label, widthIn }) => [
      id,
      { label, widthIn, heightIn: FIGURE_SIZES[id]?.heightIn ?? ONE_HALF_HEIGHT_IN }
    ])
  )
  return {
    version: PLOT_STYLE_VERSION,
    defaultPreset: DEFAULT_FIGURE_STYLE,
    aliases: PRESET_ALIASES,
    accentAliases: ACCENT_ALIASES,
    presets: Object.fromEntries(Object.keys(FIGURE_STYLES).map((id) => [id, presetData(id)])),
    swatches: Object.fromEntries(
      Object.entries(FIGURE_ACCENTS).map(([name, accent]) => [
        name,
        { fill: accent.fill, strong: accent.strong, ink: accent.stroke, solid: accent.solid }
      ])
    ),
    // Why this order: other methods take the swatches farthest from a blue accent first.
    swatchOrder: ['clay', 'teal', 'amber', 'green', 'violet', 'blue', 'slate'],
    semantic: SEMANTIC_COLORS,
    accentRule: { tintL: TINT_L, tintC: TINT_C },
    sizes,
    venues,
    doubleMaxHeightIn: DOUBLE_COLUMN_MAX_HEIGHT_IN,
    fonts: PLOT_FONTS,
    previewDpi: PLOT_PREVIEW_DPI
  }
}
