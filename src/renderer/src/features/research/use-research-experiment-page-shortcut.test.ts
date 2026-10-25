// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  keybindings: {},
  activeModal: 'none',
  openModal: (_modal: string): void => {},
  closeModal: (): void => {}
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: typeof store) => unknown) => select(store), {
    getState: () => store
  })
}))

const { installAppKeyboardRouter } = await import('@/lib/app-keyboard-router')
const { useResearchPaletteShortcut } =
  await import('@/components/cmd-j/use-research-palette-shortcut')
const { useResearchExperimentPageShortcut } =
  await import('./use-research-experiment-page-shortcut')

installAppKeyboardRouter(window)

const PLATFORMS = [
  { name: 'macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', mod: 'metaKey' },
  { name: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', mod: 'ctrlKey' },
  { name: 'Linux', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', mod: 'ctrlKey' }
] as const

let toggle = vi.fn()
let openPalette = vi.fn()

beforeEach(() => {
  toggle = vi.fn()
  openPalette = vi.fn()
  store.openModal = openPalette
  document.body.innerHTML =
    '<section aria-label="Experiment"><table><td id="cell">27.76</td></table><textarea id="composer"></textarea></section>'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function press(
  targetId: string,
  mod: 'metaKey' | 'ctrlKey',
  shiftKey: boolean
): { defaultPrevented: boolean } {
  const event = new KeyboardEvent('keydown', {
    key: shiftKey ? 'K' : 'k',
    code: 'KeyK',
    metaKey: mod === 'metaKey',
    ctrlKey: mod === 'ctrlKey',
    shiftKey,
    bubbles: true,
    cancelable: true
  })
  document.getElementById(targetId)?.dispatchEvent(event)
  return event
}

describe.each(PLATFORMS)('Experiment notebook/details shortcut on $name', ({ userAgent, mod }) => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    // Both owners share the routed stage, palette first as at app start.
    renderHook(() => useResearchPaletteShortcut(true))
    renderHook(() => useResearchExperimentPageShortcut(toggle))
  })

  it('toggles once from the page and from the chat composer, without opening the palette', () => {
    expect(press('cell', mod, true).defaultPrevented).toBe(true)
    expect(press('composer', mod, true).defaultPrevented).toBe(true)
    expect(toggle).toHaveBeenCalledTimes(2)
    expect(openPalette).not.toHaveBeenCalled()
  })

  it('leaves the plain K chord to the palette', () => {
    press('cell', mod, false)
    expect(openPalette).toHaveBeenCalledWith('worktree-palette')
    expect(toggle).not.toHaveBeenCalled()
  })
})
