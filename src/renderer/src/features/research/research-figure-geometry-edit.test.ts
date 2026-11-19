import { describe, expect, it, vi } from 'vitest'
import { byId, scene } from './research-figure-edit-fixture'
import { translate } from './research-figure-geometry-edit'

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

describe('moving a box', () => {
  it('carries the label typed into it (Excalidraw bound text), which is never selected', () => {
    const elements = scene()
    const next = translate(elements, new Set(['tok']), 6, 0)
    expect(byId(next, 'tok').x).toBe(566)
    expect(byId(next, 'tok-label').x).toBe(586)
    expect(byId(next, 'tok-frozen').x).toBe(653)
  })
})
