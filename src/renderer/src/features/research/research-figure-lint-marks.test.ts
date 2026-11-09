import { describe, expect, it } from 'vitest'
import {
  figureElement,
  pageFrameElement
} from '../../../../research-harness/research-figures-model.mjs'
import { lintMarks } from './research-figure-lint-marks'

describe('lintMarks', () => {
  it('places one mark per element in preview pixels, with every code it got', () => {
    const page = { ...pageFrameElement(3.25, 2), x: 100, y: 50 }
    const box = figureElement('rectangle', { id: 'b', x: 148, y: 98, width: 96, height: 48 })
    const arrow = figureElement('arrow', {
      id: 'a',
      x: 300,
      y: 200,
      points: [
        [0, 0],
        [-60, 30]
      ]
    })
    const { marks, page: pageCodes } = lintMarks(
      [page, box, arrow],
      {
        errors: [{ code: 'diagonal-segment', id: 'a', message: '' }],
        warnings: [
          { code: 'empty-box', id: 'b', message: '' },
          { code: 'uneven-spacing', id: 'b', message: '' },
          { code: 'page-fill', id: null, message: '' }
        ]
      },
      216
    )
    // 216 dpi over 144 units per inch: 1.5 px per unit from the page's corner.
    expect(marks).toEqual([
      { x: 210, y: 225, width: 90, height: 45, codes: ['diagonal-segment'], error: true },
      {
        x: 72,
        y: 72,
        width: 144,
        height: 72,
        codes: ['empty-box', 'uneven-spacing'],
        error: false
      }
    ])
    expect(pageCodes).toEqual(['page-fill'])
  })

  it('boxes an empty stretch where it lies, not at the corner or over the page', () => {
    const page = { ...pageFrameElement(3.25, 2), x: 100, y: 50 }
    const { marks, page: pageCodes } = lintMarks(
      [page],
      {
        errors: [],
        warnings: [
          {
            code: 'empty-region',
            id: null,
            message: '',
            regions: [{ x: 300, y: 150, width: 120, height: 96 }]
          }
        ]
      },
      216
    )
    expect(marks).toEqual([
      { x: 300, y: 150, width: 180, height: 144, codes: ['empty-region'], error: false }
    ])
    expect(pageCodes).toEqual([])
  })
})
