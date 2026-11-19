// Every colour a style itself offers (roles, accents, panels, loss, good and bad), so the colour
// lint never reads the preset's own accent as a borrowed library colour.
import { stylePalette } from './research-figures-style.mjs'

const HEX = /^#[0-9a-f]{3,8}$/i

/** The hex colours anywhere in a style's palette, lower case. */
export function styleOwnColors(style) {
  const found = new Set()
  const walk = (value) => {
    if (typeof value === 'string') {
      if (HEX.test(value)) {
        found.add(value.toLowerCase())
      }
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) {
        walk(item)
      }
    }
  }
  walk(stylePalette(style))
  return found
}
