// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ResearchLibrarySplitLayout } from './ResearchLibrarySplitLayout'

const PANEL_KEY = 'aster.research-library-panel-width.v1'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderLayout(): { handle: HTMLElement; panel: HTMLElement; reader: HTMLElement } {
  render(
    <ResearchLibrarySplitLayout
      listOpen={false}
      list={<div>List</div>}
      reader={<div>Reader</div>}
      panel={<div>Panel</div>}
    />
  )
  const panel = screen.getByText('Panel').parentElement
  const reader = screen.getByText('Reader').parentElement
  if (!panel || !reader) {
    throw new Error('Library panes were not rendered')
  }
  const handle = screen.getByRole('separator', { name: 'Resize paper reader and reading panel' })
  return { handle, panel, reader }
}

it('moves the reading panel boundary from the keyboard and resets it on double-click', () => {
  const { handle, panel } = renderLayout()
  expect(panel.style.width).toBe('400px')

  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(panel.style.width).toBe('416px')
  fireEvent.keyDown(handle, { key: 'End' })
  expect(handle.getAttribute('aria-valuenow')).toBe('960')
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(panel.style.width).toBe('280px')
  expect(localStorage.getItem(PANEL_KEY)).toBe('280')

  fireEvent.mouseDown(handle, { detail: 2 })
  expect(panel.style.width).toBe('400px')
  expect(localStorage.getItem(PANEL_KEY)).toBeNull()
})

it('holds the PDF reader at its width while dragging and releases it on drop', () => {
  const { handle, panel, reader } = renderLayout()
  Object.defineProperty(reader.parentElement, 'clientWidth', { configurable: true, value: 700 })

  fireEvent.mouseDown(handle, { clientX: 700 })
  expect(reader.style.width).toBe('700px')
  fireEvent.mouseMove(window, { clientX: 600 })
  fireEvent.mouseUp(window)

  expect(panel.style.width).toBe('500px')
  expect(reader.style.width).toBe('')
  expect(localStorage.getItem(PANEL_KEY)).toBe('500')
})
