import type { LossStyle, LossTone } from './research-figures-palette.mjs'

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
export type FigureStyleAccent = {
  name: string
  role: string
  hue: number | null
  fill: string
  strong: string
  ink: string
  solid: string
  highlight: string | null
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
  /** Label and small text sizes in scene units (8 pt and 7 pt). */
  textSize: number
  smallSize: number
  /** Excalidraw font family: 9 Liberation Sans, 6 Nunito (illustrative). */
  fontFamily: number
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
  options?: { panels?: string[] | null }
): FigureStyle
export function styleColor(
  style: FigureStyle,
  name: string | undefined
): { fill: string; stroke: string; ink: string; role?: 'loss' }
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
  }[]
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
