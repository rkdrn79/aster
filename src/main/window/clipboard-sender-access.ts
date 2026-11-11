import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { isDashboardPopoutRenderer } from './dashboard-popout-window'
import { isResearchPageWindowRenderer } from './research-page-window'

let trustedClipboardRendererWebContentsId: number | null = null

export function setTrustedClipboardRendererWebContentsId(webContentsId: number | null): void {
  trustedClipboardRendererWebContentsId = webContentsId
}

export function assertTrustedClipboardSender(event: IpcMainInvokeEvent): void {
  if (!isAppPageClipboardRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

export function assertTrustedClipboardTextSender(event: IpcMainInvokeEvent): void {
  // Why: terminal copy/paste runs in the exact dashboard popout window, but its
  // clipboard authority must not extend to image, file, or remote operations.
  if (!isAppPageClipboardRenderer(event.sender) && !isDashboardPopoutRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

/** The main window, or a project window: it renders the same chats and pages, so the same clipboard. */
function isAppPageClipboardRenderer(sender: WebContents): boolean {
  return isTrustedClipboardRenderer(sender) || isResearchPageWindowRenderer(sender)
}

function isTrustedClipboardRenderer(sender: WebContents): boolean {
  if (sender.isDestroyed() || sender.getType() !== 'window') {
    return false
  }
  if (trustedClipboardRendererWebContentsId != null) {
    return sender.id === trustedClipboardRendererWebContentsId
  }

  const senderUrl = sender.getURL()
  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      return new URL(senderUrl).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    } catch {
      return false
    }
  }

  return senderUrl.startsWith('file://')
}
