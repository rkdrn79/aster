import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import type { ResearchWindowTarget } from '../../../../shared/research-page-window'
import { enterResearchWorkspace, openResearchView } from './research-navigation'
import { pickResearchWindowState, researchWindowStateChanged } from './research-window-state'

/** Shows a research window's page in this window, for what only the main window can do. */
export function revealResearchPageInMain(target: ResearchWindowTarget): void {
  const executionHostId = normalizeExecutionHostId(target.hostId) ?? undefined
  enterResearchWorkspace({ id: target.workspaceId, executionHostId })
  openResearchView(target.page)
}

/** Main window: keeps open research windows supplied with the projects and workspaces they read. */
export function ResearchWindowStatePublisher(): null {
  useEffect(() => {
    const api = window.api.researchWindow
    if (!api) {
      return
    }
    let windowsOpen = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let offStore: (() => void) | null = null
    const publish = (): void => {
      timer = null
      if (windowsOpen) {
        void api.publishState(pickResearchWindowState(useAppStore.getState()))
      }
    }
    const queuePublish = (): void => {
      if (windowsOpen && timer === null) {
        timer = setTimeout(publish, 100)
      }
    }
    const offRequest = api.onStateRequested(() => {
      windowsOpen = true
      offStore ??= useAppStore.subscribe((next, previous) => {
        if (researchWindowStateChanged(previous, next)) {
          queuePublish()
        }
      })
      publish()
    })
    const offClosed = api.onAllClosed(() => {
      windowsOpen = false
      offStore?.()
      offStore = null
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    })
    const offReveal = api.onRevealInMain(revealResearchPageInMain)
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      offStore?.()
      offRequest()
      offClosed()
      offReveal()
    }
  }, [])
  return null
}
