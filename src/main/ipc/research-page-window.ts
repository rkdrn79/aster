import { BrowserWindow, ipcMain, screen } from 'electron'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from './ui'
import {
  getResearchPageWindows,
  isResearchPageWindowRenderer,
  openResearchPageWindow
} from '../window/research-page-window'
import { safelyRevealWindow } from '../window/focus-existing-window'
import { createMainWindowRequests } from './research-window-main-requests'
import {
  parseResearchWindowAction,
  parseResearchWindowActionResult,
  type ResearchWindowActionResult
} from '../../shared/research-window-actions'
import {
  parseResearchWindowChatOptions,
  parseResearchWindowLaunchResult,
  parseResearchWindowTarget,
  type ResearchWindowLaunchResult
} from '../../shared/research-page-window'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { Store } from '../persistence'
import type { KeybindingService } from '../keybindings/keybinding-service'

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
const ACTION_TIMED_OUT = 'The main window did not answer in time. Check it and try again.'

// Chat starts and tab actions a research window handed to the main window, until it answers.
const chatLaunches = createMainWindowRequests<ResearchWindowLaunchResult>({
  timeoutMs: LAUNCH_CHAT_TIMEOUT_MS,
  timedOut: { error: LAUNCH_TIMED_OUT },
  unavailable: { error: MAIN_WINDOW_UNAVAILABLE }
})
const tabActions = createMainWindowRequests<ResearchWindowActionResult>({
  timeoutMs: LAUNCH_CHAT_TIMEOUT_MS,
  timedOut: { ok: false, error: ACTION_TIMED_OUT },
  unavailable: { ok: false, error: MAIN_WINDOW_UNAVAILABLE }
})

export function registerResearchPageWindowHandlers(
  store: Store,
  keybindings?: Pick<KeybindingService, 'getOverrides'>
): void {
  for (const channel of [
    'researchWindow:open',
    'researchWindow:publishState',
    'researchWindow:requestState',
    'researchWindow:revealInMain',
    'researchWindow:launchChat',
    'researchWindow:reportLaunchChatResult',
    'researchWindow:runAction',
    'researchWindow:reportActionResult',
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
    openResearchPageWindow(store, target, fromDrag === true ? point : undefined, () =>
      keybindings?.getOverrides()
    )
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
    (
      event,
      input: unknown,
      agent: unknown,
      rawOptions: unknown
    ): Promise<ResearchWindowLaunchResult> => {
      const target = parseResearchWindowTarget(input)
      const options = parseResearchWindowChatOptions(rawOptions)
      if (
        !isResearchPageWindowRenderer(event.sender) ||
        !target ||
        !isTuiAgent(agent) ||
        !options
      ) {
        return Promise.resolve({ error: 'This window cannot start that chat.' })
      }
      return chatLaunches.ask((main, requestId) =>
        main.send('researchWindow:launchChat', target, agent, requestId, options)
      )
    }
  )
  // Why through the main window: a tab made, closed or renamed in a research window's copy of the
  // state is lost; the main window does it and says how it went.
  ipcMain.handle(
    'researchWindow:runAction',
    (event, input: unknown): Promise<ResearchWindowActionResult> => {
      const action = parseResearchWindowAction(input)
      if (!isResearchPageWindowRenderer(event.sender) || !action) {
        return Promise.resolve({ ok: false, error: 'This window cannot do that.' })
      }
      if (action.kind === 'open-in-editor') {
        // Why: the editor opens in the main window, which the person must then see.
        const main = getTrustedUIRendererWebContents()
        const window = main ? BrowserWindow.fromWebContents(main) : null
        if (window) {
          safelyRevealWindow(window)
        }
      }
      return tabActions.ask((main, requestId) =>
        main.send('researchWindow:runAction', action, requestId)
      )
    }
  )
  ipcMain.handle(
    'researchWindow:reportActionResult',
    (event, requestId: unknown, result: unknown): void => {
      const parsed = parseResearchWindowActionResult(result)
      if (isTrustedUIRenderer(event.sender) && typeof requestId === 'string' && parsed) {
        tabActions.answer(requestId, parsed)
      }
    }
  )
  ipcMain.handle(
    'researchWindow:reportLaunchChatResult',
    (event, requestId: unknown, result: unknown): void => {
      const parsed = parseResearchWindowLaunchResult(result)
      if (isTrustedUIRenderer(event.sender) && typeof requestId === 'string' && parsed) {
        chatLaunches.answer(requestId, parsed)
      }
    }
  )
  // Why: a main window that just reloaded forgot which windows it was supplying.
  ipcMain.handle('researchWindow:hasOpenWindows', (event): boolean => {
    return isTrustedUIRenderer(event.sender) && getResearchPageWindows().length > 0
  })
}
