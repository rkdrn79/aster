// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchWritingSplitLayout } from './ResearchWritingSplitLayout'
import { readWritingPaneRatios, saveWritingPaneRatios } from './research-writing-pane-ratios'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('resizes by keyboard, keeps all panes mounted in narrow tabs, and restores the width', () => {
  const panes = {
    agent: <div>Writing chat</div>,
    source: <div>Editable TeX</div>,
    reader: <div>Compiled pages</div>
  }
  const view = render(
    <ResearchWritingSplitLayout experimentId="paper-a" wide activePane="source" {...panes} />
  )
  const grid = view.container.firstElementChild
  if (!(grid instanceof HTMLElement)) {
    throw new Error('Writing pane grid was not rendered')
  }
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 800))
  const chat = screen.getByText('Writing chat')
  const initialColumns = grid.style.gridTemplateColumns
  fireEvent.keyDown(
    screen.getByRole('separator', { name: 'Resize Writing agent and TeX source' }),
    {
      key: 'ArrowRight'
    }
  )
  expect(grid.style.gridTemplateColumns).not.toBe(initialColumns)
  const resizedColumns = grid.style.gridTemplateColumns

  view.rerender(
    <ResearchWritingSplitLayout
      experimentId="paper-a"
      wide={false}
      activePane="reader"
      {...panes}
    />
  )
  expect(screen.getByText('Writing chat')).toBe(chat)
  expect(chat.parentElement?.style.display).toBe('none')
  expect(screen.getByText('Compiled pages').parentElement?.style.display).toBe('flex')

  view.unmount()
  const reopened = render(
    <ResearchWritingSplitLayout experimentId="paper-a" wide activePane="source" {...panes} />
  )
  const restoredGrid = reopened.container.firstElementChild
  if (!(restoredGrid instanceof HTMLElement)) {
    throw new Error('Restored Writing pane grid was not rendered')
  }
  expect(restoredGrid.style.gridTemplateColumns).toBe(resizedColumns)
})

it('drags a divider across the PDF pane and releases the temporary pointer overlay', () => {
  const view = render(
    <ResearchWritingSplitLayout
      experimentId="paper-drag"
      wide
      activePane="source"
      agent={<div>Agent</div>}
      source={<div>Source</div>}
      reader={<div>PDF</div>}
    />
  )
  const grid = view.container.firstElementChild
  if (!(grid instanceof HTMLElement)) {
    throw new Error('Writing pane grid was not rendered')
  }
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 800))
  const handle = screen.getByRole('separator', { name: 'Resize TeX source and compiled PDF' })
  Object.defineProperties(handle, {
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: vi.fn().mockReturnValue(true) },
    releasePointerCapture: { value: vi.fn() }
  })
  const initialColumns = grid.style.gridTemplateColumns

  fireEvent(
    handle,
    new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, clientX: 700 })
  )
  fireEvent(window, new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 800 }))
  expect(grid.style.gridTemplateColumns).not.toBe(initialColumns)
  fireEvent(window, new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 800 }))
  expect(document.body.style.cursor).toBe('')
  expect(document.body.querySelector('[style*="2147483647"]')).toBeNull()
  expect(localStorage.getItem('aster.research-writing-pane-ratios.v1:paper-drag')).not.toBeNull()
})

it('keeps hidden pane content mounted and resizes the two visible panes', () => {
  const panes = {
    agent: <div>Writing chat</div>,
    source: <div>Editable TeX</div>,
    reader: <div>Compiled pages</div>
  }
  const view = render(
    <ResearchWritingSplitLayout
      experimentId="paper-hidden"
      wide
      activePane="source"
      visiblePanes={[true, true, true]}
      {...panes}
    />
  )
  const grid = view.container.firstElementChild
  if (!(grid instanceof HTMLElement)) {
    throw new Error('Writing pane grid was not rendered')
  }
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 800))
  const source = screen.getByText('Editable TeX')
  view.rerender(
    <ResearchWritingSplitLayout
      experimentId="paper-hidden"
      wide
      activePane="source"
      visiblePanes={[true, false, true]}
      {...panes}
    />
  )
  expect(screen.getByText('Editable TeX')).toBe(source)
  expect(source.parentElement?.style.display).toBe('none')
  const handle = screen.getByRole('separator', { name: 'Resize Writing agent and compiled PDF' })
  expect(grid.style.gridTemplateColumns.split('6px')).toHaveLength(2)
  const before = grid.style.gridTemplateColumns
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(grid.style.gridTemplateColumns).not.toBe(before)

  view.rerender(
    <ResearchWritingSplitLayout
      experimentId="paper-hidden"
      wide={false}
      activePane="source"
      visiblePanes={[true, false, true]}
      {...panes}
    />
  )
  expect(source.parentElement?.style.display).toBe('flex')
})

