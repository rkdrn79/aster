import { app, BrowserWindow, type WebContents } from 'electron'
import { join } from 'node:path'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { attachEditableContextMenuToContents } from './editable-context-menu-window'
import { attachResearchSideShortcuts } from './research-side-shortcuts'
import {
  admitResearchSideSrc,
  type AdmittedResearchSide,
  type ResearchSidePageLocation
} from './research-side-admission'
import type { Store } from '../persistence'
import type { KeybindingOverrides } from '../../shared/keybindings'
import type { ResearchSideCommand } from '../../shared/research-side-split'

type SideGuest = AdmittedResearchSide & { contents: WebContents }

// Sides the main window embeds, by guest WebContents id.
const guests = new Map<number, SideGuest>()
// Admitted by will-attach-webview, waiting for their guest; attaches complete in order.
const pending: AdmittedResearchSide[] = []

function pageLocation(): ResearchSidePageLocation {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return { kind: 'dev-server', origin: new URL(process.env.ELECTRON_RENDERER_URL).origin }
  }
  return { kind: 'file', path: join(__dirname, '../renderer/research-window.html') }
}

/**
 * Lets a `<webview>` of the main window become a project side: only this build's project window
 * page, on the main window's session, with the same preload and sandbox as a pop-out window.
 */
export function admitResearchSideAttach(
  webPreferences: Electron.WebPreferences,
  src: string
): boolean {
  const admitted = admitResearchSideSrc(src, pageLocation())
  const partition = typeof webPreferences.partition === 'string' ? webPreferences.partition : ''
  if (!admitted || partition !== '') {
    return false
  }
  pending.push(admitted)
  delete (webPreferences as Record<string, unknown>).preloadURL
  delete webPreferences.partition
  delete webPreferences.additionalArguments
  webPreferences.preload = join(__dirname, '../preload/index.js')
  webPreferences.sandbox = true
  webPreferences.contextIsolation = true
  webPreferences.nodeIntegration = false
  webPreferences.nodeIntegrationInSubFrames = false
  webPreferences.webviewTag = false
  webPreferences.webSecurity = true
  webPreferences.allowRunningInsecureContent = false
  return true
}

/** Takes a just-attached guest as a side when it is one; false leaves it to the browser policy. */
export function claimResearchSideGuest(
  guest: WebContents,
  host: BrowserWindow,
  options: {
    store: Store | null
    getKeybindings?: () => KeybindingOverrides | undefined
    sendToMain: (sideId: string, command: ResearchSideCommand) => void
    onClosed: () => void
  }
): boolean {
  // Why the session: browser guests always attach on their own partitions; a side shares the
  // main window's, so its pages keep the same local storage as a pop-out window does.
  if (guest.session !== host.webContents.session || pending.length === 0) {
    return false
  }
  const admitted = pending.shift()
  if (!admitted) {
    return false
  }
  const id = guest.id
  guests.set(id, { ...admitted, contents: guest })
  installPrivilegedWindowNavigationPolicy(guest)
  attachEditableContextMenuToContents(guest, host)
  attachResearchSideShortcuts(guest, {
    getKeybindings: options.getKeybindings,
    sendToMain: (command) => options.sendToMain(admitted.sideId, command)
  })
  const followZoom = (): void => {
    if (!guest.isDestroyed()) {
      guest.setZoomLevel(options.store?.getUI().uiZoomLevel ?? 0)
    }
  }
  guest.on('dom-ready', followZoom)
  const offUIChanged = options.store?.onUIChanged(followZoom)
  guest.once('destroyed', () => {
    offUIChanged?.()
    guests.delete(id)
    options.onClosed()
  })
  return true
}

export function getResearchSideGuests(): WebContents[] {
  return [...guests.values()]
    .map((guest) => guest.contents)
    .filter((contents) => !contents.isDestroyed())
}

export function isResearchSideGuest(sender: WebContents): boolean {
  return guests.has(sender.id) && !sender.isDestroyed()
}

export function researchSideIdOf(sender: WebContents): string | null {
  return guests.get(sender.id)?.sideId ?? null
}

/** Whether a side showing this workspace has the keyboard in the focused main window. */
export function isResearchSideFocusedOn(workspaceId: string): boolean {
  return [...guests.values()].some(
    (guest) =>
      guest.workspaceId === workspaceId &&
      !guest.contents.isDestroyed() &&
      guest.contents.isFocused() &&
      BrowserWindow.getFocusedWindow() !== null
  )
}
