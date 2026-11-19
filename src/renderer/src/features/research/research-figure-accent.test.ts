import { describe, expect, it } from 'vitest'
import { ACCENT_NAMES, checkAccent, parseAccentHex } from './research-figure-accent'

describe('parseAccentHex', () => {
  it('reads six or three digits, with or without the hash', () => {
    expect(parseAccentHex(' #2F7D6D ')).toBe('#2f7d6d')
    expect(parseAccentHex('2f7d6d')).toBe('#2f7d6d')
    expect(parseAccentHex('#abc')).toBe('#aabbcc')
    expect(parseAccentHex('teal')).toBeNull()
    expect(parseAccentHex('#12345')).toBeNull()
  })
})

describe('checkAccent', () => {
  it('says nothing about an ordinary pick', () => {
    expect(checkAccent('teal', false)?.notes).toEqual([])
    expect(checkAccent('blue', false)?.notes).toEqual([])
  })

  it('warns when a pick sits near the loss red, more firmly when the figure has a red loss', () => {
    expect(checkAccent('#e84d3d', false)?.notes).toContain(
      'Close to red: a red loss would be drawn in ink.'
    )
    expect(checkAccent('clay', true)?.notes).toContain(
      'Close to the loss red: this figure’s red loss turns ink.'
    )
  })

  it('treats a near-gray pick as no hue', () => {
    const gray = checkAccent('#888888', false)
    expect(gray?.neutral).toBe(true)
    expect(gray?.notes[0]).toBe('Nearly gray, so the figure takes no hue.')
    expect(checkAccent('not a colour', false)).toBeNull()
  })

  it('offers violet but never first', () => {
    expect(ACCENT_NAMES[0]).toBe('blue')
    expect(ACCENT_NAMES.at(-1)).toBe('violet')
  })
})
