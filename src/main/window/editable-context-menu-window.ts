import { ipcMain, Menu, type BrowserWindow } from 'electron'
import {
  richMarkdownContextMenuTargetChannel,
  type RichMarkdownContextMenuTableTarget
} from '../../shared/rich-markdown-context-menu'
import {
  buildEditableContextMenuTemplate,
  matchingRichMarkdownContextMenuTableTarget,
  parseRichMarkdownContextMenuTableTarget
} from './editable-context-menu'

/**
 * The main window's right-click menu over editable text (spelling, Cut, Copy, Paste and the
 * Markdown commands), for another app window that renders the same editors. Detaches on close.
 */
export function attachEditableContextMenu(window: BrowserWindow): () => void {
  const detach = attachEditableContextMenuToContents(window.webContents, window)
  window.once('closed', detach)
  return detach
}

/**
 * The same menu for contents embedded in `window` (a project side). Its points are the guest's
 * own, so a guest's menu opens at the cursor rather than at a point offset by the side's place.
 */
export function attachEditableContextMenuToContents(
  contents: Electron.WebContents,
  window: BrowserWindow
): () => void {
  const atCursor = contents !== window.webContents
  let pendingTableTarget: RichMarkdownContextMenuTableTarget | null = null
  // Why the sender check: every window's editor reports its table target on the same channel.
  const onTableTarget = (event: Electron.IpcMainEvent, value: unknown): void => {
    if (event.sender === contents) {
      pendingTableTarget = parseRichMarkdownContextMenuTableTarget(value)
    }
  }
  const onContextMenu = (_event: Electron.Event, params: Electron.ContextMenuParams): void => {
    const tableTarget = matchingRichMarkdownContextMenuTableTarget(params, pendingTableTarget)
    pendingTableTarget = null
    const template = buildEditableContextMenuTemplate(params, contents, { tableTarget })
    if (template.length === 0 || window.isDestroyed()) {
      return
    }
    Menu.buildFromTemplate(template).popup(
      atCursor ? { window } : { window, x: params.x, y: params.y }
    )
  }
  ipcMain.on(richMarkdownContextMenuTargetChannel, onTableTarget)
  contents.on('context-menu', onContextMenu)
  let attached = true
  const detach = (): void => {
    if (!attached) {
      return
    }
    attached = false
    ipcMain.removeListener(richMarkdownContextMenuTargetChannel, onTableTarget)
    if (!contents.isDestroyed()) {
      contents.removeListener('context-menu', onContextMenu)
    }
  }
  contents.once('destroyed', detach)
  return detach
}
