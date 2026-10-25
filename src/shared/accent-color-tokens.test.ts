import { describe, expect, it } from 'vitest'
import {
  ACCENT_CANVAS,
  MIN_ACCENT_CONTRAST,
  accentForeground,
  buildAccentColorStyleSheet,
  contrastRatio,
  ensureAccentReadable,
  normalizeAccentColor,
  resolveAccentColorTokens
} from './accent-color-tokens'

describe('normalizeAccentColor', () => {
  it('normalizes #rgb and #rrggbb to lowercase #rrggbb', () => {
    expect(normalizeAccentColor('#ABC')).toBe('#aabbcc')
    expect(normalizeAccentColor(' 0F766E ')).toBe('#0f766e')
  })

  it('rejects anything that is not a hex color', () => {
    for (const value of ['', '#12', '#12345', 'teal', 'rgb(0 0 0)', null, undefined, 42]) {
      expect(normalizeAccentColor(value)).toBeNull()
    }
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG reference points', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})

describe('ensureAccentReadable', () => {
  it('keeps colors that already clear 3:1 on the canvas', () => {
    expect(ensureAccentReadable('#0f766e', 'light')).toBe('#0f766e')
    expect(ensureAccentReadable('#0f766e', 'dark')).toBe('#0f766e')
  })

  it('darkens pale accents in light mode just enough to clear 3:1', () => {
    const guarded = ensureAccentReadable('#ffff00', 'light')
    const ratio = contrastRatio(guarded, ACCENT_CANVAS.light)
    expect(ratio).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST)
    expect(ratio).toBeLessThan(MIN_ACCENT_CONTRAST + 0.1)
    // Mixing toward black keeps the hue: red and green stay equal, blue stays zero.
    expect(guarded.slice(1, 3)).toBe(guarded.slice(3, 5))
    expect(guarded.slice(5, 7)).toBe('00')
  })

  it('lightens dark accents in dark mode so black stays usable', () => {
    const guarded = ensureAccentReadable('#000000', 'dark')
    expect(contrastRatio(guarded, ACCENT_CANVAS.dark)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST)
    expect(ensureAccentReadable('#000000', 'light')).toBe('#000000')
  })
})

describe('accentForeground', () => {
  it('picks white on deep accents and ink on bright ones', () => {
    expect(accentForeground('#0f766e', 'light')).toBe('#ffffff')
    expect(accentForeground('#ffff00', 'dark')).toBe('#101216')
    expect(accentForeground('#c2620c', 'light')).toBe('#161921')
  })
})

describe('buildAccentColorStyleSheet', () => {
  it('emits light and dark overrides that outrank main.css and spare the security tokens', () => {
    const css = buildAccentColorStyleSheet('#ffffff')
    const light = resolveAccentColorTokens('#ffffff', 'light')
    expect(css).toContain(`:root:root {\n  --primary: ${light['--primary']};`)
    expect(css).toContain(':root.dark {\n  --primary: #ffffff;\n  --primary-foreground: #101216;')
    expect(css).not.toContain('--orca-security')
  })
})
