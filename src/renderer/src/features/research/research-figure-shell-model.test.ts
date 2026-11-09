import { describe, expect, it } from 'vitest'
import { figureToolbarLayout, TOOLBAR_PRIORITY } from './research-figure-toolbar-layout'
import { figuresLayoutMode, type FiguresLayoutPrefs } from './research-figures-layout-mode'
import { figureCanvasState, figureQuickActions } from './research-figure-quick-actions'
import {
  activeFigureSidePanelTab,
  figureSidePanelTabs,
  type FigureSidePanelTab
} from './research-figure-side-panel'

const prefs = (change: Partial<FiguresLayoutPrefs>): FiguresLayoutPrefs => ({
  windowWidth: 1600,
  focus: false,
  sideOpen: true,
  drawerOpen: false,
  listOverride: null,
  ...change
})

describe('figuresLayoutMode', () => {
  it('shows the full list and the docked side panel on a wide window', () => {
    expect(figuresLayoutMode(prefs({}))).toEqual({ list: 'full', side: 'docked', pill: false })
  })

  it('starts the list as a strip below 1440 px, unless the user widened it', () => {
    expect(figuresLayoutMode(prefs({ windowWidth: 1400 })).list).toBe('strip')
    expect(figuresLayoutMode(prefs({ windowWidth: 1400, listOverride: 'full' })).list).toBe('full')
  })

  it('turns the side panel into a closed drawer below 1200 px, with the pill instead', () => {
    expect(figuresLayoutMode(prefs({ windowWidth: 1100 }))).toEqual({
      list: 'strip',
      side: 'hidden',
      pill: true
    })
    expect(figuresLayoutMode(prefs({ windowWidth: 1100, drawerOpen: true })).side).toBe('drawer')
  })

  it('folds both panes in focus mode', () => {
    expect(figuresLayoutMode(prefs({ focus: true, listOverride: 'full' }))).toEqual({
      list: 'strip',
      side: 'hidden',
      pill: true
    })
  })
})

describe('figureToolbarLayout', () => {
  it('keeps everything when there is room', () => {
    const layout = figureToolbarLayout(1400)
    expect(layout.overflow).toEqual([])
    expect([...layout.visible]).toEqual([...TOOLBAR_PRIORITY])
  })

  it('folds the least important controls first and never Export', () => {
    const layout = figureToolbarLayout(560)
    expect(layout.visible.has('export')).toBe(true)
    expect(layout.visible.has('save')).toBe(true)
    expect(layout.overflow.at(-1)).toBe('parts')
    expect(layout.overflow).toContain('colors')
    // Folding follows priority: nothing visible ranks below something folded (Export aside).
    const ranks = TOOLBAR_PRIORITY.filter((slot) => slot !== 'export')
    const firstFolded = ranks.findIndex((slot) => !layout.visible.has(slot))
    expect(ranks.slice(firstFolded).every((slot) => !layout.visible.has(slot))).toBe(true)
  })

  it('keeps Export even when nothing else fits', () => {
    const layout = figureToolbarLayout(140)
    expect([...layout.visible]).toEqual(['export'])
    expect(layout.overflow).toHaveLength(TOOLBAR_PRIORITY.length - 1)
  })
})

describe('figure quick actions', () => {
  it('reads the canvas: none, empty page, sketch, or a drawing', () => {
    expect(figureCanvasState(null)).toBe('none')
    expect(figureCanvasState([{ id: 'figure-page', type: 'frame' }])).toBe('empty')
    expect(
      figureCanvasState([
        { id: 'figure-page', type: 'frame' },
        { id: 'p', type: 'image', customData: { asterPhoto: {} } }
      ])
    ).toBe('drawn')
    expect(figureCanvasState([{ id: 'f', type: 'freedraw' }])).toBe('sketch')
    expect(figureCanvasState([{ id: 'i', type: 'image' }])).toBe('sketch')
  })

  it('offers two actions that fit and disables the rest with a reason', () => {
    const none = figureQuickActions('none')
    expect(none.primary.map((action) => action.id)).toEqual(['draw-method', 'plot'])
    expect(none.more.find((action) => action.id === 'clean-up')?.disabledReason).toBe(
      'Open a figure first.'
    )
    const sketch = figureQuickActions('sketch')
    expect(sketch.primary.map((action) => action.id)).toEqual(['sketch', 'clean-up'])
    expect(sketch.primary.every((action) => action.disabledReason === null)).toBe(true)
    expect(figureQuickActions('drawn').more.find((a) => a.id === 'sketch')?.disabledReason).toMatch(
      /sketch/
    )
  })
})

describe('figure side panel tabs', () => {
  const history: FigureSidePanelTab = {
    id: 'history',
    label: 'History',
    order: 20,
    render: () => null
  }

  it('shows Agent, Parts and History, with placeholders until a track registers', () => {
    const tabs = figureSidePanelTabs({})
    expect(tabs.map((tab) => tab.id)).toEqual(['agent', 'parts', 'history'])
    expect(tabs.every((tab) => tab.render === null)).toBe(true)
    const registered = figureSidePanelTabs({ history })
    expect(registered.find((tab) => tab.id === 'history')?.render).toBe(history.render)
  })

  it('falls back to Agent when the remembered tab is gone', () => {
    const tabs = figureSidePanelTabs({})
    expect(activeFigureSidePanelTab(tabs, 'history')).toBe('history')
    expect(activeFigureSidePanelTab(tabs, 'gone')).toBe('agent')
  })
})
