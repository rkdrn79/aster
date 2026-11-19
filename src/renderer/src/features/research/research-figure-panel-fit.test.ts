import { describe, expect, it } from 'vitest'
import { scene } from './research-figure-edit-fixture'
import { settleFigure } from './research-figure-settle'
import {
  baselineSettled,
  commitSettled,
  createSettleMemory,
  type SettleElement,
  type SettleUpdate
} from './research-figure-settle-state'

type Mutable = { -readonly [K in keyof SettleElement]: SettleElement[K] }

/** The fixture with its panel marked as the kit marks one, settled once (panels learned). */
function settled() {
  const elements: Mutable[] = scene().map((element) =>
    element.id === 'panel' ? { ...element, customData: { asterPanel: true } } : { ...element }
  )
  const memory = createSettleMemory()
  baselineSettled(memory, elements)
  settleFigure(elements, memory)
  return { elements, memory }
}

function edit(elements: Mutable[], id: string, patch: Partial<Mutable>): void {
  const element = elements.find((entry) => entry.id === id)
  if (element) {
    Object.assign(element, patch, { version: element.version + 1 })
  }
}

function apply(elements: Mutable[], updates: Map<string, SettleUpdate>): void {
  for (const element of elements) {
    Object.assign(element, updates.get(element.id) ?? {})
  }
}

const find = (elements: readonly Mutable[], id: string): Mutable => {
  const found = elements.find((element) => element.id === id)
  if (!found) {
    throw new Error(`no ${id}`)
  }
  return found
}

describe('background panels grow with what lies on them', () => {
  it('grows to keep its pad when a box on it is resized past its edge', () => {
    const { elements, memory } = settled()
    expect(memory.panels.get('panel')?.pad).toEqual({ left: 10, right: 11, bottom: 11, top: 31 })
    edit(elements, 'ctx', { width: 300 })
    apply(elements, settleFigure(elements, memory))
    const panel = find(elements, 'panel')
    expect([panel.x, panel.y, panel.x + panel.width]).toEqual([370, 9, 691])
    expect([find(elements, 'panel-title-0').x, find(elements, 'panel-title-0').y]).toEqual([
      378, 13
    ])
  })

  it('keeps a badge that a resize pushed past the edge, and grows around it when the drag ends', () => {
    const elements: Mutable[] = [
      ...scene().map((element) =>
        element.id === 'panel' ? { ...element, customData: { asterPanel: true } } : { ...element }
      ),
      {
        ...scene()[0],
        id: 'ctx-trainable',
        type: 'image',
        x: 483,
        y: 33,
        width: 18,
        height: 18,
        groupIds: []
      }
    ]
    const memory = createSettleMemory()
    baselineSettled(memory, elements)
    settleFigure(elements, memory)
    expect(memory.panels.get('panel')?.contents).toContain('ctx-trainable')
    edit(elements, 'ctx', { width: 300 })
    apply(elements, settleFigure(elements, memory, { gesture: true }))
    commitSettled(memory, elements)
    expect(find(elements, 'ctx-trainable').x).toBe(483 + 188)
    apply(elements, settleFigure(elements, memory))
    const panel = find(elements, 'panel')
    expect(panel.x + panel.width).toBe(483 + 188 + 18 + 11)
  })

  it('waits for a drag to end, and lets a box dragged off it go', () => {
    const { elements, memory } = settled()
    edit(elements, 'ctx', { x: 600 })
    let updates = settleFigure(elements, memory, { gesture: true })
    expect(updates.has('panel')).toBe(false)
    commitSettled(memory, elements)
    updates = settleFigure(elements, memory)
    apply(elements, updates)
    expect(find(elements, 'panel').width).toBe(600 + 112 + 11 - 370)
    edit(elements, 'ctx', { x: 900 })
    for (const id of ['ctx-label-0-0', 'ctx-label-1-0', 'ctx-label-2-0']) {
      edit(elements, id, { x: find(elements, id).x + 300 })
    }
    apply(elements, settleFigure(elements, memory))
    expect(find(elements, 'panel').width).toBe(353)
    expect(memory.panels.get('panel')?.contents).toEqual([])
  })

  it('moves its titled top up for a box nudged above it, and its title comes along', () => {
    const { elements, memory } = settled()
    edit(elements, 'ctx', { y: 10 })
    apply(elements, settleFigure(elements, memory))
    const panel = find(elements, 'panel')
    expect(panel.y).toBe(10 - 31)
    expect(panel.y + panel.height).toBe(131)
    expect(find(elements, 'panel-title-0').y).toBe(13 - 30)
  })

  it('learns again where a person moved the panel, without growing it', () => {
    const { elements, memory } = settled()
    edit(elements, 'panel', { x: 400 })
    edit(elements, 'panel-title-0', { x: 408 })
    apply(elements, settleFigure(elements, memory))
    expect(find(elements, 'panel').x).toBe(400)
    expect(find(elements, 'panel').width).toBe(304)
    expect(memory.panels.get('panel')?.contents).not.toContain('ctx')
  })
})
