import { describe, expect, it } from 'vitest'
import { findColorRegions } from './research-figure-reference-regions'

function canvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  const paint = (x: number, y: number, w: number, h: number, rgb: [number, number, number]) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        pixels.set([...rgb, 255], (row * width + col) * 4)
      }
    }
  }
  return { pixels, paint }
}

describe('findColorRegions', () => {
  it('finds filled boxes, outlines and lines, but not glyph-sized specks or the background', () => {
    const { pixels, paint } = canvas(120, 80)
    paint(10, 10, 40, 20, [191, 227, 245])
    paint(70, 10, 40, 20, [191, 227, 245])
    paint(10, 50, 40, 1, [30, 30, 30])
    paint(10, 69, 40, 1, [30, 30, 30])
    paint(10, 50, 1, 20, [30, 30, 30])
    paint(49, 50, 1, 20, [30, 30, 30])
    paint(70, 60, 4, 6, [30, 30, 30])
    const regions = findColorRegions(pixels, 120, 80)
    expect(regions).toHaveLength(3)
    const blue = regions.filter((region) => region.color === '#bfe3f5')
    expect(blue.map((region) => [region.x, region.y, region.width, region.height])).toEqual([
      [10, 10, 40, 20],
      [70, 10, 40, 20]
    ])
    expect(blue[0].fill).toBe(1)
    const outline = regions.find((region) => region.color === '#1e1e1e')
    expect(outline).toMatchObject({ x: 10, y: 50, width: 40, height: 20 })
    expect(outline?.fill).toBeLessThan(0.2)
  })

  it('treats a tinted background as background', () => {
    const { pixels, paint } = canvas(60, 60)
    paint(0, 0, 60, 60, [230, 230, 230])
    paint(10, 10, 30, 30, [224, 74, 74])
    const regions = findColorRegions(pixels, 60, 60)
    expect(regions.map((region) => region.color)).toEqual(['#e04a4a'])
  })
})
