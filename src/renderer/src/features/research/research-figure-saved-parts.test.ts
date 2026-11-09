import { describe, expect, it, vi } from 'vitest'

vi.mock('./research-figure-requests', () => ({ selectedFigureElements: () => [] }))
vi.mock('./research-project-files', () => ({
  listProjectDirectory: vi.fn(),
  readProjectText: vi.fn(),
  writeProjectText: vi.fn()
}))

import { figurePartItems, figurePartLibraryText } from './research-figure-saved-parts'

describe('saved figure parts', () => {
  it('write the library format the Figure kit reads, and load with unique ids', () => {
    const text = figurePartLibraryText('Encoder pair', [{ id: 'enc', type: 'rectangle' }])
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toMatchObject({
      type: 'excalidrawlib',
      libraryItems: [{ name: 'Encoder pair', elements: [{ id: 'enc' }] }]
    })
    const project = figurePartItems(text, 'project', 'encoder-pair.excalidrawlib')
    const user = figurePartItems(text, 'user', 'encoder-pair.excalidrawlib')
    expect(project[0].id).not.toBe(user[0].id)
    expect(figurePartItems('not json', 'user', 'x')).toEqual([])
  })
})
