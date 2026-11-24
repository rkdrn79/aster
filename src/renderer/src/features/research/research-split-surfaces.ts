import type { ResearchWindowPage } from '../../../../shared/research-page-window'

type SideSurface = { webview: Electron.WebviewTag; ready: boolean; queued: (() => void)[] }

// The live side guests and the main column, so commands reach the one they are about.
const sides = new Map<string, SideSurface>()
let mainColumn: HTMLElement | null = null

/** Called by a side's view when its `<webview>` is attached; the returned function forgets it. */
export function registerResearchSideWebview(
  id: string,
  webview: Electron.WebviewTag
): {
  markReady: () => void
  unregister: () => void
} {
  const surface: SideSurface = { webview, ready: false, queued: [] }
  sides.set(id, surface)
  return {
    markReady: () => {
      surface.ready = true
      for (const run of surface.queued.splice(0)) {
        run()
      }
    },
    unregister: () => {
      if (sides.get(id) === surface) {
        sides.delete(id)
      }
    }
  }
}

/** Runs `send` once the side's page can take messages: a guest refuses them before dom-ready. */
function whenReady(id: string, send: (webview: Electron.WebviewTag) => void): void {
  const surface = sides.get(id)
  if (!surface) {
    return
  }
  const run = (): void => {
    try {
      send(surface.webview)
    } catch {
      // Why: the guest went away between the check and the send; the side is closing.
    }
  }
  if (surface.ready) {
    run()
  } else {
    surface.queued.push(run)
  }
}

export function showResearchSidePage(id: string, page: ResearchWindowPage): void {
  whenReady(id, (webview) => webview.send('researchWindow:showPage', page))
}

/** Opens one of the side's chats in its Chats section, as a notification click asks. */
export function showResearchSideChat(id: string, tabId: string): void {
  whenReady(id, (webview) => webview.send('researchWindow:showChat', tabId))
}

/** Tells a side whether its column has the keyboard, so its sidebar marks its project. */
export function setResearchSideFocused(id: string, focused: boolean): void {
  whenReady(id, (webview) => webview.send('researchWindow:sideFocused', focused))
}

/** Room a side's page keeps clear on its right for the window controls drawn over it. */
export function setResearchSideControlsInset(id: string, px: number): void {
  whenReady(id, (webview) => webview.send('researchWindow:sideInset', px))
}

export function focusResearchSideWebview(id: string): void {
  whenReady(id, (webview) => webview.focus())
}

export function registerResearchMainColumn(element: HTMLElement | null): void {
  mainColumn = element
}

/** Takes the keyboard back from a side into the main column. */
export function focusResearchMainColumn(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && active.tagName === 'WEBVIEW') {
    active.blur()
  }
  mainColumn?.focus({ preventScroll: true })
}
