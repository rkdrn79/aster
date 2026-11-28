import { BrowserWindow } from 'electron'

/** Sends one event to every live window; a window closing mid-send is skipped. */
export function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(channel, payload)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}
