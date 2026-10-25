// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { readOffscreenTabStripSlotIds } from './tab-strip-slot-geometry'

function rect(left: number, width: number): DOMRect {
  return DOMRect.fromRect({ x: left, y: 0, width, height: 30 })
}

/** A 300px strip with 120px tabs laid out from `firstLeft`. */
function strip(firstLeft: number, ids: string[], dockId?: string): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: 300 })
  el.getBoundingClientRect = () => rect(0, 300)
  ids.forEach((id, index) => {
    const slot = document.createElement('div')
    slot.dataset.tabStripSlot = id
    if (id === dockId) {
      slot.dataset.activeTabDock = ''
    }
    slot.getBoundingClientRect = () => rect(firstLeft + index * 120, 120)
    el.append(slot)
  })
  return el
}

describe('readOffscreenTabStripSlotIds', () => {
  it('lists tabs scrolled away or clipped at either edge', () => {
    expect(readOffscreenTabStripSlotIds(strip(-120, ['a', 'b', 'c', 'd']))).toEqual(['a', 'd'])
  })

  it('leaves out the docked active tab, which is drawn at the edge', () => {
    expect(readOffscreenTabStripSlotIds(strip(0, ['a', 'b', 'c', 'd'], 'd'))).toEqual(['c'])
  })
})
