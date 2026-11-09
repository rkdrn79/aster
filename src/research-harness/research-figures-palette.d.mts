export type Oklch = { L: number; C: number; h: number }
export type PaletteAccent = {
  name: string
  role: string
  hue: number | null
  tint: string
  strong: string
  shade: string
  solid: string
  highlight?: string
  pick?: string
}
export type PalettePreset = {
  label: string
  neutrals: {
    panel: string
    block: string
    strong: string
    text: string
    line: string
    muted: string
  }
  outline: string | null
  outlineWidth?: number
  radius: number
  tonal?: boolean
  illustrative?: boolean
  mono?: boolean
  accents: PaletteAccent[]
  rules: string[]
}
export type DerivedAccent = {
  hue: number
  tint: string
  strong: string
  shade: string
  solid: string
  /** The pick is nearly gray (C < 0.03): the figure then has no hue. */
  neutral: boolean
  /** Within 35° of the loss red: a red loss (`tone: 'red'`) stays ink. */
  lossClash: boolean
}
export type PresetColors = {
  name: string
  label: string
  panel: string
  block: string
  strong: string
  text: string
  line: string
  muted: string
  outline: string | null
  outlineWidth: number | null
  radius: number
  accents: PaletteAccent[]
  accentName: string | null
  loss: LossStyle & { clash: boolean }
  rules: string[]
}
export type LossTone = 'ink' | 'accent' | 'red'
/** A loss's colours: its text, optional frame (`stroke`), the rings round what it compares, links. */
export type LossStyle = {
  tone: LossTone
  fill: string
  text: string
  stroke: string
  ring: string
  link: string
}
export const LOSS_RED: string
export const LOSS_HUE: number
export const LOSS_TONES: LossTone[]
export function lossStyle(
  tone?: LossTone,
  options?: { neutrals?: { text: string; line: string; muted: string }; accent?: string }
): LossStyle
export const PALETTE_PRESETS: Record<string, PalettePreset>
export const PRESET_ALIASES: Record<string, string>
export const DEFAULT_PRESET: string
export const ACCENT_SWATCHES: Record<string, { hue: number; chroma?: number }>
export const ACCENT_ALIASES: Record<string, string>
export function hexChannels(hex: string): [number, number, number] | null
export function hexToOklch(hex: string): Oklch | null
export function oklchToHex(color: Oklch): string
export function luminance(hex: string): number
export function contrast(first: string, second: string): number
export function hueDistance(first: number, second: number): number
export function colorClass(hex: string): ({ kind: 'hue' | 'tinted' | 'neutral' } & Oklch) | null
export function deriveAccent(
  pick: string | number,
  options?: { block?: string; chroma?: number }
): DerivedAccent
export function accentFor(name: string, block?: string): ({ name: string } & DerivedAccent) | null
export function tonalNeutrals(hue: number): { panel: string; block: string; strong: string }
export function presetColors(presetName: string, pick?: string | null): PresetColors
export const PANEL_SWATCHES: Record<string, { hue: number; L: number; C: number }>
export function panelColors(names?: string[]): { name: string; fill: string; ink: string }[]
