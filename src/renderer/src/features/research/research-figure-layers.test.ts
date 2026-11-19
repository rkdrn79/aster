import { describe, expect, it, vi } from 'vitest'
import { byId, scene } from './research-figure-edit-fixture'
import { layerRows, reorderLayer, texForRow, withHidden } from './research-figure-layers'

vi.mock('@excalidraw/excalidraw', () => ({
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  })
}))

/** The fixture with words in its labels, as the kit writes them. */
function named() {
  const text: Record<string, string> = {
    'patch-label': 'patchify',
    'embed-label': 'linear embed',
    'mask-label': 'random mask',
    'ctx-label-0-0': 'context',
    'ctx-label-1-0': 'encoder',
    'tok-label': 'tokenizer',
    'panel-title-0': 'JEPA branch',
    'a-ema-label-0': 'EMA'
  }
  return scene().map((element) => {
    const words = text[element.id]
    if (element.id === 'panel') {
      return { ...element, customData: { asterPanel: true } }
    }
    return words && element.type === 'text' ? { ...element, text: words } : element
  })
}

describe('layers panel rows', () => {
  it('lists each thing a person picks, topmost first, named by its label', () => {
    const rows = layerRows(named())
    expect(rows.map((row) => [row.key, row.kind, row.name])).toEqual([
      ['a-ema', 'arrow', 'EMA'],
      ['panel-panel', 'panel', 'JEPA branch (panel)'],
      ['tok', 'box', 'tokenizer'],
      ['ctx-shape', 'box', 'context encoder · f_θ'],
      ['mask', 'box', 'random mask'],
      ['embed', 'box', 'linear embed'],
      ['patch', 'box', 'patchify']
    ])
    const ctx = rows.find((row) => row.key === 'ctx-shape')
    expect(ctx?.parts.map((part) => [part.name, part.editingGroupId])).toEqual([
      ['label: context', 'ctx-label-group'],
      ['label: encoder', 'ctx-label-group'],
      ['math: f_θ', 'ctx-label-group']
    ])
    expect(ctx?.fill).toBe('#c5def8')
  })

  it('hides a row as invisible and locked, and shows it back as it was', () => {
    const elements = named()
    const hidden = withHidden(elements, new Set(['mask', 'mask-label']), true)
    expect(byId(hidden, 'mask')).toMatchObject({ opacity: 0, locked: true })
    const row = layerRows(hidden).find((entry) => entry.key === 'mask')
    expect(row).toMatchObject({ hidden: true, locked: false })
    const shown = withHidden(hidden, new Set(['mask', 'mask-label']), false)
    expect(byId(shown, 'mask')).toMatchObject({ locked: false, customData: {} })
    expect(byId(shown, 'mask').opacity).toBe(byId(elements, 'mask').opacity)
  })

  it('moves a row above or below another in drawing order', () => {
    const elements = named()
    const up = reorderLayer(elements, ['patch'], ['tok'], 'above')
    const order = up.map((element) => element.id)
    expect(order.indexOf('patch')).toBe(order.indexOf('tok') + 1)
    const down = reorderLayer(elements, ['panel', 'panel-title-0'], ['patch'], 'below')
    expect(down.map((element) => element.id).slice(0, 4)).toEqual([
      'figure-page',
      'panel',
      'panel-title-0',
      'patch'
    ])
  })
})

describe('TeX in a row name', () => {
  it('reads Greek letters as letters and drops font commands and braces', () => {
    expect(texForRow('f_{\\bar\\theta}')).toBe('f_θ')
    expect(texForRow('\\mathcal{L}_2')).toBe('L_2')
    expect(texForRow('g_\\phi')).toBe('g_φ')
  })
})
