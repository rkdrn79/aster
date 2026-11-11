import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  clipboardReadText,
  clipboardWriteText,
  clipboardWriteImage,
  createFromBuffer,
  isResearchPageWindowRenderer,
  readClipboardCopiedFilePaths,
  readClipboardImageSource
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  clipboardReadText: vi.fn(() => 'copied in a project window'),
  clipboardWriteText: vi.fn(),
  clipboardWriteImage: vi.fn(),
  createFromBuffer: vi.fn(() => ({
    isEmpty: () => false,
    getSize: () => ({ width: 4, height: 4 })
  })),
  isResearchPageWindowRenderer: vi.fn(() => true),
  readClipboardCopiedFilePaths: vi.fn(() => ['/Users/me/notes.txt']),
  readClipboardImageSource: vi.fn(() => null)
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), commandLine: { getSwitchValue: vi.fn(() => 'x11') } },
  clipboard: {
    readText: clipboardReadText,
    readBuffer: vi.fn(),
    writeText: clipboardWriteText,
    readImage: vi.fn(),
    writeImage: clipboardWriteImage,
    writeBuffer: vi.fn()
  },
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler)
  },
  nativeImage: { createFromBuffer }
}))

vi.mock('./research-page-window', () => ({ isResearchPageWindowRenderer }))
vi.mock('./dashboard-popout-window', () => ({ isDashboardPopoutRenderer: () => false }))
vi.mock('./clipboard-copied-file-paths', () => ({ readClipboardCopiedFilePaths }))
vi.mock('./clipboard-image-source', () => ({ readClipboardImageSource }))
vi.mock('./clipboard-remote-file-copy', () => ({
  cleanupExpiredRemoteClipboardFiles: vi.fn(async () => undefined),
  scheduleLegacyRemoteClipboardFileCleanup: vi.fn()
}))

import {
  registerClipboardHandlers,
  setTrustedClipboardRendererWebContentsId
} from './clipboard-ipc-handlers'

// A project window: a file:// app page that is not the main window.
const projectWindowEvent = {
  sender: {
    id: 51,
    isDestroyed: () => false,
    getType: () => 'window',
    getURL: () => 'file:///app/out/renderer/research-window.html?page=research-chats'
  }
}

describe('project window clipboard access', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    isResearchPageWindowRenderer.mockReturnValue(true)
    clipboardReadText.mockReturnValue('copied in a project window')
    setTrustedClipboardRendererWebContentsId(17)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only clipboard:writeFile reads the store, and no test here calls it.
    registerClipboardHandlers({} as never)
  })

  it('reads and writes text, as copy buttons and paste do in the main window', async () => {
    await expect(handlers.get('clipboard:readText')?.(projectWindowEvent)).resolves.toBe(
      'copied in a project window'
    )
    await expect(
      handlers.get('clipboard:writeText')?.(projectWindowEvent, 'message text')
    ).resolves.toBeUndefined()
    expect(clipboardWriteText).toHaveBeenCalledWith('message text')
    expect(isResearchPageWindowRenderer).toHaveBeenCalledWith(projectWindowEvent.sender)
  })

  it('reaches the image and file paths a chat paste reads', async () => {
    expect(handlers.get('clipboard:hasImage')?.(projectWindowEvent)).toBe(false)
    expect(handlers.get('clipboard:readFilePaths')?.(projectWindowEvent)).toEqual([
      '/Users/me/notes.txt'
    ])
    await expect(
      handlers.get('clipboard:saveImageAsTempFile')?.(projectWindowEvent)
    ).resolves.toBeNull()
    handlers.get('clipboard:writeImage')?.(projectWindowEvent, 'data:image/png;base64,AAAA')
    expect(clipboardWriteImage).toHaveBeenCalledTimes(1)
  })

  it('still refuses a window that is neither the main window nor a project window', async () => {
    isResearchPageWindowRenderer.mockReturnValue(false)
    await expect(handlers.get('clipboard:readText')?.(projectWindowEvent)).rejects.toThrow(
      'Unauthorized clipboard IPC sender'
    )
    await expect(
      handlers.get('clipboard:writeText')?.(projectWindowEvent, 'secret')
    ).rejects.toThrow('Unauthorized clipboard IPC sender')
    expect(() => handlers.get('clipboard:readFilePaths')?.(projectWindowEvent)).toThrow(
      'Unauthorized clipboard IPC sender'
    )
    expect(clipboardReadText).not.toHaveBeenCalled()
    expect(readClipboardCopiedFilePaths).not.toHaveBeenCalled()
  })
})
