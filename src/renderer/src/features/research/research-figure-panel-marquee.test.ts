import { describe, expect, it } from 'vitest'
import { scene } from './research-figure-edit-fixture'
import { marqueeSelection, panelUnderPress, selectWhole } from './research-figure-panel-marquee'

/** The fixture as the kit layers it: the panel under everything it holds. */
const layered = () => {
  const elements = scene()
  const panel = elements.filter((element) => element.groupIds.includes('panel-panel'))
  return [elements[0], ...panel, ...elements.slice(1).filter((element) => !panel.includes(element))]
}
const withPanel = () =>
  layered().map((element) =>
    element.id === 'panel' ? { ...element, customData: { asterPanel: true } } : element
  )
const pick = { zoom: 1, selectedElementIds: {}, editingGroupId: null }

describe('a press on a background panel', () => {
  it('starts a selection box in its empty middle, not on its boxes, title or outline', () => {
    const elements = withPanel()
    expect(panelUnderPress(elements, { x: 600, y: 60 }, pick)?.id).toBe('panel')
    expect(panelUnderPress(elements, { x: 420, y: 60 }, pick)).toBeNull()
    expect(panelUnderPress(elements, { x: 400, y: 20 }, pick)).toBeNull()
    expect(panelUnderPress(elements, { x: 672, y: 60 }, pick)).toBeNull()
    // Why: the emptiest spot of a kit panel often lies a few points above its bottom edge.
    expect(panelUnderPress(elements, { x: 528, y: 122.7 }, { ...pick, zoom: 0.8 })?.id).toBe(
      'panel'
    )
  })

  it('leaves a selected panel, or a press inside the selection, to Excalidraw', () => {
    const elements = withPanel()
    expect(
      panelUnderPress(elements, { x: 600, y: 60 }, { ...pick, selectedElementIds: { panel: true } })
    ).toBeNull()
    expect(
      panelUnderPress(elements, { x: 500, y: 60 }, { ...pick, selectedElementIds: { ctx: true } })
    ).toBeNull()
    expect(
      panelUnderPress(elements, { x: 640, y: 100 }, { ...pick, selectedElementIds: { tok: true } })
    ).not.toBeNull()
  })

  it('selects what lies wholly in the box, groups whole, never the page', () => {
    const elements = withPanel()
    const picked = marqueeSelection(elements, { x: 375, y: 35, width: 200, height: 180 }, null)
    expect(Object.keys(picked.selectedElementIds).toSorted()).toEqual([
      'a-ema',
      'a-ema-label-0',
      'ctx',
      'ctx-label-0-0',
      'ctx-label-1-0',
      'ctx-label-2-0'
    ])
    expect(picked.selectedGroupIds).toEqual({ 'ctx-shape': true, 'a-ema-label-group': true })
    const added = marqueeSelection(
      elements,
      { x: 160, y: 30, width: 140, height: 60 },
      null,
      picked
    )
    expect(added.selectedElementIds.patch).toBe(true)
    expect(added.selectedElementIds.ctx).toBe(true)
  })

  it('selects the panel with its title on a click', () => {
    const elements = withPanel()
    const panel = elements.filter((element) => element.id === 'panel')
    expect(selectWhole(elements, panel, null)).toEqual({
      selectedElementIds: { panel: true, 'panel-title-0': true },
      selectedGroupIds: { 'panel-panel': true }
    })
  })
})
