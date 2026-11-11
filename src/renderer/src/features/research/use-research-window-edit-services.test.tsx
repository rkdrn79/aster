// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResearchWindowEditServices } from './use-research-window-edit-services'

const { registerZoomIpcBridge, offZoom } = vi.hoisted(() => {
  const offZoom = vi.fn()
  return {
    offZoom,
    registerZoomIpcBridge: vi.fn((unsubs: (() => void)[]) => {
      unsubs.push(offZoom)
    })
  }
})
vi.mock('@/hooks/ipc-events/zoom-ipc-bridge', () => ({ registerZoomIpcBridge }))

vi.mock('@/store', () => ({
  useAppStore: (select: (state: unknown) => unknown) => select({ settings: null })
}))

let pasteListener: (() => void) | null = null
let selectionListener: ((action: 'copy' | 'select-all') => void) | null = null
let contextPasteListener: ((data: { plainTextOnly: boolean }) => void) | null = null
const performNativePaste = vi.fn()
const performNativeSelectionAction = vi.fn()

function Harness(): null {
  useResearchWindowEditServices()
  return null
}

beforeEach(() => {
  pasteListener = null
  selectionListener = null
  contextPasteListener = null
  performNativePaste.mockReset()
  performNativeSelectionAction.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        onAppMenuPaste: vi.fn((callback: () => void) => {
          pasteListener = callback
          return () => {
            pasteListener = null
          }
        }),
        onEditableContextPaste: vi.fn((callback: (data: { plainTextOnly: boolean }) => void) => {
          contextPasteListener = callback
          return () => {
            contextPasteListener = null
          }
        }),
        onAppMenuSelectionAction: vi.fn((callback: (action: 'copy' | 'select-all') => void) => {
          selectionListener = callback
          return () => {
            selectionListener = null
          }
        }),
        readClipboardText: vi.fn(async () => 'from the clipboard'),
        performNativePaste,
        performNativeSelectionAction
      }
    }
  })
})

afterEach(() => cleanup())

describe('useResearchWindowEditServices', () => {
  it("answers the app menu's Copy, Select All and Paste in a project window", async () => {
    render(<Harness />)

    act(() => selectionListener?.('copy'))
    act(() => selectionListener?.('select-all'))
    await act(async () => pasteListener?.())

    expect(performNativeSelectionAction).toHaveBeenCalledWith('copy')
    expect(performNativeSelectionAction).toHaveBeenCalledWith('select-all')
    expect(performNativePaste).toHaveBeenCalledWith({ mode: 'paste' })
  })

  it("answers the right-click menu's Paste as plain text", async () => {
    render(<Harness />)

    await act(async () => contextPasteListener?.({ plainTextOnly: true }))

    expect(performNativePaste).toHaveBeenCalledWith({ mode: 'paste-and-match-style' })
  })

  it('stops listening when the window unmounts', () => {
    const { unmount } = render(<Harness />)
    expect(registerZoomIpcBridge).toHaveBeenCalled()
    unmount()

    expect(offZoom).toHaveBeenCalled()

    expect(pasteListener).toBeNull()
    expect(selectionListener).toBeNull()
    expect(contextPasteListener).toBeNull()
  })

  it('keeps an unclaimed file drop from replacing the page', () => {
    render(<Harness />)
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { types: ['Files'], dropEffect: 'copy' }
    })

    document.body.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(true)
  })
})
