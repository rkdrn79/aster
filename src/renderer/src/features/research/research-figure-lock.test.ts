import { describe, expect, it, vi } from 'vitest'
import { pick, scene } from './research-figure-edit-fixture'
import { allLocked, lockTargets, lockedIds, lockedSpots, withLock } from './research-figure-lock'

vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { IMMEDIATELY: 'IMMEDIATELY', NEVER: 'NEVER' },
  newElementWith: (element: { version: number }, patch: object) => ({
    ...element,
    ...patch,
    version: element.version + 1
  })
}))

const withPage = () =>
  scene().map((element) => (element.id === 'figure-page' ? { ...element, locked: true } : element))

describe('lock you can see', () => {
  it('locks a box with its bound label and its badge, never the page', () => {
    const elements = withPage()
    const targets = lockTargets(pick(elements, 'mask', 'figure-page'), elements)
    expect(targets.map((element) => element.id)).toEqual(['mask', 'mask-label', 'mask-frozen'])
    const next = withLock(elements, new Set(targets.map((element) => element.id)), true)
    expect(allLocked(lockTargets(pick(next, 'mask'), next))).toBe(true)
    expect(lockedIds(next)).toEqual(['mask', 'mask-label', 'mask-frozen'])
  })

  it('shows one lock per locked thing: a panel with its title, a box with its badge', () => {
    const elements = withPage()
    const ids = new Set(['panel', 'panel-title-0', 'mask', 'mask-label', 'mask-frozen'])
    const spots = lockedSpots(withLock(elements, ids, true))
    expect(spots.map((spot) => [spot.key, spot.ids.toSorted()])).toEqual([
      ['mask', ['mask', 'mask-frozen', 'mask-label']],
      ['panel-panel', ['panel', 'panel-title-0']]
    ])
    expect(spots[1].box).toEqual({ x: 370, y: 9, width: 304, height: 122 })
  })
})
