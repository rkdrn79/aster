import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { getTrustedUIRendererWebContents } from './ui'

/**
 * Requests a research window hands to the main window, which owns the tabs, each answered by
 * request id. A request the main window never answers settles with `timedOut`.
 */
export function createMainWindowRequests<T>(options: {
  timeoutMs: number
  timedOut: T
  unavailable: T
}): {
  ask: (send: (main: WebContents, requestId: string) => void) => Promise<T>
  answer: (requestId: string, result: T) => void
} {
  const pending = new Map<string, (result: T) => void>()
  return {
    ask: (send) => {
      const main = getTrustedUIRendererWebContents()
      if (!main) {
        return Promise.resolve(options.unavailable)
      }
      return new Promise((resolve) => {
        const requestId = randomUUID()
        const timer = setTimeout(() => {
          pending.delete(requestId)
          resolve(options.timedOut)
        }, options.timeoutMs)
        pending.set(requestId, (result) => {
          clearTimeout(timer)
          pending.delete(requestId)
          resolve(result)
        })
        send(main, requestId)
      })
    },
    answer: (requestId, result) => {
      pending.get(requestId)?.(result)
    }
  }
}
