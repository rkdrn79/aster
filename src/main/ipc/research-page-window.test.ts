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

import { BrowserWindow } from 'electron'
import { safelyRevealWindow } from '../window/focus-existing-window'
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
      lastRequestId(),
      {}
    )

    callHandler('researchWindow:reportLaunchChatResult', lastRequestId(), { sessionId: 's-1' })

    await expect(answer).resolves.toEqual({ sessionId: 's-1' })
  })

  it("passes a page's first prompt and chat title to the main window", () => {
    void callHandler('researchWindow:launchChat', target, 'claude', {
      prompt: 'Draw the pipeline',
      label: 'Figure agent · Pipeline'
    })
    expect(mainWebContents.send).toHaveBeenLastCalledWith(
      'researchWindow:launchChat',
      target,
      'claude',
      lastRequestId(),
      { prompt: 'Draw the pipeline', label: 'Figure agent · Pipeline' }
    )
  })

  it('refuses malformed chat options without asking the main window', async () => {
    await expect(
      callHandler('researchWindow:launchChat', target, 'claude', { prompt: 42 })
    ).resolves.toMatchObject({ error: expect.any(String) })
    expect(mainWebContents.send).not.toHaveBeenCalled()
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

describe('research window tab actions', () => {
  const close = { kind: 'close-chat', workspaceId: 'wt-1', tabId: 'tab-1', entityId: 's-1' }

  /** The request id the main window was handed for the last action. */
  function lastActionRequestId(): string {
    const call = mainWebContents.send.mock.calls.findLast(
      ([channel]) => channel === 'researchWindow:runAction'
    )
    const requestId: unknown = call?.[2]
    if (typeof requestId !== 'string') {
      throw new Error('the main window was not asked to run an action')
    }
    return requestId
  }

  beforeEach(() => {
    handlers.clear()
    mainWebContents.send.mockClear()
    getTrustedUIRendererWebContentsMock.mockReturnValue(mainWebContents)
    isTrustedUIRendererMock.mockReturnValue(true)
    isResearchPageWindowRendererMock.mockReturnValue(true)
    registerResearchPageWindowHandlers(Object.create(null))
  })

  it('hands a tab action to the main window and answers with how it went', async () => {
    const answer = callHandler('researchWindow:runAction', close)
    expect(mainWebContents.send).toHaveBeenCalledWith(
      'researchWindow:runAction',
      close,
      lastActionRequestId()
    )

    callHandler('researchWindow:reportActionResult', lastActionRequestId(), { ok: true })

    await expect(answer).resolves.toEqual({ ok: true })
  })

  it('refuses a malformed action, or one from a window that is not a research window', async () => {
    await expect(
      callHandler('researchWindow:runAction', { kind: 'run-shell' })
    ).resolves.toMatchObject({ ok: false })
    isResearchPageWindowRendererMock.mockReturnValue(false)
    await expect(callHandler('researchWindow:runAction', close)).resolves.toMatchObject({
      ok: false
    })
    expect(mainWebContents.send).not.toHaveBeenCalled()
  })

  it('takes the answer only from the main window', async () => {
    const answer = callHandler('researchWindow:runAction', close)
    const requestId = lastActionRequestId()
    isTrustedUIRendererMock.mockReturnValue(false)
    callHandler('researchWindow:reportActionResult', requestId, { ok: true })
    isTrustedUIRendererMock.mockReturnValue(true)
    callHandler('researchWindow:reportActionResult', requestId, { ok: false, error: 'closed' })

    await expect(answer).resolves.toEqual({ ok: false, error: 'closed' })
  })

  it('brings the main window forward to open a file in its editor', async () => {
    const window = { id: 1 }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only passes the window on to safelyRevealWindow.
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(window as never)
    void callHandler('researchWindow:runAction', {
      kind: 'open-in-editor',
      workspaceId: 'wt-1',
      hostId: 'local',
      file: { absolutePath: '/p/a.tex', relativePath: 'a.tex' }
    })

    expect(safelyRevealWindow).toHaveBeenCalledWith(window)
  })
})
