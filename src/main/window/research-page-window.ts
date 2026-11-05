import { app, BrowserWindow, nativeTheme, screen, type WebContents } from 'electron'
import { join } from 'node:path'
import { isBackgroundLaunch, showWindowWithoutStealingFocus } from './foreground-activation-policy'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { sendToTrustedUIRenderer } from '../ipc/ui'
import type { Store } from '../persistence'
import { PRODUCT_NAME } from '../../shared/product-brand'
import {
  RESEARCH_WINDOW_PAGE_LABELS,
  researchWindowQuery,
  type ResearchWindowTarget
} from '../../shared/research-page-window'

const WIDTH = 1180
const HEIGHT = 820
// One window per page and workspace: dragging Library out twice focuses the first one.
const windows = new Map<string, BrowserWindow>()

function windowKey(target: ResearchWindowTarget): string {
  return `${target.page}\0${target.hostId ?? ''}\0${target.workspaceId}`
}

function liveWindows(): BrowserWindow[] {
  return [...windows.values()].filter(
    (window) => !window.isDestroyed() && !window.webContents.isDestroyed()
  )
}

export function getResearchPageWindows(): BrowserWindow[] {
  return liveWindows()
}

export function isResearchPageWindowRenderer(sender: WebContents): boolean {
  return liveWindows().some((window) => window.webContents === sender)
}

/** Places the window's title bar under the point where the page was dropped, kept on that display. */
function boundsAt(point: Electron.Point | undefined): Electron.Rectangle | undefined {
  if (!point) {
    return undefined
  }
  const area = screen.getDisplayNearestPoint(point).workArea
  const width = Math.min(WIDTH, area.width)
  const height = Math.min(HEIGHT, area.height)
  return {
    width,
    height,
    x: Math.min(Math.max(point.x - Math.round(width / 3), area.x), area.x + area.width - width),
    y: Math.min(Math.max(point.y - 16, area.y), area.y + area.height - height)
  }
}

export function openResearchPageWindow(
  store: Store,
  target: ResearchWindowTarget,
  point?: Electron.Point
): BrowserWindow {
  const key = windowKey(target)
  const existing = windows.get(key)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore()
    }
    if (!isBackgroundLaunch()) {
      existing.focus()
    }
    return existing
  }

  const bounds = boundsAt(point)
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    ...bounds,
    minWidth: 560,
    minHeight: 420,
    title: `${RESEARCH_WINDOW_PAGE_LABELS[target.page]} — ${PRODUCT_NAME}`,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      // Why the main window's session: the page keeps its sidebar, reader and draft state in
      // localStorage, which a separate partition would not see.
      webviewTag: false
    }
  })
  windows.set(key, window)
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.on('dom-ready', () => {
    if (!window.isDestroyed()) {
      window.webContents.setZoomLevel(store.getUI().uiZoomLevel ?? 0)
    }
  })
  let lastFollowedZoomLevel = store.getUI().uiZoomLevel ?? 0
  const offUIChanged = store.onUIChanged((ui) => {
    const level = ui.uiZoomLevel ?? 0
    if (level !== lastFollowedZoomLevel && !window.isDestroyed()) {
      lastFollowedZoomLevel = level
      window.webContents.setZoomLevel(level)
    }
  })
  window.once('ready-to-show', () => showWindowWithoutStealingFocus(window))
  window.on('closed', () => {
    offUIChanged()
    if (windows.get(key) === window) {
      windows.delete(key)
    }
    if (liveWindows().length === 0) {
      sendToTrustedUIRenderer('researchWindow:allClosed', null)
    }
  })

  const query = researchWindowQuery(target)
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(`${process.env.ELECTRON_RENDERER_URL}/research-window.html`)
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value)
    }
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/research-window.html'), { query })
  }
  return window
}

export function closeResearchPageWindows(): void {
  for (const window of liveWindows()) {
    window.close()
  }
}
