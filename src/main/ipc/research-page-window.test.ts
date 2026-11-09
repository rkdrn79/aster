import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handlers,
  ipcMainMock,
  isTrustedUIRendererMock,
  isResearchPageWindowRendererMock,
  mainWebContents,
  getTrustedUIRendererWebContentsMock
} = vi.hoisted(() => {
  const map = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers: map,
    ipcMainMock: {
      removeHandler: vi.fn(),
      handle: (channel: string, fn: (...args: unknown[]) => unknown) => map.set(channel, fn)
    },
    isTrustedUIRendererMock: vi.fn(() => true),
    isResearchPageWindowRendererMock: vi.fn(() => true),
    mainWebContents: { send: vi.fn() },
    getTrustedUIRendererWebContentsMock: vi.fn()
  }
})

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
  screen: {},
  BrowserWindow: { fromWebContents: vi.fn() }
}))
vi.mock('./ui', () => ({
  getTrustedUIRendererWebContents: getTrustedUIRendererWebContentsMock,
  isTrustedUIRenderer: isTrustedUIRendererMock
}))
vi.mock('../window/research-page-window', () => ({
  getResearchPageWindows: vi.fn(() => [{}]),
  isResearchPageWindowRenderer: isResearchPageWindowRendererMock,
  openResearchPageWindow: vi.fn()
}))
vi.mock('../window/focus-existing-window', () => ({ safelyRevealWindow: vi.fn() }))

import { registerResearchPageWindowHandlers } from './research-page-window'

const event = { sender: {} }
const target = { page: 'research-chats', workspaceId: 'wt-1', hostId: 'runtime:env-1' }

function callHandler(channel: string, ...args: unknown[]): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`no handler for ${channel}`)
  }
  return handler(event, ...args)
}

/** The request id the main window was handed for the last chat start. */
function lastRequestId(): string {
  const requestId: unknown = mainWebContents.send.mock.calls.at(-1)?.[3]
  if (typeof requestId !== 'string') {
    throw new Error('the main window was not asked to start a chat')
  }
  return requestId
}

describe('research window chat starts', () => {
  beforeEach(() => {
    handlers.clear()
    mainWebContents.send.mockClear()
    getTrustedUIRendererWebContentsMock.mockReturnValue(mainWebContents)
    isTrustedUIRendererMock.mockReturnValue(true)
    // Only the window-open handler reads the store, which these tests never call.
    registerResearchPageWindowHandlers(Object.create(null))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hands the start to the main window and answers with how it ended', async () => {
    const answer = callHandler('researchWindow:launchChat', target, 'claude')
    expect(mainWebContents.send).toHaveBeenCalledWith(
      'researchWindow:launchChat',
      target,
      'claude',
      lastRequestId()
    )

    callHandler('researchWindow:reportLaunchChatResult', lastRequestId(), { sessionId: 's-1' })

    await expect(answer).resolves.toEqual({ sessionId: 's-1' })
  })

  it('says so at once when no main window can take it', async () => {
    getTrustedUIRendererWebContentsMock.mockReturnValue(null)

    await expect(callHandler('researchWindow:launchChat', target, 'claude')).resolves.toMatchObject(
      {
        error: expect.stringMatching(/main window/)
      }
    )
  })

  it('does not wait forever for a main window that never answers', async () => {
    vi.useFakeTimers()
    const answer = callHandler('researchWindow:launchChat', target, 'claude')

    await vi.advanceTimersByTimeAsync(181_000)

    await expect(answer).resolves.toMatchObject({ error: expect.any(String) })
  })

  it('ignores a result from anything but the main window', async () => {
    const answer = callHandler('researchWindow:launchChat', target, 'claude')
    const requestId = lastRequestId()
    isTrustedUIRendererMock.mockReturnValue(false)

    callHandler('researchWindow:reportLaunchChatResult', requestId, { sessionId: 's-x' })
    isTrustedUIRendererMock.mockReturnValue(true)
    callHandler('researchWindow:reportLaunchChatResult', requestId, { error: 'real' })

    await expect(answer).resolves.toEqual({ error: 'real' })
  })

  it('reports open windows only to the main window', () => {
    expect(callHandler('researchWindow:hasOpenWindows')).toBe(true)
    isTrustedUIRendererMock.mockReturnValue(false)
    expect(callHandler('researchWindow:hasOpenWindows')).toBe(false)
  })
})
