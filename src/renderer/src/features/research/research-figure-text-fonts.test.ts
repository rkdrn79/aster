import { describe, expect, it } from 'vitest'
import { keepWrittenTextSize, textFont } from './research-figure-text-fonts'

const kit = { id: 'w', type: 'text', x: 24, y: 24, width: 36.44, height: 17.5 }
const written = [
  { ...kit, text: 'warm', fontSize: 14, fontFamily: 6 },
  { ...kit, id: 'p', text: 'paper', fontSize: 16, fontFamily: 9, width: 40 },
  { id: 'box', type: 'rectangle', x: 0, y: 0, width: 80, height: 40 }
]
/** What restore made of them, measured in a fallback while Nunito was still loading. */
const restored = [
  { ...written[0], x: 26.1, width: 32.68 },
  { ...written[1], width: 39.5 },
  written[2]
]

describe('keepWrittenTextSize', () => {
  it('keeps the writer’s size for text whose font is still loading, and says which fonts', () => {
    const ready = (font: string) => !font.includes('Nunito')
    const { elements, waiting } = keepWrittenTextSize(restored, written, ready)
    expect(elements[0]).toMatchObject({ x: 24, width: 36.44, text: 'warm' })
    expect(elements[1].width).toBe(39.5)
    expect(elements[2]).toBe(restored[2])
    expect([...waiting]).toEqual([['14px Nunito', new Set(['w'])]])
  })

  it('takes Excalidraw’s measure once the font is in, or when the file had no size', () => {
    expect(keepWrittenTextSize(restored, written, () => true).elements).toEqual(restored)
    const unsized = [{ ...written[0], width: 0 }]
    const { elements, waiting } = keepWrittenTextSize([restored[0]], unsized, () => false)
    expect(elements[0]).toBe(restored[0])
    expect(waiting.size).toBe(0)
  })

  it('names Excalidraw’s fonts as CSS does', () => {
    expect(textFont({ ...kit, fontSize: 16, fontFamily: 9 })).toBe('16px "Liberation Sans"')
    expect(textFont({ ...kit, fontSize: 16, fontFamily: 42 })).toBeNull()
  })
})
