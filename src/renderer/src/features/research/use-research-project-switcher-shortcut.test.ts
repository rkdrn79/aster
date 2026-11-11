// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

type MockState = {
  keybindings: Record<string, string[]>
  settings: { terminalShortcutPolicy: 'orca-first' | 'terminal-first' }
}

const mocks = vi.hoisted(() => {
  const state: MockState = {
    keybindings: {},
    settings: { terminalShortcutPolicy: 'orca-first' }
  }
  return { state }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => 'darwin' }))
vi.mock('./research-project-switcher-store', () => ({
  goToPreviousResearchProject: vi.fn(),
  toggleResearchProjectSwitcher: vi.fn()
}))

import { matchResearchProjectShortcut } from './use-research-project-switcher-shortcut'

function press(key: string, init: KeyboardEventInit, target: Element = document.body) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true,
    ...init
  })
  Object.defineProperty(event, 'target', { value: target })
  return matchResearchProjectShortcut(event)
}

afterEach(() => {
  mocks.state.keybindings = {}
  mocks.state.settings.terminalShortcutPolicy = 'orca-first'
  document.body.innerHTML = ''
})

describe('matchResearchProjectShortcut', () => {
  it('knows Ctrl+Cmd+P (switcher) and Ctrl+Cmd+O (previous project) on macOS', () => {
    expect(press('p', { metaKey: true, ctrlKey: true })).toBe('switcher')
    expect(press('o', { metaKey: true, ctrlKey: true })).toBe('previous')
    expect(press('p', { metaKey: true })).toBeNull()
    expect(press('o', { metaKey: true, shiftKey: true })).toBeNull()
  })

  it('ignores held keys and IME composition', () => {
    expect(press('p', { metaKey: true, ctrlKey: true, repeat: true })).toBeNull()
    expect(press('p', { metaKey: true, ctrlKey: true, isComposing: true })).toBeNull()
  })

  it('follows rebinding in the keybindings file', () => {
    mocks.state.keybindings = { 'research.projectSwitcher': ['Mod+Shift+P'] }
    expect(press('p', { metaKey: true, shiftKey: true })).toBe('switcher')
    expect(press('p', { metaKey: true, ctrlKey: true })).toBeNull()
  })

  it('works from a terminal unless terminals get shortcuts first', () => {
    const terminal = document.createElement('div')
    terminal.className = 'xterm'
    const textarea = document.createElement('textarea')
    terminal.append(textarea)
    document.body.append(terminal)
    expect(press('p', { metaKey: true, ctrlKey: true }, textarea)).toBe('switcher')
    mocks.state.settings.terminalShortcutPolicy = 'terminal-first'
    expect(press('p', { metaKey: true, ctrlKey: true }, textarea)).toBeNull()
  })
})
