import { HEX_COLOR_RE } from './color-validation'

export type AccentColorScheme = 'light' | 'dark'

/** The `--background` canvases from main.css that the readability guard measures against. */
export const ACCENT_CANVAS: Record<AccentColorScheme, string> = {
  light: '#f9f8f5',
  dark: '#101216'
}

/** Ink used on the accent when white reads worse; matches main.css's default ink pairs. */
const DARK_ON_ACCENT: Record<AccentColorScheme, string> = {
  light: '#161921',
  dark: '#101216'
}

// Why 3:1: WCAG non-text contrast, so selection, focus and the current page stay visible.
export const MIN_ACCENT_CONTRAST = 3

export const ACCENT_TOKEN_NAMES = [
  '--primary',
  '--primary-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--worktree-sidebar-ring',
  '--ring',
  '--sidebar-ring',
  '--ai-action-accent'
] as const

export type AccentColorTokens = Record<(typeof ACCENT_TOKEN_NAMES)[number], string>

type Rgb = readonly [number, number, number]

/** Returns lowercase `#rrggbb` for `#rgb`/`#rrggbb` input (hash optional), else null. */
export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!HEX_COLOR_RE.test(trimmed)) {
    return null
  }
  const digits = trimmed.replace('#', '').toLowerCase()
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits
  return `#${full}`
}

function parseHex(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ]
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance([r, g, b]: Rgb): number {
  const toLinear = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2 contrast ratio between two normalized `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(parseHex(a))
  const second = relativeLuminance(parseHex(b))
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function mixToward(color: string, target: string, amount: number): string {
  const [r, g, b] = parseHex(color)
  const [tr, tg, tb] = parseHex(target)
  const mix = (from: number, to: number): number => from + (to - from) * amount
  return toHex([mix(r, tr), mix(g, tg), mix(b, tb)])
}

/**
 * Darkens (light scheme) or lightens (dark scheme) the accent by the smallest
 * step that clears MIN_ACCENT_CONTRAST against that scheme's canvas.
 */
export function ensureAccentReadable(accent: string, scheme: AccentColorScheme): string {
  const canvas = ACCENT_CANVAS[scheme]
  if (contrastRatio(accent, canvas) >= MIN_ACCENT_CONTRAST) {
    return accent
  }
  const target = scheme === 'light' ? '#000000' : '#ffffff'
  // Why binary search: contrast only grows once the mix crosses the canvas luminance,
  // so "readable" is monotone in the mix amount and the minimal amount keeps the hue.
  let low = 0
  let high = 1
  for (let i = 0; i < 16; i += 1) {
    const middle = (low + high) / 2
    if (contrastRatio(mixToward(accent, target, middle), canvas) >= MIN_ACCENT_CONTRAST) {
      high = middle
    } else {
      low = middle
    }
  }
  return mixToward(accent, target, high)
}

/** White or the scheme's ink, whichever reads better on the accent. */
export function accentForeground(accent: string, scheme: AccentColorScheme): string {
  const dark = DARK_ON_ACCENT[scheme]
  return contrastRatio(accent, '#ffffff') >= contrastRatio(accent, dark) ? '#ffffff' : dark
}

export function resolveAccentColorTokens(
  accentColor: string,
  scheme: AccentColorScheme
): AccentColorTokens {
  const primary = ensureAccentReadable(accentColor, scheme)
  const foreground = accentForeground(primary, scheme)
  return {
    '--primary': primary,
    '--primary-foreground': foreground,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': foreground,
    '--worktree-sidebar-ring': primary,
    '--ring': primary,
    '--sidebar-ring': primary,
    '--ai-action-accent': primary
  }
}

function declarations(tokens: AccentColorTokens): string {
  return ACCENT_TOKEN_NAMES.map((name) => `  ${name}: ${tokens[name]};`).join('\n')
}

/**
 * CSS overriding main.css's `:root` / `.dark` accent tokens. The doubled
 * selectors outrank both, so system light/dark switches need no script.
 */
export function buildAccentColorStyleSheet(accentColor: string): string {
  return [
    `:root:root {\n${declarations(resolveAccentColorTokens(accentColor, 'light'))}\n}`,
    `:root.dark {\n${declarations(resolveAccentColorTokens(accentColor, 'dark'))}\n}`
  ].join('\n')
}
