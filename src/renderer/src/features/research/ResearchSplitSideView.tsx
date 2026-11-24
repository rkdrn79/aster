import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { moveFocusToRendererBeforeWebviewDetach } from '@/components/browser-pane/host-guest/webview-registry'
import { researchWindowQuery } from '../../../../shared/research-page-window'
import { RESEARCH_SIDE_QUERY_PARAM } from '../../../../shared/research-side-split'
import type { ResearchSplitSide } from './research-split-layout'
import {
  registerResearchSideWebview,
  setResearchSideControlsInset,
  setResearchSideFocused
} from './research-split-surfaces'
import { focusResearchSplitColumn, useResearchSplit } from './research-split-store'

/** The project window page a side embeds, next to the main window's own page. */
export function researchSideSrc(side: ResearchSplitSide, base: string): string {
  const url = new URL('research-window.html', base)
  const query = researchWindowQuery(side)
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value)
  }
  url.searchParams.set(RESEARCH_SIDE_QUERY_PARAM, side.id)
  return url.toString()
}

type Status = 'loading' | 'ready' | 'failed'

function isWebviewTag(element: Element): element is Electron.WebviewTag {
  return element.tagName === 'WEBVIEW'
}

/**
 * One side's page, in its own renderer pinned to its project, so what is done there (chats,
 * edits, shortcuts) never reaches the main column's project. Main admits only this page.
 */
export function ResearchSplitSideView({
  side,
  name,
  focused,
  lastColumn
}: {
  side: ResearchSplitSide
  name: string
  /** This column has the keyboard; the side marks its project name for it. */
  focused: boolean
  /** The rightmost column sits under the window controls custom title bars draw top right. */
  lastColumn: boolean
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)
  const { id, workspaceId, hostId } = side

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    setStatus('loading')
    const webview = document.createElement('webview')
    if (!isWebviewTag(webview)) {
      return
    }
    webview.setAttribute('data-research-side-id', id)
    webview.setAttribute('aria-label', name)
    webview.style.display = 'flex'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    const surface = registerResearchSideWebview(id, webview)
    const onFocus = (): void => focusResearchSplitColumn(id)
    const onReady = (): void => {
      webview.removeEventListener('dom-ready', onReady)
      setStatus('ready')
      surface.markReady()
      // Why: a side opened from the keyboard or a menu takes the keyboard once it can.
      if (useResearchSplit.getState().focused === id) {
        webview.focus()
      }
    }
    const onFailed = (event: Electron.DidFailLoadEvent): void => {
      if (event.isMainFrame && event.errorCode !== -3) {
        setStatus('failed')
      }
    }
    const onGone = (): void => setStatus('failed')
    webview.addEventListener('focus', onFocus)
    webview.addEventListener('dom-ready', onReady)
    webview.addEventListener('did-fail-load', onFailed)
    webview.addEventListener('render-process-gone', onGone)
    container.appendChild(webview)
    // Why read the page here: a page change is a message to the live side, not a reload.
    const page = useResearchSplit.getState().sides.find((entry) => entry.id === id)?.page
    webview.setAttribute(
      'src',
      researchSideSrc(
        { id, workspaceId, hostId, page: page ?? 'research-chats' },
        window.location.href
      )
    )
    return () => {
      webview.removeEventListener('focus', onFocus)
      webview.removeEventListener('dom-ready', onReady)
      webview.removeEventListener('did-fail-load', onFailed)
      webview.removeEventListener('render-process-gone', onGone)
      surface.unregister()
      moveFocusToRendererBeforeWebviewDetach(webview)
      webview.remove()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- a rename must not reload the side
  }, [id, workspaceId, hostId, attempt])

  useEffect(() => {
    const width = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--window-controls-width')
    )
    setResearchSideControlsInset(id, lastColumn && Number.isFinite(width) ? width : 0)
  }, [id, lastColumn, attempt, workspaceId, hostId])
  useEffect(() => {
    setResearchSideFocused(id, focused)
  }, [id, focused, attempt, workspaceId, hostId])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1" />
      {status === 'ready' ? null : (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[var(--shell-radius)] bg-background text-sm text-muted-foreground"
        >
          {status === 'loading' ? (
            <span>Opening {name}…</span>
          ) : (
            <>
              <span>{name} stopped responding here.</span>
              <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                <RotateCw aria-hidden />
                Reload
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
