import { describe, expect, it, vi } from 'vitest'
import { byId, fontPt, pick, scene } from './research-figure-edit-fixture'
import { copyFigureStyle, describeStyleCopy, pasteFigureStyle } from './research-figure-paint-style'

vi.mock('@excalidraw/excalidraw', () => ({
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

const ctxGroup = ['ctx-label-0-0', 'ctx-label-2-0', 'ctx', 'ctx-label-1-0']

describe('role-aware paste style', () => {
  it('copies the box under its label lines, whatever comes first in the selection', () => {
    const elements = scene().map((element) =>
      element.id === 'ctx' ? { ...element, customData: { asterRole: 'emphasis' } } : element
    )
    const copy = copyFigureStyle(pick(elements, ...ctxGroup), elements)
    expect(copy?.shape).toMatchObject({
      backgroundColor: '#c5def8',
      marks: { asterRole: 'emphasis' }
    })
    expect(copy?.text).toEqual({ fontSize: 16, strokeColor: '#1e1e1e' })
    expect(copy?.line).toBeNull()
    expect(copy && describeStyleCopy(copy)).toBe('box fill and outline, label 8 pt')
  })

  it('paints boxes with the box look and labels with the label type, never a fill', () => {
    const elements = scene()
    const copy = copyFigureStyle(pick(elements, ...ctxGroup), elements)
    const shrunk = elements.map((element) =>
      element.id === 'patch-label' ? { ...element, fontSize: 20, width: 70 } : element
    )
    if (!copy) {
      throw new Error('no copy')
    }
    const next = pasteFigureStyle(shrunk, pick(shrunk, 'patch', 'a-ema'), copy)
    expect(byId(next, 'patch').backgroundColor).toBe('#c5def8')
    expect(fontPt(byId(next, 'patch-label'))).toBe(8)
    expect(byId(next, 'patch-label').backgroundColor).toBe('transparent')
    expect(byId(next, 'a-ema')).toBe(byId(shrunk, 'a-ema'))
  })

  it('takes a role mark along and drops one the source does not have', () => {
    const elements = scene().map((element) =>
      element.id === 'mask' ? { ...element, customData: { asterRole: 'frozen' } } : element
    )
    const copy = copyFigureStyle(pick(elements, 'patch'), elements)
    if (!copy) {
      throw new Error('no copy')
    }
    const next = pasteFigureStyle(elements, pick(elements, 'mask'), copy)
    expect(byId(next, 'mask')).toMatchObject({ backgroundColor: '#e9e9e9', customData: {} })
  })

  it('copies a line with its ends and pastes it onto lines only', () => {
    const elements = scene().map((element) =>
      element.id === 'a-ema'
        ? { ...element, startArrowhead: null, endArrowhead: 'bar' as const }
        : element
    )
    const copy = copyFigureStyle(pick(elements, 'a-ema'), elements)
    expect(copy?.line).toMatchObject({
      strokeStyle: 'dashed',
      strokeWidth: 1.5,
      endArrowhead: 'bar'
    })
    expect(copy?.shape).toBeNull()
  })
})
