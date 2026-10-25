// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchWritingFileTreeSplit } from './ResearchWritingFileTreeSplit'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('resizes the TeX file list while keeping the editor mounted and restores the chosen width', () => {
  const props = {
    experimentId: 'paper-a',
    fileTree: <div>Files</div>,
    editor: <div>Editable manuscript</div>
  }
  const view = render(<ResearchWritingFileTreeSplit {...props} filesOpen />)
  const editor = screen.getByText('Editable manuscript')
  const handle = screen.getByRole('separator', { name: 'Resize TeX files and editor' })
  const tree = screen.getByText('Files').parentElement
  expect(tree?.style.width).toBe('160px')

  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(tree?.style.width).toBe('176px')
  expect(localStorage.getItem('aster.research-writing-file-tree-width.v1:paper-a')).toBe('176')

  view.rerender(<ResearchWritingFileTreeSplit {...props} filesOpen={false} />)
  expect(screen.queryByText('Files')).toBeNull()
  expect(screen.getByText('Editable manuscript')).toBe(editor)
  view.rerender(<ResearchWritingFileTreeSplit {...props} filesOpen />)
  expect(screen.getByText('Files').parentElement?.style.width).toBe('176px')
  view.unmount()

  render(<ResearchWritingFileTreeSplit {...props} filesOpen />)
  expect(screen.getByText('Files').parentElement?.style.width).toBe('176px')
})

it('clamps the rendered tree to leave editor space without discarding the stored width', async () => {
  let onResize: ResizeObserverCallback | undefined
  class TestResizeObserver implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      onResize = callback
    }
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  localStorage.setItem('aster.research-writing-file-tree-width.v1:paper-b', '400')
  const view = render(
    <ResearchWritingFileTreeSplit
      experimentId="paper-b"
      filesOpen
      fileTree={<div>Files</div>}
      editor={<div>Editor</div>}
    />
  )
  const container = view.container.firstElementChild
  if (!(container instanceof HTMLElement)) {
    throw new Error('Writing source container was not rendered')
  }
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 430 })
  act(() => onResize?.([], new TestResizeObserver(() => {})))
  await vi.waitFor(() => expect(screen.getByText('Files').parentElement?.style.width).toBe('184px'))
  expect(localStorage.getItem('aster.research-writing-file-tree-width.v1:paper-b')).toBe('400')
})

it('drags the file tree divider and releases the pointer overlay', () => {
  render(
    <ResearchWritingFileTreeSplit
      experimentId="paper-drag"
      filesOpen
      fileTree={<div>Files</div>}
      editor={<div>Editor</div>}
    />
  )
  const handle = screen.getByRole('separator', { name: 'Resize TeX files and editor' })
  fireEvent.mouseDown(handle, { clientX: 200 })
  fireEvent.mouseMove(window, { clientX: 270 })
  fireEvent.mouseUp(window)
  expect(screen.getByText('Files').parentElement?.style.width).toBe('230px')
  expect(localStorage.getItem('aster.research-writing-file-tree-width.v1:paper-drag')).toBe('230')
  expect(document.body.style.cursor).toBe('')
  expect(document.body.querySelector('[style*="2147483647"]')).toBeNull()
})
