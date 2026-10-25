import { describe, expect, it } from 'vitest'
import { libraryPaneWidths, libraryPanelDefaultWidth } from './research-library-pane-widths'

describe('libraryPaneWidths', () => {
  it('lets the reading panel take everything but the reader minimum when the list is closed', () => {
    expect(libraryPaneWidths(1200, false, 288, 400)).toEqual({
      list: null,
      panel: { minWidth: 280, maxWidth: 834, width: 400 }
    })
  })

  it('shrinks the paper list before the reading panel and bounds each drag by the other pane', () => {
    const { list, panel } = libraryPaneWidths(1000, true, 288, 400)
    expect(list).toEqual({ minWidth: 200, maxWidth: 234, width: 234 })
    expect(panel).toEqual({ minWidth: 280, maxWidth: 400, width: 400 })
    expect(1000 - (list?.width ?? 0) - panel.width).toBe(366)
  })

  it('scales every pane below its minimum together on a too-narrow window', () => {
    expect(libraryPaneWidths(600, false, 288, 700).panel).toEqual({
      minWidth: 259,
      maxWidth: 259,
      width: 259
    })
    const { list, panel } = libraryPaneWidths(720, true, 378, 400)
    expect([list?.width, 720 - (list?.width ?? 0) - panel.width, panel.width]).toEqual([
      175, 310, 235
    ])
  })

  it('keeps stored widths within absolute limits before the container is measured', () => {
    const { list, panel } = libraryPaneWidths(0, true, 999, 120)
    expect(list?.width).toBe(480)
    expect(panel.width).toBe(280)
  })

  it('gives the reading panel about a third of a narrow Library until the user drags it', () => {
    expect(libraryPanelDefaultWidth(820)).toBe(280)
    expect(libraryPanelDefaultWidth(1000)).toBe(320)
    expect(libraryPanelDefaultWidth(1600)).toBe(400)
    expect(libraryPanelDefaultWidth(0)).toBe(400)
  })
})
