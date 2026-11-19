import { describe, expect, it, vi } from 'vitest'
import { byId, centreX, fontPt, pick, scene } from './research-figure-edit-fixture'
import {
  figureTextPt,
  figureTextTargets,
  withFigureTextPt,
  withFigureTextStep
} from './research-figure-text-size'

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

describe('text size in points', () => {
  it('reaches bound labels of selected boxes and every line of a grouped label', () => {
    const elements = scene()
    const targets = figureTextTargets(pick(elements, 'patch', 'ctx-label-0-0'), elements)
    expect(targets.map((element) => element.id).toSorted()).toEqual([
      'ctx-label-0-0',
      'ctx-label-1-0',
      'patch-label'
    ])
    expect(figureTextPt(targets)).toBe(8)
    expect(
      figureTextPt(figureTextTargets(pick(elements, 'patch', 'panel-title-0'), elements))
    ).toBeNull()
  })

  it('sets 9 pt, keeps a grouped label centred, and scales its math with it', () => {
    const elements = scene()
    const targets = figureTextTargets(
      pick(elements, 'ctx', 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0'),
      elements
    )
    const before = byId(elements, 'ctx-label-2-0')
    const next = withFigureTextPt(elements, targets, 9)
    expect(fontPt(byId(next, 'ctx-label-0-0'))).toBe(9)
    expect(fontPt(byId(next, 'ctx-label-1-0'))).toBe(9)
    const math = byId(next, 'ctx-label-2-0')
    expect(math.height).toBeCloseTo(before.height * (9 / 8), 5)
    expect(math.customData?.asterMath).toMatchObject({ tex: 'f_\\theta', size: 18 })
    const lines = pick(next, 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    const left = Math.min(...lines.map((line) => line.x))
    const right = Math.max(...lines.map((line) => line.x + line.width))
    expect((left + right) / 2).toBeCloseTo((407 + 465) / 2, 5)
  })

  it('grows a box around its centre when its bound label outgrows it', () => {
    const elements = scene()
    const targets = figureTextTargets(pick(elements, 'tok'), elements)
    const next = withFigureTextPt(elements, targets, 16)
    const box = byId(next, 'tok')
    const label = byId(next, 'tok-label')
    expect(label.width).toBe(128)
    expect(box.width).toBe(138)
    expect(centreX(box)).toBe(612)
    expect(centreX(label)).toBe(612)
  })

  it('keeps a panel title in its corner and steps by half points, keeping proportions', () => {
    const elements = scene()
    const targets = figureTextTargets(pick(elements, 'panel', 'panel-title-0', 'patch'), elements)
    const next = withFigureTextStep(elements, targets, 0.5)
    const title = byId(next, 'panel-title-0')
    expect([title.x, title.y]).toEqual([378, 13])
    expect(fontPt(title)).toBe(7.5)
    expect(fontPt(byId(next, 'patch-label'))).toBe(8.5)
  })
})
