import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ipcListeners, buildFromTemplate, popup } = vi.hoisted(() => ({
  ipcListeners: new Map<string, Set<(...args: unknown[]) => void>>(),
  buildFromTemplate: vi.fn(),
  popup: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      const listeners = ipcListeners.get(channel) ?? new Set()
      listeners.add(listener)
      ipcListeners.set(channel, listeners)
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcListeners.get(channel)?.delete(listener)
    }
  },
  Menu: { buildFromTemplate }
}))

import { attachEditableContextMenu } from './editable-context-menu-window'
import { richMarkdownContextMenuTargetChannel } from '../../shared/rich-markdown-context-menu'

type FakeWindow = EventEmitter & {
  webContents: EventEmitter & {
    send: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
    replaceMisspelling: ReturnType<typeof vi.fn>
    session: { addWordToSpellCheckerDictionary: ReturnType<typeof vi.fn> }
  }
  isDestroyed: () => boolean
}

function fakeWindow(): FakeWindow {
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    isDestroyed: () => false,
    replaceMisspelling: vi.fn(),
    session: { addWordToSpellCheckerDictionary: vi.fn() }
  })
  return Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false })
}

function attach(window: FakeWindow): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the attachment reads only webContents, isDestroyed and the window's events, all stubbed.
  attachEditableContextMenu(window as never)
}

function params(overrides: Partial<Electron.ContextMenuParams> = {}): Electron.ContextMenuParams {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu builder reads only these fields.
  return {
    isEditable: true,
    formControlType: 'text-area',
    dictionarySuggestions: [],
    misspelledWord: '',
    x: 40,
    y: 60,
    ...overrides
  } as Electron.ContextMenuParams
}

type TemplateItem = { label?: string; role?: string; click?: () => void; submenu?: TemplateItem[] }

function lastTemplate(): TemplateItem[] {
  return buildFromTemplate.mock.calls.at(-1)?.[0] ?? []
}

describe('attachEditableContextMenu', () => {
  beforeEach(() => {
    ipcListeners.clear()
    buildFromTemplate.mockReset()
    popup.mockReset()
    buildFromTemplate.mockImplementation(() => ({ popup }))
  })

  it('opens Cut, Copy and Paste over editable text in that window', () => {
    const window = fakeWindow()
    attach(window)

    window.webContents.emit('context-menu', {}, params())

    const labels = lastTemplate().map((item) => item.label ?? item.role)
    expect(labels).toEqual(['cut', 'copy', 'Paste', 'Paste as plain text', 'selectAll'])
    expect(popup).toHaveBeenCalledWith({ window, x: 40, y: 60 })
    // Paste goes through the window's own paste ownership, like the main window's menu.
    lastTemplate()
      .find((item) => item.label === 'Paste')
      ?.click?.()
    expect(window.webContents.send).toHaveBeenCalledWith('ui:editableContextPaste', {
      plainTextOnly: false
    })
  })

  it('opens nothing outside editable text', () => {
    const window = fakeWindow()
    attach(window)

    window.webContents.emit('context-menu', {}, params({ isEditable: false }))

    expect(buildFromTemplate).not.toHaveBeenCalled()
  })

  it('offers table rows only for a table target this window reported', () => {
    const window = fakeWindow()
    const other = fakeWindow()
    attach(window)
    const target = { cellType: 'body', targetId: 'table-1', x: 40, y: 60 }
    const report = (sender: unknown): void => {
      for (const listener of ipcListeners.get(richMarkdownContextMenuTargetChannel) ?? []) {
        listener({ sender }, target)
      }
    }

    report(other.webContents)
    window.webContents.emit('context-menu', {}, params({ formControlType: 'none' }))
    expect(lastTemplate().some((item) => item.label === 'Table')).toBe(false)

    report(window.webContents)
    window.webContents.emit('context-menu', {}, params({ formControlType: 'none' }))
    expect(lastTemplate().some((item) => item.label === 'Table')).toBe(true)
  })

  it('stops listening once the window closes', () => {
    const window = fakeWindow()
    attach(window)

    window.emit('closed')
    window.webContents.emit('context-menu', {}, params())

    expect(buildFromTemplate).not.toHaveBeenCalled()
    expect(ipcListeners.get(richMarkdownContextMenuTargetChannel)?.size ?? 0).toBe(0)
  })
})
