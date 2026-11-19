import {
  ACCENT_SWATCHES,
  accentFor,
  type DerivedAccent
} from '../../../../research-harness/research-figures-palette.mjs'

/** A typed colour as `#rrggbb`, or null: `#abc`, `abc`, `#aabbcc` and `aabbcc` all work. */
export function parseAccentHex(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/.test(value)) {
    return `#${value}`
  }
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${[...value].map((digit) => digit + digit).join('')}`
  }
  return null
}

export type AccentCheck = DerivedAccent & {
  name: string
  /** What the person should know about the pick, in plain words. */
  notes: string[]
}

/**
 * What the colour study's rule makes of a pick (a swatch name or `#hex`), and what the person
 * should know: a near-gray pick, a hue too near red.
 */
export function checkAccent(pick: string, figureHasRedLoss: boolean): AccentCheck | null {
  const derived = accentFor(pick)
  if (!derived) {
    return null
  }
  const notes = [
    ...(derived.neutral ? ['Nearly gray, so the figure takes no hue.'] : []),
    ...(derived.lossClash
      ? [
          figureHasRedLoss
            ? 'Close to the loss red: this figure’s red loss turns ink.'
            : 'Close to red: a red loss would be drawn in ink.'
        ]
      : [])
  ]
  return { ...derived, notes }
}

/** The swatches the picker offers, in the colour study's order; violet last, never a default. */
export const ACCENT_NAMES = Object.keys(ACCENT_SWATCHES)
