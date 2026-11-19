import type { LossStyle, LossTone } from './research-figures-palette.mjs'
import type { FigurePage } from './research-figures-model.mjs'

export type FigureStyleName =
  | 'graphite'
  | 'slate'
  | 'outline'
  | 'blue-amber'
  | 'sage-butter'
  | 'tonal'
  | 'print-mono'
  | 'illustrative'
  | 'categorical'
  | 'vision'
  | 'generative'
  | 'language'
  | 'robotics'
  | 'training'
  | 'systems'
export type FigureStyleAccent = {
  name: string
  role: string
  hue: number | null
  fill: string
  strong: string
  ink: string
  solid: string
  highlight: string | null
  /** In a world: the outline darker than the fill, and the lit and turned faces for 3D. */
  stroke: string | null
  light: string | null
  dark: string | null
}
export type FigureStyle = {
  name: FigureStyleName
  label: string
  block: string
  strong: string
  /** A gray between strong and muted that shows on white (the `mid` colour). */
  mid: string
  panel: string
  boxStroke: string
  ink: string
  line: string
  muted: string
  radius: number
  accent: string | null
  accentName: string | null
  accentColor: { fill: string; stroke: string }
  accents: FigureStyleAccent[]
  loss: LossStyle & { clash: boolean }
  outlineWidth: number | null
  rules: string[]
  /** Role names (input, output, data, model, frozen, ours, a–d) to the colour each takes. */
  roles: Record<string, string>
  /** A world palette's mood and the papers it suits; null for the quiet presets. */
  world: { mood: string; fits: string[]; roles: Record<string, string> } | null
  /** Whether boxes take an outline darker than their fill, in the fill's hue (the worlds). */
  pairs: boolean
  /** Label and small text sizes in scene units (8 pt and 7 pt). */
  textSize: number
  smallSize: number
  /** Excalidraw font family: 9 Liberation Sans, 6 Nunito (illustrative), 20/21 the paper look. */
  fontFamily: number
  /** 'paper' in the paper look (research-figures-paper), with its face 'cm' | 'times'. */
  look?: 'paper'
  paperFont?: string
  titleSize: number
  calloutSize: number
  panelRadius: number | null
  panelPad: number
  /** The illustrative style's panel tints, with an ink for their phrases. */
  panels: { name: string; fill: string; ink: string }[]
}
export const FIGURE_LINE_WIDTH: number
export const FIGURE_HEAD_SIZE: number
export const DEFAULT_FIGURE_STYLE: FigureStyleName
export const FIGURE_STYLES: Record<
  FigureStyleName,
  Pick<
    FigureStyle,
    | 'label'
    | 'block'
    | 'strong'
    | 'panel'
    | 'boxStroke'
    | 'ink'
    | 'line'
    | 'muted'
    | 'radius'
    | 'accent'
  >
>
export const FIGURE_ACCENTS: Record<
  string,
  { fill: string; stroke: string; strong: string; solid: string }
>
export const LOSS_COLOR: LossStyle
export { LOSS_TONES, lossStyle } from './research-figures-palette.mjs'
export function lossColors(style: FigureStyle, tone?: LossTone): LossStyle
export const ARROW_ROLES: Record<
  'data' | 'main' | 'side' | 'aux' | 'loss',
  { color: string; strokeWidth: number; headSize: number; dashed?: boolean }
>
export function figureStyle(
  name?: string | null,
  accent?: string | null,
  options?: { panels?: string[] | null; look?: 'paper' | null; font?: string | null }
): FigureStyle
export function pageStyle(page: FigurePage | null | undefined): FigureStyle
export function styleColor(
  style: FigureStyle,
  name: string | undefined
): { fill: string; stroke: string; ink: string; solid?: string; role?: 'loss' }
export function inkColor(
  style: FigureStyle,
  name?: string | null,
  fallback?: 'ink' | 'line'
): string
export function paintValue(
  style: FigureStyle,
  value: string | undefined,
  part: 'fill' | 'stroke' | 'ink'
): string | undefined
export function colorHue(hex: string): number | null
export function isLossRed(hex: string): boolean
export function styleNeutrals(style: FigureStyle): Set<string>
export type FigureSwatch = {
  name: string
  label: string
  fill: string
  stroke: string
  ink: string
}
export function figureSwatches(style: FigureStyle): FigureSwatch[]
export function stylePalette(style: FigureStyle): {
  style: string
  accent: string | null
  block: string
  strong: string
  mid: string
  panel: string
  white: string
  ink: string
  line: string
  muted: string
  outline: string
  accents: {
    name: string
    role: string
    fill: string
    strong: string
    ink: string
    solid: string
    stroke?: string
    light?: string
    dark?: string
  }[]
  roles: Record<string, string>
  loss: FigureStyle['loss']
  good: SemanticColor
  bad: SemanticColor
}
export type SemanticColor = { fill: string; strong: string; ink: string; solid: string }
export const SEMANTIC_COLORS: { good: SemanticColor; bad: SemanticColor }
export function isSemanticColor(hex: unknown): boolean
export function isLossRole(role: unknown): boolean
export function hasRedLoss(
  elements: readonly { customData?: Record<string, unknown> | null }[]
): boolean
