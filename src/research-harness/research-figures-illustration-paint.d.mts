import type { FigureStyle } from './research-figures-style.mjs'

export type IllustrationLook = {
  outline: 'none' | 'tonal' | 'ink'
  shading: 'three-tone' | 'two-tone' | 'one-face' | 'flat'
  strokePt: number
  lift: number | 'white'
}
export type IllustrationPalette = {
  ramps: Record<string, string[]>
  ink: string
  white: string
}
export const TONE_L: number[]
export const TONES: number
export const MATERIALS: Record<string, { h: number; C: number }>
export const SKIN_TONES: Record<string, number>
export const ILLUSTRATION_ROLES: string[]
export const ILLUSTRATION_STYLES: Record<'flat' | 'tonal' | 'line' | 'mono', IllustrationLook>
export const DEFAULT_ILLUSTRATION_STYLE: string
export const SHADINGS: Record<string, number[]>
export function rampFor(h: number, C: number, options?: { tinted?: number }): string[]
export function secondHue(accentHue: number): number
export function illustrationPalette(
  style: FigureStyle | null | undefined,
  options?: { roles?: Record<string, string>; skin?: string }
): IllustrationPalette
export function shadedTone(tone: number, shade: number, shading?: string): number
export function paintHex(
  palette: IllustrationPalette,
  role: string,
  tone?: number,
  shade?: number,
  look?: Partial<IllustrationLook>
): string
export function outlineHex(
  palette: IllustrationPalette,
  role: string,
  tone: number,
  look: Partial<IllustrationLook>
): string
export function illustrationLook(svg: string): IllustrationLook & { name: string | null }
export function paintIllustrationSvg(
  svg: string,
  palette: IllustrationPalette,
  options?: { look?: string }
): string
export function svgColors(svg: string): string[]
