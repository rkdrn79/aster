import { BrowserWindow, type WebContents } from 'electron'
import { getResearchSideGuests } from '../window/research-side-guests'

/**
 * Hands a just-saved research document to every other window and project side. Each window keeps its own copy, and
 * a save from a stale copy is refused by revision, so the others must take the new one at once.
 */
export function broadcastResearchChange(
  sender: WebContents,
  channel: 'researchRecords:changed' | 'researchLibrary:changed',
  document: unknown
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    const contents = window.webContents
    if (!window.isDestroyed() && !contents.isDestroyed() && contents !== sender) {
      contents.send(channel, document)
    }
  }
  // Why: a project side keeps its own copy too, though it lives inside the main window.
  for (const contents of getResearchSideGuests()) {
    if (contents !== sender) {
      contents.send(channel, document)
    }
  }
}
