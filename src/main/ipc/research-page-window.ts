import { BrowserWindow, ipcMain, screen } from 'electron'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from './ui'
import {
  getResearchPageWindows,
  isResearchPageWindowRenderer,
  openResearchPageWindow
} from '../window/research-page-window'
import { safelyRevealWindow } from '../window/focus-existing-window'
import { parseResearchWindowTarget } from '../../shared/research-page-window'
import type { Store } from '../persistence'

function contains(bounds: Electron.Rectangle, point: Electron.Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  )
}

export function registerResearchPageWindowHandlers(store: Store): void {
  for (const channel of [
    'researchWindow:open',
    'researchWindow:publishState',
    'researchWindow:requestState',
    'researchWindow:revealInMain'
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
}
