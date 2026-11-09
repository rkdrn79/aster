import { describe, expect, it } from 'vitest'
import { compareLayout } from './research-figure-compare'

describe('compareLayout', () => {
  it('puts a tall figure beside its reference at one width', () => {
    const layout = compareLayout({ width: 1136, height: 1728 }, { width: 600, height: 912 })
    expect(layout.stacked).toBe(false)
    expect(layout.width).toBe(1136)
    expect(layout.referenceHeight).toBeCloseTo(1726.7, 1)
    expect(layout.preview.left).toBe(1136 + 24)
    expect(layout.canvas).toEqual({ width: 1136 * 2 + 24, height: 32 + 1728 })
  })

  it('stacks a wide figure and caps each panel at 1200 px', () => {
    const layout = compareLayout({ width: 1458, height: 432 }, { width: 2916, height: 864 })
    expect(layout.stacked).toBe(true)
    expect(layout.width).toBe(1200)
    expect(layout.previewHeight).toBeCloseTo(355.6, 1)
    expect(layout.preview.left).toBe(0)
    expect(layout.preview.top).toBeCloseTo(32 + 355.6 + 24 + 32, 1)
  })
})