it('fits panes to a narrower container and restores the saved widths when it grows back', () => {
  let width = 1600
  let triggerResize = (): void => {
    throw new Error('Resize observer was not attached')
  }
  const disconnect = vi.fn()
  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      triggerResize = () => callback([], this)
    }
    observe(): void {}
    unobserve(): void {}
    disconnect = disconnect
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, width, 800)
  )
  saveWritingPaneRatios('paper-resize', [0.18, 0.42, 0.4])
  const saved = readWritingPaneRatios('paper-resize')
  const view = render(
    <ResearchWritingSplitLayout
      experimentId="paper-resize"
      wide
      activePane="source"
      agent={<div>Agent remains mounted</div>}
      source={<div>Source remains mounted</div>}
      reader={<div>PDF remains mounted</div>}
    />
  )
  const grid = view.container.firstElementChild
  if (!(grid instanceof HTMLElement)) {
    throw new Error('Writing pane grid was not rendered')
  }
  const wideColumns = grid.style.gridTemplateColumns
  const agent = screen.getByText('Agent remains mounted')
  const source = screen.getByText('Source remains mounted')
  width = 1000
  act(() => triggerResize())
  const shown = [...grid.style.gridTemplateColumns.matchAll(/minmax\(0, ([\d.]+)fr\)/g)].map(
    (match) => Number(match[1]) * 988
  )
  expect(shown[0]).toBeGreaterThanOrEqual(200 - 0.001)
  expect(shown[1]).toBeGreaterThanOrEqual(420 - 0.001)
  expect(shown[2]).toBeGreaterThanOrEqual(260 - 0.001)
  expect(readWritingPaneRatios('paper-resize')).toEqual(saved)
  width = 1600
  act(() => triggerResize())
  expect(grid.style.gridTemplateColumns).toBe(wideColumns)
  expect(screen.getByText('Agent remains mounted')).toBe(agent)
  expect(screen.getByText('Source remains mounted')).toBe(source)
  view.unmount()
  expect(disconnect).toHaveBeenCalled()
})

it('reorders panes without remounting their contents and fills the grid when only one remains', () => {
  const panes = {
    agent: <div>Persistent agent</div>,
    source: <div>Persistent source</div>,
    reader: <div>Persistent PDF</div>
  }
  const view = render(
    <ResearchWritingSplitLayout experimentId="paper-order" wide activePane="source" {...panes} />
  )
  const grid = view.container.firstElementChild
  if (!(grid instanceof HTMLElement)) {
    throw new Error('Writing pane grid was not rendered')
  }
  const agent = screen.getByText('Persistent agent')
  const source = screen.getByText('Persistent source')
  const reader = screen.getByText('Persistent PDF')

  view.rerender(
    <ResearchWritingSplitLayout
      experimentId="paper-order"
      wide
      activePane="source"
      order={[2, 0, 1]}
      {...panes}
    />
  )
  expect(screen.getByText('Persistent agent')).toBe(agent)
  expect(screen.getByText('Persistent source')).toBe(source)
  expect(screen.getByText('Persistent PDF')).toBe(reader)
  expect(reader.parentElement?.style.order).toBe('0')
  expect(agent.parentElement?.style.order).toBe('2')
  expect(source.parentElement?.style.order).toBe('4')
  expect(
    screen.getByRole('separator', { name: 'Resize compiled PDF and Writing agent' })
  ).toBeTruthy()

  view.rerender(
    <ResearchWritingSplitLayout
      experimentId="paper-order"
      wide
      activePane="source"
      order={[2, 0, 1]}
      visiblePanes={[false, false, true]}
      {...panes}
    />
  )
  expect(grid.style.gridTemplateColumns).toBe('minmax(0, 1fr)')
  expect(reader.parentElement?.style.display).toBe('flex')
  expect(agent.parentElement?.style.display).toBe('none')
  expect(screen.queryByRole('separator')).toBeNull()
})
