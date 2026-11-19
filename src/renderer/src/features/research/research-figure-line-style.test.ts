import { describe, expect, it, vi } from 'vitest'
import { byId, pick, scene } from './research-figure-edit-fixture'
import {
  lineEndOf,
  lineWidthPt,
  withLineEnd,
  withLineWidth,
  withPaint
} from './research-figure-line-style'

vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  })
}))

const withHeads = () =>
  scene().map((element) =>
    element.type === 'arrow'
      ? { ...element, startArrowhead: null, endArrowhead: 'arrow' as const }
      : element
  )

describe('line ends, width and paint', () => {
  it('reads and sets arrowheads per side', () => {
    const elements = withHeads()
    const arrow = pick(elements, 'a-ema')
    expect(lineEndOf(arrow, 'start')).toBe('none')
    expect(lineEndOf(arrow, 'end')).toBe('open')
    const next = withLineEnd(elements, new Set(['a-ema', 'patch']), 'end', 'bar')
    expect(byId(next, 'a-ema')).toMatchObject({ endArrowhead: 'bar', startArrowhead: null })
    expect(byId(next, 'patch')).toBe(byId(elements, 'patch'))
    const triangle = withLineEnd(next, new Set(['a-ema']), 'start', 'triangle')
    expect(lineEndOf(pick(triangle, 'a-ema'), 'start')).toBe('triangle')
  })

  it('sets width in points and drops a line role that drew another width', () => {
    const elements = scene().map((element) =>
      element.id === 'a-ema'
        ? { ...element, customData: { asterLine: 'aux', asterRole: 'aux' } }
        : element
    )
    expect(lineWidthPt(pick(elements, 'a-ema'))).toBe(0.75)
    expect(lineWidthPt(pick(elements, 'a-ema', 'patch'))).toBeNull()
    const auxWidth = () => 1.5
    const same = withLineWidth(elements, new Set(['a-ema']), 0.75, auxWidth)
    expect(byId(same, 'a-ema').customData).toEqual({ asterLine: 'aux', asterRole: 'aux' })
    const wider = withLineWidth(elements, new Set(['a-ema', 'patch-label']), 1.5, auxWidth)
    expect(byId(wider, 'a-ema')).toMatchObject({ strokeWidth: 3, customData: {} })
    expect(byId(wider, 'patch-label')).toBe(byId(elements, 'patch-label'))
  })

  it('fills shapes only and outlines shapes and lines, never label lines or math', () => {
    const elements = scene()
    const group = new Set(['ctx', 'ctx-label-0-0', 'ctx-label-2-0', 'a-ema'])
    const next = withPaint(elements, group, { backgroundColor: '#dbeafe', strokeColor: '#111111' })
    expect(byId(next, 'ctx')).toMatchObject({ backgroundColor: '#dbeafe', strokeColor: '#111111' })
    expect(byId(next, 'ctx-label-0-0')).toBe(byId(elements, 'ctx-label-0-0'))
    expect(byId(next, 'ctx-label-2-0')).toBe(byId(elements, 'ctx-label-2-0'))
    expect(byId(next, 'a-ema')).toMatchObject({
      backgroundColor: 'transparent',
      strokeColor: '#111111'
    })
  })
})
