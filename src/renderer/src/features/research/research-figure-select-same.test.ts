import { describe, expect, it, vi } from 'vitest'
import { figureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { pick, scene } from './research-figure-edit-fixture'
import { canSelectSame, selectedKinds, selectSame } from './research-figure-select-same'

const style = figureStyle('neutral', 'blue')

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

describe('select same', () => {
  it('finds every box with the same badge, whole', () => {
    const elements = scene()
    const result = selectSame('badge', pick(elements, 'mask'), elements, style)
    expect(Object.keys(result.selectedElementIds).toSorted()).toEqual(['mask', 'tok'])
    expect(result.count).toBe(2)
  })

  it('selects a grouped box with all its lines and its group', () => {
    const elements = scene()
    const result = selectSame('kind', pick(elements, 'patch'), elements, style)
    expect(result.selectedGroupIds).toEqual({ 'ctx-shape': true, 'panel-panel': true })
    expect(result.selectedElementIds['ctx-label-2-0']).toBe(true)
    expect(result.selectedElementIds['tok-frozen']).toBeUndefined()
  })

  it('matches fills within the same kind, and text sizes across kinds', () => {
    const elements = scene()
    const fills = selectSame('fill', pick(elements, 'patch'), elements, style)
    expect(Object.keys(fills.selectedElementIds).toSorted()).toEqual(['embed', 'patch'])
    const small = selectSame('text', pick(elements, 'panel', 'panel-title-0'), elements, style)
    expect(Object.keys(small.selectedGroupIds)).toEqual(['panel-panel'])
    expect(canSelectSame('badge', pick(elements, 'patch'), elements, style)).toBe(false)
    // A box with its label lines and math counts as a box.
    const ctx = pick(elements, 'ctx', 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    expect(selectedKinds(ctx, elements)).toEqual(['shape'])
  })
})
