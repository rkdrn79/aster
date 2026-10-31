import { useEffect } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { PhoneTerminalPreview } from './phone-sessions'

const POLL_INTERVAL_MS = 4000

const terminalListSchema = z.object({
  terminals: z.array(
    z.object({
      handle: z.string(),
      tabId: z.string(),
      leafId: z.string(),
      preview: z.string().catch(''),
      lastOutputAt: z.number().nullable().catch(null)
    })
  )
})

/** Last output and handles of the host's terminals, keyed by terminal tab id. */
export const usePhoneTerminalPreviews = create<{
  byTabId: ReadonlyMap<string, PhoneTerminalPreview>
  loaded: boolean
}>(() => ({ byTabId: new Map(), loaded: false }))

async function readTerminalPreviews(): Promise<void> {
  // Why local: in the web client the local target is the paired host.
  const response = await callRuntimeRpc(
    { kind: 'local' },
    'terminal.list',
    { includeVisualLayouts: false },
    { suppressFeatureInteraction: true }
  )
  const byTabId = new Map<string, PhoneTerminalPreview>()
  for (const terminal of terminalListSchema.parse(response).terminals) {
    // Why the first leaf: a split tab lists each pane; the row shows the tab's first one.
    if (!byTabId.has(terminal.tabId)) {
      byTabId.set(terminal.tabId, terminal)
    }
  }
  usePhoneTerminalPreviews.setState({ byTabId, loaded: true })
}

/** Polls `terminal.list` while the phone shell is mounted and the page is visible. */
export function usePhoneTerminalPreviewPolling(): void {
  useEffect(() => {
    let timer: number | null = null
    let disposed = false
    const tick = (): void => {
      if (disposed) {
        return
      }
      const next = (): void => {
        if (!disposed) {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS)
        }
      }
      if (document.visibilityState !== 'visible') {
        next()
        return
      }
      // Why swallow: previews are decoration; a failed read keeps the last good list.
      readTerminalPreviews()
        .catch(() => undefined)
        .finally(next)
    }
    tick()
    return () => {
      disposed = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [])
}
