import { describe, expect, it, vi } from 'vitest'
import { byId, pick, scene } from './research-figure-edit-fixture'
import { boxedLabels, labelAlignment, withLabelAlign } from './research-figure-label-align'

vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  })
}))

describe('label align in its box', () => {
  it('finds bound labels of selected boxes and the kit label of a box or one of its lines', () => {
    const elements = scene()
    const labels = boxedLabels(pick(elements, 'patch', 'ctx-label-0-0'), elements)
    expect(labels.map((label) => [label.kind, label.box.id, label.members.length])).toEqual([
      ['bound', 'patch', 1],
      ['free', 'ctx', 3]
    ])
    expect(boxedLabels(pick(elements, 'panel-title-0', 'a-ema'), elements)).toEqual([])
  })

  it('moves bound text to the edge Excalidraw would and records its alignment', () => {
    const elements = scene()
    const labels = boxedLabels(pick(elements, 'patch'), elements)
    expect(labelAlignment(labels)).toEqual({ h: 'center', v: 'middle' })
    const next = withLabelAlign(elements, labels, { h: 'left', v: 'top' })
    const label = byId(next, 'patch-label')
    expect(label).toMatchObject({ textAlign: 'left', verticalAlign: 'top', x: 175, y: 41 })
    const right = withLabelAlign(next, boxedLabels(pick(next, 'patch'), next), { h: 'right' })
    expect(byId(right, 'patch-label')).toMatchObject({ textAlign: 'right', x: 229, y: 41 })
  })

  it('lines a kit label up on an edge and moves its block as one', () => {
    const elements = scene()
    const labels = boxedLabels(pick(elements, 'ctx'), elements)
    expect(labelAlignment(labels)).toEqual({ h: 'center', v: null })
    const next = withLabelAlign(elements, labels, { h: 'left', v: 'top' })
    const lines = pick(next, 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    expect(lines.map((line) => line.x)).toEqual([388, 388, 388])
    expect(Math.min(...lines.map((line) => line.y))).toBe(46)
    expect(byId(next, 'ctx-label-2-0').y - byId(next, 'ctx-label-0-0').y).toBe(43)
    expect(labelAlignment(boxedLabels(pick(next, 'ctx'), next))).toEqual({ h: 'left', v: 'top' })
    const bottom = withLabelAlign(next, boxedLabels(pick(next, 'ctx'), next), { v: 'bottom' })
    const after = pick(bottom, 'ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0')
    expect(Math.max(...after.map((line) => line.y + line.height))).toBe(114)
    expect(after.map((line) => line.x)).toEqual([388, 388, 388])
  })
})
