import { describe, expect, it, vi } from 'vitest'
import { pick, scene } from './research-figure-edit-fixture'
import { selectionUnits } from './research-figure-geometry-edit'
import { dragSpacing, gapHandles, spacingNeighbours } from './research-figure-spacing'

vi.mock('@excalidraw/excalidraw', () => ({
  getCommonBounds: (elements: { x: number; y: number; width: number; height: number }[]) => [
    Math.min(...elements.map((e) => e.x)),
    Math.min(...elements.map((e) => e.y)),
    Math.max(...elements.map((e) => e.x + e.width)),
    Math.max(...elements.map((e) => e.y + e.height))
  ]
}))

const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height })

describe('spacing you can see', () => {
  it('measures to the nearest box on each side that overlaps across', () => {
    const marks = dragSpacing(box(200, 100), [box(0, 110), box(400, 300), box(210, 0, 50, 60)])
    expect(marks.map((mark) => [mark.axis, mark.from, mark.to, mark.gap, mark.equal])).toEqual([
      ['x', 100, 200, 100, false],
      ['y', 60, 100, 40, false]
    ])
    expect(marks[0].at).toBe(125)
  })

  it('marks equal gaps: both sides alike, or a neighbour spaced the same way', () => {
    const between = dragSpacing(box(200, 0), [box(80, 0), box(320, 0)])
    expect(between.map((mark) => [mark.gap, mark.equal])).toEqual([
      [20, true],
      [20, true]
    ])
    const column = dragSpacing(box(0, 120), [box(0, 0), box(0, 60)])
    expect(column.map((mark) => [mark.from, mark.to, mark.gap, mark.equal])).toEqual([
      [100, 120, 20, true],
      [40, 60, 20, true]
    ])
  })

  it('measures against boxes as units, leaving out the panel, the page and badges', () => {
    const elements = scene().map((element) =>
      element.id === 'panel' ? { ...element, customData: { asterPanel: true } } : element
    )
    const boxes = spacingNeighbours(elements, new Set(['patch']))
    expect(boxes).toContainEqual({ x: 380, y: 40, width: 112, height: 80 })
    expect(boxes).not.toContainEqual({ x: 370, y: 9, width: 304, height: 122 })
    expect(boxes.some((entry) => entry.width === 18)).toBe(false)
  })

  it('puts a handle in each gap of three evenly spaced units', () => {
    const elements = scene().map((element) =>
      element.id === 'mask' ? { ...element, y: 188 } : element
    )
    const units = selectionUnits(pick(elements, 'patch', 'embed', 'mask'), elements)
    expect(gapHandles(units)).toEqual([
      { index: 0, axis: 'y', x: 234, y: 96, gap: 32 },
      { index: 1, axis: 'y', x: 231, y: 172, gap: 32 }
    ])
    expect(gapHandles(units.slice(0, 2))).toEqual([])
  })
})
