import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  attachResearchWindowShortcuts,
  isCloseWindowShortcut
} from './research-page-window-shortcuts'

const CMD_W = {
  type: 'keyDown',
  key: 'w',
  code: 'KeyW',
  meta: true,
  control: false,
  alt: false,
  shift: false
}

function fakeWindow(): {
  close: ReturnType<typeof vi.fn>
  webContents: EventEmitter & { send: ReturnType<typeof vi.fn> }
} {
  return { close: vi.fn(), webContents: Object.assign(new EventEmitter(), { send: vi.fn() }) }
}

function press(window: ReturnType<typeof fakeWindow>, input: Record<string, unknown>): boolean {
  let prevented = false
  window.webContents.emit('before-input-event', { preventDefault: () => (prevented = true) }, input)
  return prevented
}

function attach(window: ReturnType<typeof fakeWindow>, overrides?: Record<string, string[]>): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the shortcuts read only close() and webContents events.
  attachResearchWindowShortcuts(window as never, {
    getKeybindings: () => overrides,
    platform: 'darwin'
  })
}

describe('project window shortcuts', () => {
  it('closes the window on Close tab, and keeps the key from the page', () => {
    const window = fakeWindow()
    attach(window)

    expect(press(window, CMD_W)).toBe(true)
    expect(window.close).toHaveBeenCalledOnce()
  })

  it('leaves other keys, key repeats and key-ups to the page', () => {
    const window = fakeWindow()
    attach(window)

    expect(press(window, { ...CMD_W, code: 'KeyC', key: 'c' })).toBe(false)
    expect(press(window, { ...CMD_W, isAutoRepeat: true })).toBe(false)
    expect(press(window, { ...CMD_W, type: 'keyUp' })).toBe(false)
    expect(press(window, { ...CMD_W, alt: true, key: '∑' })).toBe(false)
    expect(window.close).not.toHaveBeenCalled()
  })

  it('follows a rebound Close tab', () => {
    const window = fakeWindow()
    attach(window, { 'tab.close': ['Mod+Shift+K'] })

    expect(press(window, CMD_W)).toBe(false)
    expect(press(window, { ...CMD_W, key: 'K', code: 'KeyK', shift: true })).toBe(true)
    expect(window.close).toHaveBeenCalledOnce()
  })

  it.skipIf(process.platform !== 'darwin')(
    "sends Cmd+V to the window's own paste handling, as the main window does",
    () => {
      const window = fakeWindow()
      attach(window)

      expect(press(window, { ...CMD_W, key: 'v', code: 'KeyV' })).toBe(true)
      expect(window.webContents.send).toHaveBeenCalledWith('ui:appMenuPaste')
      expect(press(window, { ...CMD_W, key: 'V', code: 'KeyV', shift: true })).toBe(false)
      expect(window.webContents.send).toHaveBeenCalledOnce()
    }
  )

  it("sends the zoom keys to the window's zoom handling, held down too", () => {
    const window = fakeWindow()
    attach(window)

    expect(press(window, { ...CMD_W, key: '=', code: 'Equal' })).toBe(true)
    expect(press(window, { ...CMD_W, key: '-', code: 'Minus', isAutoRepeat: true })).toBe(true)
    expect(press(window, { ...CMD_W, key: '0', code: 'Digit0' })).toBe(true)
    expect(window.webContents.send.mock.calls).toEqual([
      ['terminal:zoom', 'in'],
      ['terminal:zoom', 'out'],
      ['terminal:zoom', 'reset']
    ])
    expect(window.close).not.toHaveBeenCalled()
  })

  it('zooms on Cmd+wheel the same way', () => {
    const window = fakeWindow()
    attach(window)
    let prevented = false

    window.webContents.emit('zoom-changed', { preventDefault: () => (prevented = true) }, 'in')

    expect(prevented).toBe(true)
    expect(window.webContents.send).toHaveBeenCalledWith('terminal:zoom', 'in')
  })

  it('reads Ctrl+W as Close tab on Windows and Linux', () => {
    const ctrlW = { key: 'w', code: 'KeyW', meta: false, control: true, alt: false, shift: false }
    expect(isCloseWindowShortcut(ctrlW, 'linux', undefined)).toBe(true)
    expect(isCloseWindowShortcut(ctrlW, 'win32', undefined)).toBe(true)
    expect(isCloseWindowShortcut(ctrlW, 'darwin', undefined)).toBe(false)
  })
})
