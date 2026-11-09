import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from './ui'
import {
  getResearchPageWindows,
  isResearchPageWindowRenderer,
  openResearchPageWindow
} from '../window/research-page-window'
import { safelyRevealWindow } from '../window/focus-existing-window'
import {
  parseResearchWindowLaunchResult,
  parseResearchWindowTarget,
  type ResearchWindowLaunchResult,
  type ResearchWindowTarget
} from '../../shared/research-page-window'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { TuiAgent } from '../../shared/tui-agent'
import type { Store } from '../persistence'

function contains(bounds: Electron.Rectangle, point: Electron.Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  )
}

const LAUNCH_CHAT_TIMEOUT_MS = 180_000
const MAIN_WINDOW_UNAVAILABLE = 'The main window is not available. Open it and try again.'
const LAUNCH_TIMED_OUT = 'The chat did not start in time. Check the host and try again.'

// Chat starts a research window handed to the main window, by request id, until the answer comes.
const pendingChatLaunches = new Map<string, (result: ResearchWindowLaunchResult) => void>()

/** Hands a chat start to the main window and waits for how it ended. */
function launchChatThroughMainWindow(
  target: ResearchWindowTarget,
  agent: TuiAgent
): Promise<ResearchWindowLaunchResult> {
  const main = getTrustedUIRendererWebContents()
  if (!main) {
    return Promise.resolve({ error: MAIN_WINDOW_UNAVAILABLE })
  }
  return new Promise((resolve) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pendingChatLaunches.delete(requestId)
      resolve({ error: LAUNCH_TIMED_OUT })
    }, LAUNCH_CHAT_TIMEOUT_MS)
    pendingChatLaunches.set(requestId, (result) => {
      clearTimeout(timer)
      pendingChatLaunches.delete(requestId)
      resolve(result)
    })
    main.send('researchWindow:launchChat', target, agent, requestId)
  })
}

export function registerResearchPageWindowHandlers(store: Store): void {
  for (const channel of [
    'researchWindow:open',
    'researchWindow:publishState',
    'researchWindow:requestState',
    'researchWindow:revealInMain',
    'researchWindow:launchChat',
    'researchWindow:reportLaunchChatResult',
    'researchWindow:hasOpenWindows'
  ]) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('researchWindow:open', (event, input: unknown, fromDrag: unknown): boolean => {
    const target = parseResearchWindowTarget(input)
    if (!isTrustedUIRenderer(event.sender) || !target) {
      return false
    }
    const point = screen.getCursorScreenPoint()
    const main = BrowserWindow.fromWebContents(event.sender)
    // Why: a drag that ends back over the window was a slip, not a request for a new window.
    if (fromDrag === true && main && contains(main.getBounds(), point)) {
      return false
    }
    openResearchPageWindow(store, target, fromDrag === true ? point : undefined)
    return true
  })
  ipcMain.handle('researchWindow:publishState', (event, state: unknown): void => {
    if (!isTrustedUIRenderer(event.sender)) {
      return
    }
    for (const window of getResearchPageWindows()) {
      window.webContents.send('researchWindow:state', state)
    }
  })
  ipcMain.handle('researchWindow:requestState', (event): void => {
    if (isResearchPageWindowRenderer(event.sender)) {
      getTrustedUIRendererWebContents()?.send('researchWindow:stateRequested')
    }
  })
  ipcMain.handle('researchWindow:revealInMain', (event, input: unknown): void => {
    const target = parseResearchWindowTarget(input)
    const main = getTrustedUIRendererWebContents()
    if (!isResearchPageWindowRenderer(event.sender) || !target || !main) {
      return
    }
    const window = BrowserWindow.fromWebContents(main)
    if (window) {
      safelyRevealWindow(window)
    }
    main.send('researchWindow:revealInMain', target)
  })
  // Why through the main window: it owns the tabs, and starts the chat without leaving its project.
  ipcMain.handle(
    'researchWindow:launchChat',
    (event, input: unknown, agent: unknown): Promise<ResearchWindowLaunchResult> => {
      const target = parseResearchWindowTarget(input)
      if (!isResearchPageWindowRenderer(event.sender) || !target || !isTuiAgent(agent)) {
        return Promise.resolve({ error: 'This window cannot start that chat.' })
      }
      return launchChatThroughMainWindow(target, agent)
    }
  )
  ipcMain.handle(
    'researchWindow:reportLaunchChatResult',
    (event, requestId: unknown, result: unknown): void => {
      const parsed = parseResearchWindowLaunchResult(result)
      if (isTrustedUIRenderer(event.sender) && typeof requestId === 'string' && parsed) {
        pendingChatLaunches.get(requestId)?.(parsed)
      }
    }
  )
  // Why: a main window that just reloaded forgot which windows it was supplying.
  ipcMain.handle('researchWindow:hasOpenWindows', (event): boolean => {
    return isTrustedUIRenderer(event.sender) && getResearchPageWindows().length > 0
  })
}
