import { describe, expect, it, vi } from 'vitest'
import {
  alignUnits,
  distributeUnits,
  setUnitsGap,
  uniformGap,
  unitsBox
} from './research-figure-align'
import { byId, centreX, pick, PT, scene } from './research-figure-edit-fixture'
import { selectionUnits } from './research-figure-geometry-edit'

// Why a stand-in: Excalidraw's bundle does not load under Node; these are the three helpers the
// editing modules use, with Excalidraw's semantics for plain boxes.
vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER', EVENTUALLY: 'EVENTUALLY' },
  convertToExcalidrawElements: (elements: unknown[]) => elements,
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  }),
  getCommonBounds: (elements: { x: number; y: number; width: number; height: number }[]) => [
    Math.min(...elements.map((e) => e.x)),
    Math.min(...elements.map((e) => e.y)),
    Math.max(...elements.map((e) => e.x + e.width)),
    Math.max(...elements.map((e) => e.y + e.height))
  ]
}))

describe('align and spacing', () => {
  const elements = scene()
  const units = selectionUnits(pick(elements, 'patch', 'embed', 'mask'), elements)

  it('lines up centres and moves bound labels and badges with their boxes', () => {
    const box = unitsBox(units) ?? { x: 0, y: 0, width: 0, height: 0 }
    expect(box).toEqual({ x: 164, y: 36, width: 134, height: 222 })
    const next = alignUnits(elements, units, 'center', box)
    const centres = ['patch', 'embed', 'mask'].map((id) => centreX(byId(next, id)))
    expect(new Set(centres)).toEqual(new Set([231]))
    // The bound label moves with its box; the badge follows when the scene settles.
    expect(centreX(byId(next, 'mask-label'))).toBe(231)
    expect(byId(next, 'mask-frozen').x).toBe(273)
  })

  it('aligns one unit to the page', () => {
    const one = selectionUnits(pick(elements, 'tok'), elements)
    const next = alignUnits(elements, one, 'center', { x: 0, y: 0, width: 972, height: 360 })
    expect(centreX(byId(next, 'tok'))).toBe(486)
  })

  it('evens the gaps with the ends fixed, and reports the gap once even', () => {
    expect(uniformGap(units)).toEqual({ axis: 'y', gap: null })
    const next = distributeUnits(elements, units, 'y')
    const after = selectionUnits(pick(next, 'patch', 'embed', 'mask'), next)
    const { gap } = uniformGap(after)
    expect(gap).toBeCloseTo(45, 5)
    expect(byId(next, 'patch').y).toBe(36)
    expect(byId(next, 'mask').y).toBe(214)
  })

  it('sets every gap to a typed value', () => {
    const next = setUnitsGap(elements, units, 12 * PT)
    const after = selectionUnits(pick(next, 'patch', 'embed', 'mask'), next)
    expect(uniformGap(after).gap).toBe(24)
  })
})
