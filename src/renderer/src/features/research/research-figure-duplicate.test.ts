import { describe, expect, it, vi } from 'vitest'
import { byId, pick, scene } from './research-figure-edit-fixture'
import {
  EXCALIDRAW_DUPLICATE_OFFSET,
  boundsOf,
  duplicateBadges,
  firstDuplicateOffset,
  placeDuplicates
} from './research-figure-duplicate'

vi.mock('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (elements: unknown[]) => elements,
  newElementWith: (element: object, patch: object) => ({ ...element, ...patch })
}))

/** What Excalidraw's ⌘D hands `onDuplicate`: the scene plus copies 10 units down and right. */
function excalidrawDuplicate(elements: ReturnType<typeof scene>, ids: string[]) {
  const copies = pick(elements, ...ids).map((element) => ({
    ...element,
    id: `${element.id}-copy`,
    x: element.x + EXCALIDRAW_DUPLICATE_OFFSET,
    y: element.y + EXCALIDRAW_DUPLICATE_OFFSET,
    ...(element.type === 'text' && element.containerId
      ? { containerId: `${element.containerId}-copy` }
      : {})
  }))
  return [...elements, ...copies]
}

describe('smart duplicate', () => {
  it('puts the first copy one box-height plus the column gap below', () => {
    const elements = scene()
    const mask = pick(elements, 'mask')
    expect(firstDuplicateOffset(boundsOf(mask), new Set(['mask']), elements)).toEqual({
      dx: 0,
      dy: 44 + (214 - 156)
    })
  })

  it('goes to the right in a row, by the gap to the nearest neighbour beside it', () => {
    const page = pick(scene(), 'figure-page')
    const box = (id: string, x: number) =>
      pick(scene(), 'patch').map((element) => ({ ...element, id, x, y: 100 }))
    const row = [...page, ...box('a', 20), ...box('b', 160), ...box('c', 300)]
    expect(firstDuplicateOffset(boundsOf(pick(row, 'c')), new Set(['c']), row)).toEqual({
      dx: 120 + 20,
      dy: 0
    })
  })

  it('goes the other way when the spacing it reads would land the copy on a box', () => {
    const page = pick(scene(), 'figure-page')
    const box = (id: string, x: number, y: number) =>
      pick(scene(), 'patch').map((element) => ({ ...element, id, x, y }))
    const crowded = [...page, ...box('a', 20, 100), ...box('b', 160, 100), ...box('c', 300, 100)]
    const source = boundsOf(pick(crowded, 'b'))
    expect(firstDuplicateOffset(source, new Set(['b']), crowded)).toEqual({ dx: 0, dy: 44 + 16 })
  })

  it('moves the copies to the offset and gives a copied box its badge', () => {
    const elements = scene()
    const offset = { dx: 0, dy: 102 }
    const placed = placeDuplicates(
      excalidrawDuplicate(elements, ['mask', 'mask-label']),
      elements,
      offset
    )
    expect(placed.copies.map((copy) => [copy.id, copy.x, copy.y])).toEqual([
      ['mask-copy', 164, 316],
      ['mask-label-copy', 176, 328]
    ])
    const [badge] = duplicateBadges(elements, pick(elements, 'mask'), placed.copies, offset)
    expect(badge).toMatchObject({
      id: 'mask-copy-frozen',
      x: byId(elements, 'mask-frozen').x,
      y: byId(elements, 'mask-frozen').y + 102,
      index: null,
      customData: { asterAttach: { to: 'mask-copy', anchor: 'top-right' } }
    })
  })
})
