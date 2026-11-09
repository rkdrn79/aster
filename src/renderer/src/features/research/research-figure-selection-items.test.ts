import { describe, expect, it } from 'vitest'
import type { FigureElement } from '../../../../research-harness/research-figures-model.mjs'
import {
  figureSelectionBounds,
  figureSelectionItems,
  figureSelectionText
} from './research-figure-selection-items'

function el(id: string, props: Partial<FigureElement> = {}): FigureElement {
  return { id, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, ...props }
}

const elements: FigureElement[] = [
  el('figure-page', { type: 'frame', width: 500, height: 300 }),
  el('pred', { groupIds: ['g-pred'], x: 100, y: 20 }),
  el('pred-label', { type: 'text', text: 'predictor', groupIds: ['g-pred'], x: 102, y: 22 }),
  el('tgt', { groupIds: ['g-tgt'], x: 100, y: 120 }),
  el('tgt-label', { type: 'text', text: 'target\nencoder', groupIds: ['g-tgt'], x: 102, y: 122 }),
  el('tgt-frozen', { type: 'text', text: '❄️', x: 112, y: 112 }),
  el('a-ema', {
    type: 'arrow',
    x: 50,
    y: 50,
    points: [
      [0, 0],
      [0, 40]
    ]
  }),
  el('a-ema-label-group', { type: 'text', text: 'EMA', x: 55, y: 60 })
]

describe('figureSelectionItems', () => {
  it('counts a box with its label and badge as one item, named by its label', () => {
    const selected = {
      pred: true,
      'pred-label': true,
      tgt: true,
      'tgt-label': true,
      'tgt-frozen': true,
      'figure-page': true
    }
    const items = figureSelectionItems(elements, selected)
    expect(items.map((item) => item.label)).toEqual(['predictor', 'target encoder'])
    expect(figureSelectionText(items)).toBe('2 selected — predictor, target encoder')
  })

  it('keeps an arrow label with its arrow and a lone badge as its own item', () => {
    expect(
      figureSelectionItems(elements, { 'a-ema': true, 'a-ema-label-group': true })
    ).toHaveLength(1)
    expect(figureSelectionItems(elements, { 'tgt-frozen': true })).toHaveLength(1)
  })

  it('bounds lines by their points', () => {
    expect(figureSelectionBounds(elements, { 'a-ema': true, pred: true })).toEqual({
      x: 50,
      y: 20,
      width: 60,
      height: 70
    })
  })
})
