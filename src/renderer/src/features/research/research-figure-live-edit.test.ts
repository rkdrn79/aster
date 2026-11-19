import { describe, expect, it, vi } from 'vitest'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { byId, scene } from './research-figure-edit-fixture'
import { startLiveEdit } from './research-figure-live-edit'

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER', EVENTUALLY: 'EVENTUALLY' },
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  })
}))

/** A stand-in canvas: it keeps the scene and the capture of each update. */
function canvas() {
  let elements: readonly ExcalidrawElement[] = scene()
  const captures: string[] = []
  return {
    captures,
    current: () => elements,
    getSceneElementsIncludingDeleted: () => elements,
    updateScene: (update: {
      elements?: readonly ExcalidrawElement[] | null
      captureUpdate?: string
    }) => {
      elements = update.elements ?? elements
      captures.push(update.captureUpdate ?? '')
    }
  }
}

const moveMask = (dy: number) => (elements: readonly ExcalidrawElement[]) =>
  elements.map((element) =>
    element.id === 'mask' ? { ...element, y: 214 + dy, version: element.version + 1 } : element
  )

describe('a live handle drag', () => {
  it('moves unrecorded, then goes back and records the whole move as one step', () => {
    const api = canvas()
    const live = startLiveEdit(api, (elements) => [...elements], new Set(['mask']))
    live.preview(moveMask(10))
    live.preview(moveMask(20))
    expect(byId(api.current(), 'mask').y).toBe(234)
    live.finish(moveMask(30))
    expect(api.captures).toEqual(['NEVER', 'NEVER', 'NEVER', 'IMMEDIATELY'])
    expect(byId(api.current(), 'mask').y).toBe(244)
    // Why: the restore never hands Excalidraw an older version than it has seen.
    expect(byId(api.current(), 'mask').version).toBeGreaterThan(3)
  })

  it('puts everything back when the drag is cancelled', () => {
    const api = canvas()
    const live = startLiveEdit(api, (elements) => [...elements], new Set(['mask']))
    live.preview(moveMask(10))
    live.cancel()
    expect(byId(api.current(), 'mask').y).toBe(214)
    expect(api.captures).toEqual(['NEVER', 'NEVER'])
  })
})
